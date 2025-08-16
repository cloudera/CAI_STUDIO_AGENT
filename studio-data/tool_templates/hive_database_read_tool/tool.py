"""
Read-only Hive SQL tool for CDW/CDP. Always writes query results to a user-provided
unique output file name (no path) inside the session directory defined by
the SESSION_DIRECTORY environment variable.

Supported operations (no data writes):
- USE, SET, SELECT, EXPLAIN, DESCRIBE, SHOW
- Multiple semicolon-separated statements in a single invocation
- Optional database selection and session settings

This tool blocks any statement that could write or mutate data/metadata
(e.g., CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, MERGE, TRUNCATE, CTAS,
LOAD, EXPORT/IMPORT, ANALYZE, MSCK REPAIR, REFRESH, OPTIMIZE, VACUUM).

Returns structured results for statements that produce result sets, and
status metadata for statements that do not. The output file format is chosen
automatically: CSV if the result sets can be combined into a single table, otherwise
TXT. The file extension is forced to .csv or .txt regardless of the provided name.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
import json
import argparse
import cml.data_v1 as cmldata
import re
import os
from datetime import datetime
import csv


class UserParameters(BaseModel):
    """
    Credentials and connection configuration. Do not hardcode secrets.
    """
    hive_cai_data_connection_name: str = Field(description="CDW connection name configured in CML")
    workload_user: str = Field(description="Workload username for CDW")
    workload_pass: str = Field(description="Workload password for CDW")
    default_database: Optional[str] = Field(default=None, description="Default database to USE")


class ToolParameters(BaseModel):
    """
    Execution parameters for the Hive SQL tool.
    """
    sql: str = Field(description="SQL to execute. Multiple statements may be separated by semicolons.")
    database: Optional[str] = Field(default=None, description="Database to USE for this run (overrides default_database)")
    settings: Optional[Dict[str, str]] = Field(default=None, description="Hive session settings to SET before running (key: value)")
    max_rows: Optional[int] = Field(default=None, description="If provided, cap number of rows fetched per result-set statement")
    output_file: str = Field(
        description=(
            "Output file name only (no path). If a path is provided, only the basename will be used. "
            "The file will be created inside the session directory (SESSION_DIRECTORY). Extension is forced to .csv or .txt."
        )
    )


def _split_sql_statements(sql: str) -> List[str]:
    """
    Minimal statement splitter by semicolon. This does not handle semicolons in strings.
    Good enough for most tool use; callers can submit single statements if needed.
    """
    raw_parts = [part.strip() for part in sql.split(";")]
    return [part for part in raw_parts if part]


_FORBIDDEN_WRITE_PATTERN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|MSCK|ANALYZE|LOAD|EXPORT|IMPORT|OPTIMIZE|VACUUM|CACHE|UNCACHE)\b",
    flags=re.IGNORECASE,
)

_ALLOWED_START_KEYWORDS = {"SELECT", "SHOW", "DESCRIBE", "EXPLAIN", "USE", "SET", "WITH"}


def _is_read_only_statement(sql: str) -> bool:
    """
    Heuristic read-only check:
    - Disallow if any obvious write keyword is present
    - Require the first keyword to be among allowed set
    - Allow WITH only when not combined with any forbidden keyword
    """
    stripped = sql.strip()
    if not stripped:
        return True

    # Quick deny list check
    if _FORBIDDEN_WRITE_PATTERN.search(stripped):
        return False

    # Extract first keyword
    # Remove leading parentheses and comments (basic handling)
    # Remove SQL single-line comments
    stripped = re.sub(r"--.*?$", "", stripped, flags=re.MULTILINE).lstrip()
    # Remove simple /* ... */ comments
    stripped = re.sub(r"/\*.*?\*/", "", stripped, flags=re.DOTALL).lstrip()

    # First token
    first_token_match = re.match(r"([A-Za-z]+)", stripped)
    if not first_token_match:
        return False

    first_kw = first_token_match.group(1).upper()
    if first_kw not in _ALLOWED_START_KEYWORDS:
        return False

    # WITH should still be read-only; we already checked forbidden keywords
    return True


def _ensure_unique_output_path(filename_or_path: str, desired_extension: str) -> str:
    """
    Normalize to basename only (ignore any provided directories), ensure we do not
    overwrite an existing file in the current working directory. If the file exists,
    append a timestamp suffix. Always returns a path in the CWD.
    """
    basename = os.path.basename(filename_or_path)
    if not basename:
        basename = f"output{desired_extension}"
    else:
        # Force desired extension regardless of provided name
        name_without_ext, _ = os.path.splitext(basename)
        basename = f"{name_without_ext}{desired_extension}"
    # Resolve session directory
    session_dir = os.getenv("SESSION_DIRECTORY")
    if not session_dir:
        raise ValueError("Environment variable SESSION_DIRECTORY is not set")
    session_dir_abs = os.path.abspath(session_dir)
    os.makedirs(session_dir_abs, exist_ok=True)

    candidate = os.path.join(session_dir_abs, basename)
    if not os.path.exists(candidate):
        return candidate
    base, ext = os.path.splitext(candidate)
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S%fZ")
    return f"{base}_{ts}{ext}"


def _record_sql_attempt(sql: str, status: str, has_data: bool) -> None:
    """
    Append the SQL attempt to sql_attempt_history.json inside SESSION_DIRECTORY.
    Each entry is an object: {"sql", "status", "has_data", "timestamp"}.
    Only keep the latest 5 attempts (pop the first/oldest when at capacity).
    Backward-compatible with older history files that stored a list of strings.
    Fail silently if anything goes wrong.
    """
    try:
        session_dir = os.getenv("SESSION_DIRECTORY")
        if not session_dir:
            return
        session_dir_abs = os.path.abspath(session_dir)
        os.makedirs(session_dir_abs, exist_ok=True)

        history_path = os.path.join(session_dir_abs, "sql_attempt_history.json")

        history: List[Dict[str, Any]] = []
        if os.path.exists(history_path):
            try:
                with open(history_path, "r", encoding="utf-8") as f_in:
                    loaded = json.load(f_in)
                    if isinstance(loaded, list):
                        # Normalize legacy formats into dict entries
                        normalized: List[Dict[str, Any]] = []
                        for item in loaded:
                            if isinstance(item, dict):
                                normalized.append(item)
                            else:
                                normalized.append({
                                    "sql": str(item),
                                    "status": None,
                                    "has_data": False,
                                    "timestamp": None,
                                })
                        history = normalized
            except Exception:  # noqa: BLE001
                history = []

        # Trim to last 4 if already too many, so we can append one and keep 5 total
        if len(history) >= 5:
            history = history[-4:]

        attempt_record = {
            "sql": sql,
            "status": status,
            "has_data": bool(has_data),
            "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        }

        history.append(attempt_record)

        with open(history_path, "w", encoding="utf-8") as f_out:
            json.dump(history, f_out, ensure_ascii=False, indent=2)
    except Exception:  # noqa: BLE001
        # Best-effort only; never fail the tool due to history recording errors
        pass


def run_tool(config: UserParameters, args: ToolParameters) -> Any:
    results: List[Dict[str, Any]] = []
    has_any_data: bool = False
    connection = None
    cursor = None
    try:
        connection = cmldata.get_connection(
            config.hive_cai_data_connection_name,
            parameters={
                "USERNAME": config.workload_user,
                "PASSWORD": config.workload_pass,
            },
        )

        cursor = connection.get_cursor()

        database_to_use = args.database or config.default_database
        if database_to_use:
            cursor.execute(f"USE {database_to_use}")

        if args.settings:
            for setting_key, setting_value in args.settings.items():
                cursor.execute(f"SET {setting_key}={setting_value}")

        statements = _split_sql_statements(args.sql)

        for statement_index, statement in enumerate(statements):
            if not _is_read_only_statement(statement):
                _record_sql_attempt(args.sql, status="blocked", has_data=False)
                return {
                    "error": (
                        f"Statement {statement_index} is not allowed in read-only mode: "
                        f"{statement.strip()[:200]}"
                    )
                }
            cursor.execute(statement)

            has_resultset = getattr(cursor, "description", None) is not None
            if has_resultset:
                column_names = [desc[0] for desc in cursor.description]
                if args.max_rows is not None and args.max_rows > 0:
                    rows = cursor.fetchmany(args.max_rows)
                else:
                    rows = cursor.fetchall()

                row_dicts = [
                    {column_names[i]: row[i] for i in range(len(column_names))}
                    for row in rows
                ]

                results.append(
                    {
                        "statement_index": statement_index,
                        "statement": statement,
                        "columns": column_names,
                        "rows": row_dicts,
                    }
                )
                if len(row_dicts) > 0:
                    has_any_data = True
            else:
                rowcount = getattr(cursor, "rowcount", None)
                results.append(
                    {
                        "statement_index": statement_index,
                        "statement": statement,
                        "status": "ok",
                        "rowcount": rowcount,
                    }
                )

        # Decide output format: CSV if single tabular shape or consistent schemas, else TXT
        tabular_entries = [r for r in results if "rows" in r and "columns" in r]
        can_csv = False
        combined_rows: List[Dict[str, Any]] = []
        csv_columns: List[str] = []

        if len(tabular_entries) == 1:
            csv_columns = tabular_entries[0]["columns"]
            combined_rows = tabular_entries[0]["rows"]
            can_csv = True
        elif len(tabular_entries) > 1:
            # Check if all result sets share identical columns
            first_cols = tabular_entries[0]["columns"]
            if all(entry.get("columns") == first_cols for entry in tabular_entries[1:]):
                csv_columns = first_cols
                for entry in tabular_entries:
                    combined_rows.extend(entry.get("rows", []))
                can_csv = True

        if can_csv:
            unique_path = _ensure_unique_output_path(args.output_file, ".csv")
            with open(unique_path, "w", encoding="utf-8", newline="") as f_out:
                writer = csv.DictWriter(f_out, fieldnames=csv_columns)
                writer.writeheader()
                for row in combined_rows:
                    # row is a dict of column->value
                    writer.writerow({k: row.get(k) for k in csv_columns})
        else:
            unique_path = _ensure_unique_output_path(args.output_file, ".txt")
            payload = {
                "database": database_to_use,
                "statements_count": len(statements),
                "results": results,
            }
            with open(unique_path, "w", encoding="utf-8") as f_out:
                f_out.write(json.dumps(payload, ensure_ascii=False, indent=2))

        # Return object with basename and statements count
        _record_sql_attempt(args.sql, status="success", has_data=has_any_data)
        return {"output_file": os.path.basename(unique_path), "statements_count": len(statements)}
    except Exception as error:  # noqa: BLE001
        _record_sql_attempt(args.sql, status="error", has_data=False)
        return {"error": f"SQL execution failed: {error}"}
    finally:
        try:
            if connection is not None:
                connection.close()
        except Exception:
            pass


OUTPUT_KEY = "tool_output"

if __name__ == "__main__":
    """
    Tool entrypoint.
    """

    parser = argparse.ArgumentParser()
    parser.add_argument("--user-params", required=True, help="JSON string for tool configuration")
    parser.add_argument("--tool-params", required=True, help="JSON string for tool arguments")
    cli_args = parser.parse_args()

    user_dict = json.loads(cli_args.user_params)
    tool_dict = json.loads(cli_args.tool_params)

    config = UserParameters(**user_dict)
    params = ToolParameters(**tool_dict)

    output = run_tool(config, params)
    print(OUTPUT_KEY, output)
