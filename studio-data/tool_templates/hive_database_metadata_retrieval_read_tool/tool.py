"""
CDW metadata explorer and relationship discovery tool (Hive-compatible).

Capabilities (select via ToolParameters.action):
- "list_tables": List all tables with their descriptions from the configured
  metadata table. Outputs JSON with array of { table, description }.
- "describe_table": Show columns/fields for a single table (exact table name
  provided via ToolParameters.keywords[0]) with their descriptions. Outputs JSON
  with { table, description, columns: [ { column, description } ] }.
- "search": Find relevant tables and columns for a set of keywords (existing
  behavior). Outputs JSON with { top_tables, top_columns } ranked by lexical
  BM25-like scoring.

Metadata source:
- Reads from a configured metadata table (`metadata_database`.`metadata_table`)
  that contains at minimum the following columns (with flexible naming):
  - table_name (or tablename/table)
  - column_name (or column/col_name/columnname), may be NULL/empty for table-level rows
  - column_description (or description/column_desc/comment)

Execution & output:
- Results are written as JSON to the session directory referenced by the env var
  SESSION_DIRECTORY. The `output_file` parameter is normalized to .json and is
  deduplicated if a file already exists by appending a UTC timestamp suffix.
"""

from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field
import json
import argparse
import cml.data_v1 as cmldata
import re
import os
from datetime import datetime
from math import sqrt
from typing import cast
import time
import uuid
from typing import Union

try:
    import tiktoken  # type: ignore
except Exception:
    tiktoken = None  # type: ignore


class UserParameters(BaseModel):
    """
    Credentials and connection configuration. Do not hardcode secrets.
    """
    hive_cai_data_connection_name: str = Field(description="CDW connection name configured in CML")
    workload_user: str = Field(description="Workload username for CDW")
    workload_pass: str = Field(description="Workload password for CDW")
    # Metadata location configured at user level (required)
    metadata_database: str = Field(description="Database/schema that stores the table metadata")
    metadata_table: str = Field(description="Table name for metadata with columns (table_name, column_name, column_description)")


class ToolParameters(BaseModel):
    """
    Execution parameters for the metadata explorer tool.

    action:
      - "list_tables": List all tables with descriptions; ignore keywords
      - "describe_table": Describe a single table; use keywords[0] as exact table name
      - "search": Keyword-based search (existing behavior)
    """
    action: str = Field(default="search", description="Action to perform: list_tables | describe_table | search")
    keywords: List[str] = Field(default_factory=list, description="For search: keyword list. For describe_table: [exact_table_name]. For list_tables: leave empty.")
    output_file: str = Field(
        description=(
            "Output file name only (no path). If a path is provided, only the basename will be used. "
            "The file will be created inside the session directory (SESSION_DIRECTORY). Extension is forced to .json."
        )
    )
    # Legacy path support (optional)
    database: Optional[str] = Field(default=None, description="Legacy: single database name for relationship discovery when action is not 'search' and no keywords provided.")


def _normalize_tokens(text: str) -> List[str]:
    """
    Tokenize and normalize a piece of text for lexical scoring.
    - Lowercase
    - Split on non-alphanumeric boundaries
    - Remove short tokens
    """
    tokens = re.split(r"[^A-Za-z0-9]+", text.lower())
    tokens = [t for t in tokens if len(t) >= 2]
    return tokens


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Compute cosine similarity for two dense vectors."""
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for i in range(len(vec_a)):
        av = vec_a[i]
        bv = vec_b[i]
        dot += av * bv
        norm_a += av * av
        norm_b += bv * bv
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (sqrt(norm_a) * sqrt(norm_b))


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


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", value)


def _get_session_dir_abs() -> str:
    session_dir = os.getenv("SESSION_DIRECTORY")
    if not session_dir:
        raise ValueError("Environment variable SESSION_DIRECTORY is not set")
    return os.path.abspath(session_dir)


# ---------- Heuristic configuration ----------
# Stopwords and low-signal tokens. Keep short but focused; do not drop domain terms entirely.
STOPWORDS: set = {
    "the",
    "and",
    "or",
    "of",
    "for",
    "to",
    "in",
    "on",
}

# Column/type hinting for numeric rate-like and date/time semantics
RATE_HINT_SUFFIXES: Tuple[str, ...] = ("_rate", "_pct", "_percentage", "_ratio")
DATE_TYPE_HINTS: Tuple[str, ...] = ("date", "timestamp")

# Field weights for BM25F-like token replication
TABLE_FIELD_WEIGHTS: Dict[str, int] = {
    "name": 5,          # table name
    "desc": 2,          # table description
}

COLUMN_FIELD_WEIGHTS: Dict[str, int] = {
    "table": 2,
    "column": 5,
    "type": 1,
    "desc": 2,
}


# ---------- Metadata search specific cache helpers ----------
def _tablemeta_cache_path(connection_name: str, db: str, table: str) -> str:
    session_dir_abs = _get_session_dir_abs()
    fname = f"tablemeta_cache_{_safe_filename(connection_name)}_{_safe_filename(db)}_{_safe_filename(table)}.json"
    return os.path.join(session_dir_abs, fname)


def _load_tablemeta_cache(connection_name: str, db: str, table: str) -> Optional[Dict[str, Any]]:
    path = _tablemeta_cache_path(connection_name, db, table)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f_in:
            return json.load(f_in)
    except Exception:
        return None


def _save_tablemeta_cache(connection_name: str, db: str, table: str, payload: Dict[str, Any]) -> str:
    path = _tablemeta_cache_path(connection_name, db, table)
    with open(path, "w", encoding="utf-8") as f_out:
        json.dump(payload, f_out, ensure_ascii=False)
    return path


def _normalize_identifier(name: str) -> str:
    # Strip backticks and reduce qualified names to their last segment
    n = _strip_backticks(name or "")
    if "." in n:
        n = n.split(".")[-1]
    return n.lower()


def _find_first(names: List[str], candidates: List[str]) -> int:
    names_lower = [_normalize_identifier(n) for n in names]
    for cand in candidates:
        cand_norm = _normalize_identifier(cand)
        if cand_norm in names_lower:
            return names_lower.index(cand_norm)
    return -1


def _debug_log_path() -> str:
    session_dir_abs = _get_session_dir_abs()
    fname = f"meta_debug_{datetime.utcnow().strftime('%Y%m%dT%H%M%S%fZ')}_{uuid.uuid4().hex[:8]}.log"
    return os.path.join(session_dir_abs, fname)


def _debug_write(log_path: Optional[str], message: str) -> None:
    if not log_path:
        return
    try:
        with open(log_path, "a", encoding="utf-8") as f_out:
            ts = datetime.utcnow().isoformat() + "Z"
            f_out.write(f"[{ts}] {message}\n")
    except Exception:
        # Best-effort only
        pass


def _strip_backticks(value: str) -> str:
    if value.startswith("`") and value.endswith("`") and len(value) >= 2:
        return value[1:-1]
    return value


def _qualify_metadata_identifier(metadata_db: str, metadata_table: str) -> str:
    """
    Build a fully-qualified identifier for the metadata table, safely quoted.
    - If metadata_table already looks fully qualified (contains a dot), use it as-is (after stripping any existing backticks) and re-quote parts.
    - Otherwise, combine metadata_db and metadata_table.
    """
    table_clean = _strip_backticks(metadata_table.strip())
    if "." in table_clean:
        db_part, tbl_part = table_clean.split(".", 1)
        db_part = _strip_backticks(db_part.strip())
        tbl_part = _strip_backticks(tbl_part.strip())
        return f"`{db_part}`.`{tbl_part}`"
    db_clean = _strip_backticks((metadata_db or "").strip())
    tbl_clean = _strip_backticks(table_clean)
    if not db_clean:
        # Fallback to table only if db was not provided
        return f"`{tbl_clean}`"
    return f"`{db_clean}`.`{tbl_clean}`"


def _fetch_table_metadata(cursor: Any, metadata_db: str, metadata_table: str, debug_log_path: Optional[str] = None) -> List[Dict[str, str]]:
    """
    Fetch rows from metadata table with columns roughly like:
      table_name, column_name, column_description

    If column_name is empty/NULL -> description is table description.
    Returns a list of dicts with keys: table_name, column_name (may be ''), column_description (may be '').
    """
    try:
        fq = _qualify_metadata_identifier(metadata_db, metadata_table)
        sql = f"SELECT * FROM {fq}"
        _debug_write(debug_log_path, f"Executing SQL: {sql}")
        colnames, rows = _execute(cursor, sql)
        _debug_write(debug_log_path, f"Result columns: {colnames}; rows fetched: {len(rows)}")
    except Exception as e:
        _debug_write(debug_log_path, f"SELECT * failed for {metadata_db}.{metadata_table}: {e}")
        # Best effort: direct select of expected columns
        try:
            fq = _qualify_metadata_identifier(metadata_db, metadata_table)
            sql = f"SELECT table_name, column_name, column_description FROM {fq}"
            _debug_write(debug_log_path, f"Retry SQL: {sql}")
            colnames, rows = _execute(cursor, sql)
            _debug_write(debug_log_path, f"Retry result columns: {colnames}; rows fetched: {len(rows)}")
        except Exception as e2:
            _debug_write(debug_log_path, f"Retry failed: {e2}")
            return []

    # Identify columns by flexible naming
    idx_table = _find_first(colnames, ["table_name", "tablename", "table"])
    idx_column = _find_first(colnames, ["column_name", "column", "col_name", "columnname"])
    idx_desc = _find_first(colnames, ["column_description", "description", "column_desc", "comment"])
    _debug_write(debug_log_path, f"Resolved column indexes -> table:{idx_table} column:{idx_column} desc:{idx_desc}")
    if idx_table == -1 or idx_desc == -1:
        _debug_write(debug_log_path, "Unable to resolve required columns from metadata result; returning empty list")
        return []

    out: List[Dict[str, str]] = []
    for r in rows:
        tname = str(r[idx_table]) if r[idx_table] is not None else ""
        cname = str(r[idx_column]) if (idx_column != -1 and r[idx_column] is not None) else ""
        desc = str(r[idx_desc]) if r[idx_desc] is not None else ""
        out.append({
            "table_name": tname,
            "column_name": cname,
            "column_description": desc,
        })
    return out


def _bm25_prepare(docs: List[str], df_stopword_threshold: Optional[float] = None) -> Dict[str, Any]:
    # First pass: compute DF across all tokens
    raw_tokens_per_doc: List[List[str]] = []
    token_df: Dict[str, int] = {}
    for text in docs:
        tokens = _normalize_tokens(text)
        raw_tokens_per_doc.append(tokens)
        for t in set(tokens):
            token_df[t] = token_df.get(t, 0) + 1

    num_docs = len(docs)
    # Compute dynamic stopword set by DF threshold if provided
    stopwords: set = set()
    if df_stopword_threshold is not None and num_docs > 0:
        for t, df in token_df.items():
            if (df / float(num_docs)) >= df_stopword_threshold:
                stopwords.add(t)

    # Second pass: build per-doc TF without stopwords
    per_doc_tf: List[Dict[str, int]] = []
    doc_len: List[int] = []
    for tokens in raw_tokens_per_doc:
        filtered = [t for t in tokens if t not in stopwords]
        tf: Dict[str, int] = {}
        for t in filtered:
            tf[t] = tf.get(t, 0) + 1
        per_doc_tf.append(tf)
        doc_len.append(len(filtered))
    avgdl = float(sum(doc_len) / max(1, num_docs))
    return {
        "per_doc_tf": per_doc_tf,
        "doc_len": doc_len,
        "token_df": token_df,
        "num_docs": num_docs,
        "avgdl": avgdl,
        "stopwords": list(stopwords),
    }


def _bm25_scores(query: str, prepared: Dict[str, Any], expand_tokens: Optional[Dict[str, List[str]]] = None, proximity_window: int = 0) -> List[float]:
    k1 = 1.2
    b = 0.75
    # Expand keywords with external synonyms (if provided) and phrases
    base = _normalize_tokens(query)
    # include phrases like "same day" if present in original
    qtext = query.lower().replace("-", " ")
    if "same day" in qtext and "same day" not in base:
        base.append("same day")
    expanded: List[str] = list(base)
    if expand_tokens:
        for tok in list(base):
            if tok in expand_tokens:
                expanded.extend(expand_tokens[tok])
    # Drop dynamic stopwords captured in prepared model
    dyn_stop = set(prepared.get("stopwords", []))
    q_tokens = list(set([t for t in expanded if t not in dyn_stop]))
    token_df = prepared["token_df"]
    per_doc_tf = prepared["per_doc_tf"]
    doc_len = prepared["doc_len"]
    num_docs = max(1, prepared["num_docs"])
    avgdl = float(prepared["avgdl"] or 1.0)
    scores: List[float] = []
    for i, tf in enumerate(per_doc_tf):
        score = 0.0
        dl = doc_len[i] if i < len(doc_len) else 1
        for term in q_tokens:
            df = token_df.get(term, 0)
            if df == 0:
                continue
            idf = max(0.0, float((num_docs - df + 0.5) / (df + 0.5)))
            tf_i = tf.get(term, 0)
            denom = tf_i + k1 * (1 - b + b * (dl / max(1.0, avgdl)))
            score += (idf * (tf_i * (k1 + 1))) / max(1.0, denom)
        # Optional lightweight proximity within doc text
        if proximity_window > 0 and i < len(per_doc_tf) and len(q_tokens) >= 2:
            # Build a fake token list from tf (approximate)
            # We rely on overlap: if both terms appear in doc, give a tiny bonus
            present = [t for t in q_tokens if tf.get(t, 0) > 0]
            if len(present) >= 2:
                score += 0.05
        scores.append(float(score))
    return scores


TOKEN_INLINE_THRESHOLD: int = 5000


def _estimate_tokens_from_text(text: str, model: Optional[str] = None) -> int:
    """
    Estimate token count for the given text.
    - Uses tiktoken if available (model-aware when possible)
    - Falls back to a robust heuristic when tiktoken is unavailable
    Heuristic: max(words_and_punct, utf8_bytes/4) where words_and_punct tokenizes
    similar to BPE granularity by splitting on alphanumerics and single non-space punct.
    """
    if not text:
        return 0
    # Preferred: tiktoken if available
    try:
        if tiktoken is not None:  # type: ignore
            enc = None
            if model:
                try:
                    enc = tiktoken.encoding_for_model(model)  # type: ignore
                except Exception:
                    pass
            if enc is None:
                enc = tiktoken.get_encoding("cl100k_base")  # type: ignore
            return len(enc.encode(text))  # type: ignore
    except Exception:
        # Fall through to heuristic
        pass

    # Heuristic fallback: combine a word/punct count with bytes/4 approximation
    # Count alphanumerics and individual punctuation tokens
    # Example regex will capture words OR single non-space punctuation
    tokens_like = re.findall(r"[A-Za-z0-9]+|[^\sA-Za-z0-9]", text)
    approx_by_words = len(tokens_like)
    # Byte-length based
    byte_len = len(text.encode("utf-8"))
    approx_by_bytes = (byte_len + 3) // 4
    return max(approx_by_words, approx_by_bytes)


def _estimate_tokens_from_json(obj: Union[Dict[str, Any], List[Any]]) -> int:
    """
    Serialize with compact separators to get a conservative token estimate and
    run through the tokenizer estimator.
    """
    try:
        compact = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        # Fallback to string repr if something is not JSON-serializable
        compact = str(obj)
    return _estimate_tokens_from_text(compact)


def _metadata_search_flow(
    connection_name: str,
    cursor: Any,
    metadata_db: str,
    metadata_table: str,
    keywords: List[str],
    output_file: str,
    tool_params: Optional[ToolParameters] = None,
) -> Dict[str, Any]:
    # Prepare debug log
    debug_log = _debug_log_path()
    _debug_write(debug_log, f"Start metadata search; connection={connection_name} db={metadata_db} table={metadata_table} keywords={keywords}")

    # Load or fetch metadata with cache
    rows = _load_or_fetch_metadata_rows(connection_name, cursor, metadata_db, metadata_table, debug_log)

    # If still no rows, fail fast with a helpful error
    if not rows:
        # Enrich error with user-supplied params and debug log path
        raise ValueError(
            f"Metadata table returned zero rows. Verify metadata_database/metadata_table and that it is populated; also remove the existing tablemeta_cache file to force a refresh. "
            f"Received params: connection_name='{connection_name}', metadata_database='{metadata_db}', metadata_table='{metadata_table}'. "
            f"Debug log: {debug_log}"
        )

    # Build table structures
    table_desc: Dict[str, str] = {}
    column_entries: List[Dict[str, Any]] = []
    for r in rows:
        t = str(r.get("table_name", ""))
        c = str(r.get("column_name", ""))
        d = str(r.get("column_description", ""))
        if not t:
            continue
        if c is None or c.strip() == "":
            # Table description
            if d and not table_desc.get(t):
                table_desc[t] = d
        else:
            column_entries.append({
                "table": t,
                "column": c,
                "description": d,
            })

    # Resolve dynamic config from tool_params for weights and thresholds
    tp = tool_params
    tbl_name_w = TABLE_FIELD_WEIGHTS.get("name", 5)
    tbl_desc_w = TABLE_FIELD_WEIGHTS.get("desc", 2)
    col_name_w = COLUMN_FIELD_WEIGHTS.get("column", 5)
    col_tbl_w = COLUMN_FIELD_WEIGHTS.get("table", 2)
    col_type_w = COLUMN_FIELD_WEIGHTS.get("type", 1)
    col_desc_w = COLUMN_FIELD_WEIGHTS.get("desc", 2)
    df_stop_thr = 0.8
    prox_win = 3
    # Optional synonym map
    syn_map: Optional[Dict[str, List[str]]] = None

    # Prepare docs for scoring with BM25F-like replication
    table_names = sorted(set(list(table_desc.keys()) + [ce["table"] for ce in column_entries]))
    table_docs: List[str] = []
    for t in table_names:
        d = table_desc.get(t, "")
        name_rep = (f"{t} ") * tbl_name_w
        desc_rep = (f"{d} ") * tbl_desc_w
        name_exp = t.replace("_", " ")
        table_docs.append(f"{name_rep}{name_exp} {desc_rep}")
    table_prepared = _bm25_prepare(table_docs, df_stopword_threshold=df_stop_thr)

    # Score tables and columns per keyword and keep per-item best score+keyword
    per_table_best: Dict[str, Tuple[float, str]] = {t: (0.0, "") for t in table_names}
    per_column_best: List[Dict[str, Any]] = []  # mirrors column_entries order

    # Initialize column bests
    for e in column_entries:
        e["score"] = 0.0
        e["keyword"] = ""
        per_column_best.append(e)

    raw_keywords = keywords or []
    for kw in raw_keywords:
        tbl_scores = _bm25_scores(kw, table_prepared, expand_tokens=syn_map, proximity_window=prox_win)
        for t, sc in zip(table_names, tbl_scores):
            if sc > per_table_best[t][0]:
                per_table_best[t] = (float(sc), kw)

        # Column docs scored per keyword
        # Build column docs with BM25F-style replication using dynamic weights
        col_docs = []
        for e in column_entries:
            tbl = e["table"]
            col = e["column"]
            desc = e.get("description", "")
            doc = (
                (f"{col} ") * col_name_w +
                (f"{tbl} ") * col_tbl_w +
                (f"{e.get('type','')} ") * col_type_w +
                (f"{desc} ") * col_desc_w +
                col.replace("_", " ") + " " + tbl.replace("_", " ")
            )
            col_docs.append(doc)
        col_prepared = _bm25_prepare(col_docs, df_stopword_threshold=df_stop_thr)
        col_scores = _bm25_scores(kw, col_prepared, expand_tokens=syn_map, proximity_window=prox_win)
        for e, sc in zip(per_column_best, col_scores):
            if sc > e.get("score", 0.0):
                e["score"] = float(sc)
                e["keyword"] = kw

    # Helper: fixed quota picker per keyword (no dedup to guarantee exact counts)
    def pick_per_keyword(lists: List[List[Dict[str, Any]]], quotas: List[int]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for lst, q in zip(lists, quotas):
            if q <= 0:
                continue
            out.extend(lst[:q])
        return out

    # Build ranked lists per keyword for tables
    per_kw_table_lists: List[List[Dict[str, Any]]] = []
    for kw in (raw_keywords):
        tbl_scores = _bm25_scores(kw, table_prepared)
        tbl_pairs = list(zip(table_names, tbl_scores))
        tbl_pairs.sort(key=lambda x: x[1], reverse=True)
        per_kw_table_lists.append([
            {"table": t, "description": table_desc.get(t, ""), "score": float(sc), "keyword": kw}
            for t, sc in tbl_pairs
        ])
    # Quotas: distribute 5 tables across keywords as evenly as possible
    # Gate keywords with zero-signal
    gated_keywords: List[str] = []
    for idx, kw in enumerate(raw_keywords):
        has_signal = False
        if idx < len(per_kw_table_lists) and per_kw_table_lists[idx]:
            if per_kw_table_lists[idx][0].get("score", 0.0) > 0.0:
                has_signal = True
        if has_signal:
            gated_keywords.append(kw)
    n = max(1, len(gated_keywords) if gated_keywords else len(raw_keywords))
    base_q_tables = 5 // n
    remainder_tables = 5 - base_q_tables * n
    table_quotas = [base_q_tables + (1 if i < remainder_tables else 0) for i in range(n)]
    effective_per_kw_tables = per_kw_table_lists if not gated_keywords else [
        per_kw_table_lists[(raw_keywords.index(kw))] for kw in gated_keywords
    ]
    table_top = pick_per_keyword(effective_per_kw_tables, table_quotas)
    table_top.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    # Ensure distinct tables and try to cover different keywords
    seen_tbls: set = set()
    table_top_5: List[Dict[str, Any]] = []
    for item in table_top:
        t = item.get("table", "")
        if not t or t in seen_tbls:
            continue
        seen_tbls.add(t)
        table_top_5.append(item)
        if len(table_top_5) >= 5:
            break

    # Build ranked lists per keyword for columns
    base_col_docs = [f"{e['table']}.{e['column']} {e.get('description','')}" for e in column_entries]
    base_col_prepared = _bm25_prepare(base_col_docs)
    per_kw_col_lists: List[List[Dict[str, Any]]] = []
    for kw in (raw_keywords):
        col_scores = _bm25_scores(kw, base_col_prepared)
        pairs = list(zip(column_entries, col_scores))
        pairs.sort(key=lambda x: x[1], reverse=True)
        per_kw_col_lists.append([
            {
                "table": e["table"],
                "column": e["column"],
                "description": e.get("description", ""),
                "score": float(sc),
                "keyword": kw,
            }
            for e, sc in pairs
        ])
    # Quotas: distribute 25 columns across keywords as evenly as possible
    base_q_columns = 25 // n
    remainder_columns = 25 - base_q_columns * n
    column_quotas = [base_q_columns + (1 if i < remainder_columns else 0) for i in range(n)]
    effective_per_kw_cols = per_kw_col_lists if not gated_keywords else [
        per_kw_col_lists[(raw_keywords.index(kw))] for kw in gated_keywords
    ]
    col_top = pick_per_keyword(effective_per_kw_cols, column_quotas)
    col_top.sort(key=lambda x: x.get("score", 0.0), reverse=True)
    # Deduplicate column results and cap at 25
    seen_col_pairs: set = set()
    top_columns: List[Dict[str, Any]] = []
    for e in col_top:
        key = (e.get("table", ""), e.get("column", ""))
        if key in seen_col_pairs:
            continue
        seen_col_pairs.add(key)
        top_columns.append(e)
        if len(top_columns) >= 25:
            break

    # For top tables, include all of their column names
    table_to_columns_map: Dict[str, List[str]] = {}
    tmp_columns_accumulator: Dict[str, set] = {}
    for e in column_entries:
        tname = str(e.get("table", ""))
        cname = str(e.get("column", ""))
        if not tname or not cname:
            continue
        if tname not in tmp_columns_accumulator:
            tmp_columns_accumulator[tname] = set()
        tmp_columns_accumulator[tname].add(cname)
    for tname, cols in tmp_columns_accumulator.items():
        table_to_columns_map[tname] = sorted(list(cols))

    top_tables_with_columns: List[Dict[str, Any]] = []
    for item in table_top_5:
        tname = item.get("table", "")
        enriched = dict(item)
        enriched["columns"] = table_to_columns_map.get(tname, [])
        # Joinability hints: simple id/_id columns present in this table
        enriched["join_hints"] = [c for c in enriched["columns"] if c == "id" or c.endswith("_id")]
        top_tables_with_columns.append(enriched)

    # Per-keyword views intentionally omitted from output

    # Write JSON
    unique_path = _ensure_unique_output_path(output_file, ".json")
    # Build additional guidance for downstream LLMs
    # Suggested joins between top tables based on simple id/_id alignment
    suggested_joins: List[Dict[str, Any]] = []
    try:
        top_tbl_names = [t.get("table", "") for t in top_tables_with_columns]
        for i in range(len(top_tbl_names)):
            for j in range(i + 1, len(top_tbl_names)):
                a = top_tbl_names[i]
                b = top_tbl_names[j]
                a_cols = set(table_to_columns_map.get(a, []))
                b_cols = set(table_to_columns_map.get(b, []))
                # Common join keys heuristic
                candidates = []
                for c in a_cols:
                    if c == "id" or c.endswith("_id"):
                        if c in b_cols or c == f"{b.split('.')[-1]}_id" or c == f"{a.split('.')[-1]}_id":
                            candidates.append(c)
                if candidates:
                    suggested_joins.append({
                        "left_table": a,
                        "right_table": b,
                        "keys": sorted(list(set(candidates))),
                    })
    except Exception:
        suggested_joins = []

    out_payload = {
        "top_tables": top_tables_with_columns,
        "top_columns": top_columns,
        "suggested_joins": suggested_joins,
    }
    with open(unique_path, "w", encoding="utf-8") as f_out:
        json.dump(out_payload, f_out, ensure_ascii=False, indent=2)

    response: Dict[str, Any] = {
        "output_file": os.path.basename(unique_path),
        "tables_returned": len(top_tables_with_columns),
        "columns_returned": len(top_columns),
    }
    try:
        token_count = _estimate_tokens_from_json(out_payload)
        response["inline_json_tokens"] = token_count
        if token_count <= TOKEN_INLINE_THRESHOLD:
            response["inline_json"] = out_payload
    except Exception:
        pass
    return response


def _load_or_fetch_metadata_rows(
    connection_name: str,
    cursor: Any,
    metadata_db: str,
    metadata_table: str,
    debug_log: Optional[str] = None,
) -> List[Dict[str, str]]:
    cached = _load_tablemeta_cache(connection_name, metadata_db, metadata_table)
    if cached is None:
        _debug_write(debug_log, "No existing cache; fetching metadata")
        rows = _fetch_table_metadata(cursor, metadata_db, metadata_table, debug_log)
        if rows:
            payload = {"fetched_at_utc": datetime.utcnow().isoformat() + "Z", "rows": rows}
            _save_tablemeta_cache(connection_name, metadata_db, metadata_table, payload)
        else:
            rows = []
    else:
        _debug_write(debug_log, "Loaded existing cache")
        rows = cached.get("rows", [])
        if not rows:
            _debug_write(debug_log, "Cache empty; attempting refresh")
            refreshed = _fetch_table_metadata(cursor, metadata_db, metadata_table, debug_log)
            if refreshed:
                rows = refreshed
                payload = {"fetched_at_utc": datetime.utcnow().isoformat() + "Z", "rows": rows}
                _save_tablemeta_cache(connection_name, metadata_db, metadata_table, payload)
    return rows


def _metadata_list_tables_flow(
    connection_name: str,
    cursor: Any,
    metadata_db: str,
    metadata_table: str,
    output_file: str,
) -> Dict[str, Any]:
    debug_log = _debug_log_path()
    _debug_write(debug_log, f"Start list_tables; connection={connection_name} db={metadata_db} table={metadata_table}")

    rows = _load_or_fetch_metadata_rows(connection_name, cursor, metadata_db, metadata_table, debug_log)
    if not rows:
        raise ValueError(
            f"Metadata table returned zero rows. Verify metadata_database/metadata_table and that it is populated. Debug log: {debug_log}"
        )

    table_desc: Dict[str, str] = {}
    for r in rows:
        t = str(r.get("table_name", ""))
        c = str(r.get("column_name", ""))
        d = str(r.get("column_description", ""))
        if not t:
            continue
        if c is None or c.strip() == "":
            if d and not table_desc.get(t):
                table_desc[t] = d
        else:
            # Ensure table key exists even if no explicit table-level desc row
            table_desc.setdefault(t, table_desc.get(t, ""))

    items = [
        {"table": t, "description": table_desc.get(t, "")}
        for t in sorted(table_desc.keys())
    ]

    unique_path = _ensure_unique_output_path(output_file, ".json")
    out_payload = {"tables": items}
    with open(unique_path, "w", encoding="utf-8") as f_out:
        json.dump(out_payload, f_out, ensure_ascii=False, indent=2)

    response: Dict[str, Any] = {"output_file": os.path.basename(unique_path), "tables_returned": len(items)}
    try:
        token_count = _estimate_tokens_from_json(out_payload)
        response["inline_json_tokens"] = token_count
        if token_count <= TOKEN_INLINE_THRESHOLD:
            response["inline_json"] = out_payload
    except Exception:
        pass
    return response


def _metadata_describe_table_flow(
    connection_name: str,
    cursor: Any,
    metadata_db: str,
    metadata_table: str,
    table_name: str,
    output_file: str,
) -> Dict[str, Any]:
    debug_log = _debug_log_path()
    _debug_write(debug_log, f"Start describe_table; connection={connection_name} db={metadata_db} table={metadata_table} target={table_name}")

    rows = _load_or_fetch_metadata_rows(connection_name, cursor, metadata_db, metadata_table, debug_log)
    if not rows:
        raise ValueError(
            f"Metadata table returned zero rows. Verify metadata_database/metadata_table and that it is populated. Debug log: {debug_log}"
        )

    # Normalize table match using identifier normalization used elsewhere
    target_norm = _normalize_identifier(table_name)
    tbl_desc_value = ""
    columns: List[Dict[str, str]] = []

    for r in rows:
        t = str(r.get("table_name", ""))
        c = str(r.get("column_name", ""))
        d = str(r.get("column_description", ""))
        if _normalize_identifier(t) != target_norm:
            continue
        if c is None or c.strip() == "":
            # Table-level description
            if d:
                tbl_desc_value = d
        else:
            columns.append({"column": c, "description": d})

    if not columns and not tbl_desc_value:
        raise ValueError(f"No metadata found for table '{table_name}'")

    unique_path = _ensure_unique_output_path(output_file, ".json")
    out_payload = {"table": table_name, "description": tbl_desc_value, "columns": columns}
    with open(unique_path, "w", encoding="utf-8") as f_out:
        json.dump(out_payload, f_out, ensure_ascii=False, indent=2)

    response: Dict[str, Any] = {
        "output_file": os.path.basename(unique_path),
        "columns_returned": len(columns),
    }
    try:
        token_count = _estimate_tokens_from_json(out_payload)
        response["inline_json_tokens"] = token_count
        if token_count <= TOKEN_INLINE_THRESHOLD:
            response["inline_json"] = out_payload
    except Exception:
        pass
    return response


def _cache_path(connection_name: str, db_scope: str) -> str:
    session_dir_abs = _get_session_dir_abs()
    fname = f"schema_cache_{_safe_filename(connection_name)}_{_safe_filename(db_scope)}.json"
    return os.path.join(session_dir_abs, fname)


def _load_cache_if_exists(connection_name: str, db_scope: str) -> Optional[Dict[str, Any]]:
    path = _cache_path(connection_name, db_scope)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f_in:
            return json.load(f_in)
    except Exception:
        return None


def _save_cache(connection_name: str, db_scope: str, payload: Dict[str, Any]) -> str:
    path = _cache_path(connection_name, db_scope)
    with open(path, "w", encoding="utf-8") as f_out:
        json.dump(payload, f_out, ensure_ascii=False)
    return path


def _execute(cursor: Any, sql: str) -> Tuple[List[str], List[Tuple[Any, ...]]]:
    cursor.execute(sql)
    has_resultset = getattr(cursor, "description", None) is not None
    colnames = [desc[0] for desc in cursor.description] if has_resultset else []
    rows = cursor.fetchall() if has_resultset else []
    return colnames, rows


def _list_databases(cursor: Any) -> List[str]:
    try:
        _, rows = _execute(cursor, "SHOW DATABASES")
        if not rows:
            return []
        # Take first column of each row as database name
        return [str(row[0]) for row in rows]
    except Exception:
        return []


def _list_tables(cursor: Any, database: str) -> List[str]:
    try:
        _, rows = _execute(cursor, f"SHOW TABLES IN {database}")
        if not rows:
            return []
        # The first column is typically the table name
        return [str(row[0]) for row in rows]
    except Exception:
        return []


def _describe_table_columns(cursor: Any, database: str, table: str) -> List[Dict[str, Any]]:
    try:
        _, rows = _execute(cursor, f"DESCRIBE {database}.{table}")
    except Exception:
        return []

    columns: List[Dict[str, Any]] = []
    for row in rows:
        if not row:
            continue
        col_name = str(row[0]) if row[0] is not None else ""
        if not col_name or col_name.startswith("#") or col_name.lower().startswith("partition "):
            break
        data_type = str(row[1]) if len(row) > 1 and row[1] is not None else ""
        comment = str(row[2]) if len(row) > 2 and row[2] is not None else ""
        # Skip struct separator rows etc.
        if col_name.strip() == "" or col_name.strip().startswith("_col") and comment == "":
            continue
        columns.append(
            {
                "database": database,
                "table": table,
                "column": col_name,
                "type": data_type,
                "comment": comment,
            }
        )
    return columns


def _discover_metadata(cursor: Any, databases: List[str]) -> Dict[str, Any]:
    all_columns: List[Dict[str, Any]] = []
    for db in databases:
        tables = _list_tables(cursor, db)
        for table in tables:
            cols = _describe_table_columns(cursor, db, table)
            all_columns.extend(cols)
    payload: Dict[str, Any] = {
        "discovered_at_utc": datetime.utcnow().isoformat() + "Z",
        "databases": databases,
        "columns": all_columns,
    }
    # Build lexical index for fast subsequent queries
    _ensure_lexical_index(payload)
    return payload


def _compute_name_match_relationships(column_entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    col_to_tables: Dict[str, set] = {}
    for e in column_entries:
        database = str(e.get("database", ""))
        table = str(e.get("table", ""))
        column = str(e.get("column", ""))
        if not database or not table or not column:
            continue
        fq_table = f"{database}.{table}"
        col_key = column.lower().strip()
        if not col_key:
            continue
        s = col_to_tables.get(col_key)
        if s is None:
            s = set()
            col_to_tables[col_key] = s
        s.add(fq_table)

    relationships: List[Dict[str, Any]] = []
    for col_key, tables in col_to_tables.items():
        if len(tables) < 2:
            continue
        relationships.append({
            "column": col_key,
            "tables": sorted(list(tables)),
        })

    # Sort by number of tables descending, then column name
    relationships.sort(key=lambda r: (-len(r.get("tables", [])), r.get("column", "")))
    return {"relationships": relationships}


def _ensure_lexical_index(meta: Dict[str, Any]) -> None:
    if meta is None:
        return
    if meta.get("columns") is None:
        return
    if meta.get("lexical") and isinstance(meta.get("lexical"), dict):
        # Already present
        return
    column_entries: List[Dict[str, Any]] = cast(List[Dict[str, Any]], meta.get("columns", []))
    documents = [_build_search_text(e) for e in column_entries]
    token_df: Dict[str, int] = {}
    per_doc_tf: List[Dict[str, int]] = []
    doc_len: List[int] = []
    for text in documents:
        toks_all = _normalize_tokens(text)
        tf: Dict[str, int] = {}
        for t in toks_all:
            tf[t] = tf.get(t, 0) + 1
        per_doc_tf.append(tf)
        doc_len.append(len(toks_all))
        for t in set(toks_all):
            token_df[t] = token_df.get(t, 0) + 1
    avgdl = float(sum(doc_len) / max(1, len(doc_len)))
    meta["lexical"] = {
        "documents": documents,
        "per_doc_tf": per_doc_tf,
        "doc_len": doc_len,
        "token_df": token_df,
        "num_docs": len(documents),
        "avgdl": avgdl,
    }


def _build_search_text(entry: Dict[str, Any]) -> str:
    database = entry.get("database", "")
    table = entry.get("table", "")
    column = entry.get("column", "")
    col_type = entry.get("type", "")
    comment = entry.get("comment", "")
    parts = [f"{database}.{table}.{column}", col_type, comment]
    # Help lexical matching by expanding underscores into separate tokens
    parts.append(" ".join(column.replace("_", " ").split()))
    parts.append(" ".join(table.replace("_", " ").split()))
    # Keep raw concatenation here (BM25F replication is applied at call site using dynamic weights)
    return " ".join([p for p in parts if p])


# Embeddings removed for speed guarantees (<2s). Using lexical/BM25 only.


def _rank_with_lexical(query: str, meta: Dict[str, Any], column_entries: List[Dict[str, Any]]) -> List[Tuple[int, float]]:
    # Precomputed BM25-like fast scoring using cached per-doc term frequencies
    lexical = cast(Dict[str, Any], meta.get("lexical", {}))
    documents: List[str] = cast(List[str], lexical.get("documents", []))
    per_doc_tf: List[Dict[str, int]] = cast(List[Dict[str, int]], lexical.get("per_doc_tf", []))
    token_df: Dict[str, int] = cast(Dict[str, int], lexical.get("token_df", {}))
    doc_len: List[int] = cast(List[int], lexical.get("doc_len", []))
    num_docs: int = int(lexical.get("num_docs", len(column_entries)))
    avgdl: float = float(lexical.get("avgdl", 1.0))

    # BM25 parameters
    k1 = 1.2
    b = 0.75

    query_tokens = _normalize_tokens(query)
    # Collapse duplicates in query to reduce work; keep only intrinsic phrase if present
    expanded: List[str] = list(query_tokens)
    qtext = query.lower().replace("-", " ")
    if "same day" in qtext and "same day" not in expanded:
        expanded.append("same day")
    unique_query_tokens = list(set(expanded))

    scores: List[Tuple[int, float]] = []
    for idx, tf in enumerate(per_doc_tf):
        score = 0.0
        dl = doc_len[idx] if idx < len(doc_len) else 1
        for term in unique_query_tokens:
            df = token_df.get(term, 0)
            if df == 0:
                continue
            # IDF with BM25 smoothing
            idf = max(0.0, float((num_docs - df + 0.5) / (df + 0.5)))
            tf_i = tf.get(term, 0)
            denom = tf_i + k1 * (1 - b + b * (dl / max(1.0, avgdl)))
            bm25 = (idf * (tf_i * (k1 + 1))) / max(1.0, denom)
            score += bm25

        # Exact name boosts
        colname = str(column_entries[idx].get("column", "")).lower()
        tblname = str(column_entries[idx].get("table", "")).lower()
        if colname in unique_query_tokens:
            score += 1.5
        if tblname in unique_query_tokens:
            score += 0.5

        # Proximity/substring bonus across prepared document text
        if score == 0.0 and idx < len(documents):
            doc_text = documents[idx].lower()
            for qt in unique_query_tokens:
                if len(qt) >= 3 and qt in doc_text:
                    score += 0.1
            # Bigram proximity: small window for multi-term queries
            if len(unique_query_tokens) >= 2:
                tokens = doc_text.split()
                positions: Dict[str, List[int]] = {}
                for pos, tok in enumerate(tokens):
                    if tok in unique_query_tokens:
                        positions.setdefault(tok, []).append(pos)
                # reward if any two query tokens appear within window 3
                window = 3
                found_close = False
                for a in unique_query_tokens:
                    for b in unique_query_tokens:
                        if a >= b:
                            continue
                        for pa in positions.get(a, []):
                            for pb in positions.get(b, []):
                                if abs(pa - pb) <= window:
                                    found_close = True
                                    break
                            if found_close:
                                break
                        if found_close:
                            break
                    if found_close:
                        break
                if found_close:
                    score += 0.2
        scores.append((idx, float(score)))

    scores.sort(key=lambda x: x[1], reverse=True)
    return scores


# Relationship discovery and caching
def _relationships_cache_path(connection_name: str, db_scope: str) -> str:
    session_dir_abs = _get_session_dir_abs()
    fname = f"schema_rel_cache_{_safe_filename(connection_name)}_{_safe_filename(db_scope)}.json"
    return os.path.join(session_dir_abs, fname)


def _load_relationships_cache(connection_name: str, db_scope: str) -> Optional[Dict[str, Any]]:
    path = _relationships_cache_path(connection_name, db_scope)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f_in:
            return json.load(f_in)
    except Exception:
        return None


def _save_relationships_cache(connection_name: str, db_scope: str, payload: Dict[str, Any]) -> str:
    path = _relationships_cache_path(connection_name, db_scope)
    with open(path, "w", encoding="utf-8") as f_out:
        json.dump(payload, f_out, ensure_ascii=False)
    return path


def _try_info_schema_names(cursor: Any) -> Optional[str]:
    # Return the usable information schema name if available
    for name in ["information_schema", "INFORMATION_SCHEMA"]:
        try:
            _execute(cursor, f"SHOW TABLES IN {name}")
            return name
        except Exception:
            continue
    return None


def _discover_relationships_via_info_schema(cursor: Any, database: str, info_schema: str) -> Dict[str, Any]:
    relationships: Dict[str, Any] = {"primary_keys": {}, "foreign_keys": [], "source": "information_schema"}
    try:
        # Primary keys
        pk_sql = (
            f"SELECT tc.table_name, kcu.column_name \n"
            f"FROM {info_schema}.table_constraints tc \n"
            f"JOIN {info_schema}.key_column_usage kcu \n"
            f"  ON tc.constraint_name = kcu.constraint_name \n"
            f"  AND tc.table_schema = kcu.table_schema \n"
            f"  AND tc.table_name = kcu.table_name \n"
            f"WHERE tc.table_schema = '{database}' AND tc.constraint_type = 'PRIMARY KEY'"
        )
        _, pk_rows = _execute(cursor, pk_sql)
        for row in pk_rows:
            tbl = str(row[0])
            col = str(row[1])
            relationships["primary_keys"].setdefault(tbl, []).append(col)

        # Foreign keys (best-effort)
        fk_sql = (
            f"SELECT kcu.table_name AS table_name, kcu.column_name AS column_name, \n"
            f"       kcu.referenced_table_name AS referenced_table_name, kcu.referenced_column_name AS referenced_column_name \n"
            f"FROM {info_schema}.key_column_usage kcu \n"
            f"WHERE kcu.table_schema = '{database}' AND kcu.referenced_table_name IS NOT NULL"
        )
        _, fk_rows = _execute(cursor, fk_sql)
        for row in fk_rows:
            relationships["foreign_keys"].append(
                {
                    "from_table": str(row[0]),
                    "from_column": str(row[1]),
                    "to_table": str(row[2]),
                    "to_column": str(row[3]),
                }
            )
    except Exception:
        return {"primary_keys": {}, "foreign_keys": [], "source": "information_schema_error"}
    return relationships


def _parse_constraints_from_ddl(ddl: str) -> Dict[str, Any]:
    pks: Dict[str, List[str]] = {}
    fks: List[Dict[str, str]] = []
    # Find PRIMARY KEY (col, col2)
    for m in re.finditer(r"PRIMARY\s+KEY\s*\(([^)]+)\)", ddl, flags=re.IGNORECASE):
        cols = [c.strip().strip('`') for c in m.group(1).split(',') if c.strip()]
        if cols:
            pks.setdefault("__TABLE__", []).extend(cols)
    # Find FOREIGN KEY (col) REFERENCES db.table(col)
    for m in re.finditer(r"FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([A-Za-z0-9_\.`]+)\s*\(([^)]+)\)", ddl, flags=re.IGNORECASE):
        from_cols = [c.strip().strip('`') for c in m.group(1).split(',') if c.strip()]
        ref_full = m.group(2).strip().strip('`')
        to_cols = [c.strip().strip('`') for c in m.group(3).split(',') if c.strip()]
        fks.append({"from_cols": from_cols[0] if from_cols else "", "to": ref_full, "to_cols": to_cols[0] if to_cols else ""})
    return {"pks": pks, "fks": fks}


def _discover_relationships_via_ddl(cursor: Any, database: str, tables: List[str]) -> Dict[str, Any]:
    relationships: Dict[str, Any] = {"primary_keys": {}, "foreign_keys": [], "source": "ddl_parse"}
    for tbl in tables:
        try:
            _, rows = _execute(cursor, f"SHOW CREATE TABLE {database}.{tbl}")
            ddl = "\n".join([str(r[0]) for r in rows if r and r[0] is not None])
            parsed = _parse_constraints_from_ddl(ddl)
            if parsed["pks"].get("__TABLE__"):
                relationships["primary_keys"][tbl] = parsed["pks"]["__TABLE__"]
            for fk in parsed["fks"]:
                relationships["foreign_keys"].append(
                    {
                        "from_table": tbl,
                        "from_column": fk["from_cols"],
                        "to_table": fk["to"],
                        "to_column": fk["to_cols"],
                    }
                )
        except Exception:
            continue
    return relationships


def _infer_relationships_from_names(column_entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    relationships: Dict[str, Any] = {"primary_keys": {}, "foreign_keys": [], "source": "inferred"}
    # Map table -> set(columns)
    table_to_cols: Dict[str, set] = {}
    for e in column_entries:
        tbl = f"{e.get('database','')}.{e.get('table','')}"
        col = str(e.get("column", ""))
        table_to_cols.setdefault(tbl, set()).add(col.lower())

    # Heuristic: if table has 'id', consider it PK; if table name singular/plural + '_id' exists elsewhere, consider FK
    for tbl, cols in table_to_cols.items():
        if "id" in cols:
            relationships["primary_keys"][tbl] = ["id"]

    # Build target name tokens
    tbl_basenames = {tbl: tbl.split(".")[-1] for tbl in table_to_cols}
    for from_tbl, cols in table_to_cols.items():
        for col in cols:
            if col.endswith("_id") and col != "id":
                base = col[:-3]
                # try to find table whose basename matches base or base + 's'
                for to_tbl, to_base in tbl_basenames.items():
                    if to_tbl == from_tbl:
                        continue
                    if to_base == base or to_base == base + "s" or to_base + "s" == base:
                        relationships["foreign_keys"].append(
                            {
                                "from_table": from_tbl,
                                "from_column": col,
                                "to_table": to_tbl,
                                "to_column": "id" if "id" in table_to_cols[to_tbl] else "",
                            }
                        )
    return relationships


def run_tool(config: UserParameters, args: ToolParameters) -> Any:
    connection = cmldata.get_connection(
        config.hive_cai_data_connection_name,
        parameters={
            "USERNAME": config.workload_user,
            "PASSWORD": config.workload_pass,
        },
    )

    cursor = connection.get_cursor()

    try:
        # Route by action
        action = (args.action or "search").lower().strip()
        if action == "list_tables":
            return _metadata_list_tables_flow(
                connection_name=config.hive_cai_data_connection_name,
                cursor=cursor,
                metadata_db=config.metadata_database,
                metadata_table=config.metadata_table,
                output_file=args.output_file,
            )
        if action == "describe_table":
            table_name = (args.keywords[0] if args.keywords else "").strip()
            if not table_name:
                return {"error": "For action 'describe_table', provide keywords as [exact_table_name]"}
            return _metadata_describe_table_flow(
                connection_name=config.hive_cai_data_connection_name,
                cursor=cursor,
                metadata_db=config.metadata_database,
                metadata_table=config.metadata_table,
                table_name=table_name,
                output_file=args.output_file,
            )
        # Default: search behavior (existing)
        if action == "search" and args.keywords:
            return _metadata_search_flow(
                connection_name=config.hive_cai_data_connection_name,
                cursor=cursor,
                metadata_db=config.metadata_database,
                metadata_table=config.metadata_table,
                keywords=args.keywords,
                output_file=args.output_file,
                tool_params=args,
            )

        # Otherwise, run the original relationship discovery flow (legacy) if database provided
        target_db = args.database if args.database else None
        if not target_db:
            return {"error": "Provide a valid 'action' (list_tables | describe_table | search with keywords). For legacy relationship discovery, provide 'database'."}
        databases = [target_db]
        db_scope = target_db

        # Load or refresh cache
        cache_obj: Optional[Dict[str, Any]] = _load_cache_if_exists(
            config.hive_cai_data_connection_name, db_scope
        )

        if cache_obj is None:
            t0_sql = time.time()
            meta = _discover_metadata(cursor, databases)
            _ = time.time() - t0_sql
            _save_cache(config.hive_cai_data_connection_name, db_scope, meta)
        else:
            meta = cache_obj

        column_entries: List[Dict[str, Any]] = meta.get("columns", [])

        if not column_entries:
            return {"error": "No columns discovered in the selected database scope"}

        # Relationship discovery with caching (column-name matches only)
        rel_cache = _load_relationships_cache(config.hive_cai_data_connection_name, db_scope)
        if rel_cache is None:
            relationships = _compute_name_match_relationships(column_entries)
            _save_relationships_cache(config.hive_cai_data_connection_name, db_scope, relationships)
        else:
            relationships = rel_cache

        # Write JSON output
        unique_path = _ensure_unique_output_path(args.output_file, ".json")
        # Output file should contain only relationships JSON
        output_payload = relationships
        with open(unique_path, "w", encoding="utf-8") as f_out:
            json.dump(output_payload, f_out, ensure_ascii=False, indent=2)

        response: Dict[str, Any] = {
            "output_file": os.path.basename(unique_path),
            "relationships_count": len(relationships.get("relationships", [])),
        }
        try:
            token_count = _estimate_tokens_from_json(output_payload)
            response["inline_json_tokens"] = token_count
            if token_count <= TOKEN_INLINE_THRESHOLD:
                response["inline_json"] = output_payload
        except Exception:
            pass
        return response
    except Exception as error:  # noqa: BLE001
        return {"error": f"Analysis failed: {error}"}
    finally:
        connection.close()


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
