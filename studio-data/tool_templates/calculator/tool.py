from pydantic import BaseModel, Field
from typing import Literal
import json 
import argparse

from calc import run_calc


class UserParameters(BaseModel):
    """
    Parameters used to configure a tool. This may include API keys,
    database connections, environment variables, etc.
    """
    pass 


class ToolParameters(BaseModel):
    """
    Arguments of a tool call. These arguments are passed to this tool whenever
    an Agent calls this tool. The descriptions below are also provided to agents
    to help them make informed decisions of what to pass to the tool.
    """
    a: float = Field(description="first number")
    b: float = Field(description="second number")
    op: Literal["+", "-", "*", "/"] = Field(description="operator")


def run_tool(config: UserParameters, args: ToolParameters):
    """
    Main tool code logic. Anything returned from this method is returned
    from the tool back to the calling agent.
    """
    
    return run_calc(
        args.a,
        args.b,
        args.op
    )


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

    output = run_tool(config, params)
    print(OUTPUT_KEY, output)



