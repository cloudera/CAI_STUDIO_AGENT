import os

from cmlapi import CMLServiceApi

from studio.db.model import DeployedWorkflowInstance, Workflow
from studio.deployments.types import DeploymentPayload, DeploymentStatus
from sqlalchemy.orm.session import Session


def validate_no_deployment_job_in_progress(
    payload: DeploymentPayload, session: Session, cml: CMLServiceApi = None
) -> None:
    """
    Agent studio creates a deployment job for every workflow target. If the workflow itself is
    undergoing a deployment, then validation will fail. If we are calling validation routines
    from the job directly, then there's no need to check if there is an ongoing deployment job run. However,
    these validation routines are typically called during the gRPC "deployWorkflow" call, which is where this
    validation check is useful.
    """

    if os.getenv("JOB_ARGUMENTS"):
        return

    project_id = os.getenv("CDSW_PROJECT_ID")

    workflow: Workflow = None
    if payload.workflow_target and payload.workflow_target.workflow_id:
        workflow = session.query(Workflow).filter_by(id=payload.workflow_target.workflow_id).one()
    elif payload.workflow_target and payload.workflow_target.workflow_name:
        workflow = session.query(Workflow).filter_by(name=payload.workflow_target.workflow_name).one_or_none()

    # If there is no existing workflow, then there is no existing deployment or deployment job run.
    if workflow == None:
        return

    # Get the deployed workflow instances attached to this workflow
    deployed_workflow_instances: list[DeployedWorkflowInstance] = workflow.deployed_workflow_instances

    # If there are any deployed workflow instances, then there is a deployment job running
    for deployed_workflow_instance in deployed_workflow_instances:
        if deployed_workflow_instance.status in [
            DeploymentStatus.DEPLOYING,
            DeploymentStatus.PACKAGED,
            DeploymentStatus.PACKAGING,
            DeploymentStatus.INITIALIZED,
        ]:
            raise ValueError(
                f"workflow '{workflow.name}' (id: '{workflow.id}') can't be deployed. Deployment job for this workflow is already running."
            )


def validate_workflow_target(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> None:
    # Ensure no other deployment job is running for this workflow
    validate_no_deployment_job_in_progress(payload, session, cml)

    return


def validate_deployment_target(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> None:
    """
    To validate:
    * make sure existing deployment of this deployment type (or more specifically actually
    just this deployment instance) is not undergoing a change (so force db look up and ensure
    that it's only in stopped/failed/deployed state, no middle states)
    """
    return


def validate_deployment_payload(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> None:
    """
    Validates the deployment including validing the actual
    deployment artifact as well as the payload.
    """

    # Validate the deployment artifact itself.
    validate_workflow_target(payload, session, cml)

    # Validate the deployment target.
    validate_deployment_target(payload, session, cml)

    return
