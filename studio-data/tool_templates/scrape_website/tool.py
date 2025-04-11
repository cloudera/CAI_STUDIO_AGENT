from typing import Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool
from textwrap import dedent
import json 
import argparse

import requests
from bs4 import BeautifulSoup

class UserParameters(BaseModel):
    pass

class ToolParameters(BaseModel):
    website: str = Field(description="The website URL to search or fetch data from")

def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    website = args.website
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
    }
    
    try:
        # Send a GET request to fetch the HTML content
        response = requests.get(website, headers=headers)
        response.raise_for_status()  # Ensure we catch HTTP errors

        # Parse the HTML content
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract text content from the page (e.g., from <p> tags)
        content = soup.get_text(separator="\n", strip=True)
        
        return content

    except requests.exceptions.RequestException as e:
        return f"An error occurred while scraping: {e}"
    
    

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