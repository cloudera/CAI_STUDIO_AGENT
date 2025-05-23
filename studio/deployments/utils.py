import shutil
import os
from uuid import uuid4
import json
from typing import Union

import cmlapi
from cmlapi import CMLServiceApi

from studio.deployments.types import DeploymentStatus, WorkflowTargetType, DeploymentPayload
from studio.cross_cutting.utils import get_random_compact_string, get_job_by_name
from studio.consts import AGENT_STUDIO_DEPLOY_JOB_NAME
from sqlalchemy.orm.session import Session
from studio.db.model import DeployedWorkflowInstance, Workflow

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src")


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
        os.path.join("studio", "workflow_engine"),
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


def initialize_deployment_for_workflow(
    payload: DeploymentPayload, session: Session, cml: CMLServiceApi
) -> DeployedWorkflowInstance:
    """
    Initializes a deployment for a workflow.
    """

    # First, try to grab the workflow target information. Since we are assuming that a workflow exists
    # already within an agent studio instance, this is all just a matter of ensuring that we
    # only have one workflow that matches our payload criteron. This should be checked for in our
    # validation logic further upstream.
    if payload.workflow_target.workflow_id:
        workflow: Workflow = session.query(Workflow).filter_by(id=payload.workflow_target.workflow_id).one()
    elif payload.workflow_target.workflow_name:
        workflow: Workflow = session.query(Workflow).filter_by(name=payload.workflow_target.workflow_name).one()
    else:
        raise ValueError(
            f'For deploying agent studio workflows, either "payload.workflow_target.workflow_id" or "payload.workflow_target.workflow_name" must be specified.'
        )

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

    deployment.status = DeploymentStatus.INITIALIZED
    deployment.deployment_metadata = "{}"
    deployment.is_stale = False
    session.commit()

    return deployment


def initialize_deployment(payload: DeploymentPayload, session: Session, cml: CMLServiceApi) -> None:
    """
    Initializes a deployment for a workflow.
    """

    if payload.workflow_target.type == WorkflowTargetType.WORKFLOW:
        deployment = initialize_deployment_for_workflow(payload, session, cml)
    else:
        raise ValueError(
            f'Deployments for workflow artifact type "{payload.workflow_target.type}" are not yet supported.'
        )

    return deployment


def get_deployment_job(cml: CMLServiceApi) -> cmlapi.Job:
    # Determine if the job exists
    job: Union[cmlapi.Job, None] = get_job_by_name(cml, AGENT_STUDIO_DEPLOY_JOB_NAME)

    # If this job doesn't exist, then create it!
    if job == None:
        job: cmlapi.Job = cml.create_job(
            {
                "name": AGENT_STUDIO_DEPLOY_JOB_NAME,
                "project_id": os.getenv("CDSW_PROJECT_ID"),
                "script": os.path.join(get_studio_subdirectory(), "bin", "upgrade-studio.py"),
                "cpu": 2,
                "memory": 8,
                "nvidia_gpu": 0,
                "runtime_identifier": get_deployed_workflow_runtime_identifier(cml),
            },
            project_id=os.getenv("CDSW_PROJECT_ID"),
        )

    return job
