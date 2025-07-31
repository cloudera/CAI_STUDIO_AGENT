__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import pytest
from unittest.mock import patch, MagicMock
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.workflow.utils import get_llm_config_for_workflow


def test_get_llm_config_for_workflow_includes_extra_headers():
    """Test that get_llm_config_for_workflow includes extra_headers in model configs"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()
    
    # Create test data
    with test_dao.get_session() as session:
        # Add a default model
        default_model = db_model.Model(
            model_id="default-model-id",
            model_name="default_model", 
            provider_model="gpt-4",
            model_type="OPENAI",
            api_base="https://api.openai.com/v1",
            is_studio_default=True
        )
        session.add(default_model)
        
        # Add a workflow model
        workflow_model = db_model.Model(
            model_id="workflow-model-id",
            model_name="workflow_model",
            provider_model="claude-3",
            model_type="ANTHROPIC", 
            api_base="https://api.anthropic.com",
            is_studio_default=False
        )
        session.add(workflow_model)
        
        # Add a workflow that uses the workflow model
        workflow = db_model.Workflow(
            id="workflow-1",
            name="Test Workflow",
            crew_ai_llm_provider_model_id="workflow-model-id",
            crew_ai_agents=[]
        )
        session.add(workflow)
        session.commit()

        # Mock API keys and extra headers
        api_keys = {
            "default-model-id": "default-api-key",
            "workflow-model-id": "workflow-api-key"
        }
        extra_headers = {
            "default-model-id": {"Authorization": "Bearer default-token"},
            "workflow-model-id": {"Custom-Header": "workflow-value", "Auth": "Bearer workflow-token"}
        }
        
        def mock_get_api_key(model_id, cml):
            return api_keys.get(model_id)
            
        def mock_get_extra_headers(model_id, cml):
            return extra_headers.get(model_id, {})
        
        with patch('studio.workflow.utils.get_model_api_key_from_env', side_effect=mock_get_api_key) as mock_api_key, \
             patch('studio.workflow.utils.get_model_extra_headers_from_env', side_effect=mock_get_extra_headers) as mock_headers:
            
            config = get_llm_config_for_workflow(workflow, session, mock_cml)
            
            # Verify both models are in config
            assert "default-model-id" in config
            assert "workflow-model-id" in config
            
            # Verify default model config
            default_config = config["default-model-id"]
            assert default_config["provider_model"] == "gpt-4"
            assert default_config["model_type"] == "OPENAI"
            assert default_config["api_base"] == "https://api.openai.com/v1"
            assert default_config["api_key"] == "default-api-key"
            assert default_config["extra_headers"] == {"Authorization": "Bearer default-token"}
            
            # Verify workflow model config
            workflow_config = config["workflow-model-id"]
            assert workflow_config["provider_model"] == "claude-3"
            assert workflow_config["model_type"] == "ANTHROPIC"
            assert workflow_config["api_base"] == "https://api.anthropic.com"
            assert workflow_config["api_key"] == "workflow-api-key"
            assert workflow_config["extra_headers"] == {"Custom-Header": "workflow-value", "Auth": "Bearer workflow-token"}
            
            # Verify both API key and extra headers functions were called for both models
            assert mock_api_key.call_count == 2
            assert mock_headers.call_count == 2
            mock_api_key.assert_any_call("default-model-id", mock_cml)
            mock_api_key.assert_any_call("workflow-model-id", mock_cml)
            mock_headers.assert_any_call("default-model-id", mock_cml)
            mock_headers.assert_any_call("workflow-model-id", mock_cml)


def test_get_llm_config_for_workflow_empty_extra_headers():
    """Test that get_llm_config_for_workflow handles empty extra_headers correctly"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()
    
    with test_dao.get_session() as session:
        # Add a default model
        default_model = db_model.Model(
            model_id="default-model-id",
            model_name="default_model",
            provider_model="gpt-4",
            model_type="OPENAI",
            is_studio_default=True
        )
        session.add(default_model)
        
        # Add a simple workflow
        workflow = db_model.Workflow(
            id="workflow-1",
            name="Test Workflow",
            crew_ai_agents=[]
        )
        session.add(workflow)
        session.commit()

        with patch('studio.workflow.utils.get_model_api_key_from_env', return_value="api-key") as mock_api_key, \
             patch('studio.workflow.utils.get_model_extra_headers_from_env', return_value={}) as mock_headers:
            
            config = get_llm_config_for_workflow(workflow, session, mock_cml)
            
            # Verify model config has None for empty extra_headers 
            assert "default-model-id" in config
            default_config = config["default-model-id"]
            assert default_config["extra_headers"] is None
            
            # Verify both functions were called
            mock_api_key.assert_called_once_with("default-model-id", mock_cml)
            mock_headers.assert_called_once_with("default-model-id", mock_cml)


def test_get_llm_config_for_workflow_with_agents():
    """Test that get_llm_config_for_workflow includes extra_headers for agent models"""
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()
    
    with test_dao.get_session() as session:
        # Add a default model
        default_model = db_model.Model(
            model_id="default-model-id",
            model_name="default_model",
            provider_model="gpt-4",
            model_type="OPENAI",
            is_studio_default=True
        )
        session.add(default_model)
        
        # Add an agent model
        agent_model = db_model.Model(
            model_id="agent-model-id",
            model_name="agent_model",
            provider_model="claude-3",
            model_type="ANTHROPIC",
            is_studio_default=False
        )
        session.add(agent_model)
        
        # Add an agent that uses the agent model
        agent = db_model.Agent(
            id="agent-1",
            name="Test Agent",
            llm_provider_model_id="agent-model-id",
            workflow_id="workflow-1"
        )
        session.add(agent)
        
        # Add a workflow that uses the agent
        workflow = db_model.Workflow(
            id="workflow-1",
            name="Test Workflow",
            crew_ai_agents=["agent-1"]
        )
        session.add(workflow)
        session.commit()

        # Mock API keys and extra headers
        def mock_get_api_key(model_id, cml):
            keys = {
                "default-model-id": "default-key",
                "agent-model-id": "agent-key"
            }
            return keys.get(model_id)
            
        def mock_get_extra_headers(model_id, cml):
            headers = {
                "default-model-id": {"Default-Header": "default-value"},
                "agent-model-id": {"Agent-Header": "agent-value"}
            }
            return headers.get(model_id, {})
        
        with patch('studio.workflow.utils.get_model_api_key_from_env', side_effect=mock_get_api_key) as mock_api_key, \
             patch('studio.workflow.utils.get_model_extra_headers_from_env', side_effect=mock_get_extra_headers) as mock_headers:
            
            config = get_llm_config_for_workflow(workflow, session, mock_cml)
            
            # Verify both models are in config
            assert "default-model-id" in config
            assert "agent-model-id" in config
            
            # Verify agent model config includes extra headers
            agent_config = config["agent-model-id"]
            assert agent_config["provider_model"] == "claude-3"
            assert agent_config["api_key"] == "agent-key"
            assert agent_config["extra_headers"] == {"Agent-Header": "agent-value"}
            
            # Verify both functions were called for both models
            assert mock_api_key.call_count == 2
            assert mock_headers.call_count == 2 