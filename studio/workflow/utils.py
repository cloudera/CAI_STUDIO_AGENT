# No top level studio.db imports allowed to support wokrflow model deployment

from typing import List
import os
import requests

from cmlapi import CMLServiceApi

from studio.cross_cutting import utils as cc_utils
from studio import consts
from studio.cross_cutting.global_thread_pool import get_thread_pool
from studio.db.model import Workflow, Model, Agent, ToolInstance
from studio.api.types import ToolInstanceStatus
from sqlalchemy.orm.session import Session

from studio.models.utils import get_model_api_key_from_env, get_model_extra_headers_from_env
from studio.tools.tool_instance import prepare_tool_instance


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
        if not api_key:
            raise ValueError(
                f"API key is required but not found for model {language_model_db_model.model_name} "
                f"({language_model_db_model.model_id}). Please configure the API key in project environment variables."
            )

        # Get extra headers from environment
        extra_headers = get_model_extra_headers_from_env(language_model_db_model.model_id, cml)

        model_config[lm_id] = {
            "provider_model": language_model_db_model.provider_model,
            "model_type": language_model_db_model.model_type,
            "api_base": language_model_db_model.api_base or None,
            "api_key": api_key,
            "extra_headers": extra_headers or None,
        }

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
    workbench_gteq_2_0_47 = compare_workbench_versions(bootstrap_data.get("gitSha", "0.0.0"), "2.0.47") >= 0

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
