import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from studio.models.utils import (
    get_studio_default_model_id,
    get_model_api_key_from_env,
    update_model_api_key_in_env,
    remove_model_api_key_from_env,
    get_model_extra_headers_from_env,
    update_model_extra_headers_in_env,
    remove_model_extra_headers_from_env,
    _encode_value,
    _decode_value,
    _get_env_key,
    _get_extra_headers_env_key
)
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from cmlapi import CMLServiceApi
import json

def test_encode_decode_value():
    # Test encoding and decoding
    original = "test-value"
    encoded = _encode_value(original)
    assert isinstance(encoded, str)
    assert _decode_value(encoded) == original

    # Test edge cases
    assert _encode_value(None) == ""
    assert _encode_value(123) == ""
    assert _decode_value("") is None
    assert _decode_value("invalid-base64") is None

def test_get_env_key():
    model_id = "test-model"
    env_key = _get_env_key(model_id)
    assert isinstance(env_key, str)
    assert env_key.startswith("MODEL_API_KEY_")

@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_get_model_api_key_from_env(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    # Create encoded test key
    test_api_key = "test_api_key"
    encoded_key = _encode_value(test_api_key)
    env_key = _get_env_key("model-id-123")
    mock_cml.get_project.return_value.environment = json.dumps({env_key: encoded_key})
    mock_cml_api.return_value = mock_cml

    api_key = get_model_api_key_from_env("model-id-123", mock_cml)
    assert api_key == test_api_key

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

    model_id = "model-id-123"
    new_api_key = "new_api_key"
    update_model_api_key_in_env(model_id, new_api_key, mock_cml)

    # Verify the encoded key is stored
    env_key = _get_env_key(model_id)
    encoded_key = _encode_value(new_api_key)
    expected_env = json.dumps({env_key: encoded_key})
    mock_cml.update_project.assert_called_once_with({"environment": expected_env}, "test_project_id")

@patch('os.getenv', return_value=None)
def test_update_model_api_key_in_env_no_project_id(mock_getenv):
    mock_cml = MagicMock()
    with pytest.raises(ValueError, match="CDSW_PROJECT_ID environment variable not found"):
        update_model_api_key_in_env("model-id-123", "new_api_key", mock_cml)

@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_remove_model_api_key_from_env(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    model_id = "model-id-123"
    env_key = _get_env_key(model_id)
    initial_env = {env_key: _encode_value("test_key")}
    mock_cml.get_project.return_value.environment = json.dumps(initial_env)
    mock_cml_api.return_value = mock_cml

    remove_model_api_key_from_env(model_id, mock_cml)

    # Verify the key was removed
    mock_cml.update_project.assert_called_once_with({"environment": "{}"}, "test_project_id")

@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_remove_model_api_key_from_env_nonexistent(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    mock_cml.get_project.return_value.environment = '{}'
    mock_cml_api.return_value = mock_cml

    # Should not raise an error if key doesn't exist
    remove_model_api_key_from_env("model-id-123", mock_cml)
    mock_cml.update_project.assert_not_called()

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


# Tests for extra_headers functionality

def test_get_extra_headers_env_key():
    model_id = "test-model"
    env_key = _get_extra_headers_env_key(model_id)
    assert isinstance(env_key, str)
    assert env_key.startswith("MODEL_EXTRA_HEADERS_")
    # Should be different from API key env key
    api_key = _get_env_key(model_id)
    assert env_key != api_key


@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_get_model_extra_headers_from_env_success(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    # Create test extra headers
    test_headers = {"Authorization": "Bearer token", "Custom-Header": "value"}
    encoded_headers = _encode_value(json.dumps(test_headers))
    env_key = _get_extra_headers_env_key("model-id-123")
    mock_cml.get_project.return_value.environment = json.dumps({env_key: encoded_headers})
    mock_cml_api.return_value = mock_cml

    extra_headers = get_model_extra_headers_from_env("model-id-123", mock_cml)
    assert extra_headers == test_headers


@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_get_model_extra_headers_from_env_empty(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    mock_cml.get_project.return_value.environment = '{}'
    mock_cml_api.return_value = mock_cml

    extra_headers = get_model_extra_headers_from_env("model-id-123", mock_cml)
    assert extra_headers == {}


@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')  
def test_get_model_extra_headers_from_env_invalid_json(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    # Create invalid encoded data
    env_key = _get_extra_headers_env_key("model-id-123")
    mock_cml.get_project.return_value.environment = json.dumps({env_key: _encode_value("invalid-json")})
    mock_cml_api.return_value = mock_cml

    with patch('studio.models.utils.logger') as mock_logger:
        extra_headers = get_model_extra_headers_from_env("model-id-123", mock_cml)
        assert extra_headers == {}
        mock_logger.warning.assert_called_once()


@patch('os.getenv', return_value=None)
def test_get_model_extra_headers_from_env_no_project_id(mock_getenv):
    mock_cml = MagicMock()
    with pytest.raises(ValueError, match="CDSW_PROJECT_ID environment variable not found"):
        get_model_extra_headers_from_env("model-id-123", mock_cml)


@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_update_model_extra_headers_in_env_success(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    mock_cml.get_project.return_value.environment = '{}'
    mock_cml_api.return_value = mock_cml

    model_id = "model-id-123"
    test_headers = {"Authorization": "Bearer token", "Custom-Header": "value"}
    update_model_extra_headers_in_env(model_id, test_headers, mock_cml)

    # Verify the encoded headers are stored
    env_key = _get_extra_headers_env_key(model_id)
    encoded_headers = _encode_value(json.dumps(test_headers))
    expected_env = json.dumps({env_key: encoded_headers})
    mock_cml.update_project.assert_called_once_with({"environment": expected_env}, "test_project_id")


@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_update_model_extra_headers_in_env_empty_headers(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    model_id = "model-id-123"
    env_key = _get_extra_headers_env_key(model_id)
    initial_env = {env_key: _encode_value(json.dumps({"old": "header"}))}
    mock_cml.get_project.return_value.environment = json.dumps(initial_env)
    mock_cml_api.return_value = mock_cml

    # Pass empty headers - should remove the key
    update_model_extra_headers_in_env(model_id, {}, mock_cml)

    # Verify the key was removed
    mock_cml.update_project.assert_called_once_with({"environment": "{}"}, "test_project_id")


@patch('os.getenv', return_value=None)
def test_update_model_extra_headers_in_env_no_project_id(mock_getenv):
    mock_cml = MagicMock()
    with pytest.raises(ValueError, match="CDSW_PROJECT_ID environment variable not found"):
        update_model_extra_headers_in_env("model-id-123", {"test": "header"}, mock_cml)


@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_remove_model_extra_headers_from_env_success(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    model_id = "model-id-123"
    env_key = _get_extra_headers_env_key(model_id)
    initial_env = {env_key: _encode_value(json.dumps({"test": "header"}))}
    mock_cml.get_project.return_value.environment = json.dumps(initial_env)
    mock_cml_api.return_value = mock_cml

    remove_model_extra_headers_from_env(model_id, mock_cml)

    # Verify the key was removed
    mock_cml.update_project.assert_called_once_with({"environment": "{}"}, "test_project_id")


@patch('os.getenv', return_value="test_project_id")
@patch('studio.models.utils.CMLServiceApi')
def test_remove_model_extra_headers_from_env_nonexistent(mock_cml_api, mock_getenv):
    mock_cml = MagicMock()
    mock_cml.get_project.return_value.environment = '{}'
    mock_cml_api.return_value = mock_cml

    # Should not raise an error if key doesn't exist
    remove_model_extra_headers_from_env("model-id-123", mock_cml)
    mock_cml.update_project.assert_not_called()


@patch('os.getenv', return_value=None)
def test_remove_model_extra_headers_from_env_no_project_id(mock_getenv):
    mock_cml = MagicMock()
    with pytest.raises(ValueError, match="CDSW_PROJECT_ID environment variable not found"):
        remove_model_extra_headers_from_env("model-id-123", mock_cml)


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