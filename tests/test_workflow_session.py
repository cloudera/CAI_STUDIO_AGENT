__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import os
from unittest.mock import patch, MagicMock
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
import studio.workflow.test_and_deploy_workflow as tdw
from studio.api import CreateSessionRequest, TestWorkflowRequest


def test_workflow_name_collision_guard():
    # Ensure our module import didn't accidentally bind pytest's request fixture into tdw.test_workflow
    assert callable(tdw.test_workflow)


def _make_dao_with_workflow(dir_value: str) -> AgentStudioDao:
    dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    with dao.get_session() as session:
        session.add(db_model.Workflow(id="w1", name="wf", description="d", directory=dir_value))
        session.commit()
    return dao


def test_create_session_strips_home_prefix():
    dao = _make_dao_with_workflow("/home/cdsw/my/workflow")
    res = tdw.create_session(CreateSessionRequest(workflow_id="w1"), cml=MagicMock(), dao=dao)
    assert res.session_id and len(res.session_id) == 6
    assert res.session_directory.startswith("my/workflow/session/")


@patch("studio.workflow.test_and_deploy_workflow.get_workflow_runners")
@patch("studio.workflow.test_and_deploy_workflow.requests.post")
@patch("studio.workflow.test_and_deploy_workflow.is_workflow_ready", return_value=True)
@patch("studio.workflow.test_and_deploy_workflow.create_collated_input")
@patch("studio.workflow.test_and_deploy_workflow.get_llm_config_for_workflow", return_value={})
def test_test_workflow_builds_payload_and_returns_paths(mock_llm, mock_collate, mock_ready, mock_post, mock_runners):
    # Arrange simple collated input object with required attributes
    class _Lm:
        def __init__(self):
            self.generation_config = {}
    class _CI:
        def __init__(self):
            self.workflow = MagicMock(name="wf_obj")
            self.workflow.name = "wf"
            self.language_models = [_Lm()]
        def model_dump(self):
            return {"workflow": {"name": "wf", "id": "w1"}}
    mock_collate.return_value = _CI()
    mock_runners.return_value = [{"endpoint": "http://runner", "busy": False}]

    # Make sure filesystem appears valid
    dao = _make_dao_with_workflow("/home/cdsw/my/workflow")
    os.makedirs("my/workflow", exist_ok=True)

    req = TestWorkflowRequest(
        workflow_id="w1",
        generation_config='{"temperature": 0.1}',
        tool_user_parameters={},
        mcp_instance_env_vars={},
        inputs={},
    )

    resp = tdw.test_workflow(req, cml=MagicMock(), dao=dao)
    assert resp.session_id and len(resp.session_id) == 6
    assert resp.session_directory.startswith("my/workflow/session/")
