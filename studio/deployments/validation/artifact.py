from cmlapi import CMLServiceApi

from studio.deployments.types import DeploymentPayload
from sqlalchemy.orm.session import Session


def validate_payload_for_workflow_artifact(payload: DeploymentPayload, session: Session, ml: CMLServiceApi) -> None:
    """
    Validations to perform:
    * File path of workflow artifact exists
    * Workflow name the same in artifact vs in the payload
    * Test out creating a collated input
    """

    return
