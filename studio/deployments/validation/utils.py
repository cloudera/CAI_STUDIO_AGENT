
import cmlapi 
from cmlapi import CMLServiceApi

from studio.deployments.types import (
    DeploymentPayload,
    WorkflowTargetType,
    DeploymentStatus
)
from studio.deployments.validation.workflows import (
    validate_payload_for_workflow
)
from sqlalchemy.orm.session import Session
from studio.db.model import DeployedWorkflowInstance



def validate_workflow_target(payload, session: Session, cml: CMLServiceApi) -> None:
    if payload.workflow_target.type == WorkflowTargetType.WORKFLOW:
        validate_payload_for_workflow(payload, session, cml)
    else:
        raise ValueError(f'Deployment artifact of type "{payload.target.type}" is not supported.')
    return


def validate_deployment_target(payload, session: Session, cml: CMLServiceApi) -> None:
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