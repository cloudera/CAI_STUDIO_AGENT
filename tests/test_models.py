__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import pytest
from unittest.mock import patch, MagicMock, call
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.api import *
from studio.models.models import *
from engine.types import Input__LanguageModel, Input__LanguageModelConfig



def test_list_models():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="model1",
            provider_model="provider1",
            model_type="OPENAI",
            api_base="http://api.base1"
        ))
        session.commit()

    req = ListModelsRequest()
    res = list_models(req, dao=test_dao)
    assert len(res.model_details) == 1
    assert res.model_details[0].model_name == "model1"


def test_add_model():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    # Mock the UUID generation
    test_uuid = "test-uuid-1234"
    with patch('studio.models.models.uuid4', return_value=test_uuid):
        # Mock the utility function for updating API key
        with patch('studio.models.models.update_model_api_key_in_env') as mock_update_key:
            req = AddModelRequest(
                model_name="new_model",
                provider_model="provider1",
                model_type="OPENAI",
                api_base="http://api.base",
                api_key="api_key"
            )

            res = add_model(req, cml=mock_cml, dao=test_dao)
            
            # Verify response
            assert res.model_id == test_uuid

            # Verify model was created correctly
            with test_dao.get_session() as session:
                model = session.query(db_model.Model).filter_by(model_name="new_model").one_or_none()
                assert model is not None
                assert model.provider_model == "provider1"
                assert model.model_id == test_uuid
                assert model.is_studio_default == True  # Should be default as it's first model

            # Verify API key was stored
            mock_update_key.assert_called_once_with(test_uuid, "api_key", mock_cml)

def test_add_model_duplicate_name():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    # Add first model
    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="duplicate_name",
            provider_model="provider1",
            model_type="OPENAI"
        ))
        session.commit()

    # Try to add model with same name
    req = AddModelRequest(
        model_name="duplicate_name",
        provider_model="provider2",
        model_type="ANTHROPIC"
    )

    with pytest.raises(ValueError) as exc_info:
        add_model(req, dao=test_dao)
    assert "Model with name 'duplicate_name' already exists" in str(exc_info.value)

def test_remove_model():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="model1",
            provider_model="provider1",
            model_type="OPENAI",
            api_base="http://api.base1"
        ))
        session.commit()

    req = RemoveModelRequest(model_id="m1")
    remove_model(req, dao=test_dao)

    with test_dao.get_session() as session:
        model = session.query(db_model.Model).filter_by(model_id="m1").one_or_none()
        assert model is None


def test_update_model():
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

    # Mock the API key update function
    with patch('studio.models.models.update_model_api_key_in_env') as mock_update_key:
        req = UpdateModelRequest(
            model_id="m1",
            model_name="new_model",
            provider_model="new_provider",
            api_base="http://new.base",
            api_key="new_key"
        )

        res = update_model(req, cml=mock_cml, dao=test_dao)
        assert res.model_id == "m1"

        # Verify model updates
        with test_dao.get_session() as session:
            model = session.query(db_model.Model).filter_by(model_id="m1").one_or_none()
            assert model.model_name == "new_model"
            assert model.provider_model == "new_provider"
            assert model.api_base == "http://new.base"

        # Verify API key was updated
        mock_update_key.assert_called_once_with("m1", "new_key", mock_cml)

def test_get_model_not_found():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    req = GetModelRequest(model_id="nonexistent")
    with pytest.raises(ValueError) as excinfo:
        get_model(req, dao=test_dao)
    assert "Model with ID 'nonexistent' not found" in str(excinfo.value)


class MockCrewAILLM:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        
    def call(self, messages):
        if self.error:
            raise self.error
        return self.response

def test_model_test_model_not_found():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()
    
    req = TestModelRequest(
        model_id="nonexistent_id",
        completion_role="user",
        completion_content="Test prompt"
    )
    
    with pytest.raises(ValueError) as exc_info:
        model_test(req, cml=mock_cml, dao=test_dao)
    assert "Model with ID 'nonexistent_id' not found" in str(exc_info.value)

def test_model_test_missing_api_key():
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

    # Mock environment API key retrieval to return None
    with patch('studio.models.models.get_model_api_key_from_env', return_value=None):
        req = TestModelRequest(
            model_id="test_id",
            completion_role="user",
            completion_content="Test prompt"
        )
        
        with pytest.raises(ValueError) as exc_info:
            model_test(req, cml=mock_cml, dao=test_dao)
        assert "API key is required but not found" in str(exc_info.value)

# @patch('engine.crewai.llms.get_crewai_llm')
# def test_model_test_without_optional_params(mock_get_llm):
#     # Create a mock LLM object with a call method
#     mock_llm = MagicMock()
#     mock_llm.call.return_value = "Test response"
#     mock_get_llm.return_value = mock_llm

#     test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
#     mock_cml = MagicMock()

#     # Setup test data with valid model_type
#     with test_dao.get_session() as session:
#         session.add(db_model.Model(
#             model_id="test_id",
#             model_name="test_model",
#             provider_model="test_provider",
#             model_type="OPENAI",
#             api_base=None
#         ))
#         session.commit()

#     with patch('studio.models.models.get_model_api_key_from_env', return_value="test_api_key"):
#         req = TestModelRequest(
#             model_id="test_id",
#             completion_role="user",
#             completion_content="Test prompt"
#             # Omit optional temperature and max_tokens
#         )

#         response = model_test(req, cml=mock_cml, dao=test_dao)
#         assert response.response == "Test response"

#         # Verify get_crewai_llm was called with correct parameters
#         mock_get_llm.assert_called_once_with(
#             Input__LanguageModel(
#                 model_id="test_id",
#                 model_name="test_model",
#                 config=Input__LanguageModelConfig(
#                     provider_model="test_provider",
#                     model_type="OPENAI",
#                     api_base=None,
#                     api_key="test_api_key",
#                 ),
#                 generation_config={
#                     "temperature": None,
#                     "max_new_tokens": None,
#                 },
#             )
#         )

def test_set_studio_default_model():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    # Setup initial models with required fields
    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="model1",
            provider_model="provider1",
            model_type="OPENAI",
            is_studio_default=True
        ))
        session.add(db_model.Model(
            model_id="m2",
            model_name="model2",
            provider_model="provider2",
            model_type="OPENAI",
            is_studio_default=False
        ))
        session.commit()

    req = SetStudioDefaultModelRequest(model_id="m2")
    set_studio_default_model(req, dao=test_dao)

    with test_dao.get_session() as session:
        # Verify old default was unset
        old_default = session.query(db_model.Model).filter_by(model_id="m1").one()
        assert old_default.is_studio_default == False

        # Verify new default was set
        new_default = session.query(db_model.Model).filter_by(model_id="m2").one()
        assert new_default.is_studio_default == True

def test_get_studio_default_model():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    # Test when no default exists
    req = GetStudioDefaultModelRequest()
    res = get_studio_default_model(req, dao=test_dao)
    assert res.is_default_model_configured == False

    # Add a default model and test again
    with test_dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="default_model",
            provider_model="provider1",
            model_type="OPENAI",
            is_studio_default=True
        ))
        session.commit()

    res = get_studio_default_model(req, dao=test_dao)
    assert res.is_default_model_configured == True
    assert res.model_details.model_name == "default_model"
