from unittest.mock import mock_open, patch
from engine.crewai.artifact import is_crewai_workflow


@patch("studio.deployments.package.utils.os.path.isfile")
@patch("studio.deployments.package.utils.open", new_callable=mock_open, read_data="type: collated_input")
@patch("studio.deployments.package.utils.yaml.safe_load", return_value={"type": "collated_input"})
def test_is_crewai_workflow_true(mock_yaml_load, mock_open_file, mock_isfile):
    mock_isfile.return_value = True
    assert is_crewai_workflow("/fake/path") is True


@patch("studio.deployments.package.utils.os.path.isfile")
@patch("studio.deployments.package.utils.open", new_callable=mock_open, read_data="type: something_else")
@patch("studio.deployments.package.utils.yaml.safe_load", return_value={"type": "something_else"})
def test_is_crewai_workflow_wrong_type(mock_yaml_load, mock_open_file, mock_isfile):
    mock_isfile.return_value = True
    assert is_crewai_workflow("/fake/path") is False


@patch("studio.deployments.package.utils.os.path.isfile")
def test_is_crewai_workflow_missing_file(mock_isfile):
    mock_isfile.return_value = False
    assert is_crewai_workflow("/fake/path") is False


@patch("studio.deployments.package.utils.os.path.isfile")
@patch("studio.deployments.package.utils.open", new_callable=mock_open, read_data="not: yaml")
@patch("studio.deployments.package.utils.yaml.safe_load", side_effect=Exception("YAML error"))
def test_is_crewai_workflow_yaml_parse_failure(mock_yaml_load, mock_open_file, mock_isfile):
    mock_isfile.return_value = True
    assert is_crewai_workflow("/fake/path") is False
