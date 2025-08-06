import shutil
import os
from uuid import uuid4
import json
from typing import Union

import cmlapi
from cmlapi import CMLServiceApi

from studio.deployments.types import DeploymentStatus, DeploymentPayload
from studio.cross_cutting.utils import (
    get_random_compact_string,
    get_job_by_name,
    get_studio_subdirectory,
    get_deployed_workflow_runtime_identifier,
)
from sqlalchemy.orm.session import Session
from studio.db.model import DeployedWorkflowInstance, Workflow

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

app_dir = os.getenv("APP_DIR")
if not app_dir:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))


def copy_workflow_engine(target_dir: str) -> None:
    """
    Copy over our workflow engine code into our deployed workflow directory
    NOTE: this will go away once we move to a dedicated repo for workflow engines
    NOTE: for workbenches without the model root dir feature enabled, we are technically installing
    the workflow_engine package directly as part of the cdsw-build.sh script, so this copy may
    not be necessary.
    NOTE: the need for copying workflow engine code into a model artifact will go
    away depending on the deployment target type, so perhaps this should be part of the deployment
    target step.
    """

    def workflow_engine_ignore(src, names):
        return {".venv", ".ruff_cache", "__pycache__"}

    shutil.copytree(
        os.path.join(os.getenv("APP_DIR"), "studio", "workflow_engine"),
        target_dir,
        dirs_exist_ok=True,
        ignore=workflow_engine_ignore,
    )


def set_deployment_metadata(deployment: DeployedWorkflowInstance, metadata: dict) -> None:
    deployment.deployment_metadata = json.dumps(metadata)
    return


def update_deployment_metadata(deployment: DeployedWorkflowInstance, updated_metadata: dict) -> None:
    metadata: dict = json.loads(deployment.deployment_metadata) if deployment.deployment_metadata else {}
    metadata.update(updated_metadata)
    deployment.deployment_metadata = json.dumps(metadata)
    return


def create_new_deployed_workflow_instance(
    payload: DeploymentPayload, workflow: Workflow, cml: CMLServiceApi
) -> DeployedWorkflowInstance:
    return DeployedWorkflowInstance(
        id=str(uuid4()),
        name=f"{workflow.name}_{get_random_compact_string()}",
        type=payload.deployment_target.type,
        workflow=workflow,
    )


def create_new_workflow(payload: DeploymentPayload, cml: CMLServiceApi) -> DeployedWorkflowInstance:
    return Workflow(id=str(uuid4()), name=payload.workflow_target.workflow_name)


def get_or_create_workflow(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> Workflow:
    if payload.workflow_target and payload.workflow_target.workflow_id:
        workflow = session.query(Workflow).filter_by(id=payload.workflow_target.workflow_id).one()
    elif payload.workflow_target and payload.workflow_target.workflow_name:
        workflow = session.query(Workflow).filter_by(name=payload.workflow_target.workflow_name).one_or_none()
        if not workflow:
            workflow = create_new_workflow(payload, cml)
            session.add(workflow)
    else:
        raise ValueError(f"Either workflow_id or workflow_name required in the workflow_target payload.")

    return workflow


def get_or_create_deployment(
    workflow: Workflow, payload: DeploymentPayload, session: Session, cml: CMLServiceApi
) -> DeployedWorkflowInstance:
    # Grab any existing workflow deployments for this model
    existing_deployments: list[DeployedWorkflowInstance] = workflow.deployed_workflow_instances
    existing_deployments_of_type = list(
        filter(lambda x: x.type == payload.deployment_target.type, existing_deployments)
    )

    # Determine if we should be creating a new deployment or an existing deployment. We can do this by determining
    # whether the workflow itself has already been deployed to a deployment target of the same type of the request.
    # if there are no deploymnet targets of this target type, that means we can create an entirely new deployment
    # target instance. If the auto_deploy_to_type feature is enabled, then the existing deployment of the same
    # deployment type will be used as the deployment target (TODO: add in upstream validations that in this case that there
    # is only one deployment of this deployment type)
    if payload.deployment_target and payload.deployment_target.deployment_instance_id:
        deployment: DeployedWorkflowInstance = (
            session.query(DeployedWorkflowInstance).filter_by(id=payload.deployment_target.deployment_instance_id).one()
        )
    elif payload.deployment_target and payload.deployment_target.deployment_instance_name:
        deployment: DeployedWorkflowInstance = (
            session.query(DeployedWorkflowInstance)
            .filter_by(name=payload.deployment_target.deployment_instance_name)
            .one()
        )
    elif payload.deployment_target and payload.deployment_target.auto_redeploy_to_type and existing_deployments_of_type:
        assert len(existing_deployments_of_type) == 1
        deployment = existing_deployments_of_type[0]
    else:
        deployment: DeployedWorkflowInstance = create_new_deployed_workflow_instance(payload, workflow, cml)
        session.add(deployment)

    return deployment


def initialize_deployment(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> DeployedWorkflowInstance:
    """
    Initializes a deployment for a workflow.
    """

    workflow: Workflow = get_or_create_workflow(payload, session, cml)
    deployment: DeployedWorkflowInstance = get_or_create_deployment(workflow, payload, session, cml)
    deployment.status = DeploymentStatus.INITIALIZED
    deployment.is_stale = False
    session.commit()

    # Initialize deployment metadata if it does not exist yet
    if not deployment.deployment_metadata:
        deployment.deployment_metadata = "{}"
        session.commit()

    return deployment


def get_deployment_job_name(workflow: Workflow) -> str:
    return f"Agent Studio - Deploy Workflow: {workflow.id}"


def get_deployment_job_for_workflow(workflow: Workflow, cml: CMLServiceApi) -> cmlapi.Job:
    # Determine if the job exists
    job: Union[cmlapi.Job, None] = get_job_by_name(cml, get_deployment_job_name(workflow))

    # If this job doesn't exist, then create it!
    if job == None:
        job: cmlapi.Job = cml.create_job(
            {
                "name": get_deployment_job_name(workflow),
                "project_id": os.getenv("CDSW_PROJECT_ID"),
                "script": os.path.join(get_studio_subdirectory(), "studio", "jobs", "deploy.py"),
                "cpu": 2,
                "memory": 4,
                "nvidia_gpu": 0,
                "runtime_identifier": get_deployed_workflow_runtime_identifier(cml),
            },
            project_id=os.getenv("CDSW_PROJECT_ID"),
        )

    return job
