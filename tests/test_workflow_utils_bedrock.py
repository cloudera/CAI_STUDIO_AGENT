# Ensure pysqlite3 is used instead of sqlite3 for isolation
__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import os
from unittest.mock import patch, MagicMock
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.workflow.utils import get_llm_config_for_workflow


def test_get_llm_config_for_workflow_bedrock_includes_aws_creds_and_filters_headers(monkeypatch):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    with test_dao.get_session() as session:
        # Default model is Bedrock to hit the Bedrock branches
        default_model = db_model.Model(
            model_id="bedrock-default",
            model_name="default_bedrock",
            provider_model="us.amazon.nova-pro-v1:0",
            model_type="BEDROCK",
            is_studio_default=True,
        )
        session.add(default_model)
        # Create a simple workflow using default model
        workflow = db_model.Workflow(
            id="wf-1",
            name="WF",
            crew_ai_agents=[],
        )
        session.add(workflow)
        session.commit()

        # Mock env providers
        def mock_extra_headers(model_id, cml):
            # Include AWS keys which should be filtered out for Bedrock
            return {
                "x-amzn-bedrock-inference-profile-arn": "arn",
                "aws_access_key_id": "SHOULD_FILTER",
                "aws_secret_access_key": "SHOULD_FILTER",
            }

        with patch('studio.workflow.utils.get_model_api_key_from_env', return_value=None), \
             patch('studio.workflow.utils.get_model_extra_headers_from_env', side_effect=mock_extra_headers), \
             patch('studio.workflow.utils.get_model_aws_credentials_from_env', return_value={
                 "aws_access_key_id": "AKIA",
                 "aws_secret_access_key": "SECRET",
                 "aws_region_name": "us-east-1",
             }):
            cfg = get_llm_config_for_workflow(workflow, session, mock_cml)

            assert "bedrock-default" in cfg
            entry = cfg["bedrock-default"]
            # API base and key must be None for Bedrock
            assert entry.get("api_base") is None
            assert entry.get("api_key") is None
            # AWS creds attached
            assert entry["aws_access_key_id"] == "AKIA"
            assert entry["aws_secret_access_key"] == "SECRET"
            assert entry["aws_region_name"] == "us-east-1"
            # Extra headers should not include raw AWS keys
            assert "aws_access_key_id" not in entry["extra_headers"]
            assert "aws_secret_access_key" not in entry["extra_headers"]
            # But should preserve valid header
            assert entry["extra_headers"]["x-amzn-bedrock-inference-profile-arn"] == "arn"


def test_get_llm_config_for_workflow_bedrock_env_region_fallback(monkeypatch):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()

    with test_dao.get_session() as session:
        default_model = db_model.Model(
            model_id="bedrock-default",
            model_name="default_bedrock",
            provider_model="us.amazon.nova-pro-v1:0",
            model_type="BEDROCK",
            is_studio_default=True,
        )
        session.add(default_model)
        workflow = db_model.Workflow(id="wf-1", name="WF", crew_ai_agents=[])
        session.add(workflow)
        session.commit()

        with patch('studio.workflow.utils.get_model_api_key_from_env', return_value=None), \
             patch('studio.workflow.utils.get_model_extra_headers_from_env', return_value={}), \
             patch('studio.workflow.utils.get_model_aws_credentials_from_env', return_value={}):
            # Provide fallback region through environment
            monkeypatch.setenv("AWS_REGION_NAME", "eu-west-1")
            cfg = get_llm_config_for_workflow(workflow, session, mock_cml)
            entry = cfg["bedrock-default"]
            assert entry["aws_region_name"] == "eu-west-1"