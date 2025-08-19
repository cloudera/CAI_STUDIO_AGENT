import os
from uuid import uuid4
import tarfile
import subprocess
from urllib.parse import urlparse

from cmlapi import CMLServiceApi

from studio.deployments.types import DeploymentArtifact, DeploymentPayload

from sqlalchemy.orm.session import Session
from studio.db.model import DeployedWorkflowInstance


# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

app_dir = os.getenv("APP_DIR")
if not app_dir:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))


def package_github_for_deployment(
    payload: DeploymentPayload, deployment: DeployedWorkflowInstance, session: Session, cml: CMLServiceApi
) -> DeploymentArtifact:
    """
    Packages a GitHub-hosted workflow template into an artifact for deployment.
    Clones the GitHub repo (accepts clean URLs), optionally checks out a specific ref,
    and packages it into a .tar.gz archive.
    """
    print(f"Packaging GitHub for deployment. Deployment ID: {deployment.id}, Deployment Name: {deployment.name}")

    assert payload.workflow_target and payload.workflow_target.github_url, "Missing GitHub URL in workflow target"

    # Normalize GitHub URL
    raw_url = payload.workflow_target.github_url.strip().rstrip("/")
    if not raw_url.endswith(".git"):
        github_url = raw_url + ".git"
    else:
        github_url = raw_url

    print("Github URL: ", github_url)
    print("Raw URL: ", raw_url)
    packaging_directory = os.path.join("/tmp", "deployment_artifacts", str(uuid4()))
    os.makedirs(packaging_directory, exist_ok=True)
    print(f"Packaging directory: {packaging_directory}")

    repo_name = os.path.basename(urlparse(raw_url).path)
    repo_path = os.path.join(packaging_directory, repo_name)
    print(f"Repo name: {repo_name}")
    print(f"Repo path: {repo_path}")

    try:
        subprocess.run(
            ["git", "clone", github_url, repo_path], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to clone GitHub repository: {e.stderr.decode()}") from e

    # For workbench model packaging reasons, we remove the .git directory
    try:
        subprocess.run(
            ["rm", "-rf", os.path.join(repo_path, ".git")],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to remove .git directory: {e.stderr.decode()}") from e

    # Step 2: Add any additional packaging logic if needed
    # For now we assume the repo structure is compatible and needs no modification.

    # Step 3: Create the archive (excluding the archive itself)
    deployment_artifact_path = os.path.join(packaging_directory, "artifact.tar.gz")
    with tarfile.open(deployment_artifact_path, "w:gz") as tar:
        for root, dirs, files in os.walk(repo_path):
            for file in files:
                full_path = os.path.join(root, file)
                print(f"Adding file: {full_path} to archive")
                arcname = os.path.relpath(full_path, start=repo_path)  # root-level in archive
                print(f"arcname: {arcname}")
                tar.add(full_path, arcname=arcname)

    return DeploymentArtifact(artifact_path=deployment_artifact_path)
