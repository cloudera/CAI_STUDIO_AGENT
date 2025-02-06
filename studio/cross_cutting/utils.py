import uuid
import base64
import re
import os
import cmlapi
import requests
from typing import Tuple, Annotated, Any, Union
from pydantic import Field
from studio import consts


def get_cml_project_number_and_id() -> Tuple[
    Annotated[str, Field(description="project number")], Annotated[str, Field(description="project ID")]
]:
    """
    Get the CML project number and ID from the environment variables.
    """
    project_num = os.environ.get("CDSW_PROJECT_NUM")
    project_id = os.environ.get("CDSW_PROJECT_ID")
    if not project_num or not project_id:
        raise EnvironmentError("Environment variables CDSW_PROJECT_NUM or CDSW_PROJECT_ID are not set")
    return project_num, project_id


def deploy_cml_model(
    cml: cmlapi.CMLServiceApi,
    model_name: str,
    model_description: str,
    model_build_comment: str,
    model_file_path: str,
    function_name: str,
    runtime_identifier: str,
    deployment_config: cmlapi.ShortCreateModelDeployment,
) -> Tuple[Annotated[str, Field(description="Model ID")], Annotated[str, Field(description="Model Build ID")]]:
    """
    Deploy a model to CML and create a model build with deployment.
    """
    # Check for required environment variables
    _, project_id = get_cml_project_number_and_id()
    try:
        # Create the model
        create_model_body = cmlapi.CreateModelRequest(
            project_id=project_id,
            name=model_name,
            description=model_description,
            disable_authentication=True,
        )
        create_resp = cml.create_model(create_model_body, project_id=project_id)
    except cmlapi.rest.ApiException as e:
        raise RuntimeError(f"Failed to create model: {e.body}") from e
    except Exception as e:
        raise RuntimeError(f"Unexpected error during model creation: {str(e)}") from e

    model_id = create_resp.id

    try:
        # Create the model build
        create_model_build_body = cmlapi.CreateModelBuildRequest(
            project_id=project_id,
            model_id=model_id,
            comment=model_build_comment,
            file_path=model_file_path,
            function_name=function_name,
            runtime_identifier=runtime_identifier,
            auto_deployment_config=deployment_config,
            auto_deploy_model=True,
        )
        if get_studio_subdirectory():
            create_model_build_body.model_root_dir = get_studio_subdirectory()
        create_build_resp = cml.create_model_build(create_model_build_body, project_id=project_id, model_id=model_id)
    except cmlapi.rest.ApiException as e:
        raise RuntimeError(f"Failed to create model build: {e.body}") from e
    except Exception as e:
        raise RuntimeError(f"Unexpected error during model build creation: {str(e)}") from e

    build_id = create_build_resp.id
    return model_id, build_id


def delete_cml_model(cml: cmlapi.CMLServiceApi, model_id: str) -> None:
    """
    Delete a model from CML.
    """
    project_num, project_id = get_cml_project_number_and_id()

    cdsw_ds_api_url = os.environ.get("CDSW_DS_API_URL").replace("/ds", "")
    cdsw_api_key = os.environ.get("CDSW_API_KEY")

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
    model_num = [m_["id"] for m_ in model_list if model_id in m_["crn"]]
    if not model_num:
        return  # might be already deleted
    model_num = model_num[0]
    delete_url = f"{cdsw_ds_api_url}/models/delete-model"
    data = {"id": model_num}
    response = requests.post(delete_url, headers=headers, json=data, auth=(cdsw_api_key, ""))
    if response.status_code != 200:
        raise RuntimeError(f"Failed to delete model: {response.text}")


def stop_all_cml_model_deployments(cml: cmlapi.CMLServiceApi, model_id: str) -> None:
    """
    Stop all deployments for a given model in CML.
    """
    project_id = os.environ.get("CDSW_PROJECT_ID")
    if not project_id:
        raise EnvironmentError("CDSW_PROJECT_ID environment variable is not set")

    try:
        # Fetch model builds
        model_builds = cml.list_model_builds(project_id=project_id, model_id=model_id).model_builds
        for build in model_builds:
            # Fetch model deployments for each build
            model_deployments = cml.list_model_deployments(
                project_id=project_id, model_id=model_id, build_id=build.id
            ).model_deployments
            for deployment in model_deployments:
                # Stop each deployment
                if deployment.status.lower() not in ["stopped", "failed"]:
                    cml.stop_model_deployment(
                        project_id=project_id, model_id=model_id, build_id=build.id, deployment_id=deployment.id
                    )
    except cmlapi.rest.ApiException as e:
        raise RuntimeError(f"API Exception during stopping deployments: {e.body}") from e
    except Exception as e:
        raise RuntimeError(f"Unexpected error during stopping deployments: {str(e)}") from e


def get_cml_model_deployment_status(cml: cmlapi.CMLServiceApi, model_id: str) -> str:
    """
    Fetch the deployment status of a model in CML.
    """
    project_id = os.environ.get("CDSW_PROJECT_ID")
    if not project_id:
        raise EnvironmentError("CDSW_PROJECT_ID environment variable is not set")

    try:
        # Get model builds
        model_builds = cml.list_model_builds(project_id=project_id, model_id=model_id).model_builds
        if not model_builds:
            raise ValueError("No model builds found for the given model ID")

        # Get the latest build
        build_id = model_builds[-1].id

        # Get deployments for the latest build
        model_deployments = cml.list_model_deployments(
            project_id=project_id, model_id=model_id, build_id=build_id
        ).model_deployments
        if not model_deployments:
            raise ValueError("No deployments found for the latest build")

        # Return the deployment status of the first deployment
        return model_deployments[0].status
    except AttributeError as e:
        raise ValueError(f"Invalid API client configuration: {str(e)}") from e
    except cmlapi.rest.ApiException as e:
        raise RuntimeError(f"API Exception during deployment status retrieval: {e.body}") from e
    except Exception as e:
        raise RuntimeError(f"Unexpected error during deployment status retrieval: {str(e)}") from e


def get_random_compact_string() -> str:
    """
    Generate a random 8-character string.
    """
    try:
        return (
            base64.urlsafe_b64encode(uuid.uuid4().bytes)[:8]
            .decode()
            .replace("_", "")
            .replace("-", "")
            .replace("=", "")[:8]
        )
    except Exception as e:
        raise RuntimeError(f"Failed to generate random string: {str(e)}") from e


def get_prefix_for_temporary_file() -> str:
    """
    Generate a prefix for temporary files.
    """
    try:
        return f"file_{get_random_compact_string()}_"
    except Exception as e:
        raise RuntimeError(f"Failed to generate file prefix: {str(e)}") from e


def is_valid_python_module_name(name: str) -> bool:
    """
    Validate if a string is a valid Python module name.
    """
    try:
        pattern = r"^[a-zA-Z_][a-zA-Z0-9_]*$"
        return bool(re.match(pattern, name))
    except Exception as e:
        raise ValueError(f"Error while validating module name: {str(e)}") from e


def get_appliction_by_name(cml: cmlapi.CMLServiceApi, name: str) -> cmlapi.Application:
    """
    Get the most recent running version of a CML application by its name.
    Args:
        cml: CML API client
        name: Base name of the application (e.g. 'Agent Studio')
    Returns:
        The most recent running version of the application
    Raises:
        ValueError: If no running application is found
    """
    applications: list[cmlapi.Application] = cml.list_applications(project_id=os.getenv("CDSW_PROJECT_ID")).applications

    # Filter for applications that:
    # 1. Match the base name
    # 2. Have "running" in their status
    running_apps = [
        app
        for app in applications
        if ((app.name == name) or (name + " v") in app.name)
        and "running" in app.status.lower()  # Changed to check if "running" is in status
    ]

    if not running_apps:
        raise ValueError(f"No running applications found matching '{name}'")

    # Sort by version number (assuming format "Name vX.Y")
    def get_version(app_name: str) -> tuple:
        try:
            version = app_name.split("v")[-1]
            return tuple(map(int, version.split(".")))
        except (IndexError, ValueError):
            return (0, 0)  # Default for apps without version

    # Return the most recent version
    return sorted(running_apps, key=lambda x: get_version(x.name))[-1]


def get_deployed_workflow_runtime_identifier(cml: cmlapi.CMLServiceApi) -> Union[Any, None]:
    """
    Get a runtime ID to be used for deployed workflow CML models. For now, we will use
    the same runtime ID as AI studio.

    Right now, we actually use the same base runtime image for both the CML model tasked
    with running our deployed workflows, as well as the standalone Workflow UI application.
    """
    application: cmlapi.Application = get_appliction_by_name(cml, consts.AGENT_STUDIO_SERVICE_APPLICATION_NAME)
    return application.runtime_identifier


def get_studio_subdirectory() -> str:
    """
    Get the subdirectory for the studio (if installed in IS_COMPOSABLE mode).
    """
    if os.getenv("IS_COMPOSABLE", "false").lower() != "true":
        return ""
    relative_path = os.path.relpath(os.path.abspath(os.getcwd()), "/home/cdsw")
    if relative_path.startswith("/"):
        relative_path = relative_path[1:]
    if relative_path.endswith("/"):
        relative_path = relative_path[:-1]
    return relative_path
