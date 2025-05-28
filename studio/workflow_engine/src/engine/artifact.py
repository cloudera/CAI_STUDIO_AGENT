import os
import tarfile
import yaml
from typing import Any
import json

from engine.types import CollatedInput, WorkflowArtifactType


def extract_artifact_to_location(artifact_location: str, destination_path: str):
    """
    Extract a packaged workflow artifact to a specified directory.
    """

    tarball_path = os.path.join(artifact_location)
    extract_path = os.path.join(destination_path)

    # Ensure destination directory exists
    os.makedirs(extract_path, exist_ok=True)

    # Extract the tarball
    with tarfile.open(tarball_path, "r:gz") as tar:
        tar.extractall(path=extract_path)

    print(f"Extracted {os.path.basename(artifact_location)} to {extract_path}")


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


def get_artifact_workflow_name(artifact_dir: str) -> str:
    """
    Get the workflow name from workflow.yaml inside the given artifact directory.
    """
    workflow_data = get_artifact_workflow(artifact_dir)

    # If YAML contains name, favor this
    if workflow_data.get("name"):
        return workflow_data.get("name")

    # Check for collated input type
    if workflow_data.get("type") == WorkflowArtifactType.COLLATED_INPUT:
        collated_input = get_collated_input(artifact_dir)
        return collated_input.workflow.name

    raise ValueError(f"Could not find a valid workflow name in artifact '{artifact_dir}'.")


def get_artifact_workflow_type(artifact_dir: str) -> str:
    """
    Get the workflow name from workflow.yaml inside the given artifact directory.
    """
    workflow_data = get_artifact_workflow(artifact_dir)
    return workflow_data.get("name")


def get_artifact_workflow(artifact_dir: str) -> Any:
    """
    Load the parsed YAML from workflow.yaml in a given artifact directory.
    """
    return get_artifact_yaml_member(artifact_dir, "workflow.yaml")


def get_collated_input(artifact_dir: str) -> CollatedInput:
    workflow_data = get_artifact_workflow(artifact_dir)
    artifact_type = workflow_data.get("type")
    if not artifact_type == WorkflowArtifactType.COLLATED_INPUT:
        raise ValueError(f"Collated input requested on a workflow of type '{artifact_type}'")

    collated_input_filename = workflow_data.get("input")
    if not collated_input_filename:
        raise ValueError(f'Collated input requested but missing "collated_input" field in workflow.yaml.')

    collated_input_dict = json.load(open(os.path.join(artifact_dir, collated_input_filename), "r"))
    collated_input = CollatedInput.model_validate(collated_input_dict)

    return collated_input
