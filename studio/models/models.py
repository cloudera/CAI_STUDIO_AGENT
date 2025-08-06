import json
import os
from uuid import uuid4
from typing import List
from cmlapi import CMLServiceApi
import logging

from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.api import *

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys
import os

app_dir = os.getenv("APP_DIR")
if not app_dir:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))

from engine.crewai.llms import get_crewai_llm
from engine.types import Input__LanguageModel
from engine.consts import SupportedModelTypes

from .utils import (
    get_model_api_key_from_env,
    update_model_api_key_in_env,
    remove_model_api_key_from_env,
    get_model_extra_headers_from_env,
    update_model_extra_headers_in_env,
    remove_model_extra_headers_from_env,
)

logger = logging.getLogger(__name__)


def _add_extra_headers_to_model_protobuf(model_protobuf: Model, cml: CMLServiceApi) -> Model:
    """Helper function to add extra_headers from environment to model protobuf"""
    try:
        extra_headers = get_model_extra_headers_from_env(model_protobuf.model_id, cml)
        if extra_headers:
            model_protobuf.extra_headers = json.dumps(extra_headers)
        else:
            model_protobuf.extra_headers = ""
    except Exception as e:
        logger.warning(f"Failed to get extra headers for model {model_protobuf.model_id}: {str(e)}")
        model_protobuf.extra_headers = ""
    return model_protobuf


def list_models(
    request: ListModelsRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> ListModelsResponse:
    """
    List all models. Future extensions may include filtering based on request attributes.
    """
    with dao.get_session() as session:
        models: List[db_model.Model] = session.query(db_model.Model).all()
        model_details = []
        for model in models:
            model_proto = model.to_protobuf(Model)
            model_proto = _add_extra_headers_to_model_protobuf(model_proto, cml)
            model_details.append(model_proto)
        return ListModelsResponse(model_details=model_details)


def get_model(request: GetModelRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None) -> GetModelResponse:
    """
    Get details of a specific model by its ID.
    """
    with dao.get_session() as session:
        model = session.query(db_model.Model).filter_by(model_id=request.model_id).one_or_none()
        if not model:
            raise ValueError(f"Model with ID '{request.model_id}' not found.")

        model_proto = model.to_protobuf(Model)
        model_proto = _add_extra_headers_to_model_protobuf(model_proto, cml)
        return GetModelResponse(model_details=model_proto)


def add_model(request: AddModelRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None) -> AddModelResponse:
    """
    Add a new model based on the request parameters.
    If no models exist, set the added model as the default.

    Raises:
        ValueError: If model name already exists or if API key storage fails
    """
    # Generate model ID upfront so we can store the API key
    model_id = str(uuid4())

    if request.model_type not in [m_.value for m_ in SupportedModelTypes]:
        raise ValueError(f"Invalid model type: {request.model_type}. Supported model types are: {SupportedModelTypes}")

    # Store API key in project environment if provided
    if request.api_key:
        try:
            update_model_api_key_in_env(model_id, request.api_key, cml)
        except Exception as e:
            raise ValueError(f"Failed to store API key in environment: {str(e)}")

    # Store extra headers in project environment if provided
    if request.extra_headers:
        try:
            # Parse extra_headers if it's a string, otherwise use as-is
            if isinstance(request.extra_headers, str):
                extra_headers_dict = json.loads(request.extra_headers)
            else:
                extra_headers_dict = request.extra_headers
            update_model_extra_headers_in_env(model_id, extra_headers_dict, cml)
        except Exception as e:
            # Clean up API key if it was stored
            if request.api_key:
                try:
                    remove_model_api_key_from_env(model_id, cml)
                except Exception as cleanup_e:
                    logger.warning(f"Failed to clean up API key during extra headers error: {str(cleanup_e)}")
            raise ValueError(f"Failed to store extra headers in environment: {str(e)}")

    with dao.get_session() as session:
        # Validate if a model with the same name already exists
        if session.query(db_model.Model).filter_by(model_name=request.model_name).first():
            # Clean up API key and extra headers if they were stored
            if request.api_key:
                try:
                    remove_model_api_key_from_env(model_id, cml)
                except Exception as e:
                    logger.warning(
                        f"Failed to clean up API key for model {model_id} after duplicate name error: {str(e)}"
                    )
            if request.extra_headers:
                try:
                    remove_model_extra_headers_from_env(model_id, cml)
                except Exception as e:
                    logger.warning(
                        f"Failed to clean up extra headers for model {model_id} after duplicate name error: {str(e)}"
                    )
            raise ValueError(f"Model with name '{request.model_name}' already exists.")

        # Check if there are existing models in the database
        existing_model_count = session.query(db_model.Model).count()

        # Create the new model
        m_ = db_model.Model(
            model_id=model_id,
            model_name=request.model_name,
            provider_model=request.provider_model,
            model_type=request.model_type,
            api_base=request.api_base,
            is_studio_default=(existing_model_count == 0),
        )
        session.add(m_)
        session.commit()

        return AddModelResponse(model_id=m_.model_id)


def remove_model(
    request: RemoveModelRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> RemoveModelResponse:
    """
    Remove an existing model by its ID.
    Also updates any agents using this model and removes the API key from environment variables.
    Prevents deletion of the default LLM model.
    """
    with dao.get_session() as session:
        # Find the model
        m_ = session.query(db_model.Model).filter_by(model_id=request.model_id).one_or_none()
        if not m_:
            raise ValueError(f"Model with ID '{request.model_id}' not found.")

        # Check if this is the default model
        if m_.is_studio_default:
            raise ValueError(
                "Cannot delete the default LLM Model. Please set a different model as default first, "
                "or create a new default LLM Model before deleting this one."
            )

        # Update all agents using this model to have empty llm_provider_model_id
        session.query(db_model.Agent).filter_by(llm_provider_model_id=request.model_id).update(
            {"llm_provider_model_id": ""}
        )

        # Delete the model
        session.delete(m_)

        try:
            # Remove API key from project environment
            remove_model_api_key_from_env(request.model_id, cml)
        except Exception as e:
            logger.warning(f"Failed to remove API key for model {request.model_id} during deletion: {str(e)}")

        try:
            # Remove extra headers from project environment
            remove_model_extra_headers_from_env(request.model_id, cml)
        except Exception as e:
            logger.warning(f"Failed to remove extra headers for model {request.model_id} during deletion: {str(e)}")

        session.commit()

    return RemoveModelResponse()


def update_model(
    request: UpdateModelRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> UpdateModelResponse:
    """
    Update the configuration of an existing model.
    """
    with dao.get_session() as session:
        m_ = session.query(db_model.Model).filter_by(model_id=request.model_id).one_or_none()
        if not m_:
            raise ValueError(f"Model with ID '{request.model_id}' not found.")

        # Update fields only if provided in the request
        if request.model_name:
            m_.model_name = request.model_name
        if request.provider_model:
            m_.provider_model = request.provider_model
        if request.api_base:
            m_.api_base = request.api_base
        if request.extra_headers:
            # Parse extra_headers if it's a string, otherwise use as-is
            if isinstance(request.extra_headers, str):
                extra_headers_dict = json.loads(request.extra_headers)
            else:
                extra_headers_dict = request.extra_headers
            update_model_extra_headers_in_env(m_.model_id, extra_headers_dict, cml)
        if request.api_key:
            update_model_api_key_in_env(m_.model_id, request.api_key, cml)
        model_id = m_.model_id
        session.commit()

    return UpdateModelResponse(model_id=model_id)


def model_test(request: TestModelRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None) -> TestModelResponse:
    """Tests an existing model by sending a test request to the LiteLLM server."""
    with dao.get_session() as session:
        model = session.query(db_model.Model).filter_by(model_id=request.model_id).one_or_none()
        if not model:
            raise ValueError(f"Model with ID '{request.model_id}' not found.")

        # Get API key from environment instead of database
        api_key = get_model_api_key_from_env(model.model_id, cml)
        if not api_key:
            raise ValueError(
                f"API key is required but not found for model {model.model_name} "
                f"({model.model_id}). Please configure the API key in project environment variables."
            )

        # Get extra headers from environment instead of database
        extra_headers = get_model_extra_headers_from_env(model.model_id, cml)

        llm = get_crewai_llm(
            Input__LanguageModel(
                model_id=model.model_id,
                model_name=model.model_name,
                generation_config={
                    "temperature": request.temperature or None,
                    "max_new_tokens": request.max_tokens or None,
                },
            ),
            llm_config_dict={
                "provider_model": model.provider_model,
                "model_type": model.model_type,
                "api_base": model.api_base or None,
                "api_key": api_key,
                "extra_headers": extra_headers or None,
            },
        )

        try:
            response = llm.call(messages=[{"role": request.completion_role, "content": request.completion_content}])
            return TestModelResponse(response=response)
        except Exception as e:
            return TestModelResponse(response=f"Model Test Failed: {str(e)}")


def set_studio_default_model(
    request: SetStudioDefaultModelRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> SetStudioDefaultModelResponse:
    """
    Set a model as the default model for the Studio.
    """
    with dao.get_session() as session:
        # Reset the existing default model
        session.query(db_model.Model).filter_by(is_studio_default=True).update({"is_studio_default": False})
        # Set the new default model
        m_ = session.query(db_model.Model).filter_by(model_id=request.model_id).one_or_none()
        if not m_:
            raise ValueError(f"Model with ID '{request.model_id}' not found.")
        m_.is_studio_default = True
        session.commit()
    return SetStudioDefaultModelResponse()


def get_studio_default_model(
    request: GetStudioDefaultModelRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> GetStudioDefaultModelResponse:
    """
    Get the default model for the Studio.
    """
    with dao.get_session() as session:
        m_ = session.query(db_model.Model).filter_by(is_studio_default=True).one_or_none()
        if not m_:
            return GetStudioDefaultModelResponse(
                is_default_model_configured=False,
            )
        model_proto = m_.to_protobuf(Model)
        model_proto = _add_extra_headers_to_model_protobuf(model_proto, cml)
        return GetStudioDefaultModelResponse(
            is_default_model_configured=True,
            model_details=model_proto,
        )
