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


def copy_custom_workflow_artifact(target: WorkflowTargetRequest, target_dir: str) -> None:
    
    if target.custom_workflow_artifact:
        shutil.copyfile(
            target.custom_workflow_artifact, 
            os.path.join(target_dir, 'workflow.tar.gz'),
        )
    elif target.custom_workflow_artifact_s3_uri:
        raise ValueError(f'Specifying "target.custom_workflow_artifact_s3_uri" is not yet supported.')

    return


def package_custom_workflow(target: WorkflowTargetRequest, deployment_id: str, dao: AgentStudioDao) -> DeploymentArtifact:
    """
    Package a custom workflow artifact for deployment. It is assumed in this case that 
    the incoming workflow artifact is already packaged for deployment and is in the right
    format for deployment, self-containing all keys and parameters needed to run the workflow.
    """
    
    if not target.custom_workflow_artifact:
        raise ValueError('Cannot deploy a custom workflow artifact without first specifying "target.custom_workflow_artifact".')
    
    # Create our deployment directory
    deployed_workflow_dir = os.path.join(DEPLOYABLE_WORKFLOWS_LOCATION, deployment_id)
    os.makedirs(deployed_workflow_dir, exist_ok=True)
    
    # Copy over our workflow artifact into the deployment directory
    copy_custom_workflow_artifact(target, deployed_workflow_dir)
    
    return DeploymentArtifact(
        id=deployment_id,
        project_location=deployed_workflow_dir
    )




