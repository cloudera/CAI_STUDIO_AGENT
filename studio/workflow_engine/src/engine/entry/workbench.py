# TODO: expand workbench models past just collated inputs

import os
import sys
import subprocess
import logging

# Set up logging to file
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/cdsw/testv4.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

logger.info("="*80)
logger.info("WORKBENCH STARTUP INITIATED")
logger.info("="*80)

# Restore the original stdio file objects so the
# jupyter kernel doesn't swallow our print statements
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
logger.info("stdio file objects restored")

# Extract workflow parameters from the environment
logger.info("Extracting workflow parameters from environment...")
WORFKLOW_ARTIFACT = os.environ.get("AGENT_STUDIO_WORKFLOW_ARTIFACT", "/home/cdsw/workflow/artifact.tar.gz")
WORKFLOW_DEPLOYMENT_CONFIG = os.environ.get("AGENT_STUDIO_WORKFLOW_DEPLOYMENT_CONFIG", "{}")
MODEL_EXECUTION_DIR = os.environ.get("AGENT_STUDIO_MODEL_EXECUTION_DIR", "/home/cdsw")
WORKFLOW_PROJECT_FILE_DIR = os.environ.get("AGENT_STUDIO_WORKFLOW_PROJECT_FILE_DIR")
CDSW_DOMAIN = os.getenv("CDSW_DOMAIN")
logger.info(f"WORFKLOW_ARTIFACT: {WORFKLOW_ARTIFACT}")
logger.info(f"MODEL_EXECUTION_DIR: {MODEL_EXECUTION_DIR}")
logger.info(f"WORKFLOW_PROJECT_FILE_DIR: {WORKFLOW_PROJECT_FILE_DIR}")
logger.info(f"CDSW_DOMAIN: {CDSW_DOMAIN}")

# Specify where our workflows will be extracted to
WORKFLOW_DIRECTORY = os.path.abspath("workflow")
sys.path.append(WORKFLOW_DIRECTORY)
logger.info(f"WORKFLOW_DIRECTORY set to: {WORKFLOW_DIRECTORY}")

# Install the cmlapi. This is a required dependency for cross-cutting util modules
# and ops modules that are used in a workflow.
logger.info("Importing engine.utils to get URL scheme...")
try:
    from engine.utils import get_url_scheme
    logger.info("Successfully imported get_url_scheme")
except Exception as e:
    logger.error(f"Failed to import get_url_scheme: {e}", exc_info=True)
    raise

logger.info("Installing cmlapi...")
try:
    scheme = get_url_scheme()
    cmlapi_url = f"{scheme}://{CDSW_DOMAIN}/api/v2/python.tar.gz"
    logger.info(f"Installing cmlapi from: {cmlapi_url}")
    subprocess.call(["pip", "install", cmlapi_url])
    logger.info("cmlapi installation completed")
except Exception as e:
    logger.error(f"Failed to install cmlapi: {e}", exc_info=True)
    raise

# If we are in old workbenches, we cannot modify the model
# root dir location. To get around this, we specify early what
# the root dir of the deployed workflow artifact is and we
# early change our directory. This script runs in a python
# kernel so all commands after this will run in the kernel.
# also ensure the workflow engine code is on the path.
logger.info(f"Changing directory to model execution directory: {MODEL_EXECUTION_DIR}")
print(f"Model execution directory: {MODEL_EXECUTION_DIR}")
try:
    os.chdir(MODEL_EXECUTION_DIR)
    sys.path.append(os.path.join("src/"))
    logger.info(f"Successfully changed to directory: {os.getcwd()}")
except Exception as e:
    logger.error(f"Failed to change directory: {e}", exc_info=True)
    raise

# Manual patch required for CrewAI compatability
logger.info("Applying pysqlite3 patch for CrewAI compatibility...")
try:
    __import__("pysqlite3")
    sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
    logger.info("pysqlite3 patch applied successfully")
except Exception as e:
    logger.error(f"Failed to apply pysqlite3 patch: {e}", exc_info=True)
    raise

logger.info("Importing required modules...")
try:
    import asyncio
    from opentelemetry.context import get_current
    from datetime import datetime
    from typing import List, Dict, Union, Optional
    import json
    import base64
    from pydantic import BaseModel
    from uuid import uuid4
    logger.info("Standard library imports successful")
except Exception as e:
    logger.error(f"Failed to import standard libraries: {e}", exc_info=True)
    raise

try:
    import engine.types as input_types
    from engine.crewai.mcp import get_mcp_tools_definitions
    from engine.crewai.run import run_workflow_async
    from engine.crewai.artifact import is_crewai_workflow, load_crewai_workflow
    from engine.artifact import extract_artifact_to_location, get_workflow_name
    from engine.langgraph.artifact import is_langgraph_workflow, load_langgraph_workflow
    logger.info("Engine module imports successful")
except Exception as e:
    logger.error(f"Failed to import engine modules: {e}", exc_info=True)
    raise

try:
    import cml.models_v1 as cml_models
    logger.info("CML models import successful")
except Exception as e:
    logger.error(f"Failed to import cml.models_v1: {e}", exc_info=True)
    raise


# Extract (or download) our artifact to MODEL_EXECUTION_DIR/workflow/*
logger.info(f"Extracting workflow artifact from {WORFKLOW_ARTIFACT} to {WORKFLOW_DIRECTORY}...")
try:
    extract_artifact_to_location(WORFKLOW_ARTIFACT, WORKFLOW_DIRECTORY)
    logger.info("Workflow artifact extracted successfully")
except Exception as e:
    logger.error(f"Failed to extract workflow artifact: {e}", exc_info=True)
    raise

LANGGRAPH_CALLABLES = None
tracer = None  # keep this for CrewAI workflows

logger.info("Detecting workflow type...")
try:
    if is_langgraph_workflow(WORKFLOW_DIRECTORY):
        logger.info("Detected LangGraph workflow")
        LANGGRAPH_CALLABLES = load_langgraph_workflow(WORKFLOW_DIRECTORY)
        logger.info("LangGraph workflow loaded successfully")
    elif is_crewai_workflow(WORKFLOW_DIRECTORY):
        logger.info("Detected CrewAI workflow")
        collated_input: Optional[BaseModel] = None
        collated_input, tracer = load_crewai_workflow(WORKFLOW_DIRECTORY)
        logger.info("CrewAI workflow loaded successfully")
    else:
        logger.error("Unsupported workflow artifact type")
        raise ValueError("Unsupported workflow artifact type.")
except Exception as e:
    logger.error(f"Failed to load workflow: {e}", exc_info=True)
    raise


# Extract the workflow name
logger.info("Extracting workflow name...")
try:
    workflow_name = get_workflow_name(workflow_dir=WORKFLOW_DIRECTORY)
    logger.info(f"Workflow name: {workflow_name}")
except Exception as e:
    logger.error(f"Failed to get workflow name: {e}", exc_info=True)
    raise

_mcp_tool_defintions: Optional[Dict[str, List[Dict]]] = None


async def _set_mcp_tool_definitions():
    global _mcp_tool_defintions
    logger.info("Setting up MCP tool definitions...")
    try:
        if not LANGGRAPH_CALLABLES:
            deployment_config: input_types.DeploymentConfig = input_types.DeploymentConfig.model_validate(
                json.loads(WORKFLOW_DEPLOYMENT_CONFIG)
            )
            # Calculate session directory for MCP tool definitions (session_id not available at startup)
            session_directory = None
            # Note: At startup, we don't have session_id yet, so MCP tools won't have SESSION_DIRECTORY env var
            # This will be set properly during actual workflow execution

            result = await get_mcp_tools_definitions(
                collated_input.mcp_instances, deployment_config.mcp_config, session_directory
            )
            _mcp_tool_defintions = {mcp_id: [t.model_dump() for t in tool_list] for mcp_id, tool_list in result.items()}
            logger.info(f"MCP tool definitions set successfully. Found {len(_mcp_tool_defintions)} MCP instances")
            print(f"MCP tool definitions are set")
        else:
            logger.info("Skipping MCP tool definitions for LangGraph workflow")
    except Exception as e:
        logger.error(f"Failed to set MCP tool definitions: {e}", exc_info=True)


logger.info("Creating async task for MCP tool definitions...")
asyncio.create_task(_set_mcp_tool_definitions())
logger.info("="*80)
logger.info("WORKBENCH STARTUP COMPLETE - Ready to accept API calls")
logger.info("="*80)


def base64_decode(encoded_str: str):
    decoded_bytes = base64.b64decode(encoded_str)
    return json.loads(decoded_bytes.decode("utf-8"))


# TODO: remove dependence on collated_input workflow type
@cml_models.cml_model
def api_wrapper(args: Union[dict, str]) -> str:
    logger.info("="*80)
    logger.info("API WRAPPER CALLED")
    logger.info("="*80)
    try:
        dict_args = args
        if not isinstance(args, dict):
            dict_args = json.loads(args)
        logger.info(f"Parsed arguments: {dict_args}")
        serve_workflow_parameters = input_types.ServeWorkflowParameters.model_validate(dict_args)
        logger.info(f"Action type: {serve_workflow_parameters.action_type}")
    except Exception as e:
        logger.error(f"Failed to parse API wrapper arguments: {e}", exc_info=True)
        raise
    
    if serve_workflow_parameters.action_type == input_types.DeployedWorkflowActions.KICKOFF.value:
        logger.info("Processing KICKOFF action...")
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

        # Check if session_id is provided in inputs, if not generate a 6-character UUID
        session_id = inputs.get("session_id")
        if not session_id:
            session_id = str(uuid4())[:6]

        # LangGraph workflow
        if LANGGRAPH_CALLABLES:
            logger.info("Executing LangGraph workflow...")
            try:
                graph_callable = LANGGRAPH_CALLABLES.get(workflow_name)
                if not graph_callable:
                    logger.error(f"No graph callable found for workflow name '{workflow_name}'")
                    raise ValueError(f"No graph callable found for workflow name '{workflow_name}'")

                async def run_langgraph_workflow():
                    from engine.langgraph.run import run_workflow_langgraph_instance
                    logger.info("Starting LangGraph workflow execution...")
                    await run_workflow_langgraph_instance(graph_callable, inputs)
                    logger.info("LangGraph workflow execution completed")

                asyncio.create_task(run_langgraph_workflow())

                # Build session directory from workflow_project_file_directory (strip /home/cdsw/ only in session dir)
                workflow_project_file_directory = WORKFLOW_PROJECT_FILE_DIR
                session_dir_base = workflow_project_file_directory or ""
                if session_dir_base.startswith("/home/cdsw/"):
                    session_dir_base = session_dir_base[len("/home/cdsw/") :]
                session_directory = f"{session_dir_base}/session/{session_id}"
                logger.info(f"LangGraph workflow kickoff successful - session_id: {session_id}, session_dir: {session_directory}")

                return {"trace_id": "n/a", "session_id": session_id, "session_directory": session_directory}
            except Exception as e:
                logger.error(f"Failed to execute LangGraph workflow: {e}", exc_info=True)
                raise

        # CrewAI workflow
        else:
            logger.info("Executing CrewAI workflow...")
            try:
                collated_input_copy = collated_input.model_copy(deep=True)
                current_time = datetime.now()
                formatted_time = current_time.strftime("%b %d, %H:%M:%S.%f")[:-3]
                span_name = f"Workflow Run: {formatted_time}"

                # Prepare workflow root directory from MODEL_EXECUTION_DIR
                workflow_root_directory = MODEL_EXECUTION_DIR
                # Remove /home/cdsw prefix if present
                if workflow_root_directory and workflow_root_directory.startswith("/home/cdsw/"):
                    workflow_root_directory = workflow_root_directory[len("/home/cdsw/") :]

                # Prepare workflow project file directory from env (do not strip prefix here)
                workflow_project_file_directory = WORKFLOW_PROJECT_FILE_DIR
                if workflow_project_file_directory and workflow_project_file_directory.startswith("/home/cdsw/"):
                    workflow_project_file_directory = workflow_project_file_directory[len("/home/cdsw/") :]

                with tracer.start_as_current_span(span_name) as parent_span:
                    decimal_trace_id = parent_span.get_span_context().trace_id
                    trace_id = f"{decimal_trace_id:032x}"
                    parent_context = get_current()
                    logger.info(f"Starting CrewAI workflow with trace_id: {trace_id}, session_id: {session_id}")

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
                            session_id,
                            workflow_root_directory,
                            workflow_project_file_directory,
                            "DEPLOYMENT",
                        )
                    )
                # Build session directory (strip /home/cdsw/ only in session dir)
                session_dir_base = workflow_project_file_directory or ""
                session_directory = f"{session_dir_base}/session/{session_id}"
                logger.info(f"CrewAI workflow kickoff successful - trace_id: {trace_id}, session_id: {session_id}, session_dir: {session_directory}")
                return {"trace_id": str(trace_id), "session_id": session_id, "session_directory": session_directory}
            except Exception as e:
                logger.error(f"Failed to execute CrewAI workflow: {e}", exc_info=True)
                raise

        return {"trace_id": str(trace_id)}
    elif serve_workflow_parameters.action_type == input_types.DeployedWorkflowActions.GET_CONFIGURATION.value:
        logger.info("Processing GET_CONFIGURATION action...")
        # Prepare workflow project file directory from env (do not strip prefix)
        workflow_project_file_directory = WORKFLOW_PROJECT_FILE_DIR
        # Remove /home/cdsw prefix if present
        if workflow_project_file_directory and workflow_project_file_directory.startswith("/home/cdsw/"):
            workflow_project_file_directory = workflow_project_file_directory[len("/home/cdsw/") :]

        # Get the base configuration (serialize enums and complex types as JSON-friendly)
        configuration = collated_input.model_dump(mode="json")
        configuration["workflow_directory"] = workflow_project_file_directory
        logger.info(f"GET_CONFIGURATION successful - workflow_directory: {workflow_project_file_directory}")

        return {"configuration": configuration}
    elif serve_workflow_parameters.action_type == input_types.DeployedWorkflowActions.CREATE_SESSION.value:
        logger.info("Processing CREATE_SESSION action...")
        # For create-session, just compute session id and session directory
        # using WORKFLOW_PROJECT_FILE_DIR, strip /home/cdsw/ only for session_directory
        session_id = str(uuid4())[:6]
        workflow_project_file_directory = WORKFLOW_PROJECT_FILE_DIR
        session_dir_base = workflow_project_file_directory or ""
        if session_dir_base.startswith("/home/cdsw/"):
            session_dir_base = session_dir_base[len("/home/cdsw/") :]
        session_directory = f"{session_dir_base}/session/{session_id}"
        logger.info(f"CREATE_SESSION successful - session_id: {session_id}, session_dir: {session_directory}")
        return {"session_id": session_id, "session_directory": session_directory}
    elif serve_workflow_parameters.action_type == input_types.DeployedWorkflowActions.GET_ASSET_DATA.value:
        logger.info("Processing GET_ASSET_DATA action...")
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
        logger.info(f"GET_ASSET_DATA successful - assets retrieved: {len(asset_data)}, unavailable: {len(unavailable_assets)}")
        return {"asset_data": asset_data, "unavailable_assets": unavailable_assets}
    elif serve_workflow_parameters.action_type == input_types.DeployedWorkflowActions.GET_MCP_TOOL_DEFINITIONS.value:
        logger.info("Processing GET_MCP_TOOL_DEFINITIONS action...")
        ready = _mcp_tool_defintions is not None
        logger.info(f"MCP tool definitions ready: {ready}")
        return {"ready": ready, "mcp_tool_definitions": _mcp_tool_defintions}
    else:
        logger.error(f"Invalid action type: {serve_workflow_parameters.action_type}")
        raise ValueError("Invalid action type.")
