# Custom Tools in Agent Studio

This guide will walk you through creating and using a custom tool within Agent Studio. We’ll cover the high-level anatomy of a tool, how to build one from scratch (based on the example code), and best practices for testing and validation.


## Anatomy of a Tool
A custom tool in Agent Studio is structured around three main pieces:

- `UserParameters`
   - Defines the configuration needed to set up or authenticate the tool.
   - Typically includes API keys, database credentials, or any user-specific settings.
   - Must be provided whenever the tool is used in a deployed environment or within a Crew.

- `ToolParameters`
    - Defines the run-time arguments an agent needs to pass into the tool for each invocation.
    - These are the parameters that define how the tool should behave for a specific call.

- `run_tool(...)`
    - The main function or method containing the tool’s core logic.
    - Takes the validated UserParameters and ToolParameters objects and executes the desired functionality (e.g. API calls, data processing, etc.).
    - Returns the result object (any Python data structure), which gets sent back to the agent.

For a full sample code listing, see the **Sample Tool Structure** section in the Appendix below.


### Example File Structure
A typical single-file tool might look like this in your project (note, you are not limited to one tool file - you can create an entire package if needed):

```
my_cool_tool/
├─ __init__.py
├─ tool.py
└─ requirements.txt
```

The most important file is `tool.py`—this is the entrypoint containing:
- Your Pydantic models (`UserParameters`, `ToolParameters`).
- The `run_tool(...)` function.
- Any other logic needed (in the sample tool case, we provide a command-line interface that parses JSON-serialized user parameters and tool parameters).

## Testing a Tool Outside of Agent Studio

To test your tool locally outside  Agent Studio during tool development process, you can treat the tool like any other standard python project with an entrypoint file.

Activate your virtual environment (if you have one).
Install dependencies:
```
pip install -r requirements.txt
```
Run your tool with sample parameters:
```
python main.py \
  --user-params '{"user_key_1": "abc123", "user_key_2": "def456"}' \
  --tool-params '{"input1": "hello ", "input2": "world!"}'
```
 - `--user-params` expects a JSON string that must conform to UserParameters.
 - `--tool-params` expects a JSON string that must conform to ToolParameters.

**Inspect the Output:** You should see something like this printed to your terminal:
```
tool_output {"combined": "hello world!"}
```

If you don’t see `tool_output` or if an error is raised, check your parameters or review the Pydantic error messages to ensure your JSON matches the required fields.

## Advanced Tool Concepts

### Controlling Tool Output

Agent Studio captures and processes the tool’s stdout to provide a response back to the calling agent:

 When the `OUTPUT_KEY` is present, Everything printed to stdout after `OUTPUT_KEY` is treated as the final output. This is useful for returning structured data to the agent while allowing you to include additional log or debug statements earlier in the output. For instance, if `OUTPUT_KEY="tool_output"`, and you print:

```
Debug: Doing some work here...
tool_output {"final_result": 123}
```
The agent will only receive `{"final_result": 123}` as the structured output.

When the `OUTPUT_KEY` is not present in the tool's main file, the entire `stdout` stream is returned to the agent. This means any debug statements or logs will be included in the final output. If you want to provide structured data to the agent without `OUTPUT_KEY`, you should be sure not to print extraneous information or logs that might confuse the agent’s parsing.

In general, it is recommended to use `OUTPUT_KEY` so that you can log freely throughout your tool without impacting the agent’s understanding of the final output.



### Modifying a Tool's Entrypoint

For most simple use cases, you only need to modify the contents of the `run_tool` function to implement your core logic.

However, you can completely change the entrypoint file to suit your needs, as long as the file still contains both `UserParameters` and `ToolParameters`. Agent Studio looks for these classes to determine how to validate and parse data passed to the tool.

#### Behavior of the Entrypoint

When calling your tool, Agent Studio will automatically invoke the tool file and pass two arguments:
 - `--user-params` (containing a JSON string that corresponds to UserParameters)
 - `--tool-params` (containing a JSON string that corresponds to ToolParameters)

After parsing these arguments, your entrypoint can proceed in any manner you wish, as long as the classes `UserParameters` and `ToolParameters` exist in the file. For example, you could:
 - Implement additional business logic before calling `run_tool`.
 - Handle logging in different ways.
 - Output results to `stdout` in an alternative format (though to ensure Agent Studio can parse the output, you should continue to use OUTPUT_KEY for the final return data).


## Appendix

### Sample Tool

Full listing of a sample tool

```python
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
    user_key_1: str  # e.g. an API key
    user_key_2: Optional[str] = None  # optional user parameter

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
    # Simple example: combine the two string inputs
    result_object = {
        "combined": args.input1 + args.input2,
    }
    return result_object

OUTPUT_KEY = "tool_output"
"""
When an agent calls a tool, the tool's entire stdout can be passed back to the agent.
However, if OUTPUT_KEY is present in a tool's main file, only stdout content *after*
this key is passed to the agent. This allows us to return structured output to the agent
while still retaining the entire stdout stream from a tool.
"""

if __name__ == "__main__":
    """
    Tool entrypoint. 
    Parses CLI arguments and runs run_tool.
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

    # Run the tool and return structured output
    output = run_tool(config, params)
    print(OUTPUT_KEY, output)
```

#### Sample Tool Components

* Imports:
  - We use Python’s built-in argparse for command-line argument handling.
  - json handles JSON serialization and deserialization.
  - pydantic enforces schema validation for our input data.

* `UserParameters`:
  - Enforces that user_key_1 is mandatory. If it’s missing, the tool will fail at runtime.
  - You can add as many optional or required user parameters as you need.

* ToolParam`eters:
  - Captures what you might pass to this tool at runtime.
  - In the example, we expect two string inputs, input1 and input2.

* `run_tool(...)`:
  - You can do any logic here—make HTTP calls, process data, query a database, etc.
  - The return value should be JSON-serializable if you want the agent to parse it easily.

* `OUTPUT_KEY`:
  - A special string that signals to Agent Studio that everything after it in stdout contains the final output.
  - This ensures the agent can consume the structured data without being confused by logs, debug statements, or other messages printed beforehand.

* `if __name__ == "__main__":`:
   - The CLI code that:
     - Accepts two JSON strings via the --user-params and --tool-params flags.
     - Deserializes them into dictionaries.
     - Validates them against your Pydantic models.
     - Calls run_tool(...).
     - Prints the result.


