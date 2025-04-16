import pytest
from pydantic import BaseModel
from unittest.mock import patch, MagicMock

from studio.api import *
from studio.cross_cutting.upgrades import (
    get_semantic_versions,
    is_on_a_semantic_version,
    get_current_semantic_version,
    get_most_recent_semantic_version
)
import json





@patch("studio.cross_cutting.upgrades.subprocess.run")
def test_get_semantic_versions_happy(mock_run):
    
    class MockRunOutput(BaseModel):
        stdout: str
    
    mock_run.return_value = MockRunOutput(stdout="""
2e3edd9a07d8590848b8c4d433e5f479191b83c4        refs/tags/v1.0.0
20e7c80a99c2ce64269c7ff4d27c76bf30f26ff0        refs/tags/v1.0.0^{}
299688eb82f548067718d7bafa9564cce43a8915        refs/tags/v1.0.1
13e295ec4de907932b24fa202eb6cd0348267a81        refs/tags/v1.0.1^{}
asdve5ec4de907932b24fa202eb6cd0348267a81        refs/tags/randomTag
    """[:-1])
    
    valid_versions = get_semantic_versions()
    
    assert len(valid_versions) == 2
    assert valid_versions == [
        {
            "commit": "2e3edd9a07d8590848b8c4d433e5f479191b83c4",
            "tag": "v1.0.0"
        },
        {
            "commit": "299688eb82f548067718d7bafa9564cce43a8915",
            "tag": "v1.0.1"
        }
    ]
    
    
@patch("studio.cross_cutting.upgrades.get_semantic_versions")
def test_get_most_recent_semantic_version_happy(mock_get_semantic_versions):
    
    mock_get_semantic_versions.return_value = [
        {
            "commit": "c1",
            "tag": "v1.0.0"
        },
        {
            "commit": "c2",
            "tag": "v1.0.3"
        },
        {
            "commit": "c3",
            "tag": "v1.0.2"
        }
    ]
    
    most_recent_version = get_most_recent_semantic_version()
    assert most_recent_version == "v1.0.3"
    
    
@patch("studio.cross_cutting.upgrades.get_semantic_versions")
def test_get_most_recent_semantic_version_no_versions(mock_get_semantic_versions):
    
    mock_get_semantic_versions.return_value = []
    
    with pytest.raises(RuntimeError) as excinfo:
        most_recent_version = get_most_recent_semantic_version()
    assert "There are no semantic versions available." in str(excinfo.value)
    

@patch("studio.cross_cutting.upgrades.get_current_semantic_version")
def test_is_on_a_semantic_version_happy(mock_get_current_semantic_version):
    mock_get_current_semantic_version.return_value = "v1.0.1"
    assert is_on_a_semantic_version() == True
    
    
@patch("studio.cross_cutting.upgrades.get_current_semantic_version")
def test_is_on_a_semantic_version_happy(mock_get_current_semantic_version):
    mock_get_current_semantic_version.side_effect = RuntimeError
    assert is_on_a_semantic_version() == False
    

@patch("studio.cross_cutting.upgrades.subprocess.run")
@patch("studio.cross_cutting.upgrades.get_semantic_versions")
def test_get_current_semantic_version_happy(mock_vers, mock_run):
    class MockRunOutput(BaseModel):
        stdout: str
    mock_run.return_value = MockRunOutput(stdout="c1")
    mock_vers.return_value = [
        {
            "commit": "c1",
            "tag": "v1.0.1"
        },
        {
            "commit": "c2",
            "tag": "v1.0.2"
        }
    ]
    current_version = get_current_semantic_version()
    assert current_version == "v1.0.1"
    


@patch("studio.cross_cutting.upgrades.subprocess.run")
@patch("studio.cross_cutting.upgrades.get_semantic_versions")
def test_get_current_semantic_version_no_matching_version(mock_vers, mock_run):
    class MockRunOutput(BaseModel):
        stdout: str
    mock_run.return_value = MockRunOutput(stdout="c1")
    mock_vers.return_value = [
        {
            "commit": "c2",
            "tag": "v1.0.1"
        },
        {
            "commit": "c3",
            "tag": "v1.0.2"
        }
    ]
    with pytest.raises(RuntimeError) as excinfo:
        current_version = get_current_semantic_version()
    assert "HEAD commit (c1) does not correspond to a semantic version." in str(excinfo.value)
    


@patch("studio.cross_cutting.upgrades.subprocess.run")
@patch("studio.cross_cutting.upgrades.get_semantic_versions")
def test_get_current_semantic_version_multiple_matching_versions(mock_vers, mock_run):
    class MockRunOutput(BaseModel):
        stdout: str
    mock_run.return_value = MockRunOutput(stdout="c1")
    mock_vers.return_value = [
        {
            "commit": "c1",
            "tag": "v1.0.1"
        },
        {
            "commit": "c1",
            "tag": "v1.0.2"
        }
    ]
    with pytest.raises(RuntimeError) as excinfo:
        current_version = get_current_semantic_version()
    assert "Multiple semantic versions corresponding to this commit!" in str(excinfo.value)
    

