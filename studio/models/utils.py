# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Tuple, Annotated, Union, Dict, Any
from pydantic import Field
from cmlapi import CMLServiceApi
import os
import json
import base64
import logging

logger = logging.getLogger(__name__)


def get_studio_default_model_id(
    dao=None,
    preexisting_db_session=None,
) -> Tuple[
    Annotated[bool, Field(description="Is default set")], Union[Annotated[str, Field(description="Model ID")], None]
]:
    """
    Get the default model ID for the studio.
    """

    from studio.db import DbSession, model as db_model

    session: DbSession = preexisting_db_session or dao.get_session()
    model = session.query(db_model.Model).filter_by(is_studio_default=True).one_or_none()
    if not model:
        if not preexisting_db_session:
            session.close()
        return False, None

    if not preexisting_db_session:
        session.close()
    return True, model.model_id


def _encode_value(value: str) -> str:
    """Encode value for storage in environment variables using base64"""
    if not value or not isinstance(value, str):
        return ""
    return base64.b64encode(value.encode()).decode()


def _decode_value(encoded_value: str) -> str:
    """Decode base64-encoded value from environment variables"""
    if not encoded_value:
        return None
    try:
        return base64.b64decode(encoded_value.encode()).decode()
    except Exception:
        logger.warning("Failed to decode value from environment")
        return None


def _get_env_key(model_id: str) -> str:
    """Generate environment variable key for model API key"""
    encoded_id = _encode_value(model_id)
    return f"MODEL_API_KEY_{encoded_id}"


def get_model_api_key_from_env(model_id: str, cml: CMLServiceApi) -> str:
    """Get model API key from project environment variables"""
    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            raise ValueError("CDSW_PROJECT_ID environment variable not found")

        # Get project details
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
        except (json.JSONDecodeError, TypeError):
            environment = {}

        # Use encoded model ID for environment variable
        env_key = _get_env_key(model_id)
        encoded_key = environment.get(env_key)
        return _decode_value(encoded_key)

    except Exception as e:
        raise ValueError(f"Failed to get API key for model {model_id}: {str(e)}")


def update_model_api_key_in_env(model_id: str, api_key: str, cml: CMLServiceApi) -> None:
    """Update/Store model API key in project environment variables"""
    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            raise ValueError("CDSW_PROJECT_ID environment variable not found")

        # Get current project
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
        except (json.JSONDecodeError, TypeError):
            environment = {}

        # Use encoded model ID and API key
        env_key = _get_env_key(model_id)
        environment[env_key] = _encode_value(api_key)

        # Update project with new environment
        update_body = {"environment": json.dumps(environment)}
        cml.update_project(update_body, project_id)

    except Exception as e:
        raise ValueError(f"Failed to update API key for model {model_id}: {str(e)}")


def remove_model_api_key_from_env(model_id: str, cml: CMLServiceApi) -> None:
    """Remove model API key from project environment variables"""
    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            raise ValueError("CDSW_PROJECT_ID environment variable not found")

        # Get current project
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
            env_key = _get_env_key(model_id)
            if env_key in environment:
                del environment[env_key]
                # Update project with new environment
                update_body = {"environment": json.dumps(environment)}
                cml.update_project(update_body, project_id)
        except (json.JSONDecodeError, TypeError):
            pass  # Ignore if environment parsing fails

    except Exception as e:
        raise ValueError(f"Failed to remove API key for model {model_id}: {str(e)}")


def _get_extra_headers_env_key(model_id: str) -> str:
    """Generate environment variable key for model extra headers"""
    encoded_id = _encode_value(model_id)
    return f"MODEL_EXTRA_HEADERS_{encoded_id}"


def get_model_extra_headers_from_env(model_id: str, cml: CMLServiceApi) -> Dict[str, Any]:
    """Get model extra headers from project environment variables"""
    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            raise ValueError("CDSW_PROJECT_ID environment variable not found")

        # Get project details
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
        except (json.JSONDecodeError, TypeError):
            environment = {}

        # Use encoded model ID for environment variable
        env_key = _get_extra_headers_env_key(model_id)
        encoded_headers = environment.get(env_key)
        if not encoded_headers:
            return {}

        decoded_headers_str = _decode_value(encoded_headers)
        if not decoded_headers_str:
            return {}

        try:
            return json.loads(decoded_headers_str)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse extra headers for model {model_id}")
            return {}

    except Exception as e:
        raise ValueError(f"Failed to get extra headers for model {model_id}: {str(e)}")


def update_model_extra_headers_in_env(model_id: str, extra_headers: Dict[str, Any], cml: CMLServiceApi) -> None:
    """Update/Store model extra headers in project environment variables"""
    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            raise ValueError("CDSW_PROJECT_ID environment variable not found")

        # Get current project
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
        except (json.JSONDecodeError, TypeError):
            environment = {}

        # Use encoded model ID and serialize extra headers
        env_key = _get_extra_headers_env_key(model_id)
        if extra_headers:
            headers_json = json.dumps(extra_headers)
            environment[env_key] = _encode_value(headers_json)
        else:
            # Remove the key if extra_headers is empty
            if env_key in environment:
                del environment[env_key]

        # Update project with new environment
        update_body = {"environment": json.dumps(environment)}
        cml.update_project(update_body, project_id)

    except Exception as e:
        raise ValueError(f"Failed to update extra headers for model {model_id}: {str(e)}")


def remove_model_extra_headers_from_env(model_id: str, cml: CMLServiceApi) -> None:
    """Remove model extra headers from project environment variables"""
    try:
        project_id = os.getenv("CDSW_PROJECT_ID")
        if not project_id:
            raise ValueError("CDSW_PROJECT_ID environment variable not found")

        # Get current project
        project = cml.get_project(project_id)
        try:
            environment = json.loads(project.environment) if project.environment else {}
            env_key = _get_extra_headers_env_key(model_id)
            if env_key in environment:
                del environment[env_key]
                # Update project with new environment
                update_body = {"environment": json.dumps(environment)}
                cml.update_project(update_body, project_id)
        except (json.JSONDecodeError, TypeError):
            pass  # Ignore if environment parsing fails

    except Exception as e:
        raise ValueError(f"Failed to remove extra headers for model {model_id}: {str(e)}")
