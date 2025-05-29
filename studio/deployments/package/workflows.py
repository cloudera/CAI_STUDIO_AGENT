import os
from uuid import uuid4
import shutil
import yaml
import json
import tarfile

from cmlapi import CMLServiceApi

from studio.deployments.types import DeploymentArtifact, DeploymentPayload
from studio.deployments.package.collated_input import create_collated_input

from sqlalchemy.orm.session import Session
from studio.db.model import DeployedWorkflowInstance, Workflow


# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src")
import engine.types as input_types


def studio_data_workflow_ignore_factory(workflow_directory_name: str):
    def ignore(src, names):
        base = os.path.basename(src)
        if base == "studio-data":
            return {"deployable_workflows", "tool_templates", "temp_files"}
        elif base == "workflows":
            return {name for name in names if name != workflow_directory_name}
        else:
            return {".venv", ".next", "node_modules", ".nvm", ".requirements_hash.txt"}

    return ignore


def package_workflow_for_deployment(
    payload: DeploymentPayload, deployment: DeployedWorkflowInstance, session: Session, cml: CMLServiceApi
) -> DeploymentArtifact:
    """
    For packaging existing workflows, we support packaging into a collated input
    type. In the future, we may want to support packaging into other types.
    """

    # Create a temporary directory to package our artifact
    packaging_directory = os.path.join("/tmp", "deployment_artifacts", str(uuid4()))
    os.makedirs(packaging_directory, exist_ok=True)

    # Create our base workflow.yaml
    workflow_yaml_path = os.path.join(packaging_directory, "workflow.yaml")
    with open(workflow_yaml_path, "w") as f:
        yaml.dump({"type": "collated_input", "input": "collated_input.json"}, f, default_flow_style=False)

    # Grab the corresponding workflow for this deployed workflow instance
    workflow: Workflow = deployment.workflow

    # Ignore logic for copying over our studio-data/ directory
    ignore_fn = studio_data_workflow_ignore_factory(os.path.basename(workflow.directory))
    shutil.copytree("studio-data", os.path.join(packaging_directory, "studio-data"), ignore=ignore_fn)

    # Create the collated input.
    collated_input: input_types.CollatedInput = create_collated_input(workflow, session)

    # Force override generational config. These generational configs
    # are set to default values and can optionally be overriden (currently
    # for all LLMs in a workflow) via the payload argument. Also ensure that
    # we are not storing the config (which has API keys) to the input json file.
    for lm in collated_input.language_models:
        lm.generation_config.update(payload.deployment_config.generation_config)

    # Write collated input to our packaging directory.
    collated_input_file_path = os.path.join(packaging_directory, "collated_input.json")
    with open(collated_input_file_path, "w") as f:
        json.dump(collated_input.model_dump(), f, indent=2)

    # Package everything up into an archive.
    deployment_artifact_path = os.path.join(packaging_directory, "artifact.tar.gz")
    with tarfile.open(deployment_artifact_path, "w:gz") as tar:
        for root, dirs, files in os.walk(packaging_directory):
            for file in files:
                full_path = os.path.join(root, file)
                # Skip the archive itself
                if os.path.abspath(full_path) == os.path.abspath(deployment_artifact_path):
                    continue
                # Compute relative path inside the archive
                arcname = os.path.relpath(full_path, start=packaging_directory)
                tar.add(full_path, arcname=arcname)

    # Return the packaged artifact.
    return DeploymentArtifact(project_location=deployment_artifact_path)
