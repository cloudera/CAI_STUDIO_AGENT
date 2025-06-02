# TODO: expand workbench models past just collated inputs

import os
import sys
import subprocess

# Restore the original stdio file objects so the
# jupyter kernel doesn't swallow our print statements
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__

# Extract workflow parameters from the environment
WORFKLOW_ARTIFACT = os.environ.get("AGENT_STUDIO_WORKFLOW_ARTIFACT", "/home/cdsw/workflow/artifact.tar.gz")
WORKFLOW_DEPLOYMENT_CONFIG = os.environ.get("AGENT_STUDIO_WORKFLOW_DEPLOYMENT_CONFIG", "{}")
MODEL_EXECUTION_DIR = os.environ.get("AGENT_STUDIO_MODEL_EXECUTION_DIR", "/home/cdsw")
CDSW_DOMAIN = os.getenv("CDSW_DOMAIN")

# Specify where our workflows will be extracted to
WORKFLOW_DIRECTORY = os.path.abspath("workflow")
sys.path.append(WORKFLOW_DIRECTORY)

# Install the cmlapi. This is a required dependency for cross-cutting util modules
# and ops modules that are used in a workflow.
subprocess.call(["pip", "install", f"https://{CDSW_DOMAIN}/api/v2/python.tar.gz"])

# If we are in old workbenches, we cannot modify the model
# root dir location. To get around this, we specify early what
# the root dir of the deployed workflow artifact is and we
# early change our directory. This script runs in a python
# kernel so all commands after this will run in the kernel.
# also ensure the workflow engine code is on the path.
print(f"Model execution directory: {MODEL_EXECUTION_DIR}")
os.chdir(MODEL_EXECUTION_DIR)
sys.path.append(os.path.join("src/"))

# Manual patch required for CrewAI compatability
__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

import asyncio
from opentelemetry.context import get_current
from datetime import datetime
from typing import Dict, Union
import json
import base64

import engine.types as input_types
from engine.crewai.run import run_workflow_async
from engine.crewai.artifact import is_crewai_workflow, load_crewai_workflow
from engine.artifact import extract_artifact_to_location, get_workflow_name
from engine.langgraph.artifact import is_langgraph_workflow, load_langgraph_workflow

import cml.models_v1 as cml_models


# Extract (or download) our artifact to MODEL_EXECUTION_DIR/workflow/*
extract_artifact_to_location(WORFKLOW_ARTIFACT, WORKFLOW_DIRECTORY)

LANGGRAPH_CALLABLES = None
tracer = None  # keep this for CrewAI workflows

if is_langgraph_workflow(WORKFLOW_DIRECTORY):
    LANGGRAPH_CALLABLES = load_langgraph_workflow(WORKFLOW_DIRECTORY)
elif is_crewai_workflow(WORKFLOW_DIRECTORY):
    collated_input, tracer = load_crewai_workflow(WORKFLOW_DIRECTORY)
else:
    raise ValueError("Unsupported workflow artifact type.")


# Extract the workflow name
workflow_name = get_workflow_name(workflow_dir=WORKFLOW_DIRECTORY)


def base64_decode(encoded_str: str):
    decoded_bytes = base64.b64decode(encoded_str)
    return json.loads(decoded_bytes.decode("utf-8"))


# TODO: remove dependence on collated_input workflow type
@cml_models.cml_model
def api_wrapper(args: Union[dict, str]) -> str:
    dict_args = args
    if not isinstance(args, dict):
        dict_args = json.loads(args)
    serve_workflow_parameters = input_types.ServeWorkflowParameters.model_validate(dict_args)
    if serve_workflow_parameters.action_type == input_types.DeployedWorkflowActions.KICKOFF.value:
        inputs = (
            base64_decode(serve_workflow_parameters.kickoff_inputs) if serve_workflow_parameters.kickoff_inputs else {}
        )

        # Extract deployment config (API keys, env vars, etc.)
        deployment_config: input_types.DeploymentConfig = input_types.DeploymentConfig.model_validate(
            json.loads(WORKFLOW_DEPLOYMENT_CONFIG)
        )

        # Set environment variables defined in the deployment config
        for key, value in deployment_config.environment.items():
            os.environ[key] = str(value)

        # Extract inputs
        inputs = (
            base64_decode(serve_workflow_parameters.kickoff_inputs) if serve_workflow_parameters.kickoff_inputs else {}
        )

        # LangGraph workflow
        if LANGGRAPH_CALLABLES:
            graph_callable = LANGGRAPH_CALLABLES.get(workflow_name)
            if not graph_callable:
                raise ValueError(f"No graph callable found for workflow name '{workflow_name}'")

            async def run_langgraph_workflow():
                from engine.langgraph.run import run_workflow_langgraph_instance

                await run_workflow_langgraph_instance(graph_callable, inputs)

            asyncio.create_task(run_langgraph_workflow())
            return {"trace_id": "n/a"}

        # CrewAI workflow
        else:
            collated_input_copy = collated_input.model_copy(deep=True)
            current_time = datetime.now()
            formatted_time = current_time.strftime("%b %d, %H:%M:%S.%f")[:-3]
            span_name = f"Workflow Run: {formatted_time}"

            with tracer.start_as_current_span(span_name) as parent_span:
                decimal_trace_id = parent_span.get_span_context().trace_id
                trace_id = f"{decimal_trace_id:032x}"
                parent_context = get_current()

                asyncio.create_task(
                    run_workflow_async(
                        WORKFLOW_DIRECTORY,
                        collated_input_copy,
                        deployment_config.tool_config,
                        deployment_config.mcp_config,
                        deployment_config.llm_config,
                        inputs,
                        parent_context,
                        trace_id,
                    )
                )
            return {"trace_id": str(trace_id)}

        return {"trace_id": str(trace_id)}
    elif serve_workflow_parameters.action_type == input_types.DeployedWorkflowActions.GET_CONFIGURATION.value:
        return {"configuration": collated_input.model_dump()}
    elif serve_workflow_parameters.action_type == input_types.DeployedWorkflowActions.GET_ASSET_DATA.value:
        unavailable_assets = list()
        asset_data: Dict[str, str] = dict()
        for asset_uri in list(set(serve_workflow_parameters.get_asset_data_inputs)):
            # Ensure that the asset requested belongs to one of the tool instances or agents
            matching_tool_ins = next(
                (tool for tool in collated_input.tool_instances if tool.tool_image_uri == asset_uri), None
            )
            matching_agent = next(
                (agent for agent in collated_input.agents if agent.agent_image_uri == asset_uri), None
            )
            if (not matching_tool_ins) and (not matching_agent):
                unavailable_assets.append(asset_uri)
                continue
            # Ensure that the asset exists
            asset_path = os.path.join(WORKFLOW_DIRECTORY, asset_uri)
            if not os.path.exists(asset_path):
                unavailable_assets.append(asset_uri)
                continue
            with open(asset_path, "rb") as asset_file:
                asset_data[asset_uri] = base64.b64encode(asset_file.read()).decode()
                # Decode at the destination with: base64.b64decode(asset_data[asset_uri])
        return {"asset_data": asset_data, "unavailable_assets": unavailable_assets}
    else:
        raise ValueError("Invalid action type.")
