from unittest.mock import patch, mock_open

from engine.langgraph.artifact import is_langgraph_workflow


@patch("engine.langgraph.artifact.os.path.isfile", return_value=True)
@patch("engine.langgraph.artifact.open", new_callable=mock_open, read_data='{"graphs": {"agent": "path.py:graph"}}')
def test_is_langgraph_workflow_valid(mock_file, mock_isfile):
    assert is_langgraph_workflow("/some/path") is True


@patch("engine.langgraph.artifact.os.path.isfile", return_value=True)
@patch("engine.langgraph.artifact.open", new_callable=mock_open, read_data="not-json")
def test_is_langgraph_workflow_invalid_json(mock_file, mock_isfile):
    with patch("engine.langgraph.artifact.json.load", side_effect=ValueError):
        assert is_langgraph_workflow("/some/path") is False


@patch("engine.langgraph.artifact.os.path.isfile", return_value=False)
def test_is_langgraph_workflow_file_missing(mock_isfile):
    assert is_langgraph_workflow("/some/path") is False


@patch("engine.langgraph.artifact.os.path.isfile", return_value=True)
@patch("engine.langgraph.artifact.open", new_callable=mock_open, read_data="{}")
def test_is_langgraph_workflow_missing_graphs_key(mock_file, mock_isfile):
    assert is_langgraph_workflow("/some/path") is False
