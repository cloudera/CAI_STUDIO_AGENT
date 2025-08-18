__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import pytest
import json
from unittest.mock import patch, MagicMock, call
from uuid import UUID
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.api import *
from studio.models.models import (
    add_model, update_model, remove_model, model_test, 
    list_models, get_model, get_studio_default_model,
    _add_extra_headers_to_model_protobuf
)


def test_add_model_with_extra_headers_dict():
    """Test adding a model with extra_headers as dict"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    test_uuid_str = "test-uuid-1234"
    test_uuid = MagicMock()
    test_uuid.__str__ = MagicMock(return_value=test_uuid_str)
    test_headers = {"Authorization": "Bearer token", "Custom-Header": "value"}
    
    with patch('studio.models.models.uuid4', return_value=test_uuid), \
         patch('studio.models.models.update_model_api_key_in_env') as mock_update_key, \
         patch('studio.models.models.update_model_extra_headers_in_env') as mock_update_headers:
        
        req = AddModelRequest(
            model_name="new_model",
            provider_model="provider1",
            model_type="OPENAI",
            api_base="http://api.base",
            api_key="api_key",
            extra_headers=json.dumps(test_headers)
        )

        res = add_model(req, cml=mock_cml, dao=test_dao)
        
        # Verify response
        assert res.model_id == test_uuid_str

        # Verify API key and extra headers were stored
        mock_update_key.assert_called_once_with(test_uuid_str, "api_key", mock_cml)
        mock_update_headers.assert_called_once_with(test_uuid_str, test_headers, mock_cml)


def test_add_model_extra_headers_failure_cleanup():
    """Test that API key is cleaned up if extra_headers storage fails"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    test_uuid_str = "test-uuid-1234"
    test_uuid = MagicMock()
    test_uuid.__str__ = MagicMock(return_value=test_uuid_str)
    
    with patch('studio.models.models.uuid4', return_value=test_uuid), \
         patch('studio.models.models.update_model_api_key_in_env') as mock_update_key, \
         patch('studio.models.models.update_model_extra_headers_in_env') as mock_update_headers, \
         patch('studio.models.models.remove_model_api_key_from_env') as mock_remove_key:
        
        # Make extra headers update fail
        mock_update_headers.side_effect = Exception("Headers storage failed")
        
        req = AddModelRequest(
            model_name="new_model",
            provider_model="provider1",
            model_type="OPENAI",
            api_key="api_key",
            extra_headers=json.dumps({"test": "header"})
        )

        with pytest.raises(ValueError, match="Failed to store extra headers in environment"):
            add_model(req, cml=mock_cml, dao=test_dao)
        
        # Verify API key was cleaned up
        mock_remove_key.assert_called_once_with(test_uuid_str, mock_cml)


def test_add_model_duplicate_name_extra_headers_cleanup():
    """Test cleanup of both API key and extra headers on duplicate name"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()
    
    # Add first model
    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="duplicate_name",
            provider_model="provider1",
            model_type="OPENAI"
        ))
        session.commit()

    test_uuid_str = "test-uuid-1234"
    test_uuid = MagicMock()
    test_uuid.__str__ = MagicMock(return_value=test_uuid_str)
    
    with patch('studio.models.models.uuid4', return_value=test_uuid), \
         patch('studio.models.models.update_model_api_key_in_env') as mock_update_key, \
         patch('studio.models.models.update_model_extra_headers_in_env') as mock_update_headers, \
         patch('studio.models.models.remove_model_api_key_from_env') as mock_remove_key, \
         patch('studio.models.models.remove_model_extra_headers_from_env') as mock_remove_headers:
        
        req = AddModelRequest(
            model_name="duplicate_name",
            provider_model="provider2",
            model_type="ANTHROPIC",
            api_key="test_key",
            extra_headers=json.dumps({"test": "header"})
        )

        with pytest.raises(ValueError, match="already exists"):
            add_model(req, cml=mock_cml, dao=test_dao)
        
        # Verify both API key and extra headers were cleaned up
        mock_remove_key.assert_called_once_with(test_uuid_str, mock_cml)
        mock_remove_headers.assert_called_once_with(test_uuid_str, mock_cml)


def test_update_model_with_extra_headers():
    """Test updating a model with extra_headers"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="old_model",
            provider_model="old_provider",
            model_type="OPENAI",
            api_base="http://old.base"
        ))
        session.commit()

    test_headers = {"Authorization": "Bearer new-token"}
    
    with patch('studio.models.models.update_model_extra_headers_in_env') as mock_update_headers:
        req = UpdateModelRequest(
            model_id="m1",
            model_name="new_model",
            extra_headers=json.dumps(test_headers)
        )

        res = update_model(req, cml=mock_cml, dao=test_dao)
        assert res.model_id == "m1"

        # Verify extra headers were updated
        mock_update_headers.assert_called_once_with("m1", test_headers, mock_cml)


def test_remove_model_cleans_up_extra_headers():
    """Test that removing a model cleans up both API key and extra headers"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="model1",
            provider_model="provider1",
            model_type="OPENAI",
            api_base="http://api.base1"
        ))
        session.commit()

    with patch('studio.models.models.remove_model_api_key_from_env') as mock_remove_key, \
         patch('studio.models.models.remove_model_extra_headers_from_env') as mock_remove_headers:
        
        req = RemoveModelRequest(model_id="m1")
        remove_model(req, cml=mock_cml, dao=test_dao)

        # Verify both API key and extra headers cleanup were called
        mock_remove_key.assert_called_once_with("m1", mock_cml)
        mock_remove_headers.assert_called_once_with("m1", mock_cml)

    # Verify model was actually deleted
    with test_dao.get_session() as session:
        model = session.query(db_model.Model).filter_by(model_id="m1").one_or_none()
        assert model is None


def test_model_test_uses_extra_headers_from_env():
    """Test that model_test uses extra_headers from environment"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()
    
    # Setup test data
    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="test_id",
            model_name="test_model",
            provider_model="test_provider",
            model_type="test_type",
            api_base="http://test.base"
        ))
        session.commit()

    test_headers = {"Custom-Header": "test-value"}
    
    with patch('studio.models.models.get_model_api_key_from_env', return_value="test_key"), \
         patch('studio.models.models.get_model_extra_headers_from_env', return_value=test_headers) as mock_get_headers, \
         patch('studio.models.models.get_crewai_llm') as mock_get_llm:
        
        mock_llm = MagicMock()
        mock_llm.call.return_value = "Test response"
        mock_get_llm.return_value = mock_llm
        
        req = TestModelRequest(
            model_id="test_id",
            completion_role="user",
            completion_content="Test prompt"
        )
        
        response = model_test(req, cml=mock_cml, dao=test_dao)
        assert response.response == "Test response"
        
        # Verify extra headers were retrieved and used
        mock_get_headers.assert_called_once_with("test_id", mock_cml)
        
        # Verify get_crewai_llm was called with extra headers
        call_args = mock_get_llm.call_args
        # The llm_config_dict is passed as the second positional argument
        llm_config = call_args[0][1]
        assert llm_config['extra_headers'] == test_headers


def test_add_extra_headers_to_model_protobuf():
    """Test the helper function for adding extra headers to protobuf"""
    mock_cml = MagicMock()
    test_headers = {"Authorization": "Bearer token"}
    
    # Create a mock model protobuf
    model_proto = MagicMock()
    model_proto.model_id = "test-model-id"
    
    with patch('studio.models.models.get_model_extra_headers_from_env', return_value=test_headers) as mock_get_headers:
        result = _add_extra_headers_to_model_protobuf(model_proto, mock_cml)
        
        # Verify extra headers were retrieved and set
        mock_get_headers.assert_called_once_with("test-model-id", mock_cml)
        assert result.extra_headers == json.dumps(test_headers)


def test_add_extra_headers_to_model_protobuf_empty():
    """Test helper function with empty extra headers"""
    mock_cml = MagicMock()
    
    model_proto = MagicMock()
    model_proto.model_id = "test-model-id"
    
    with patch('studio.models.models.get_model_extra_headers_from_env', return_value={}) as mock_get_headers:
        result = _add_extra_headers_to_model_protobuf(model_proto, mock_cml)
        
        # Verify empty string is set for empty headers
        assert result.extra_headers == ""


def test_add_extra_headers_to_model_protobuf_error():
    """Test helper function error handling"""
    mock_cml = MagicMock()
    
    model_proto = MagicMock()
    model_proto.model_id = "test-model-id"
    
    with patch('studio.models.models.get_model_extra_headers_from_env') as mock_get_headers, \
         patch('studio.models.models.logger') as mock_logger:
        
        mock_get_headers.side_effect = Exception("Failed to get headers")
        
        result = _add_extra_headers_to_model_protobuf(model_proto, mock_cml)
        
        # Verify error was logged and empty string set
        mock_logger.warning.assert_called_once()
        assert result.extra_headers == ""


def test_list_models_includes_extra_headers():
    """Test that list_models includes extra_headers from environment"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="model1",
            provider_model="provider1",
            model_type="OPENAI",
            api_base="http://api.base1"
        ))
        session.commit()

    test_headers = {"Custom-Header": "value"}
    
    with patch('studio.models.models.get_model_extra_headers_from_env', return_value=test_headers) as mock_get_headers:
        req = ListModelsRequest()
        res = list_models(req, cml=mock_cml, dao=test_dao)
        
        assert len(res.model_details) == 1
        assert res.model_details[0].model_name == "model1"
        assert res.model_details[0].extra_headers == json.dumps(test_headers)
        
        # Verify extra headers were retrieved
        mock_get_headers.assert_called_once_with("m1", mock_cml)


def test_get_model_includes_extra_headers():
    """Test that get_model includes extra_headers from environment"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="model1",
            provider_model="provider1",
            model_type="OPENAI",
            api_base="http://api.base1"
        ))
        session.commit()

    test_headers = {"Custom-Header": "value"}
    
    with patch('studio.models.models.get_model_extra_headers_from_env', return_value=test_headers) as mock_get_headers:
        req = GetModelRequest(model_id="m1")
        res = get_model(req, cml=mock_cml, dao=test_dao)
        
        assert res.model_details.model_name == "model1"
        assert res.model_details.extra_headers == json.dumps(test_headers)
        
        # Verify extra headers were retrieved
        mock_get_headers.assert_called_once_with("m1", mock_cml)


def test_get_studio_default_model_includes_extra_headers():
    """Test that get_studio_default_model includes extra_headers from environment"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="default_model",
            provider_model="provider1", 
            model_type="OPENAI",
            is_studio_default=True
        ))
        session.commit()

    test_headers = {"Custom-Header": "value"}
    
    with patch('studio.models.models.get_model_extra_headers_from_env', return_value=test_headers) as mock_get_headers:
        req = GetStudioDefaultModelRequest()
        res = get_studio_default_model(req, cml=mock_cml, dao=test_dao)
        
        assert res.is_default_model_configured == True
        assert res.model_details.model_name == "default_model"
        assert res.model_details.extra_headers == json.dumps(test_headers)
        
        # Verify extra headers were retrieved
        mock_get_headers.assert_called_once_with("m1", mock_cml) 