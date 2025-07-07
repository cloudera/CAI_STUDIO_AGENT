import sys

__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

from unittest.mock import mock_open, patch
from engine.crewai.artifact import is_crewai_workflow


@patch("engine.crewai.artifact.os.path.isfile")
@patch("engine.crewai.artifact.open", new_callable=mock_open, read_data="type: collated_input")
def test_is_crewai_workflow_true(mock_open_file, mock_isfile):
    mock_isfile.return_value = True
    assert is_crewai_workflow("/fake/path") is True


@patch("engine.crewai.artifact.os.path.isfile")
@patch("engine.crewai.artifact.open", new_callable=mock_open, read_data="type: something_else")
def test_is_crewai_workflow_wrong_type(mock_open_file, mock_isfile):
    mock_isfile.return_value = True
    assert is_crewai_workflow("/fake/path") is False


@patch("engine.crewai.artifact.os.path.isfile")
def test_is_crewai_workflow_missing_file(mock_isfile):
    mock_isfile.return_value = False
    assert is_crewai_workflow("/fake/path") is False


@patch("engine.crewai.artifact.os.path.isfile")
def test_is_crewai_workflow_yaml_parse_failure(mock_isfile):
    mock_isfile.return_value = True
    assert is_crewai_workflow("/fake/path") is False
