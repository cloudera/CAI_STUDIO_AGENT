
import cmlapi 
from cmlapi import CMLServiceApi

from studio.deployments.types import (
    DeploymentPayload,
    WorkflowTargetType
)
from sqlalchemy.orm.session import Session
from studio.db.model import DeployedWorkflowInstance


def validate_payload_for_workflow(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> None:
    """
    Validations to perform:
    * deployment target types align appropriately
    """
    
    return