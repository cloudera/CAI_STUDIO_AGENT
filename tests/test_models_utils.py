import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from studio.models.utils import (
    get_studio_default_model_id,
    get_model_api_key_from_env,
    update_model_api_key_in_env,
    _sanitize_model_id,
    _sanitize_api_key
)
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from cmlapi import CMLServiceApi

def test_sanitize_model_id():
    assert _sanitize_model_id("model-id-123") == "MODEL_ID_123"
    assert _sanitize_model_id("model@id!") == "MODEL_ID_"
    assert _sanitize_model_id("model id") == "MODEL_ID"

def test_sanitize_api_key():
    assert _sanitize_api_key("  api_key  ") == "api_key"
    assert _sanitize_api_key('api"key') == "apikey"
    assert _sanitize_api_key("api'key") == "apikey"
    assert _sanitize_api_key("api key") == "apikey"
    assert _sanitize_api_key(None) == ""
    assert _sanitize_api_key(123) == ""

@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_get_model_api_key_from_env(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    mock_cml.get_project.return_value.environment = '{"MODEL_API_KEY_MODEL_ID_123": "test_api_key"}'
    mock_cml_api.return_value = mock_cml

    api_key = get_model_api_key_from_env("model-id-123", mock_cml)
    assert api_key == "test_api_key"

@patch('os.getenv', return_value=None)
def test_get_model_api_key_from_env_no_project_id(mock_getenv):
    mock_cml = MagicMock()
    with pytest.raises(ValueError, match="CDSW_PROJECT_ID environment variable not found"):
        get_model_api_key_from_env("model-id-123", mock_cml)

@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_update_model_api_key_in_env(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    mock_cml.get_project.return_value.environment = '{}'
    mock_cml_api.return_value = mock_cml

    update_model_api_key_in_env("model-id-123", "new_api_key", mock_cml)

    expected_env = '{"MODEL_API_KEY_MODEL_ID_123": "new_api_key"}'
    mock_cml.update_project.assert_called_once_with({"environment": expected_env}, "test_project_id")

@patch('os.getenv', return_value=None)
def test_update_model_api_key_in_env_no_project_id(mock_getenv):
    mock_cml = MagicMock()
    with pytest.raises(ValueError, match="CDSW_PROJECT_ID environment variable not found"):
        update_model_api_key_in_env("model-id-123", "new_api_key", mock_cml)

def test_get_studio_default_model_id():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    # Test with no default model first
    with test_dao.get_session() as session:
        is_default_set, model_id = get_studio_default_model_id(dao=test_dao, preexisting_db_session=session)
        assert is_default_set is False
        assert model_id is None

    # Add a default model and test again
    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="default_model",
            provider_model="provider1",
            model_type="type1",
            is_studio_default=True
        ))
        session.commit()

        # Test with the same session
        is_default_set, model_id = get_studio_default_model_id(dao=test_dao, preexisting_db_session=session)
        assert is_default_set is True
        assert model_id == "m1"

def test_get_studio_default_model_id_no_default():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    # Add a non-default model
    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="non_default_model",
            provider_model="provider1",
            model_type="type1",
            is_studio_default=False
        ))
        session.commit()

        # Test with the same session
        is_default_set, model_id = get_studio_default_model_id(dao=test_dao, preexisting_db_session=session)
        assert is_default_set is False
        assert model_id is None 