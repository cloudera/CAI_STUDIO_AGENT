import base64
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple
from cmlapi import CMLServiceApi
import os
from cmlapi.models import CreateV2KeyRequest
import cmlapi

from studio.db.dao import AgentStudioDao
from studio.proto.agent_studio_pb2 import CmlApiCheckResponse, RotateCmlApiResponse
from studio.api import CmlApiCheckRequest, RotateCmlApiRequest
from studio.cross_cutting.workflow_redeploy import redeploy_all_workflows

# Configure logging to print to terminal
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create console handler and set level
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)

# Create formatter
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)

# Add handler to logger
logger.addHandler(console_handler)

def _encode_value(value: str) -> str:
    """Encode value for storage in environment variables using base64"""
    if not value or not isinstance(value, str):
        logger.debug("Empty or non-string value provided for encoding")
        return ""
    try:
        return base64.b64encode(value.encode()).decode()
    except Exception as e:
        logger.error(f"Failed to encode value: {str(e)}")
        return ""

def _decode_value(encoded_value: str) -> str:
    """Decode base64-encoded value from environment variables"""
    if not encoded_value:
        logger.debug("No encoded value provided for decoding")
        return None
    try:
        return base64.b64decode(encoded_value.encode()).decode()
    except Exception as e:
        logger.error(f"Failed to decode value: {str(e)}")
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
    """Generate new API v2 key with 1 year expiry"""
    if logger is None:
        logger = logging.getLogger(__name__)
        
    try:
        logger.info("Generating new API v2 key")
        
        # Get username from environment
        username = os.getenv("HADOOP_USER_NAME") or os.getenv("USER")
        if not username:
            logger.error("No username found in environment variables")
            raise ValueError("Could not determine username from environment variables")
            
        logger.info(f"Creating API key for user: {username}")
        
        # Create API key with 1 year expiry
        expiry = datetime.now() + timedelta(days=365)
        
        # Create request body as a dict
        body = {
            "expiry": expiry.isoformat(),
            "key_type": "API_KEY_TYPE_V2"
        }
        
        # Make API call with proper types
        logger.debug(f"Making API call with username: {username} and body: {body}")
        response = cml.create_v2_key(body=body, username=username)
        logger.debug(f"API key creation response type: {type(response)}")
        
        if not response:
            logger.error("Empty response from API")
            raise ValueError("Empty response from API")
            
        # Get response attributes using correct field names
        api_key_id = getattr(response, 'key_id', None)
        api_key = getattr(response, 'api_key', None)
        
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
            
        base_url = f"https://{domain}"
        
        # Create new client with the API key
        test_client = cmlapi.default_client(url=base_url, cml_api_key=key_value)
        
        # Try listing projects as a test
        test_client.list_projects()
        logger.info("API key validation successful")
        return True
        
    except Exception as e:
        logger.error(f"API key validation failed: {str(e)}")
        return False

def cml_api_check(request: CmlApiCheckRequest, cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None) -> CmlApiCheckResponse:
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

def rotate_cml_api(request: RotateCmlApiRequest, cml: CMLServiceApi, dao: AgentStudioDao, logger: logging.Logger = None) -> RotateCmlApiResponse:
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