"""
Sample agent studio tool to showcase
tool making capabilities.
"""

from pydantic import BaseModel, Field
from typing import Optional, Any
import json 
import argparse


class UserParameters(BaseModel):
    """
    Parameters used to configure a tool. This may include API keys,
    database connections, environment variables, etc.
    """
    user_key_1: str # User parameters can be required, and will lead to a tool failure if this parameter is missing.
    user_key_2: Optional[str] = None  # User parameters can also be optional if they're not needed by the tool, but may be used.
    pass 


class ToolParameters(BaseModel):
    """
    Arguments of a tool call. These arguments are passed to this tool whenever
    an Agent calls this tool. The descriptions below are also provided to agents
    to help them make informed decisions of what to pass to the tool.
    """
    input1: str = Field(description="First parameter that should be passed to the tool")
    input2: str = Field(description="Second parameter to be passed to the tool")



def run_tool(config: UserParameters, args: ToolParameters) -> Any:
    """
    Main tool code logic. Anything returned from this method is returned
    from the tool back to the calling agent.
    """
    
    result_object = {
        "combined": args.input1 + args.input2,
    }
    return result_object




OUTPUT_KEY = "tool_output"
"""
When an agent calls a tool, technically the tool's entire stdout can be passed back to the agent.
However, if an OUTPUT_KEY is present in a tool's main file, only stdout content *after* this key is
passed to the agent. This allows us to return structured output to the agent while still retaining
the entire stdout stream from a tool! By default, this feature is enabled, and anything returned
from the run_tool() method above will be the structured output of the tool.
"""


if __name__ == "__main__":
    """
    Tool entrypoint. 
    
    The only two things that are required in a tool are the
    ToolConfiguration and ToolArguments classes. Then, the only two arguments that are
    passed to a tool entrypoint are "--tool-config" and "--tool-args", respectively. The rest
    of the implementation is up to the tool builder - feel free to customize the entrypoint to your 
    chosing!
    """
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-params", required=True, help="Tool configuration")
    parser.add_argument("--tool-params", required=True, help="Tool arguments")
    args = parser.parse_args()
    
    # Parse JSON into dictionaries
    user_dict = json.loads(args.user_params)
    tool_dict = json.loads(args.tool_params)
    
    # Validate dictionaries against Pydantic models
    config = UserParameters(**user_dict)
    params = ToolParameters(**tool_dict)
    
    # Run the tool.
    output = run_tool(config, params)
    print(OUTPUT_KEY, output)