# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Tuple, Annotated, Union
from pydantic import Field
from cmlapi import CMLServiceApi
import os
import json


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

def _sanitize_model_id(model_id: str) -> str:
    """Convert model ID to a valid environment variable name"""
    # Replace hyphens and any other invalid chars with underscores
    return "".join(c if c.isalnum() else "_" for c in model_id).upper()

def _sanitize_api_key(api_key: str) -> str:
    """Sanitize API key for shell environment variable value"""
    # Remove or escape any problematic characters
    # For now, we'll just ensure it's a simple string without spaces or special chars
    if not api_key or not isinstance(api_key, str):
        return ""
    return api_key.strip().replace('"', '').replace("'", "").replace(" ", "")

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
            
        # Use sanitized model ID for environment variable
        env_key = f"MODEL_API_KEY_{_sanitize_model_id(model_id)}"
        api_key = environment.get(env_key)
        return _sanitize_api_key(api_key) if api_key else None
        
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
            
        # Use sanitized model ID and API key
        env_key = f"MODEL_API_KEY_{_sanitize_model_id(model_id)}"
        environment[env_key] = _sanitize_api_key(api_key)
        
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
            env_key = f"MODEL_API_KEY_{_sanitize_model_id(model_id)}"
            if env_key in environment:
                del environment[env_key]
                # Update project with new environment
                update_body = {"environment": json.dumps(environment)}
                cml.update_project(update_body, project_id)
        except (json.JSONDecodeError, TypeError):
            pass  # Ignore if environment parsing fails
            
    except Exception as e:
        raise ValueError(f"Failed to remove API key for model {model_id}: {str(e)}")
