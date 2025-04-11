import json
import requests
from typing import Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool
from textwrap import dedent
import argparse

class UserParameters(BaseModel):
    serper_api_key: str

class ToolParameters(BaseModel):
    query: str = Field(description="The search query to find relevant results")
    
    

def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    query = args.query
    
    top_result_to_return = 3
    url = "https://google.serper.dev/search"

    # Prepare request payload and headers
    payload = json.dumps({"q": query})
    headers = {
        'X-API-KEY': config.serper_api_key,
        'content-type': 'application/json'
    }

    # Make the POST request
    response = requests.request("POST", url, headers=headers, data=payload)

    # Check if 'organic' key exists in the response
    if 'organic' not in response.json():
        return "Sorry, I couldn't find anything about that. There might be an issue with your Serper API key."

    # Extract and format results
    results = response.json().get('organic', [])
    formatted_results = []
    for result in results[:top_result_to_return]:
        
        try:
            formatted_results.append({
                "title": result['title'],
                "link": result['link'],
                "snippet": result['snippet']
            })
        except KeyError:
            continue  # Skip if any key is missing

    return formatted_results

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