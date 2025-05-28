from cmlapi import CMLServiceApi

from studio.deployments.types import DeploymentPayload
from sqlalchemy.orm.session import Session


def validate_payload_for_workflow(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> None:
    """
    Validations to perform:
    * deployment target types align appropriately
    * non-ambiguous workflow target (check ID if there, check not multiple workflow names if that way)
    """

    return
