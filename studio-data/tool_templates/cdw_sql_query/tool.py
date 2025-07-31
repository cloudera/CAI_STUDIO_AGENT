"""
This tool executes a given SQL query on the configured database
and returns the output as a Pandas DataFrame in text format.
"""

from textwrap import dedent
from typing import Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool  # Required for the tool to be recognized
import argparse
import json

import cml.data_v1 as cmldata
import pandas as pd
import os

class UserParameters(BaseModel):
    """
    Define user parameters required for the tool.
    These parameters should be passed when initializing the tool instance.
    """
    workload_user: str
    workload_pass: str
    hive_cai_data_connection_name: str
    default_database: str


class ToolParameters(BaseModel):
    """
    Parameters for executing the SQL query.
    """
    sql_query: str = Field(
        description="The SQL query to execute on the database."
    )


def run_tool(config: UserParameters, args: ToolParameters):
    conn = cmldata.get_connection(
        config.hive_cai_data_connection_name,
        parameters={
            "USERNAME": config.workload_user,
            "PASSWORD": config.workload_pass
        }
    )
    cursor = conn.get_cursor()

    try:

        cursor.execute(f"USE {config.default_database}")

        sql_query = args.sql_query
        if sql_query[-1] == ";":
            sql_query = sql_query[:-1]
        
        cursor.execute(sql_query)
        columns = [desc[0] for desc in cursor.description]  # Extract column names
        rows = cursor.fetchall()
        df = pd.DataFrame(rows, columns=columns)
    except Exception as error:
        return f"SQL Execution failed. Error details: {error}"
    finally:
        conn.close()

    return df.to_string(index=False)


OUTPUT_KEY = "tool_output"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-params", required=True, help="JSON string for user params")
    parser.add_argument("--tool-params", required=True, help="JSON string for tool arguments")
    args = parser.parse_args()

    config = UserParameters(**json.loads(args.user_params))
    params = ToolParameters(**json.loads(args.tool_params))
    output = run_tool(config, params)
    print(OUTPUT_KEY, output)