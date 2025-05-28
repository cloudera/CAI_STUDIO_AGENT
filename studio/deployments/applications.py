import json
import os
import cmlapi
import requests
import json
from cmlapi import CMLServiceApi

from studio.db import model as db_model
import studio.cross_cutting.utils as cc_utils

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src")


def cleanup_deployed_workflow_application(cml: CMLServiceApi, application: cmlapi.Application):
    """
    Helper function to clean up an application. Abstracted out in case
    we need to add more functionality in the future.
    """
    try:
        cml.delete_application(os.getenv("CDSW_PROJECT_ID"), application.id)
    except Exception as e:
        print(f"Failed to clean up workflow application with ID {application.id}: {str(e)}")


def get_application_name_for_deployed_workflow(deployment: db_model.DeployedWorkflowInstance) -> str:
    """
    Get the name of the workflow application given the name of the workflow. This
    seems like overkill but it's abstracted out in case we need to change it in the future.
    """
    return f"Workflow: {deployment.name}"


def get_application_for_deployed_workflow(
    deployed_workflow: db_model.DeployedWorkflowInstance, cml: CMLServiceApi
) -> cmlapi.Application:
    """
    Get the CML application tied to a specific workflow.
    """
    resp: cmlapi.ListApplicationsResponse = cml.list_applications(os.getenv("CDSW_PROJECT_ID"), page_size=5000)
    applications: list[cmlapi.Application] = resp.applications
    applications = list(
        filter(lambda x: x.name == get_application_name_for_deployed_workflow(deployed_workflow), applications)
    )
    assert len(applications) == 1
    application: cmlapi.Application = applications[0]
    return application


def create_application_for_deployed_workflow(
    deployment: db_model.DeployedWorkflowInstance, bypass_authentication: bool, cml: CMLServiceApi
) -> cmlapi.Application:
    """
    Deploy a dedicated CML application for this deployed workflow which can be used to test the workflow.
    The application can make calls to the CML model endpoint and can also track the lifecycle of a request.
    """

    # Load deployment metadata
    deployment_metadata = json.loads(deployment.deployment_metadata)

    # The workflow app runs in the same Node environment as our react app. Based on
    # a "render mode" environment variable, either the studio app will display, or the
    # workflow app will display. In this fashion, we can centralize dependencies and also
    # carry over the API middleware to access the gRPC service through HTTP.
    env_vars_for_app = {
        "AGENT_STUDIO_RENDER_MODE": "workflow",
        "AGENT_STUDIO_DEPLOYED_WORKFLOW_ID": deployment.id,
        "AGENT_STUDIO_DEPLOYED_MODEL_ID": deployment.cml_deployed_model_id
        or deployment_metadata.get("cml_model_id")
        or "",
    }

    # Right now, creating an application through CML APIv2 will manually copy over the project
    # environment variables into the application env vars, which is undesirable. Every time the observability server or the
    # gRPC server changes, we need to reach out to all deployed workflows and deployed applications
    # and update the respective environment variables. We shouldn't have to do this once we
    # fix the env var copying issue.
    application: cmlapi.Application = cml.create_application(
        cmlapi.CreateApplicationRequest(
            name=get_application_name_for_deployed_workflow(deployment),
            subdomain=f"workflow-{deployment.id}",
            description=f"Workflow UI for workflow {deployment.name}",
            script=os.path.join(cc_utils.get_studio_subdirectory(), "startup_scripts", "run-app.py"),
            cpu=2,
            memory=4,
            nvidia_gpu=0,
            environment=env_vars_for_app,
            bypass_authentication=bypass_authentication,
            runtime_identifier=cc_utils.get_deployed_workflow_runtime_identifier(cml),
        ),
        project_id=os.environ.get("CDSW_PROJECT_ID"),
    )

    return application


def get_application_deep_link(workflow_app_name: str) -> str:
    cdsw_api_key = os.environ.get("CDSW_API_KEY")
    headers = {"Content-Type": "application/json"}
    project_url = os.getenv("CDSW_PROJECT_URL")
    apps_url = f"{project_url}/applications?page_size=1000"
    apps_resp = requests.get(
        apps_url,
        headers=headers,
        auth=(cdsw_api_key, ""),
    )
    if apps_resp.status_code != 200:
        raise RuntimeError(f"Failed to list applications: {apps_resp.text}")
    applications = apps_resp.json()
    matching_app = next((app for app in applications if app["name"] == workflow_app_name), None)
    if matching_app and "projectHtmlUrl" in matching_app and "id" in matching_app:
        application_deep_link = f"{matching_app['projectHtmlUrl']}/applications/{matching_app['id']}"
        return application_deep_link
    raise ValueError(f"Could not get application deep link for application named '{workflow_app_name}'")
