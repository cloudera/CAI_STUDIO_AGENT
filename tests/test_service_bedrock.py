__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import pytest
from unittest.mock import patch, MagicMock

from studio.service import AgentStudioApp
from studio.api import AddModelRequest, GetModelRequest, ListModelsRequest, TestModelRequest
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model


def _dao_with_session():
    dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    return dao


@patch('studio.service.cmlapi')
def test_grpc_add_model_bedrock_stores_region_and_filters_headers(mock_cmlapi):
    mock_cmlapi.default_client.return_value = MagicMock()
    dao = _dao_with_session()
    app = AgentStudioApp(dao=dao)

    with patch('studio.models.models.update_model_api_key_in_env') as mock_update_key, \
         patch('studio.models.models.update_model_extra_headers_in_env') as mock_update_headers, \
         patch('studio.models.models.update_model_aws_credentials_in_env') as mock_update_creds:
        req = AddModelRequest(
            model_name="bedrock_model",
            provider_model="us.amazon.nova-pro-v1:0",
            model_type="BEDROCK",
            aws_region_name="us-east-1",
            aws_access_key_id="AKIA",
            aws_secret_access_key="SECRET",
            extra_headers='{"aws_access_key_id":"should_not_store","x-amzn-bedrock-inference-profile-arn":"arn"}'
        )
        res = app.AddModel(req, context=None)
        assert res.model_id

        # AWS creds stored once
        assert mock_update_creds.call_count == 1
        _, kwargs = mock_update_creds.call_args
        assert kwargs["aws_credentials"]["aws_region_name"] == "us-east-1"

        # Extra headers filtered before secondary store (no aws_* keys)
        assert mock_update_headers.call_count >= 1
        # The last call should be with filtered headers excluding aws keys
        last_headers = mock_update_headers.call_args[0][1]
        assert "aws_access_key_id" not in last_headers
        assert last_headers.get("x-amzn-bedrock-inference-profile-arn") == "arn"


@patch('studio.service.cmlapi')
def test_grpc_get_model_bedrock_includes_region_from_env(mock_cmlapi):
    mock_cmlapi.default_client.return_value = MagicMock()
    dao = _dao_with_session()
    app = AgentStudioApp(dao=dao)

    with dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="bedrock_model",
            provider_model="us.amazon.nova-pro-v1:0",
            model_type="BEDROCK",
        ))
        session.commit()

    with patch('studio.models.models.get_model_aws_credentials_from_env', return_value={"aws_region_name": "us-west-2"}):
        res = app.GetModel(GetModelRequest(model_id="m1"), context=None)
        assert res.model_details.aws_region_name == "us-west-2"


@patch('studio.service.cmlapi')
def test_grpc_list_models_bedrock_includes_region_from_env(mock_cmlapi):
    mock_cmlapi.default_client.return_value = MagicMock()
    dao = _dao_with_session()
    app = AgentStudioApp(dao=dao)

    with dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="bedrock_model",
            provider_model="us.amazon.nova-pro-v1:0",
            model_type="BEDROCK",
        ))
        session.commit()

    with patch('studio.models.models.get_model_aws_credentials_from_env', return_value={"aws_region_name": "eu-central-1"}):
        res = app.ListModels(ListModelsRequest(), context=None)
        assert len(res.model_details) == 1
        assert res.model_details[0].aws_region_name == "eu-central-1"


@patch('studio.service.cmlapi')
def test_grpc_test_model_invokes_llm_with_bedrock_config(mock_cmlapi):
    mock_cmlapi.default_client.return_value = MagicMock()
    dao = _dao_with_session()
    app = AgentStudioApp(dao=dao)

    with dao.get_session() as session:
        session.add(db_model.Model(
            model_id="m1",
            model_name="bedrock_model",
            provider_model="us.amazon.nova-pro-v1:0",
            model_type="BEDROCK",
        ))
        session.commit()

    with patch('studio.models.models.get_model_api_key_from_env', return_value=None), \
         patch('studio.models.models.get_model_extra_headers_from_env', return_value={"x-amzn-bedrock-inference-profile-arn": "arn"}), \
         patch('studio.models.models.get_model_aws_credentials_from_env', return_value={
             "aws_region_name": "us-east-1",
             "aws_access_key_id": "AKIA",
             "aws_secret_access_key": "SECRET",
         }), \
         patch('studio.models.models.get_crewai_llm') as mock_get_llm:
        mock_llm = MagicMock()
        mock_llm.call.return_value = "ok"
        mock_get_llm.return_value = mock_llm

        res = app.TestModel(TestModelRequest(model_id="m1", completion_role="user", completion_content="hi"), context=None)
        assert res.response == "ok"

        # Ensure the constructed llm_config_dict includes Bedrock fields
        _, kwargs = mock_get_llm.call_args
        cfg = kwargs["llm_config_dict"]
        assert cfg["model_type"] == "BEDROCK"
        assert cfg["provider_model"] == "us.amazon.nova-pro-v1:0"
        assert cfg["aws_region_name"] == "us-east-1"
        assert cfg["extra_headers"]["x-amzn-bedrock-inference-profile-arn"] == "arn"
