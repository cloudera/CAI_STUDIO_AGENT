import os
import json
import tarfile
from typing import Optional
import requests

from sqlalchemy.orm.session import Session

import cmlapi
from cmlapi import CMLServiceApi

import studio.consts as consts
from studio.cross_cutting.apiv2 import get_api_key_from_env, validate_api_key, upload_file_to_project
from studio.deployments.types import DeploymentArtifact, DeploymentPayload
from studio.db.model import DeployedWorkflowInstance
from studio.workflow.utils import is_custom_model_root_dir_feature_enabled
from studio.cross_cutting.utils import deploy_cml_model, get_cml_project_number_and_id
import studio.cross_cutting.utils as cc_utils
from studio.deployments.applications import create_application_for_deployed_workflow, get_application_deep_link
from studio.deployments.utils import update_deployment_metadata

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

app_dir = os.getenv("APP_DIR")
if not app_dir:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))

from engine.ops import get_ops_endpoint


def get_application_ops_url(application_subdomain: str) -> str:
    """
    Construct the ops endpoint URL for an application.
    Format: {application.subdomain}.{CDSW_DOMAIN}/api/ops
    """
    cdsw_domain = os.getenv("CDSW_DOMAIN")
    if not cdsw_domain:
        raise EnvironmentError("CDSW_DOMAIN environment variable is not set.")

    scheme = cc_utils.get_url_scheme()
    return f"{scheme}://{application_subdomain}.{cdsw_domain}/api/ops"


def get_workbench_model_config(deployment_target_project_dir: str, artifact: DeploymentArtifact) -> dict:
    model_config = {}
    if is_custom_model_root_dir_feature_enabled():
        model_config = {
            "model_root_dir": deployment_target_project_dir,
            "model_file_path": "workbench.py",
            "workflow_artifact_location": os.path.join("/home/cdsw", os.path.basename(artifact.artifact_path)),
            "model_execution_dir": "/home/cdsw",
        }
    else:
        model_config = {
            "model_root_dir": None,
            "model_file_path": os.path.join(deployment_target_project_dir, "workbench.py"),
            "workflow_artifact_location": os.path.join(
                "/home/cdsw",
                deployment_target_project_dir,
                os.path.basename(artifact.artifact_path),
            ),
            "model_execution_dir": os.path.join("/home/cdsw", deployment_target_project_dir),
        }

    # For runtime mode, we only copy over the workbench driver file. All other files
    # and python packages are part of the runtime image itself.
    if os.getenv("AGENT_STUDIO_DEPLOY_MODE", "amp").lower() == "runtime":
        model_config["model_file_path"] = "workbench.py"

    return model_config


def prepare_env_vars_for_workbench(
    cml,
    deployment_target_project_dir: str,
    artifact: DeploymentArtifact,
    payload: DeploymentPayload,
    deployment: DeployedWorkflowInstance,
    session: Session,
    ops_endpoint: Optional[str] = None,
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

    workbench_model_config = get_workbench_model_config(deployment_target_project_dir, artifact)

    env_vars_dict.update(
        {
            "AGENT_STUDIO_OPS_ENDPOINT": ops_endpoint or get_ops_endpoint(),
            "AGENT_STUDIO_WORKFLOW_ARTIFACT": workbench_model_config["workflow_artifact_location"],
            "AGENT_STUDIO_WORKFLOW_DEPLOYMENT_CONFIG": json.dumps(payload.deployment_config.model_dump()),
            "AGENT_STUDIO_MODEL_EXECUTION_DIR": workbench_model_config["model_execution_dir"],
            "CDSW_APIV2_KEY": key_value,  # Pass the validated API key
            "CDSW_PROJECT_ID": os.getenv("CDSW_PROJECT_ID"),  # Pass the project ID
            "AGENT_STUDIO_DEPLOY_MODE": os.getenv("AGENT_STUDIO_DEPLOY_MODE", "amp"),
            "CREWAI_DISABLE_TELEMETRY": "true",  # disable crewai telemetry for the workflow engine
            "AGENT_STUDIO_WORKBENCH_TLS_ENABLED": os.getenv("AGENT_STUDIO_WORKBENCH_TLS_ENABLED", "true"),
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


def prepare_deployment_target_dir(
    cml: cmlapi.CMLServiceApi, deployment: DeployedWorkflowInstance, artifact: DeploymentArtifact
) -> str:
    """
    Create a deployment directory for this deployment. Note that we store sensitive
    logs information in this directory .phoenix/.

    Returns the relative path of the deployment directory from within the project filesystem.
    """

    # Relative to the project filesystem.
    deployment_target_dir = os.path.join(os.getenv("APP_DATA_DIR"), consts.DEPLOYABLE_WORKFLOWS_LOCATION, deployment.id)
    deployment_target_project_dir = os.path.relpath(deployment_target_dir, "/home/cdsw")

    # Upload the model artifact to the project.
    upload_file_to_project(
        cml,
        os.getenv("CDSW_PROJECT_ID"),
        os.path.join(deployment_target_project_dir, os.path.basename(artifact.artifact_path)),
        artifact.artifact_path,
    )

    # Upload the workbench driver file to the project.
    upload_file_to_project(
        cml,
        os.getenv("CDSW_PROJECT_ID"),
        os.path.join(deployment_target_project_dir, "workbench.py"),
        os.path.join(app_dir, "studio", "workflow_engine", "src", "engine", "entry", "workbench.py"),
    )

    # Upload the application driver to the workbench. Note: once we are able
    # to drive applications from files that don't exist within the project filesystem, we can
    # simply specify the startup script directly from the APP_DIR.
    upload_file_to_project(
        cml,
        os.getenv("CDSW_PROJECT_ID"),
        os.path.join(deployment_target_project_dir, "run-app.py"),
        os.path.join(app_dir, "startup_scripts", "run-app.py"),
    )

    # Lastly, bundle and add our workflow engine code to the deployment directory.
    prepare_workflow_engine_package(cml, deployment, deployment_target_project_dir)

    return deployment_target_project_dir


def prepare_workflow_engine_package(
    cml: cmlapi.CMLServiceApi, deployment: DeployedWorkflowInstance, deployment_target_project_dir: str
) -> None:
    """
    Create a tar.gz package of the workflow_engine directory (excluding .venv)
    and upload it to the project along with the cdsw-build.sh script.
    """
    # Create workflow_engine.tar.gz excluding .venv directory
    workflow_engine_dir = os.path.join(app_dir, "studio", "workflow_engine")
    tar_filename = "workflow_engine.tar.gz"
    tar_path = os.path.join("/tmp", tar_filename)

    def tar_filter(tarinfo):
        # Skip .venv directory and its contents
        if ".venv" in tarinfo.name or ".ruff_cache" in tarinfo.name or "__pycache__" in tarinfo.name:
            return None
        return tarinfo

    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(workflow_engine_dir, arcname=".", filter=tar_filter)

    # Upload workflow_engine.tar.gz to the project
    upload_file_to_project(
        cml,
        os.getenv("CDSW_PROJECT_ID"),
        os.path.join(deployment_target_project_dir, tar_filename),
        tar_path,
    )

    # Upload the cdsw-build.sh script to the deployment directory separately.
    upload_file_to_project(
        cml,
        os.getenv("CDSW_PROJECT_ID"),
        os.path.join(deployment_target_project_dir, "cdsw-build.sh"),
        os.path.join(app_dir, "studio", "workflow_engine", "cdsw-build.sh"),
    )

    # Clean up temporary tar file
    os.remove(tar_path)


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

        # Prepare the target directory. The returned directory is a RELATIVE path
        # relative to the project filesystem.
        deployment_target_project_dir = prepare_deployment_target_dir(cml, deployment, artifact)

        # STEP 1: Create CML model (without deployment)
        deployment_metadata = json.loads(deployment.deployment_metadata)
        if payload.deployment_target.auto_redeploy_to_type and deployment_metadata.get("cml_model_id"):
            print(f"Auto-redeploying to CML model with ID {deployment_metadata.get('cml_model_id')}")
            cml_model_id = deployment_metadata.get("cml_model_id")
        else:
            cml_model_id = create_new_cml_model(deployment, cml)

        # Update deployment metadata with model ID so application can access it
        update_deployment_metadata(deployment, {"cml_model_id": cml_model_id})
        deployment.cml_deployed_model_id = cml_model_id  # keep for legacy reasons
        session.commit()

        # STEP 2: Create application (with model ID available in deployment metadata)
        application_ops_url = None
        if payload.deployment_target.deploy_application:
            deployment_metadata = json.loads(deployment.deployment_metadata)
            if not deployment_metadata.get("application_id"):
                application: cmlapi.Application = create_application_for_deployed_workflow(
                    deployment_target_project_dir, deployment, False, cml
                )
                deep_link = get_application_deep_link(application.name)
                update_deployment_metadata(
                    deployment,
                    {
                        "application_id": application.id,
                        "application_deep_link": deep_link,
                        "application_subdomain": application.subdomain,
                    },
                )
                session.commit()

                # Construct the ops URL for this application
                application_subdomain = application.subdomain
                application_ops_url = get_application_ops_url(application_subdomain)
                print("APPLICATION OPS URL", application_ops_url)

        # STEP 3: Deploy the CML model with application URL as ops endpoint
        # Create env vars with the application ops URL
        workbench_model_env_vars = prepare_env_vars_for_workbench(
            cml, deployment_target_project_dir, artifact, payload, deployment, session, application_ops_url
        )

        # Get the workbench deployment config
        workbench_model_config = get_workbench_model_config(deployment_target_project_dir, artifact)

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

        # Update deployment metadata with build info and deep link
        workbench_model_deep_link = get_workbench_model_deep_link(cml_model_id)
        update_deployment_metadata(
            deployment,
            {
                "cml_model_build_id": model_build_id,
                "cml_model_deep_link": workbench_model_deep_link,
            },
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
