from textwrap import dedent
from typing import Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool
import json 
import argparse

# import <any other requirements(python libraries) for the tool>
import os
import subprocess
import uuid
import json

class UserParameters(BaseModel):
    workload_user: str # This is your CDP workload username  
    workload_pass: str # This is your CDP workload password 
    CDP_ACCESS_KEY_ID: str # This is your CDP API Access Key
    CDP_PRIVATE_KEY: str  # This is your CDP API Private Key
    service_crn: str # This is the CRN of a running CDF Dataflow Service

class ToolParameters(BaseModel):
    hf_dataset: str = Field(description="The huggingface dataset we want to import.")
    s3_bucket: str = Field(description="The destination s3 bucket to write to in the form s3a://<Destination S3 Bucket> ")
    s3_path: str = Field(description="The destination path to write to.")
    
    
OUTPUT_KEY="tool_output"
  

def run_tool(config: UserParameters, args: ToolParameters) -> str:
    hf_dataset = args.hf_dataset
    s3_bucket = args.s3_bucket
    s3_path = args.s3_path
    
    os.environ["CDP_ACCESS_KEY_ID"] = config.CDP_ACCESS_KEY_ID
    os.environ["CDP_PRIVATE_KEY"] = config.CDP_PRIVATE_KEY
    os.environ["WORKLOAD_PASSWORD"] = config.workload_pass
    
    flow_version_crn="crn:cdp:df:us-west-1:altus:readyFlow:HuggingFace-to-S3/ADLS/v.1"
    
    uid = str(uuid.uuid4())[:8]
    deployment_name="hf_to_CDP_%s"%uid
    
    readyflow_paramaters_json_tmpl = """[
{{
"name": "huggingface-to-S3-ADLS",
"parameters": [
    {{
    "name": "CDP Workload User",
    "assetReferences": [],
    "value": "{workload_user}"
    }},
    {{
    "name": "CDP Workload User Password",
    "assetReferences": [],
    "value": "{workload_pass}"
    }},
    {{
    "name": "CDPEnvironment",
    "assetReferences": [],
    "value": "/home/nifi/additional/secret/env_config/core-site.xml,/home/nifi/additional/secret/env_config/ssl-client.xml,/home/nifi/additional/secret/env_config/hive-site.xml"
    }},
    {{
    "name": "Dataset Name",
    "assetReferences": [],
    "value": "{hf_dataset}"
    }},
    {{
    "name": "Destination S3 or ADLS Path",
    "assetReferences": [],
    "value": "{s3_path}"
    }},
    {{
    "name": "Destination S3 or ADLS Storage Location",
    "assetReferences": [],
    "value": "{s3_bucket}"
    }}
]
}}
]
"""
    readyflow_paramaters_json = readyflow_paramaters_json_tmpl.format(workload_user=config.workload_user, workload_pass=config.workload_pass, hf_dataset=hf_dataset, s3_path=s3_path, s3_bucket=s3_bucket)
    print(readyflow_paramaters_json)
    readyflow_params_path = "/tmp/readyflow_%s_params.json" % uid
    with open(readyflow_params_path, "w") as text_file:
        text_file.write(readyflow_paramaters_json )

    create_run_readyflow_cmd = ["cdp", "df", "create-deployment"]
    create_run_readyflow_cmd.extend(["--service-crn", config.service_crn])
    create_run_readyflow_cmd.extend(["--flow-version-crn", flow_version_crn])
    create_run_readyflow_cmd.extend(["--deployment-name", deployment_name])
    create_run_readyflow_cmd.extend(["--cfm-nifi-version", "1.27.0.2.3.15.0-8"])
    create_run_readyflow_cmd.extend(["--auto-start-flow"])
    create_run_readyflow_cmd.extend(["--cluster-size", "name=EXTRA_SMALL"])
    create_run_readyflow_cmd.extend(["--static-node-count", "1"])
    create_run_readyflow_cmd.extend(["--no-auto-scaling-enabled"])
    create_run_readyflow_cmd.extend(["--parameter-groups", "file://%s"%readyflow_params_path])

    # For development testing purposes only
    if "CDP_ALT_ENDPOINT" in os.environ:
        create_run_readyflow_cmd.extend(["--endpoint-url", os.environ["CDP_ALT_ENDPOINT"]])
        create_run_readyflow_cmd.extend(["--no-verify-tls"])
    
    cmd_path = "/tmp/readyflow_%s_cmd.json" % uid
    with open(cmd_path, "w") as text_file:
        text_file.write(" ".join(create_run_readyflow_cmd))
    
    output = subprocess.run(create_run_readyflow_cmd, capture_output=True)
    
    output_status = "Status: Ingestion Launch Successful" if output.returncode == 0 else "Status: Failure"
    
    success_stdout = "CDF Deployment: %s" % deployment_name
    output_stdout =  " " if output.returncode == 0 else output.stdout

    os.remove(readyflow_params_path)
    
    tool_exec_details ={ 
        "command_status" : output_status,
        "cmd_stdout": output_stdout,
        "cdf_deployment" : deployment_name, 
        "file_format" : "parquet", 
        "destination_path" : s3_bucket+s3_path+'/'+hf_dataset+'/parquet/default/<split>',
        "notes" : "Remember that if the huggingface dataset has any splits defined, that must be used as part of the path when accessing or importing from the datalake s3a location."
    } 
    
    tool_exec_details_json = json.dumps(tool_exec_details) 

    
    return tool_exec_details_json


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

    output = run_tool(config,params)
    print(OUTPUT_KEY, output)

