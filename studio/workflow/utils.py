# No top level studio.db imports allowed to support wokrflow model deployment

from typing import List, Optional
import os
import requests

from cmlapi import CMLServiceApi

from studio.cross_cutting import utils as cc_utils
from studio import consts
from studio.db.dao import AgentStudioDao
from studio.cross_cutting.global_thread_pool import get_thread_pool
from studio.db.model import Workflow, Model, Agent, ToolInstance, DeployedWorkflowInstance
from studio.api.types import ToolInstanceStatus
from sqlalchemy.orm.session import Session

from studio.models.utils import (
    get_model_api_key_from_env,
    get_model_extra_headers_from_env,
    get_model_aws_credentials_from_env,
)
from studio.tools.utils import prepare_tool_instance


def get_llm_config_for_workflow(workflow: Workflow, session: Session, cml: CMLServiceApi) -> dict:
    """
    Creates a model config object for a workbench deployment
    given the current model configs stored in Agent Studio for
    a given workflow.
    """

    model_config = {}

    default_llm = session.query(Model).filter_by(is_studio_default=True).one()
    language_model_ids = set([default_llm.model_id])

    agent_ids = set(workflow.crew_ai_agents) or set()
    if workflow.crew_ai_llm_provider_model_id:
        language_model_ids.add(workflow.crew_ai_llm_provider_model_id)

    agents: list[Agent] = session.query(Agent).filter(Agent.id.in_(agent_ids)).all()
    for agent_id in agent_ids:
        agent: Agent = next((a for a in agents if a.id == agent_id), None)
        if not agent:
            raise ValueError(f"Agent with ID '{agent_id}' not found.")
        if agent.llm_provider_model_id:
            language_model_ids.add(agent.llm_provider_model_id)

    language_model_db_models = session.query(Model).filter(Model.model_id.in_(language_model_ids)).all()
    for lm_id in language_model_ids:
        language_model_db_model = next((lm for lm in language_model_db_models if lm.model_id == lm_id), None)
        if not language_model_db_model:
            raise ValueError(f"Language Model with ID '{lm_id}' not found.")

        # Get API key from environment with error handling
        api_key = get_model_api_key_from_env(language_model_db_model.model_id, cml)
        # For Bedrock, API key is not required as we use AWS credentials/role
        if not api_key and language_model_db_model.model_type != "BEDROCK":
            raise ValueError(
                f"API key is required but not found for model {language_model_db_model.model_name} "
                f"({language_model_db_model.model_id}). Please configure the API key in project environment variables."
            )

        # Get extra headers from environment
        extra_headers = get_model_extra_headers_from_env(language_model_db_model.model_id, cml)
        # For Bedrock, ensure we do NOT pass AWS credentials as HTTP headers
        if language_model_db_model.model_type == "BEDROCK" and extra_headers:
            extra_headers = {
                k: v
                for k, v in extra_headers.items()
                if k not in {"aws_secret_access_key", "aws_access_key_id", "aws_region_name", "aws_session_token"}
            }

        # Construct base model config
        config_entry = {
            "provider_model": language_model_db_model.provider_model,
            "model_type": language_model_db_model.model_type,
            # For Bedrock we no longer misuse api_base; leave None
            "api_base": (language_model_db_model.api_base or None)
            if language_model_db_model.model_type != "BEDROCK"
            else None,
            "api_key": api_key if language_model_db_model.model_type != "BEDROCK" else None,
            "extra_headers": extra_headers or None,
        }

        # For Bedrock, include AWS credentials from environment so LiteLLM can authenticate
        if language_model_db_model.model_type == "BEDROCK":
            try:
                aws_credentials = get_model_aws_credentials_from_env(language_model_db_model.model_id, cml) or {}
                if aws_credentials:
                    config_entry.update(
                        {
                            "aws_access_key_id": aws_credentials.get("aws_access_key_id"),
                            "aws_secret_access_key": aws_credentials.get("aws_secret_access_key"),
                            "aws_region_name": aws_credentials.get("aws_region_name"),
                            "aws_session_token": aws_credentials.get("aws_session_token"),
                        }
                    )
                else:
                    # Fallback: use global env if set (IAM role case)
                    fallback_region = os.getenv("AWS_REGION_NAME") or os.getenv("AWS_REGION")
                    if fallback_region:
                        config_entry["aws_region_name"] = fallback_region
            except Exception:
                # If fetching AWS creds fails, leave them unset so caller gets a clear auth error
                pass

        model_config[lm_id] = config_entry

    return model_config


#  Compare two different versions of Cloudera AI Workbench. Workbench
#  gitShas follow semantic versioning, and this verion checker
#  only checks out to the patch version (i.e., '2.0.47' and '2.0.47-b450'
#  will evalute to being equal).
#
#  if verion a is greater than version b, returns 1.
#  if version a is less than b, returns 0.
#  returns 0 if both versions evaluate to the same patch version.
def compare_workbench_versions(a: str, b: str) -> int:
    # Split on the dash and take the first part
    sanitized_a = a.split("-")[0]
    sanitized_b = b.split("-")[0]

    # Extract numeric parts
    a_major, a_minor, a_patch = map(int, sanitized_a.split("."))
    b_major, b_minor, b_patch = map(int, sanitized_b.split("."))

    # Compare major
    if a_major > b_major:
        return 1
    if a_major < b_major:
        return -1

    # Compare minor
    if a_minor > b_minor:
        return 1
    if a_minor < b_minor:
        return -1

    # Compare patch
    if a_patch > b_patch:
        return 1
    if a_patch < b_patch:
        return -1

    # Versions are the same
    return 0


def is_workbench_gteq_2_0_47() -> bool:
    """
    Check if the workbench version is greater than or equal to 2.0.47. There were two features
    released in 2.0.47 that Agent Studio have specific features depending on:
    - Call applications authenticated with APIv2 keys
    - AI Studios feature
    - Custom model root dir feature for model deployments in a workbench
    """
    scheme = cc_utils.get_url_scheme()
    bootstrap_data: dict = requests.get(f"{scheme}://{os.getenv('CDSW_DOMAIN')}/sense-bootstrap.json").json()
    return compare_workbench_versions(bootstrap_data.get("gitSha", "0.0.0"), "2.0.47") >= 0


def is_custom_model_root_dir_feature_enabled() -> bool:
    """
    Currently custom model root dirs for Workbench models are hidden behind
    the ML_ENABLE_COMPOSABLE_AMPS entitlement, which can be checked with
    unauthenticated access at our /sense-bootstrap.json endpoint.
    """

    # Grab the bootstrap data
    scheme = cc_utils.get_url_scheme()
    bootstrap_data: dict = requests.get(f"{scheme}://{os.getenv('CDSW_DOMAIN')}/sense-bootstrap.json").json()

    # Return the result of the entitlement we are looking for
    # and default this to false (for older workbenches). "enable_ai_studios"
    # is translated upstream from ML_ENABLE_COMPOSABLE_AMPS, which is the
    # entitlement that blocks the model root dir feature.
    composable_amp_entitlement_enabled = bootstrap_data.get("enable_ai_studios", False)
    workbench_gteq_2_0_47 = is_workbench_gteq_2_0_47()

    return composable_amp_entitlement_enabled and workbench_gteq_2_0_47


def get_fresh_workflow_directory(workflow_name: str) -> str:
    return f"{consts.WORKFLOWS_LOCATION}/{cc_utils.create_slug_from_name(workflow_name)}_{cc_utils.get_random_compact_string()}"


def get_all_tools_for_workflow(workflow_id: str, session: Session) -> List[ToolInstance]:
    """
    Get all tool instances for a given workflow.
    """
    try:
        # Get the workflow
        workflow: Workflow = session.query(Workflow).filter_by(id=workflow_id).one()
        agents: List[Agent] = session.query(Agent).filter(Agent.id.in_(workflow.crew_ai_agents)).all()
        tool_instance_ids = {tool_id for agent in agents if agent.tool_ids for tool_id in agent.tool_ids}
        tool_instances: List[ToolInstance] = (
            session.query(ToolInstance).filter(ToolInstance.id.in_(list(tool_instance_ids))).all()
        )
        return tool_instances

    except Exception as e:
        raise RuntimeError(f"Error getting tools for workflow {workflow_id}: {str(e)}")


def is_workflow_ready(workflow_id: str, session: Session) -> bool:
    """
    Check if a workflow is ready for execution.
    """
    try:
        # Determine if all tools are ready
        tool_instances: List[ToolInstance] = get_all_tools_for_workflow(workflow_id, session)
        all_tools_ready = all(tool.status == ToolInstanceStatus.READY.value for tool in tool_instances)

        return all([all_tools_ready])

    except Exception as e:
        raise RuntimeError(f"Error checking workflow readiness for workflow {workflow_id}: {str(e)}")


def prepare_tools_for_workflow(workflow_id: str, session: Session) -> None:
    """
    Prepare all tools for a given workflow.
    """
    tool_instances: List[ToolInstance] = get_all_tools_for_workflow(workflow_id, session)
    for tool_instance in tool_instances:
        get_thread_pool().submit(
            prepare_tool_instance,
            tool_instance.id,
        )


def set_workflow_deployment_stale_status(parent_workflow_id: Optional[str], is_stale: bool) -> None:
    if not parent_workflow_id:
        return

    dao: AgentStudioDao = AgentStudioDao()
    try:
        with dao.get_session() as session:
            deployed_workflows = session.query(DeployedWorkflowInstance).filter_by(workflow_id=parent_workflow_id).all()
            if not deployed_workflows:
                print(f"Workflow deployment with parent workflow ID '{parent_workflow_id}' not found.")
                return
            for deployed_workflow in deployed_workflows:
                deployed_workflow.stale = is_stale
            session.commit()
    except Exception as e:
        print(f"Error marking workflow deployment as stale: {str(e)}")
