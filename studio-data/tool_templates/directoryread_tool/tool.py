from typing import Optional, Type
from textwrap import dedent
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool
import os
import json
import argparse
import glob

class UserParameters(BaseModel):
    pass
    
class ToolParameters(BaseModel):
    directory: Optional[str] = Field(None, description="The directory path for file listing.")

def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    # Use function argument if provided, else fallback to user parameter
    directory = args.directory

    if not directory:
        return "Error: No directory provided."

    # Remove trailing slash if present
    directory = directory.rstrip("/")
    
    # Verify that the directory exists
    if not os.path.isdir(directory):
        return f"Error: {directory} is not a directory."

    # Use glob to get top-level items (files + directories) in the directory
    pattern = os.path.join(directory, "*")
    items = glob.glob(pattern)

    return items


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