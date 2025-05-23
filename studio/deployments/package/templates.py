from uuid import uuid4
import os 
import shutil



from studio.deployments.types import (
    DeploymentArtifact,
    WorkflowTargetRequest,
    WorkflowTargetType
)

from studio.db.dao import AgentStudioDao
from studio.db.model import Workflow

from studio.consts import (
    DEPLOYABLE_WORKFLOWS_LOCATION
)
    





def package_workflow_template(target: WorkflowTargetRequest, deployment_id: str, dao: AgentStudioDao) -> DeploymentArtifact:
    raise ValueError(f"Packaging workflow templates for direct deployment is not yet supported.")
    return



def package_workflow_template_zip(target: WorkflowTargetRequest, deployment_id: str, dao: AgentStudioDao) -> DeploymentArtifact:
    raise ValueError(f"Packaging workflow template zips for direct deployment is not yet supported.")
    return


