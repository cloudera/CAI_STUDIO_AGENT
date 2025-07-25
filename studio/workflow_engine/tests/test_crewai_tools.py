import sys

__import__("pysqlite3")
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")

import pytest
from unittest.mock import patch, MagicMock, mock_open
import json
from pydantic import BaseModel

from engine.crewai.tools import (
    get_venv_tool,
    get_venv_tool_output_key,
    get_venv_tool_python_executable,
    get_venv_tool_tool_parameters_type,
    get_crewai_tool,
)
from engine.types import Input__ToolInstance


class TestGetVenvToolOutputKey:
    def test_extract_output_key_present(self):
        code = """
OUTPUT_KEY = 'test_key'
class ToolParameters(BaseModel):
    param1: str
"""
        result = get_venv_tool_output_key(code)
        assert result == "test_key"

    def test_extract_output_key_absent(self):
        code = """
class ToolParameters(BaseModel):
    param1: str
"""
        result = get_venv_tool_output_key(code)
        assert result is None

    def test_extract_output_key_non_string(self):
        code = """
OUTPUT_KEY = 123
class ToolParameters(BaseModel):
    param1: str
"""
        result = get_venv_tool_output_key(code)
        assert result is None

    def test_extract_output_key_syntax_error(self):
        code = """
OUTPUT_KEY = 'test_key'
class ToolParameters(BaseModel
    param1: str
"""
        with pytest.raises(ValueError, match="Error parsing Python code"):
            get_venv_tool_output_key(code)


class TestGetVenvToolPythonExecutable:
    def test_get_python_executable(self):
        tool_instance = Input__ToolInstance(
            id="test_id",
            name="test_tool",
            python_code_file_name="main.py",
            python_requirements_file_name="requirements.txt",
            tool_metadata="{}",
            source_folder_path="test_folder",
            tool_image_uri="",
            is_venv_tool=True,
        )
        workflow_directory = "/test/workflow"

        result = get_venv_tool_python_executable(workflow_directory, tool_instance)
        expected = "/test/workflow/test_folder/.venv/bin/python"
        assert result == expected


class TestGetVenvToolToolParametersType:
    def test_extract_tool_parameters_type(self):
        code = """
from pydantic import BaseModel

class ToolParameters(BaseModel):
    param1: str
    param2: int
"""
        result = get_venv_tool_tool_parameters_type(code)
        assert issubclass(result, BaseModel)
        assert result.__name__ == "ToolParameters"

    def test_tool_parameters_not_found(self):
        code = """
from pydantic import BaseModel

class SomeOtherClass(BaseModel):
    param1: str
"""
        with pytest.raises(ValueError, match="ToolParameters class not found"):
            get_venv_tool_tool_parameters_type(code)

    def test_tool_parameters_not_basemodel_subclass(self):
        code = """
class ToolParameters:
    param1: str
"""
        with pytest.raises(ValueError, match="not a subclass of BaseModel"):
            get_venv_tool_tool_parameters_type(code)


class TestAgentStudioCrewAIVenvTool:
    @pytest.fixture
    def mock_tool_instance(self):
        return Input__ToolInstance(
            id="test_id",
            name="test_tool",
            python_code_file_name="main.py",
            python_requirements_file_name="requirements.txt",
            tool_metadata="{}",
            source_folder_path="test_folder",
            tool_image_uri="",
            is_venv_tool=True,
        )

    @pytest.fixture
    def sample_tool_code(self):
        return '''"""
Test tool for unit testing
"""
from pydantic import BaseModel

OUTPUT_KEY = "RESULT:"

class ToolParameters(BaseModel):
    param1: str
    param2: int = 10
'''

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    def test_get_venv_tool_creation(self, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        user_params = {"user_key": "user_value"}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)

        assert tool.agent_studio_id == "test_id"
        assert tool.name == "test_tool"
        assert tool.output_key == "RESULT:"
        # The description is extracted from the docstring
        assert "Test tool for unit testing" in tool.description
        assert tool.python_executable == "/test/workflow/test_folder/.venv/bin/python"
        assert tool.python_file == "/test/workflow/test_folder/main.py"
        assert tool.venv_dir == "/test/workflow/test_folder/.venv"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    @patch.dict("os.environ", {"PATH": "/usr/bin", "HOME": "/home/user", "EXISTING_VAR": "existing_value"})
    def test_run_method_environment_copying(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        # Setup mocks
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "RESULT:Success output"
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        # Create tool and run
        user_params = {"user_key": "user_value"}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test", param2=20)

        # Verify subprocess was called with correct environment
        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args

        # Check that environment was passed and contains both existing and new vars
        env = call_args[1]["env"]
        assert "PATH" in env  # Existing environment variable
        assert "HOME" in env  # Existing environment variable
        assert "EXISTING_VAR" in env  # Existing environment variable
        assert env["EXISTING_VAR"] == "existing_value"
        assert env["VIRTUAL_ENV"] == "/test/workflow/test_folder/.venv"  # New variable

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_successful_execution(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        # Setup mocks
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "RESULT:Success output"
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        # Create tool and run
        user_params = {"user_key": "user_value"}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test", param2=20)

        # Verify command construction
        expected_cmd = [
            "/test/workflow/test_folder/.venv/bin/python",
            "/test/workflow/test_folder/main.py",
            "--user-params",
            json.dumps({"user_key": "user_value"}),
            "--tool-params",
            json.dumps({"param1": "test", "param2": 20}),
        ]

        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args[0][0]  # First positional argument (cmd)
        assert call_args == expected_cmd

        # Verify output processing with output key
        assert result == "Success output"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_no_output_key(self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance):
        # Tool code without OUTPUT_KEY
        tool_code_no_key = '''"""
Test tool without output key
"""
from pydantic import BaseModel

class ToolParameters(BaseModel):
    param1: str
'''

        mock_file.return_value.read.return_value = tool_code_no_key
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "Raw output without key"
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        user_params = {"user_key": "user_value"}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        # Should return full stdout when no output key
        assert result == "Raw output without key"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_error_handling(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = ""
        mock_result.stderr = "Error occurred"
        mock_subprocess.return_value = mock_result

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        assert result == "Error: Error occurred"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_exception_handling(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_subprocess.side_effect = Exception("Subprocess failed")

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        assert result == "Tool call failed: Subprocess failed"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_stderr_only(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = ""
        mock_result.stderr = "Warning message"
        mock_subprocess.return_value = mock_result

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        assert "stderr: Warning message" in result
        assert "stdout:" in result

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_no_output(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = ""
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        assert result == "Error running tool - no output"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_output_key_processing(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance
    ):
        # Test tool with output key and complex output
        tool_code_with_key = '''"""
Tool with output key processing
"""
from pydantic import BaseModel

OUTPUT_KEY = "FINAL_RESULT:"

class ToolParameters(BaseModel):
    param1: str
'''

        mock_file.return_value.read.return_value = tool_code_with_key
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "Debug info\nSome logs\nFINAL_RESULT:This is the actual result\nMore debug info"
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        # Should extract only the part after the output key
        assert result == "This is the actual result\nMore debug info"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_empty_user_params(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "RESULT:Success with empty user params"
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        # Test with empty user params
        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        # Verify command was called with empty user params
        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args[0][0]
        assert "--user-params" in call_args
        user_params_index = call_args.index("--user-params") + 1
        assert json.loads(call_args[user_params_index]) == {}

        assert result == "Success with empty user params"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_complex_tool_params(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "RESULT:Complex params processed"
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        user_params = {"user_key": "user_value"}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)

        # Test with complex parameters including nested data
        complex_params = {
            "param1": "string_value",
            "param2": 42,
            "nested_dict": {"key": "value", "number": 123},
            "list_param": [1, 2, 3, "string"],
            "boolean_param": True,
        }

        result = tool._run(**complex_params)

        # Verify command was called with complex params properly serialized
        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args[0][0]
        tool_params_index = call_args.index("--tool-params") + 1
        parsed_params = json.loads(call_args[tool_params_index])
        assert parsed_params == complex_params

        assert result == "Complex params processed"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_working_directory(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "RESULT:Working directory test"
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        user_params = {}
        workflow_directory = "/custom/workflow/path"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        # Verify subprocess was called with correct working directory
        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args
        assert call_args[1]["cwd"] == workflow_directory

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    def test_run_method_error_no_details(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = ""
        mock_result.stderr = ""  # No error details
        mock_subprocess.return_value = mock_result

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        assert result == "Error: No error details found"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    @patch("engine.crewai.tools.subprocess.run")
    @patch.dict("os.environ", {}, clear=True)  # Clear environment to test empty environment
    def test_run_method_empty_environment(
        self, mock_subprocess, mock_abspath, mock_join, mock_file, mock_tool_instance, sample_tool_code
    ):
        mock_file.return_value.read.return_value = sample_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "RESULT:Empty environment test"
        mock_result.stderr = ""
        mock_subprocess.return_value = mock_result

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)
        result = tool._run(param1="test")

        # Verify subprocess was called with environment containing at least VIRTUAL_ENV
        mock_subprocess.assert_called_once()
        call_args = mock_subprocess.call_args
        env = call_args[1]["env"]
        assert env["VIRTUAL_ENV"] == "/test/workflow/test_folder/.venv"

        assert result == "Empty environment test"


class TestVenvToolEdgeCases:
    @pytest.fixture
    def mock_tool_instance(self):
        return Input__ToolInstance(
            id="edge_case_id",
            name="edge_case_tool",
            python_code_file_name="edge_case.py",
            python_requirements_file_name="requirements.txt",
            tool_metadata="{}",
            source_folder_path="edge_case_folder",
            tool_image_uri="",
            is_venv_tool=True,
        )

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    def test_tool_with_no_docstring(self, mock_abspath, mock_join, mock_file, mock_tool_instance):
        # Tool code without docstring
        tool_code_no_docstring = """
from pydantic import BaseModel

class ToolParameters(BaseModel):
    param1: str
"""

        mock_file.return_value.read.return_value = tool_code_no_docstring
        mock_abspath.return_value = "/abs/path/edge_case_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)

        # Should handle missing docstring gracefully
        # The description may be None or contain tool info but no actual docstring
        assert tool.description is None or "Tool Description: None" in tool.description
        assert tool.name == "edge_case_tool"

    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    def test_tool_with_multiline_docstring(self, mock_abspath, mock_join, mock_file, mock_tool_instance):
        # Tool code with multiline docstring
        tool_code_multiline = '''"""
This is a multiline docstring
that spans multiple lines
and contains detailed information
"""
from pydantic import BaseModel

class ToolParameters(BaseModel):
    param1: str
'''

        mock_file.return_value.read.return_value = tool_code_multiline
        mock_abspath.return_value = "/abs/path/edge_case_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        user_params = {}
        workflow_directory = "/test/workflow"

        tool = get_venv_tool(mock_tool_instance, user_params, workflow_directory)

        # Should handle multiline docstring correctly
        expected_desc = "This is a multiline docstring\nthat spans multiple lines\nand contains detailed information"
        # The description contains the docstring content
        assert expected_desc in tool.description


class TestIntegrationTests:
    @patch("builtins.open", new_callable=mock_open)
    @patch("engine.crewai.tools.os.path.join")
    @patch("engine.crewai.tools.os.path.abspath")
    def test_get_crewai_tool_integration_venv(self, mock_abspath, mock_join, mock_file):
        # Test code that is_venv_tool will return True for
        venv_tool_code = """
from pydantic import BaseModel

class ToolParameters(BaseModel):
    param1: str
    param2: int = 10
"""

        mock_file.return_value.read.return_value = venv_tool_code
        mock_abspath.return_value = "/abs/path/test_folder"
        mock_join.side_effect = lambda *args: "/".join(args)

        tool_instance = Input__ToolInstance(
            id="test_id",
            name="test_tool",
            python_code_file_name="main.py",
            python_requirements_file_name="requirements.txt",
            tool_metadata="{}",
            source_folder_path="test_folder",
            tool_image_uri="",
            is_venv_tool=True,
        )

        user_params = {"user_key": "user_value"}
        workflow_directory = "/test/workflow"

        tool = get_crewai_tool(tool_instance, user_params, workflow_directory)

        # Should return AgentStudioCrewAIVenvTool instance
        assert hasattr(tool, "agent_studio_id")
        assert hasattr(tool, "venv_dir")
        assert tool.agent_studio_id == "test_id"
