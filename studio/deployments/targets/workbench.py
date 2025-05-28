import os
import shutil
import json
from typing import Optional
import requests

from sqlalchemy.orm.session import Session

import cmlapi
from cmlapi import CMLServiceApi

import studio.consts as consts
from studio.cross_cutting.apiv2 import get_api_key_from_env, validate_api_key
from studio.deployments.types import DeploymentArtifact, DeploymentPayload
from studio.deployments.utils import copy_workflow_engine
from studio.db.model import DeployedWorkflowInstance
from studio.workflow.utils import is_custom_model_root_dir_feature_enabled
from studio.cross_cutting.utils import get_studio_subdirectory, deploy_cml_model, get_cml_project_number_and_id
import studio.cross_cutting.utils as cc_utils
from studio.deployments.applications import create_application_for_deployed_workflow, get_application_deep_link
from studio.deployments.utils import update_deployment_metadata

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src")
from engine.ops import get_ops_endpoint


def get_workbench_model_config(deployable_workflow_dir: str, artifact: DeploymentArtifact) -> dict:
    if is_custom_model_root_dir_feature_enabled():
        return {
            "model_root_dir": os.path.join(get_studio_subdirectory(), deployable_workflow_dir),
            "model_file_path": "src/engine/entry/workbench.py",
            "workflow_artifact_location": os.path.join("/home/cdsw", os.path.basename(artifact.project_location)),
            "model_execution_dir": "/home/cdsw",
        }
    else:
        return {
            "model_root_dir": None,
            "model_file_path": os.path.join(
                get_studio_subdirectory(), deployable_workflow_dir, "src/engine/entry/workbench.py"
            ),
            "workflow_artifact_location": os.path.join(
                "/home/cdsw",
                get_studio_subdirectory(),
                deployable_workflow_dir,
                os.path.basename(artifact.project_location),
            ),
            "model_execution_dir": os.path.join("/home/cdsw", get_studio_subdirectory(), deployable_workflow_dir),
        }


def prepare_env_vars_for_workbench(
    cml,
    deployable_workflow_dir: str,
    artifact: DeploymentArtifact,
    payload: DeploymentPayload,
    deployment: DeployedWorkflowInstance,
    session: Session,
) -> dict:
    # Start with base dict
    env_vars_dict = {}

    # Get API key from project environment
    key_id, key_value = get_api_key_from_env(cml)
    if not key_id or not key_value:
        raise RuntimeError(
            "CML API v2 key not found. You need to configure a CML API v2 key for Agent Studio to deploy workflows."
        )

    # Validate the API key
    if not validate_api_key(key_id, key_value, cml):
        raise RuntimeError(
            "CML API v2 key validation has failed. You need to rotate the CML API v2 key for Agent Studio to deploy your workflow."
        )

    workbench_model_config = get_workbench_model_config(deployable_workflow_dir, artifact)

    env_vars_dict.update(
        {
            "AGENT_STUDIO_OPS_ENDPOINT": get_ops_endpoint(),
            "AGENT_STUDIO_WORKFLOW_ARTIFACT": workbench_model_config["workflow_artifact_location"],
            "AGENT_STUDIO_WORKFLOW_DEPLOYMENT_CONFIG": json.dumps(payload.deployment_config.model_dump()),
            "AGENT_STUDIO_MODEL_EXECUTION_DIR": workbench_model_config["model_execution_dir"],
            "CDSW_APIV2_KEY": key_value,  # Pass the validated API key
            "CDSW_PROJECT_ID": os.getenv("CDSW_PROJECT_ID"),  # Pass the project ID
        }
    )

    # Override any custom environment variables
    env_vars_dict.update(payload.deployment_config.environment)

    return env_vars_dict


def create_new_cml_model(
    deployment: DeployedWorkflowInstance,
    cml: cmlapi.CMLServiceApi,
):
    # k8s service labels are limited to 63 characters in length. the service that serves this
    # model will be labeled with "ds-runtime-workflow-model-<workflow_name>-HHHHHHHH-XXX-XXX". 26 characters are used for "ds-runtime-"
    # and 17 characters are used for "-HHHHHHHH-XXX-XXX", which leaves 63 - 26 - 17 = 20 characters for the name
    # of the workflow, including spaces and special characters. For longer workflow names, this information will get cut off,
    # but the model description (and workflow Application) will still contain the entire name string.
    #
    # components of the name:
    #   "ds-runtime": CDSW-specific, we don't have a say
    #   "workflow_model_": identifier that represents a workflow
    #   "_HHHHHHHH": 8-character hex idintifier that we add to each workflow instance
    #   "-XXX-XXX": CDSW-specfic, we don't have control over this
    #
    # ALSO, there's a fluent bit config volume mount that is in the form of:
    #  "workflow-model-<name>-<8hex>-XXX-XXXX-fluent-bit-config"
    #  which even FURTHER limits our name to 14 characters (!)
    # TODO: update character restrictions above ^ since we no longer prepend workflow_model
    cml_model_name = f"{deployment.name[:22]}_{deployment.name[-8:]}"

    # Check for required environment variables
    _, project_id = get_cml_project_number_and_id()
    try:
        # Create the model
        create_model_body = cmlapi.CreateModelRequest(
            project_id=project_id,
            name=cml_model_name,
            description=f"Model for workflow {deployment.name}",
            disable_authentication=True,
        )
        create_resp = cml.create_model(create_model_body, project_id=project_id)
    except cmlapi.rest.ApiException as e:
        raise RuntimeError(f"Failed to create model: {e.body}") from e
    except Exception as e:
        raise RuntimeError(f"Unexpected error during model creation: {str(e)}") from e
    model_id = create_resp.id
    return model_id


def deploy_artifact_to_workbench(
    artifact: DeploymentArtifact,
    payload: DeploymentPayload,
    deployment: DeployedWorkflowInstance,
    session: Session,
    cml: CMLServiceApi,
) -> None:
    """
    Deploys an artifact to a workbench.
    """

    cml_model_id, model_build_id = None, None
    workflow_frontend_application: Optional[cmlapi.Application] = None

    try:
        # Get cmlapi client
        cml = cmlapi.default_client()

        # Create a deployment staging area
        deployable_workflow_dir = os.path.join(consts.DEPLOYABLE_WORKFLOWS_LOCATION, deployment.id)
        if os.path.isdir(deployable_workflow_dir):
            shutil.rmtree(deployable_workflow_dir)
        os.makedirs(deployable_workflow_dir)

        # Copy model artifact and engine code
        shutil.copy(artifact.project_location, deployable_workflow_dir)
        copy_workflow_engine(deployable_workflow_dir)

        # Determine whether we are creating a new workbench model or if we
        # are deploying to an existing model.
        deployment_metadata = json.loads(deployment.deployment_metadata)
        if payload.deployment_target.auto_redeploy_to_type and deployment_metadata.get("cml_model_id"):
            print(f"Auto-redeploying to CML model with ID {deployment_metadata.get('cml_model_id')}")
            cml_model_id = deployment_metadata.get("cml_model_id")
        else:
            cml_model_id = create_new_cml_model(deployment, cml)

        # Create env vars of the workbench model
        workbench_model_env_vars = prepare_env_vars_for_workbench(
            cml, deployable_workflow_dir, artifact, payload, deployment, session
        )

        # Get the workbench deployment config
        workbench_model_config = get_workbench_model_config(deployable_workflow_dir, artifact)

        # Deploy workbench model
        cml_model_id, model_build_id = deploy_cml_model(
            cml=cml,
            model_id=cml_model_id,
            model_build_comment=f"Build for workflow {deployment.name}",
            model_root_dir=workbench_model_config["model_root_dir"],
            model_file_path=workbench_model_config["model_file_path"],
            function_name="api_wrapper",
            runtime_identifier=cc_utils.get_deployed_workflow_runtime_identifier(cml),
            deployment_config=cmlapi.ShortCreateModelDeployment(
                cpu=payload.deployment_target.workbench_resource_profile.cpu,
                memory=payload.deployment_target.workbench_resource_profile.mem,
                nvidia_gpus=0,
                environment=workbench_model_env_vars,
                replicas=payload.deployment_target.workbench_resource_profile.num_replicas,
            ),
        )
        workbench_model_deep_link = get_workbench_model_deep_link(cml_model_id)
        update_deployment_metadata(
            deployment,
            {
                "cml_model_id": cml_model_id,
                "cml_model_build_id": model_build_id,
                "cml_model_deep_link": workbench_model_deep_link,
            },
        )
        deployment.cml_deployed_model_id = cml_model_id  # keep for legacy reasons
        session.commit()

        # Create application if applicable (or pull this out elsewhere)
        if payload.deployment_target.deploy_application:
            deployment_metadata = json.loads(deployment.deployment_metadata)
            if not deployment_metadata.get("application_id"):
                application = create_application_for_deployed_workflow(deployment, False, cml)
                deep_link = get_application_deep_link(application.name)
                update_deployment_metadata(
                    deployment, {"application_id": application.id, "application_deep_link": deep_link}
                )
                session.commit()

        # Monitor application status and deployment status
        monitor_workbench_deployment_for_completion(payload, deployment, session, cml)

    except Exception as e:
        # Always elevate errors, as we want the deployment job itself to fail
        raise RuntimeError(f"Unexpected error occurred while deploying workflow: {str(e)}")

    return


def monitor_workbench_deployment_for_completion(
    payload: DeploymentPayload, deployment: DeployedWorkflowInstance, session: Session, cml: CMLServiceApi
) -> None:
    """
    Blocking method that waits for full deployment status of both application and model.
    """
    get_workbench_model_deployment_status(payload, deployment, session, cml)
    get_workbench_model_application_status(payload, deployment, session, cml)
    return


def get_workbench_model_deep_link(cml_model_id: str) -> str:
    # Get all models first for deep links
    project_num, project_id = cc_utils.get_cml_project_number_and_id()
    cdsw_ds_api_url = os.environ.get("CDSW_DS_API_URL").replace("/ds", "")
    cdsw_api_key = os.environ.get("CDSW_API_KEY")

    # Get list of all models
    list_url = f"{cdsw_ds_api_url}/models/list-models"
    headers = {"Content-Type": "application/json"}
    list_resp = requests.post(
        list_url,
        headers=headers,
        json={"latestModelBuild": True, "projectId": int(project_num), "latestModelDeployment": True},
        auth=(cdsw_api_key, ""),
    )
    if list_resp.status_code != 200:
        raise RuntimeError(f"Failed to list models: {list_resp.text}")

    model_list = list_resp.json()
    model_urls = {m["crn"].split("/")[-1]: m["htmlUrl"] for m in model_list if "crn" in m and "htmlUrl" in m}
    model_deep_link = model_urls.get(cml_model_id, "")
    return model_deep_link


def get_workbench_model_deployment_status(
    payload: DeploymentPayload, deployment: DeployedWorkflowInstance, session: Session, cml: CMLServiceApi
) -> bool:
    return True


def get_workbench_model_application_status(
    payload: DeploymentPayload, deployment: DeployedWorkflowInstance, session: Session, cml: CMLServiceApi
) -> bool:
    return True
