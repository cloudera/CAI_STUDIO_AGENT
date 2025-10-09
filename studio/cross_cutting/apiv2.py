import base64
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple
from concurrent.futures import ThreadPoolExecutor
from cmlapi import CMLServiceApi
import os
from cmlapi.models import CreateModelDeploymentRequest
import cmlapi

from studio.db.dao import AgentStudioDao
from studio.proto.agent_studio_pb2 import CmlApiCheckResponse, RotateCmlApiResponse, DeployedWorkflow
from studio.api import CmlApiCheckRequest, RotateCmlApiRequest
from studio.db import model as db_model
import studio.cross_cutting.utils as cc_utils


def _encode_value(value: str) -> str:
    """Encode value for storage in environment variables using base64"""
    if not value or not isinstance(value, str):
        return ""
    try:
        return base64.b64encode(value.encode()).decode()
    except Exception as e:
        return ""


def _decode_value(encoded_value: str) -> str:
    """Decode base64-encoded value from environment variables"""
    if not encoded_value:
        return None
    try:
        return base64.b64decode(encoded_value.encode()).decode()
    except Exception as e:
        return None


def _get_api_key_env_keys() -> Tuple[str, str]:
    """Get environment variable keys for API key storage"""
    return "AGENT_STUDIO_API_KEY_ID", "AGENT_STUDIO_API_KEY_VALUE"


def get_api_key_from_env(cml: CMLServiceApi, logger: logging.Logger = None) -> Tuple[Optional[str], Optional[str]]:
    """Get API key ID and value from project environment variables"""
    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            logger.error("CDSW_PROJECT_ID environment variable not found")
            raise ValueError("CDSW_PROJECT_ID environment variable not found")

        logger.info(f"Fetching API key from project {project_id}")
        # Get project details
        project = cml.get_project(project_id)
        if not project:
            logger.error(f"Project {project_id} not found")
            return None, None

        try:
            environment = json.loads(project.environment) if project.environment else {}
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to parse project environment: {str(e)}")
            environment = {}

        # Get encoded keys
        key_id_env, key_value_env = _get_api_key_env_keys()
        encoded_key_id = environment.get(key_id_env)
        encoded_key_value = environment.get(key_value_env)

        if not encoded_key_id or not encoded_key_value:
            logger.info("No API key found in environment")
            return None, None

        key_id = _decode_value(encoded_key_id)
        key_value = _decode_value(encoded_key_value)

        if key_id and key_value:
            logger.info("Successfully retrieved API key from environment")
        else:
            logger.warning("Retrieved API key is invalid")

        return key_id, key_value

    except Exception as e:
        logger.error(f"Failed to get API key from environment: {str(e)}")
        return None, None


def update_api_key_in_env(key_id: str, key_value: str, cml: CMLServiceApi, logger: logging.Logger = None) -> None:
    """Store API key ID and value in project environment variables"""
    if logger is None:
        logger = logging.getLogger(__name__)

    if not key_id or not key_value:
        logger.error("Invalid API key provided for storage")
        raise ValueError("API key ID and value must be provided")

    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            logger.error("CDSW_PROJECT_ID environment variable not found")
            raise ValueError("CDSW_PROJECT_ID environment variable not found")

        logger.info(f"Updating API key in project {project_id}")
        # Get current project
        project = cml.get_project(project_id)
        if not project:
            logger.error(f"Project {project_id} not found")
            raise ValueError(f"Project {project_id} not found")

        try:
            environment = json.loads(project.environment) if project.environment else {}
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to parse project environment: {str(e)}")
            environment = {}

        # Store encoded values
        key_id_env, key_value_env = _get_api_key_env_keys()
        environment[key_id_env] = _encode_value(key_id)
        environment[key_value_env] = _encode_value(key_value)

        # Update project with new environment
        update_body = {"environment": json.dumps(environment)}
        cml.update_project(update_body, project_id)
        logger.info("Successfully updated API key in environment")

    except Exception as e:
        logger.error(f"Failed to update API key in environment: {str(e)}")
        raise ValueError(f"Failed to update API key in environment: {str(e)}")


def generate_api_key(cml: CMLServiceApi, logger: logging.Logger = None) -> Tuple[str, str]:
    """Generate new API v2 key with 1 year expiry and both API and Application audiences"""
    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        logger.info("Generating new API v2 key with API and Application audiences")

        # Get username from environment
        username = os.getenv("HADOOP_USER_NAME") or os.getenv("USER")
        if not username:
            logger.error("No username found in environment variables")
            raise ValueError("Could not determine username from environment variables")

        logger.info(f"Creating API key for user: {username}")

        # Create API key with 1 year expiry
        expiry = datetime.now() + timedelta(days=365)

        # Create request body as a dict with both audiences
        body = {
            "expiry": expiry.isoformat(),
            "key_type": "API_KEY_TYPE_V2",
            "audiences": ["API", "Application"],  # Add both audiences
        }

        # Make API call with proper types
        logger.debug(f"Making API call with username: {username} and body: {body}")
        try:
            response = cml.create_v2_key(body=body, username=username)
        except Exception as e:
            # If creating with both audiences fails, try with default audience
            logger.warning(f"Failed to create key with both audiences: {str(e)}")
            logger.info("Falling back to default audience")
            body.pop("audiences", None)  # Remove audiences field
            response = cml.create_v2_key(body=body, username=username)

        logger.debug(f"API key creation response type: {type(response)}")

        if not response:
            logger.error("Empty response from API")
            raise ValueError("Empty response from API")

        # Get response attributes using correct field names
        api_key_id = getattr(response, "key_id", None)
        api_key = getattr(response, "api_key", None)

        if not api_key_id or not api_key:
            logger.error(f"Invalid response format. Response attributes: {dir(response)}")
            logger.error(f"key_id: {api_key_id}, api_key: {'present' if api_key else 'missing'}")
            raise ValueError("Invalid response format from API")

        logger.info(f"Successfully generated new API key for user {username}")
        return api_key_id, api_key

    except Exception as e:
        logger.error(f"Failed to generate API key: {str(e)}")
        raise RuntimeError(f"Failed to generate API key: {str(e)}")


def validate_api_key(key_id: str, key_value: str, cml: CMLServiceApi, logger: logging.Logger = None) -> bool:
    """Validate API key by attempting to list applications"""
    if logger is None:
        logger = logging.getLogger(__name__)

    if not key_id or not key_value:
        logger.warning("Invalid API key provided for validation")
        return False

    try:
        logger.info("Validating API key")

        # Get and format the API URL using CDSW_DOMAIN
        domain = os.getenv("CDSW_DOMAIN")
        if not domain:
            logger.error("CDSW_DOMAIN not found in environment")
            return False

        scheme = cc_utils.get_url_scheme()
        base_url = f"{scheme}://{domain}"

        # Create new client with the API key
        test_client = cmlapi.default_client(url=base_url, cml_api_key=key_value)

        # Try listing projects as a test
        test_client.list_projects()
        logger.info("API key validation successful")
        return True

    except Exception as e:
        logger.error(f"API key validation failed: {str(e)}")
        return False


def cml_api_check(
    request: CmlApiCheckRequest, cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None
) -> CmlApiCheckResponse:
    """
    Check if the CML API key exists and is valid.
    Returns CmlApiCheckResponse with message (empty string if successful, error message if failed)
    """
    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        # Get API key from environment
        key_id, key_value = get_api_key_from_env(cml, logger=logger)
        if not key_id or not key_value:
            logger.warning("No API key found in environment")
            return CmlApiCheckResponse(message="No API key found in environment")

        # Validate the key
        is_valid = validate_api_key(key_id, key_value, cml, logger=logger)
        logger.info(f"API key validation {'successful' if is_valid else 'failed'}")
        return CmlApiCheckResponse(message="" if is_valid else "API key validation failed")

    except Exception as e:
        logger.error(f"Error checking API key: {str(e)}")
        return CmlApiCheckResponse(message=f"Error checking API key: {str(e)}")


def rotate_cml_api(
    request: RotateCmlApiRequest, cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None
) -> RotateCmlApiResponse:
    """
    Generate a new API key and update it in the environment.
    Then redeploy all deployed workflows with the new key.
    Returns RotateCmlApiResponse with message (empty string if successful, error message if failed)
    """
    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        logger.info("Generating new API key...")
        # Generate new key
        key_id, key_value = generate_api_key(cml, logger=logger)

        logger.info("Updating environment with new API key...")
        # Update environment with new key
        update_api_key_in_env(key_id, key_value, cml, logger=logger)

        logger.info("API key rotation successful, starting workflow redeployments...")

        # Redeploy all workflows with new key
        redeploy_all_workflows(cml, dao, logger)

        return RotateCmlApiResponse(message="")

    except Exception as e:
        error_msg = f"Error rotating API key: {str(e)}"
        logger.error(error_msg)
        return RotateCmlApiResponse(message=error_msg)


def get_deployed_workflows(
    cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None
) -> list[DeployedWorkflow]:
    """Get list of deployed workflows"""
    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        # Get list of deployed workflows from database
        with dao.get_session() as session:
            deployed_workflows = session.query(db_model.DeployedWorkflowInstance).all()
            return [
                DeployedWorkflow(
                    deployed_workflow_id=dw.id,
                    workflow_id=dw.workflow_id,
                    cml_deployed_model_id=dw.cml_deployed_model_id,
                )
                for dw in deployed_workflows
            ]
    except Exception as e:
        logger.error(f"Error getting deployed workflows: {str(e)}")
        return []


def redeploy_single_workflow(
    workflow_id: str,
    cml: CMLServiceApi,
    dao: AgentStudioDao,
    logger: logging.Logger = None,
    env_var_overrides: dict = {},
):
    """Redeploy a single workflow"""
    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        with dao.get_session() as session:
            deployed_workflow = session.query(db_model.DeployedWorkflowInstance).filter_by(id=workflow_id).one_or_none()
            if not deployed_workflow:
                logger.error(f"Deployed workflow with ID '{workflow_id}' not found")
                return

            # Get latest build and its deployment
            builds = cml.list_model_builds(
                project_id=os.getenv("CDSW_PROJECT_ID"), model_id=deployed_workflow.cml_deployed_model_id
            ).model_builds

            if not builds:
                logger.error(f"No builds found for model {deployed_workflow.cml_deployed_model_id}")
                return

            latest_build = sorted(builds, key=lambda x: x.created_at, reverse=True)[0]
            deployments = cml.list_model_deployments(
                project_id=os.getenv("CDSW_PROJECT_ID"),
                model_id=deployed_workflow.cml_deployed_model_id,
                build_id=latest_build.id,
            ).model_deployments

            if not deployments:
                logger.error(f"No deployments found for model {deployed_workflow.cml_deployed_model_id}")
                return

            current_deployment = sorted(deployments, key=lambda x: x.created_at, reverse=True)[0]

            # Get environment vars - fail if we can't read them
            try:
                env_vars = json.loads(current_deployment.environment) if current_deployment.environment else {}
                if not env_vars:
                    raise ValueError("Current deployment has no environment variables")
            except Exception as e:
                logger.error(f"Failed to read environment variables from current deployment: {str(e)}")
                return

            # Update environment variables with overrides
            env_vars.update(env_var_overrides)

            # Get API key using the method from apiv2
            key_id, key_value = get_api_key_from_env(cml, logger)
            if not key_id or not key_value:
                raise RuntimeError(
                    "CML API v2 key not found. You need to configure a CML API v2 key for Agent Studio to deploy workflows."
                )

            # Update API key while preserving all other env vars
            env_vars["CDSW_APIV2_KEY"] = key_value

            # Create new deployment with same settings
            new_deployment = CreateModelDeploymentRequest(
                cpu=current_deployment.cpu,
                memory=current_deployment.memory,
                nvidia_gpus=0,
                environment=env_vars,
                replicas=current_deployment.replicas,
            )

            # Create new deployment with latest build
            cml.create_model_deployment(
                new_deployment, os.getenv("CDSW_PROJECT_ID"), deployed_workflow.cml_deployed_model_id, latest_build.id
            )

            logger.info(f"Successfully redeployed workflow {workflow_id}")

    except Exception as e:
        logger.error(f"Failed to redeploy workflow {workflow_id}: {str(e)}")


def redeploy_all_workflows(cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None):
    """Redeploy all deployed workflows"""
    if logger is None:
        logger = logging.getLogger(__name__)

    try:
        # Get list of deployed workflows
        deployed_workflows = get_deployed_workflows(cml, dao, logger)

        # Create thread pool for async redeployments
        with ThreadPoolExecutor(max_workers=5) as executor:
            for workflow in deployed_workflows:
                # Submit each redeployment to thread pool
                executor.submit(redeploy_single_workflow, workflow.deployed_workflow_id, cml, dao, logger)

        logger.info("All workflow redeployments initiated")

    except Exception as e:
        logger.error(f"Error redeploying workflows: {str(e)}")


def upload_file_to_project(
    client: cmlapi.CMLServiceApi, project_id: str, target_project_path: str, local_abs_path: str
):
    import time as _time

    header_params = {"Content-Type": "multipart/form-data"}
    files_payload = {target_project_path: local_abs_path}
    try:
        logging.debug(f"[AutoSync] delete_project_file before upload path={target_project_path}")
        client.delete_project_file(project_id=project_id, path=target_project_path)
    except Exception:
        logging.debug("[AutoSync] delete_project_file ignored (not existing or not deletable)")
    last_exc = None
    for attempt in range(3):
        try:
            logging.debug(f"[AutoSync] upload attempt={attempt + 1} target={target_project_path} src={local_abs_path}")
            client.api_client.call_api(
                f"/api/v2/projects/{{project_id}}/files",
                "POST",
                path_params={"project_id": project_id},
                header_params=header_params,
                files=files_payload,
                response_type=None,
            )
            return
        except Exception as e:
            last_exc = e
            _time.sleep(1 + attempt)
    if last_exc:
        logging.exception(f"[AutoSync] upload failed target={target_project_path}")
        raise last_exc
