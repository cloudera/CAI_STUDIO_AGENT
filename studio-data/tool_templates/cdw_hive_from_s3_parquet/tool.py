# File: tool.py

from textwrap import dedent
from typing import Dict, List, Optional, Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool # This import is required for the tool to be recognized by the studio

# import <any other requirements(python libraries) for the tool>
import cml.data_v1 as cmldata
import os
import json
import argparse


class UserParameters(BaseModel):
    """
    This class is used to define the parameters that would be passed by the user.
    These are used to configuire the same tool template for different instances of the service being used by the tool.
    For example,
    This can include URLs, file paths, API keys, etc.

    User parameters can also be an empty class, if the tool does not require any user parameters.
    """

    workload_user: str
    workload_pass: str
    hive_cai_data_connection_name: str

class ToolParameters(BaseModel):
    """
    This class is used to define the parameters that would be determined by AI/Agents.
    Make sure to properly annotate the parameters with the correct type and description,
    so that LLMs can understand the meaning of the parameters, and suggest the correct values.
    """

    table_name: str = Field(
        description="The table name to create"
    )
    s3_path: str = Field(
        description="The path which contains the parquet table files"
    )

def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    table_name = args.table_name
    s3_path = args.s3_path
    
    os.environ["WORKLOAD_PASSWORD"] = config.workload_pass
    os.environ["HADOOP_USER_NAME"] = config.workload_user
    conn = cmldata.get_connection(config.hive_cai_data_connection_name)

    parquet_path = s3_path
    schema_0_path = parquet_path+'/0.parquet'

    SQL_QUERY_tmpl = """
    CREATE EXTERNAL TABLE {table_name}
    LIKE FILE PARQUET '{schema_0_path}'
    STORED AS PARQUET
    LOCATION '{parquet_path}'
    """

    SQL_QUERY = SQL_QUERY_tmpl.format(table_name=table_name, parquet_path=parquet_path, schema_0_path=schema_0_path)
    cursor = conn.get_cursor()

    try:
        result = cursor.execute(SQL_QUERY)
    except Exception as error:
        return "Table Creation failed. Report this status to User.\n Error details: %s" % error
    

    conn.close()

    return "Table Creation Successful: %s" % table_name


OUTPUT_KEY="tool_output"

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-params", required=True, help="JSON string for tool configuration")
    parser.add_argument("--tool-params", required=True, help="JSON string for tool arguments")
    args = parser.parse_args()
    
    # Parse JSON into dictionaries
    config_dict = json.loads(args.user_params)
    params_dict = json.loads(args.tool_params)
    
    # Validate dictionaries against Pydantic models
    config = UserParameters(**config_dict)
    params = ToolParameters(**params_dict)

    output = run_tool(
        config,
        params
    )
    print(OUTPUT_KEY, output)