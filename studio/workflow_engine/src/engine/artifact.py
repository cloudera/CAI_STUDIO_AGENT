import os
import tarfile

from engine.crewai.artifact import is_crewai_workflow, get_crewai_workflow_name
from engine.langgraph.artifact import is_langgraph_workflow, get_langgraph_workflow_name


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


def get_workflow_name(workflow_dir: str) -> str:
    """
    Get the workflow name from workflow.yaml or langgraph.json inside the given artifact directory.
    """
    if is_crewai_workflow(workflow_dir):
        return get_crewai_workflow_name(workflow_dir)
    elif is_langgraph_workflow(workflow_dir):
        return get_langgraph_workflow_name(workflow_dir)
    else:
        raise ValueError(f"Could not find a valid workflow name in workflow artifact.")
