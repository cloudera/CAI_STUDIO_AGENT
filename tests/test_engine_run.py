import os
import sys
from unittest.mock import patch, MagicMock


# Ensure engine modules are importable
sys.path.append(os.path.join(os.getcwd(), "studio", "workflow_engine", "src"))

from engine.crewai import run as engine_run


def test_ensure_session_directory_returns_false_when_no_project_id(monkeypatch):
    # No CDSW_PROJECT_ID -> early False
    monkeypatch.delenv("CDSW_PROJECT_ID", raising=False)
    result = engine_run.ensure_session_directory("wf_proj", "abc123", {"a": 1})
    assert result is False


@patch("engine.crewai.run.cmlapi.default_client")
def test_ensure_session_directory_uploads_inputs(mock_default_client, monkeypatch):
    # Arrange env
    monkeypatch.setenv("CDSW_PROJECT_ID", "proj1")
    client = MagicMock()
    mock_default_client.return_value = client

    # Act
    result = engine_run.ensure_session_directory("wf_proj", "abc123", {"x": 2})

    # Assert
    assert result is True
    # call_api should be invoked with a files payload containing target path key
    called = False
    for _, kwargs in client.api_client.call_api.call_args_list:
        files = kwargs.get("files") or {}
        # wf_proj/session/abc123/inputs.txt should be the single key
        if any(k.endswith("wf_proj/session/abc123/inputs.txt") for k in files.keys()):
            called = True
            break
    assert called, "Expected upload to target inputs path"


@patch("engine.crewai.run.AutoSyncService")
@patch("engine.crewai.run.create_crewai_objects")
@patch("engine.crewai.run.ensure_session_directory", return_value=True)
def test_run_workflow_deployment_mode_starts_autosync(mock_ensure, mock_create, mock_sync, monkeypatch):
    # Fake collated input and crew
    class _WF: id = "wf"
    class _CI:
        def __init__(self):
            self.workflow = _WF()
    fake_crew = MagicMock()
    fake_crew.kickoff = MagicMock()
    fake_objs = MagicMock()
    fake_objs.crews = {"wf": fake_crew}
    mock_create.return_value = fake_objs

    # Prepare AutoSyncService mock behavior
    sync_instance = MagicMock()
    mock_sync.return_value = sync_instance

    # Act
    engine_run.run_workflow(
        workflow_directory="wfdir",
        collated_input=_CI(),
        tool_config={},
        mcp_config={},
        llm_config={},
        inputs={},
        parent_context=MagicMock(),
        events_trace_id="trace",
        session_id="sid",
        workflow_root_directory="root",
        workflow_project_file_directory="proj",
        mode="DEPLOYMENT",
    )

    # Assert AutoSyncService instantiated with resolved absolute paths
    args, kwargs = mock_sync.call_args
    assert len(args) == 1
    local_root_abs = args[0]
    assert local_root_abs.endswith("/home/cdsw/root/session/sid")
    assert kwargs.get("project_file_directory", "").endswith("/home/cdsw/proj/session/sid")
    sync_instance.start.assert_called_once()
    sync_instance.drain_and_stop.assert_called_once()
    fake_crew.kickoff.assert_called_once()
