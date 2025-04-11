# File: tool.py

from textwrap import dedent
from typing import Literal, Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool

import json
import argparse 

class UserParameters(BaseModel):
    pass

class ToolParameters(BaseModel):
    customer_id: str = Field(description="Customer ID - The unique identifier for the customer")

def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    customer_id = args.customer_id
    
    # Placeholder for actual portfolio data retrieval
    portfolio_data = {
        "portfolio_makeup": {
            "stocks": ["AAPL", "GOOGL", "MSFT", "ADBE"],
            "percent": ["0.2", "0.4", "0.3", "0.1" ]
        },
        "total_value": 100000
    }
    return portfolio_data


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