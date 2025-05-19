import sys

__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

import pytest
from unittest.mock import patch

from engine.crewai.tools import extract_tool_class_name, is_venv_tool, get_crewai_tool
from engine.types import Input__ToolInstance


# Tests for extract_wrapper_function_name
def test_extract_tool_class_name_valid():
    python_code = """
class UserParameters(BaseModel):
    param1: str
    param2: str
    
class NewTool(StudioBaseTool):
    pass
    """
    wrapper_name = extract_tool_class_name(python_code)
    assert wrapper_name == "NewTool"


def test_extract_tool_class_name_no_wrapper():
    python_code = """
class UserParameters(BaseModel):
    param1: str
    param2: notype
"""
    with pytest.raises(ValueError) as excinfo:
        extract_tool_class_name(python_code)
    assert "CrewAI tool class not found" in str(excinfo.value)


def test_extract_tool_class_name_syntax_error():
    python_code = """
class NewTool(StudioBaseTool:
    param1: notype
"""
    with pytest.raises(ValueError) as excinfo:
        extract_tool_class_name(python_code)
    assert "Error parsing Python code" in str(excinfo.value)


def test_is_venv_tool_true():
    python_code = """
class UserParameters(BaseModel):
    param1: str
    param2: str
    
class ToolParameters(BaseModel):
    param1: str
    param2: str  
"""
    assert is_venv_tool(python_code) == True


def test_is_venv_tool_false():
    python_code = """
class UserParameters(BaseModel):
    param1: str
    param2: str
    
class MyTool(StudioBaseTool):
    class ToolParameters(BaseModel):
        param1: str
        param2: str  
"""
    assert is_venv_tool(python_code) == False


@patch("engine.crewai.tools.os")
@patch("builtins.open")
@patch("engine.crewai.tools.is_venv_tool")
@patch("engine.crewai.tools.get_venv_tool")
@patch("engine.crewai.tools.get_tool_instance_proxy")
def test_get_crewai_tool_venv_tool(
    mock_get_tool_instance_proxy, mock_get_venv_tool, mock_is_venv_tool, mock_open, mock_os
):
    mock_is_venv_tool.return_value = True
    tool_instance = Input__ToolInstance(
        id="",
        name="",
        python_code_file_name="",
        python_requirements_file_name="",
        tool_metadata='{"tool": "metadata"}',
        source_folder_path="",
        tool_image_uri="",
        is_venv_tool=False,  # DEPRECATED, not used
    )
    out = get_crewai_tool(tool_instance, {})
    mock_get_venv_tool.assert_called_once()


@patch("engine.crewai.tools.os")
@patch("builtins.open")
@patch("engine.crewai.tools.is_venv_tool")
@patch("engine.crewai.tools.get_venv_tool")
@patch("engine.crewai.tools.get_tool_instance_proxy")
def test_get_crewai_tool_tool_proxy(
    mock_get_tool_instance_proxy, mock_get_venv_tool, mock_is_venv_tool, mock_open, mock_os
):
    mock_is_venv_tool.return_value = False
    tool_instance = Input__ToolInstance(
        id="",
        name="",
        python_code_file_name="",
        python_requirements_file_name="",
        tool_metadata='{"tool": "metadata"}',
        source_folder_path="",
        tool_image_uri="",
        is_venv_tool=False,  # DEPRECATED, not used
    )
    out = get_crewai_tool(tool_instance, {})
    mock_get_tool_instance_proxy.assert_called_once()
