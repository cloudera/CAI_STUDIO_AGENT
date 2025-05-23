from studio.deployments.types import DeploymentArtifact, WorkflowTargetRequest

from studio.db.dao import AgentStudioDao


def package_workflow_template(
    target: WorkflowTargetRequest, deployment_id: str, dao: AgentStudioDao
) -> DeploymentArtifact:
    raise ValueError(f"Packaging workflow templates for direct deployment is not yet supported.")
    return


def package_workflow_template_zip(
    target: WorkflowTargetRequest, deployment_id: str, dao: AgentStudioDao
) -> DeploymentArtifact:
    raise ValueError(f"Packaging workflow template zips for direct deployment is not yet supported.")
    return
