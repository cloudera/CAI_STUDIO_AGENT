import os
from pydantic import BaseModel
from enum import Enum
from typing import Optional

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

app_dir = os.getenv("APP_DIR")
if not app_dir:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))
from engine.types import DeploymentConfig


class DeploymentStatus(str, Enum):
    """
    Status of a deployment. TODO: determine whether this is necessary or
    if we can leverage exiting status in the models and applications.
    """

    INITIALIZED = "initialized"
    PACKAGING = "packaging"
    PACKAGED = "packaged"
    DEPLOYING = "deploying"
    DEPLOYED = "deployed"
    FAILED = "failed"
    SUSPENDED = "suspended"


class DeploymentTargetType(str, Enum):
    """
    Deployment target type. This defines where the workflow
    will be deployed to.
    """

    WORKBENCH_MODEL = "workbench_model"
    LANGGRAPH_SERVER = "langgraph_server"
    AI_INFERENCE = "ai_inference"
    MODEL_REGISTRY = "model_registry"


class WorkflowTargetType(str, Enum):
    WORKFLOW = "workflow"
    """
    A workflow that exists within an agent studio instance.
    """
    WORKFLOW_TEMPLATE = "workflow_template"
    """
    Workflow template that exists within an agent studio instance.
    """
    WORKFLOW_ARTIFACT = "workflow_artifact"
    """
    A prepackaged workflow artifact that is archived or zipped.
    """
    GITHUB = "github"


class WorkbenchDeploymentResourceProfile(BaseModel):
    """
    Resource profile used to specify a workbench model
    deployment.
    """

    num_replicas: int = 1
    cpu: int = 2
    mem: int = 4


class ApplicationDeploymentResourceProfile(BaseModel):
    """
    Resource profile used to specify an application deployment.
    """

    cpu: int = 2
    mem: int = 8


class DeploymentArtifact(BaseModel):
    """
    Artifact that is packaged up and ready to deploy. This type is not a request type, but is rather
    used midway throughin the AS Deployment Job  to represent a packaged, ready-to-deploy workflow artifact that
    is about to be deployed. Right now, we're only supporting workflow artifacts that are packaged up into a
    project-relative location first. However, this field is left optional as there may be packaged targets
    that don't need a project relative location (like a packaged model registry model).
    """

    artifact_path: Optional[str] = None
    """
    Path of the deployment workflow artifact. This is the artifact
    that is packaged and ready to be deployed to any one of our deployment targets.
    """


class DeploymentTargetRequest(BaseModel):
    """
    Deloyment target type request. A deployment target can be
    any hosting infrastructure we're running our workflows on -
    workbench models, model registry (todo), and AI inference (todo).
    """

    type: DeploymentTargetType
    """
    Deployment target type. Specifies the hosting infrastructure
    or the target storage mechanism of where the workflow will be deployed.
    """

    workbench_resource_profile: WorkbenchDeploymentResourceProfile = WorkbenchDeploymentResourceProfile()
    """
    Optional resource profile to specify for deploying to a workbench model target.
    Defaults to one replica, 2vCPU per replica, and 4GB of ram per replica.
    """

    application_resource_profile: ApplicationDeploymentResourceProfile = ApplicationDeploymentResourceProfile()
    """
    Optional resource profile to specify for deploying to an application target.
    Defaults to 2vCPU and 8GB of ram.
    """

    deploy_application: bool = True
    """
    Deploy an application alongside this workflow if an application does not
    exist for this deployment instance.
    """

    deployment_instance_name: Optional[str] = None
    """
    Optionally explicit deployment instance name which represents our deployment target.
    If this is available then it's assumed that we are deploying directly to this deployment
    instance target. If a deployment instance name is specified, then a relevant deployed
    workflow instance with this name must be available for a given workflow.
    """

    deployment_instance_id: Optional[str] = None
    """
    Optionally explicit deployment instance ID which represents our deployment target.
    If this is available then it's assumed that we are deploying directly to this deployment
    instance target. If a deployment instance ID is specified, then a relevant deployed
    workflow instance with this ID must be available for a given workflow.
    """

    auto_redeploy_to_type: bool = False
    """
    If enabled, workflow will be deployed to any pre-existing deployment that matches the
    deployment target type that's in this request. Only works if there is only one deployment
    instance of the target type available for the workflow. If there are multiple deployment
    target instances for a workflow of the same target type, then an explicit deployment_instance_name
    or deployment_instance_id must be required to specify the deployment target.
    """


class WorkflowTargetRequest(BaseModel):
    """
    Workflow target request type. A workflow artifact is any "starting"
    workflow artifact that the job needs to first package before deploying.
    """

    type: WorkflowTargetType
    """ 
    Type of workflow artifact to deploy. Currently AS supports deploying
    the following types of workflow artifacts: 
    
    - workflow: Agent Studio supports deploying workflows that exist within an
    Agent Studio instance. Similarly to workflow templates, workflows must be deployed 
    with both a model config and a tool config where any API keys are required.
    
    - workflow_template: AS Supports deploying classical workflow templates. These are
    workflow templates that exist within an Agent Studio instance specified by
    a workflow template ID or a workflow template name. 
    
    - artifact: AS supports deploying zipped or archived workflows following Agent Studio's
    designated specifications.
    """

    # Parameters used when deploying existing Agent Studio workflows

    workflow_name: Optional[str] = None
    """
    Name of a workflow to deploy to. If deploying
    to a new workflow name, a new deployment target is also created. If multiple
    workflows have the same name, an explicit workflow_id is required rather than
    using this name field.
    """

    workflow_id: Optional[str] = None
    """
    Agent Studio workflow ID to deploy. Explicit workflow IDs can be used
    when multiple workflows in an Agent Studio instance have the same name.
    """

    # Parameters for deploying Agent Studio workflow templates

    workflow_template_name: Optional[str] = None
    """
    Name of a workflow in agent studio instance to deploy to. If multiple
    workflow templates have the same name, an explicit workflow_template_id is required.
    """

    workflow_template_id: Optional[str] = None
    """
    Agent Studio workflow template ID to deploy. Explicit workflow template IDs can be used
    when multiple workflow templates in an Agent Studio instance have the same name.
    
    TODO: determine restriction logic for workflow templates that have existing names. For workflow
    templates we are able to deploy with existing names if we track ID through the process. For 
    workflow artifacts we may need to ensure unique workflow names, but we only need to avoid
    name clashing for bringing custom workflow artifacts.
    """

    # Parameters for deploying agent studio workflow template artifacts

    workflow_artifact_location: Optional[str] = None
    """
    Workflow artifact project-relative location. This is an artifact that has been exported from
    an external Agent Studio instance. Artifact is relative to the project. The name of the workflow
    within the workflow artifact must be unique to all workflows in an Agent Studio instance that
    are custom workflow artifacts. Cannot deploy a custom artifact to a workflow that is not a custom
    target.
    """

    github_url: Optional[str] = None
    """
    Github URL of a custom workflow template.
    """


class DeploymentPayload(BaseModel):
    """
    Full Deployment Payload type, passed as a serialized input to an Agent Studio
    Deployment Job.

    TODO: investigate migrating to protobuf and enable an API pass-through via
    an Agent Studio instance via an /api/deploy endpoint.
    """

    workflow_target: Optional[WorkflowTargetRequest] = None
    """
    Workflow target request. Specifies information about the origin workflow
    that will be packaged and deployed.
    """

    deployment_target: Optional[DeploymentTargetRequest] = None
    """
    Deployment target request. Specifies information about where the workflow
    will be deployed.
    """

    deployment_config: Optional[DeploymentConfig] = None
    """
    Extra parameters required for our deployment config. This includes API Keys
    for models and tool parameters.
    """
