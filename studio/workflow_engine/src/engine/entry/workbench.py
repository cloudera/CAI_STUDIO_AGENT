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
from engine.crewai.tracing import instrument_crewai_workflow, reset_crewai_instrumentation
from engine.crewai.tools import prepare_virtual_env_for_tool
from engine.crewai.events import register_global_handlers
from engine.artifact import extract_artifact_to_location, get_collated_input, get_artifact_workflow_name

import cml.models_v1 as cml_models


# Currently the only artifact type supported for import is directory.
# the collated input requirements are all relative to the workflow import path.
def _install_python_requirements(collated_input: input_types.CollatedInput):
    for tool_instance in collated_input.tool_instances:
        print(f"PREPARING VIRTUAL ENV FOR {tool_instance.name}")
        prepare_virtual_env_for_tool(
            os.path.join(WORKFLOW_DIRECTORY, tool_instance.source_folder_path),
            tool_instance.python_requirements_file_name,
        )


# Extract (or download) our artifact to MODEL_EXECUTION_DIR/workflow/*
extract_artifact_to_location(WORFKLOW_ARTIFACT, WORKFLOW_DIRECTORY)
collated_input = get_collated_input(os.path.join(WORKFLOW_DIRECTORY))
_install_python_requirements(collated_input)

# Extract the workflow name
workflow_name = get_artifact_workflow_name(artifact_dir=WORKFLOW_DIRECTORY)


def base64_decode(encoded_str: str):
    decoded_bytes = base64.b64decode(encoded_str)
    return json.loads(decoded_bytes.decode("utf-8"))


# Instrument our workflow given a specific workflow name and
# set up the instrumentation. Also register our handlers.
reset_crewai_instrumentation()
tracer_provider = instrument_crewai_workflow(f"{workflow_name}")
tracer = tracer_provider.get_tracer("opentelemetry.agentstudio.workflow.model")


# Register our handlers. This can occur globally
# because regardless of the actual workflow definition
# we run, the event handlers can remain the same (since
# trace ID is written as a contextvar on each async task)
register_global_handlers()


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
        collated_input_copy = collated_input.model_copy(deep=True)

        # Extract our deployment config (API keys, env vars, etc.)
        deployment_config: input_types.DeploymentConfig = input_types.DeploymentConfig.model_validate(
            json.loads(WORKFLOW_DEPLOYMENT_CONFIG)
        )

        current_time = datetime.now()
        formatted_time = current_time.strftime("%b %d, %H:%M:%S.%f")[:-3]
        span_name = f"Workflow Run: {formatted_time}"
        with tracer.start_as_current_span(span_name) as parent_span:
            decimal_trace_id = parent_span.get_span_context().trace_id
            trace_id = f"{decimal_trace_id:032x}"

            # Capture the current OpenTelemetry context
            parent_context = get_current()

            # Start the workflow in the background using the parent context
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
