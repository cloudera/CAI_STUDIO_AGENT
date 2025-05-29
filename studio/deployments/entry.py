import sys

__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

import os
import json
import base64

import cmlapi
from cmlapi import CMLServiceApi
import argparse

from studio.deployments.types import (
    DeploymentStatus,
    DeploymentPayload,
    DeploymentArtifact,
    DeploymentTargetType,
    WorkflowTargetType,
)
from studio.deployments.utils import initialize_deployment, update_deployment_metadata
from studio.deployments.package import package_workflow_for_deployment
from studio.deployments.targets import deploy_artifact_to_workbench
from studio.db.dao import AgentStudioDao
from sqlalchemy.orm.session import Session
from studio.db.model import DeployedWorkflowInstance


def deploy_artifact(
    artifact: DeploymentArtifact,
    payload: DeploymentPayload,
    deployment: DeployedWorkflowInstance,
    session: Session,
    cml: CMLServiceApi,
) -> None:
    """
    Deploys a given deployment artifact to a deployment target. This assumes
    that the deployment artifact itself has already gone through necessary validation
    steps and that we are ready to deploy.
    """

    deployment.status = DeploymentStatus.DEPLOYING
    session.commit()

    if payload.deployment_target.type == DeploymentTargetType.WORKBENCH_MODEL:
        deploy_artifact_to_workbench(artifact, payload, deployment, session, cml)
    else:
        raise ValueError(
            f'Deploying to a deployment target type of "{payload.deployment_target.type}" is not supported.'
        )

    deployment.status = DeploymentStatus.DEPLOYED
    session.commit()

    return


def package_workflow_target(
    payload: DeploymentPayload, deployment: DeployedWorkflowInstance, session: Session, cml: CMLServiceApi
) -> DeploymentArtifact:
    """
    Package a workflow target into an artifact.
    """

    deployment.status = DeploymentStatus.PACKAGING
    session.commit()

    if payload.workflow_target.type == WorkflowTargetType.WORKFLOW:
        artifact: DeploymentArtifact = package_workflow_for_deployment(payload, deployment, session, cml)
    elif payload.workflow_target.type == WorkflowTargetType.WORKFLOW_ARTIFACT:
        artifact: DeploymentArtifact = DeploymentArtifact(
            project_location=payload.workflow_target.workflow_artifact_location
        )
    else:
        raise ValueError(
            f'Deployment artifact of type "{payload.workflow_target.type}" is not supported for deployment.'
        )

    deployment.status = DeploymentStatus.PACKAGED
    session.commit()

    return artifact


def deploy(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> None:
    """
    Deploy a workflow artifact to a given deployment target, given inputs
    from a payload. This is the entrypoint driver for validating,
    packaging, and deploying workflow artifacts.
    """

    # Main try block to ensure DB session still closes
    try:
        # Initiate a deployment and get a reference to the deployed workflow instance.
        deployment: DeployedWorkflowInstance = initialize_deployment(payload, session, cml)

        # Attempt a deployment
        try:
            artifact: DeploymentArtifact = package_workflow_target(payload, deployment, session, cml)
            deploy_artifact(artifact, payload, deployment, session, cml)
            deployment.status = DeploymentStatus.DEPLOYED
            session.commit()

        # If a deployment fails, mark the deployment as failed in the DB
        # and continue to raise a runtime error
        except Exception as e:
            deployment.status = DeploymentStatus.FAILED
            update_deployment_metadata(deployment, {"error": str(e)})
            session.commit()

            # Raise an error so the Job also explicitly fails.
            raise RuntimeError("Deployment Failed") from e

    # Close the DB session.
    finally:
        session.close()

    return


def main():
    arg_string = os.environ.get("JOB_ARGUMENTS", "")
    parser = argparse.ArgumentParser()
    parser.add_argument("--deployment_payload", help="Payload of the deployment", required=True)
    args = parser.parse_args(arg_string.split())
    decoded_bytes = base64.b64decode(args.deployment_payload)
    decoded_str = decoded_bytes.decode("utf-8")
    deployment_payload_json: dict = json.loads(decoded_str)
    deployment_payload: DeploymentPayload = DeploymentPayload.model_validate(deployment_payload_json)
    dao: AgentStudioDao = AgentStudioDao()
    cml: CMLServiceApi = cmlapi.default_client()

    with dao.get_session() as session:
        deploy(deployment_payload, session, cml)


if __name__ == "__main__":
    main()
