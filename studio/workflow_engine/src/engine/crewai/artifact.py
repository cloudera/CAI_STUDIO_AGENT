from typing import Any
import os
import yaml
import json

from engine.types import CollatedInput
from engine.crewai.tracing import reset_crewai_instrumentation, instrument_crewai_workflow
from engine.crewai.events import register_global_handlers
from engine.crewai.tools import prepare_virtual_env_for_tool


# Currently the only artifact type supported for import is directory.
# the collated input requirements are all relative to the workflow import path.
def install_tool_virtual_envs(directory, collated_input: CollatedInput):
    for tool_instance in collated_input.tool_instances:
        print(f"PREPARING VIRTUAL ENV FOR {tool_instance.name}")
        prepare_virtual_env_for_tool(
            os.path.join(directory, tool_instance.source_folder_path),
            tool_instance.python_requirements_file_name,
        )


def get_artifact_yaml_member(root_dir: str, member: str) -> Any:
    """
    Load a YAML file named `member` from the given root directory.
    """
    member_path = os.path.join(root_dir, member)
    if not os.path.isfile(member_path):
        raise FileNotFoundError(f"{member} not found in the provided artifact directory: {root_dir}")

    with open(member_path, "r", encoding="utf-8") as f:
        yaml_data = yaml.safe_load(f)
    return yaml_data


def get_artifact_workflow_type(workflow_dir: str) -> str:
    """
    Get the workflow name from workflow.yaml inside the given artifact directory.
    """
    workflow_data = get_artifact_workflow(workflow_dir)
    return workflow_data.get("name")


def get_artifact_workflow(workflow_dir: str) -> Any:
    """
    Load the parsed YAML from workflow.yaml in a given artifact directory.
    """
    return get_artifact_yaml_member(workflow_dir, "workflow.yaml")


def get_collated_input(workflow_dir, workflow_data) -> CollatedInput:
    collated_input_filename = workflow_data.get("input")
    if not collated_input_filename:
        raise ValueError(f'Collated input requested but missing "collated_input" field in workflow.yaml.')

    collated_input_dict = json.load(open(os.path.join(workflow_dir, collated_input_filename), "r"))
    collated_input = CollatedInput.model_validate(collated_input_dict)

    return collated_input


def get_crewai_workflow_name(workflow_dir):
    workflow_data = get_artifact_workflow(workflow_dir)

    # Prefer explicit name field
    if workflow_data.get("name"):
        return workflow_data.get("name")

    # Otherwise, infer from collated input
    collated_input = get_collated_input(workflow_dir, workflow_data)
    return collated_input.workflow.name


def is_crewai_workflow(directory: str) -> bool:
    """
    Checks whether the given directory contains a CrewAI-compatible artifact
    by verifying if `workflow.yaml` exists and has `type: collated_input`.

    Args:
        directory (str): Path to the directory to check.

    Returns:
        bool: True if the artifact is CrewAI-compatible, False otherwise.
    """
    workflow_yaml_path = os.path.join(directory, "workflow.yaml")

    if not os.path.isfile(workflow_yaml_path):
        return False

    try:
        with open(workflow_yaml_path, "r") as f:
            data = yaml.safe_load(f)
            return isinstance(data, dict) and data.get("type") == "collated_input"
    except Exception:
        return False


def load_crewai_workflow(directory: str) -> Any:
    collated_input = get_collated_input(os.path.join(directory))
    install_tool_virtual_envs(collated_input)

    # Instrument our workflow given a specific workflow name and
    # set up the instrumentation. Also register our handlers.
    reset_crewai_instrumentation()
    tracer_provider = instrument_crewai_workflow(f"{collated_input.workflow.name}")
    tracer = tracer_provider.get_tracer("opentelemetry.agentstudio.workflow.model")

    # Register our handlers. This can occur globally
    # because regardless of the actual workflow definition
    # we run, the event handlers can remain the same (since
    # trace ID is written as a contextvar on each async task)
    register_global_handlers()

    return collated_input, tracer
