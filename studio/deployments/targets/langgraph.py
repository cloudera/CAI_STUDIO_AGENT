from studio.deployments.types import DeploymentArtifact, DeploymentPayload
from studio.db.model import DeployedWorkflowInstance
from sqlalchemy.orm.session import Session
from cmlapi import CMLServiceApi
import os
import shutil
from studio import consts
import tarfile
import json
import cmlapi
from studio.deployments.applications import get_application_name_for_deployed_workflow
import studio.cross_cutting.utils as cc_utils


def deploy_artifact_to_langgraph_server(
    artifact: DeploymentArtifact,
    payload: DeploymentPayload,
    deployment: DeployedWorkflowInstance,
    session: Session,
    cml: CMLServiceApi,
):
    print(f"Deploying artifact to application. Deployment ID: {deployment.id}, Deployment Name: {deployment.name}")

    # Create a deployment staging area
    deployable_application_dir = os.path.join(consts.DEPLOYABLE_APPLICATIONS_LOCATION, deployment.id)
    if os.path.isdir(deployable_application_dir):
        shutil.rmtree(deployable_application_dir)
    os.makedirs(deployable_application_dir)

    shutil.copy(artifact.artifact_path, deployable_application_dir)

    # Take the tar.gz and extract it into the deployable workflow directory
    with tarfile.open(artifact.artifact_path, "r:gz") as tar:
        tar.extractall(deployable_application_dir)

    deployment_metadata = json.loads(deployment.deployment_metadata)

    # Let's get the application configured now
    env_vars_for_app = {
        "AGENT_STUDIO_LANGGRAPH_APPLICATION_DIRECTORY": os.path.abspath(deployable_application_dir),
    }
    env_vars_for_app.update(payload.deployment_config.environment)

    # Right now, creating an application through CML APIv2 will manually copy over the project
    # environment variables into the application env vars, which is undesirable. Every time the observability server or the
    # gRPC server changes, we need to reach out to all deployed workflows and deployed applications
    # and update the respective environment variables. We shouldn't have to do this once we
    # fix the env var copying issue.
    if os.getenv("AGENT_STUDIO_DEPLOY_MODE", "amp").lower() == "runtime":
        basepath = os.getenv("APP_DIR")
    else:
        basepath = cc_utils.get_studio_subdirectory()
    application: cmlapi.Application = cml.create_application(
        cmlapi.CreateApplicationRequest(
            name=get_application_name_for_deployed_workflow(deployment),
            subdomain=f"workflow-{deployment.id}",
            description=f"Workflow UI for workflow {deployment.name}",
            script=os.path.join(basepath, "bin", "start-langgraph-app.py"),
            cpu=2,
            memory=4,
            nvidia_gpu=0,
            environment=env_vars_for_app,
            bypass_authentication=True,
            runtime_identifier=cc_utils.get_deployed_workflow_runtime_identifier(cml),
        ),
        project_id=os.environ.get("CDSW_PROJECT_ID"),
    )
