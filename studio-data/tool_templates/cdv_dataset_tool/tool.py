from textwrap import dedent
from typing import Type
from pydantic import Field, BaseModel
from pydantic import BaseModel as StudioBaseTool
import requests
from urllib.parse import urljoin
import json 
import argparse


class UserParameters(BaseModel):
    dataset_connection_id: str
    cdv_base_url: str
    cml_apiv2_app_key: str
    
class ToolParameters(BaseModel):
    ds_name: str = Field(description="Name of the new dataset to be created")
    table_name: str = Field(description="Name of the SQL table from which the dataset will be created")


def run_tool(
    config: UserParameters,
    args: ToolParameters,
):
    """
    The function creates a dataset in CDV(Cloudera Data Visualization) from a SQL table.

    The function returns the ID, columns (in the parameter `column_list`) & url of the created dataset.
    """
    ds_name = args.ds_name
    table_name = args.table_name

    common_headers = {
        "accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": f"bearer {config.cml_apiv2_app_key}",
    }
    login_path = "arc/apps"
    login_url = urljoin(config.cdv_base_url, login_path)
    session = requests.Session()
    login_response = session.get(login_url, headers=common_headers)
    if login_response.status_code != 200:
        raise Exception(f"Failed to login to CDV: {login_response.text}")

    relative_path = "arc/adminapi/v1/datasets/sql"
    url = urljoin(config.cdv_base_url, relative_path)
    request_body = {
        "title": ds_name,
        "connection_id": config.dataset_connection_id,
        "sql": f"SELECT * FROM {table_name}",
    }
    response = session.post(url, headers=common_headers, data=request_body)
    if response.status_code != 200:
        raise Exception(f"Failed to create dataset: {response.text}")
    dataset_id = str(response.json()["id"])

    # Get the complete dataset information
    relative_path = f"arc/adminapi/v1/datasets/{dataset_id}?detail=false"
    url = urljoin(config.cdv_base_url, relative_path)
    response = session.get(url, headers=common_headers)
    if response.status_code != 200:
        raise Exception(f"Failed to get dataset information: {response.text}")
    return_val: dict = response.json()[0]
    return_val.update({
        "dataset_id": dataset_id,
        "url": urljoin(config.cdv_base_url, f"arc/apps/dataset/{dataset_id}"),
        "column_list": [_c["name"] for _c in return_val["info"][0]["columns"]],
    })
    return return_val


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

