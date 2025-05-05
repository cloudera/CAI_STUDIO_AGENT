import pytest
from unittest.mock import patch, MagicMock, call, ANY
import os
import shutil
from uuid import UUID

from studio.api import *
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.tools.tool_template import *
from studio.tools.utils import (
    extract_user_params_from_code
)
import json



# Tests for extract_user_params_from_code
def test_extract_user_params_valid():
    python_code = """
class UserParameters(BaseModel):
    param1: str
    param2: str
"""
    params = extract_user_params_from_code(python_code)
    expected = {
        "param1": {"required": True},
        "param2": {"required": True}
    }
    assert params == expected


def test_extract_user_params_syntax_error():
    python_code = """
class UserParameters(BaseModel:
    param1: str
    param2: notype
"""
    with pytest.raises(ValueError) as excinfo:
        extract_user_params_from_code(python_code)
    assert "Error parsing Python code" in str(excinfo.value)


# Tests for list_tool_templates
@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.join")
def test_list_tool_templates(mock_join, mock_open):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="some/path.png",
        ))
        session.add(db_model.ToolTemplate(
            id="t2",
            name="template2",
            source_folder_path="/path/t2",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="some/path.png",
        ))
        session.commit()
        
    # Mock os.path.join
    mock_join.side_effect = lambda *args: "/".join(args)

    # Mock file reads
    mock_open.return_value.__enter__.return_value.read.side_effect = [
        "def tool_example_wrapper(): return None",  # Content of the first file
        "def tool_example_wrapper(): return None"   # Content of the second file
    ]

    req = ListToolTemplatesRequest()
    res = list_tool_templates(ListToolTemplatesRequest(), cml=None, dao=test_dao)

    assert isinstance(res, ListToolTemplatesResponse)
    assert len(res.templates) == 2
    assert res.templates[0].name == "template1"
    assert res.templates[1].name == "template2"


@patch("studio.db.dao.AgentStudioDao")
def test_list_tool_templates_empty_db(mock_dao):
    test_dao = mock_dao.return_value
    test_session = test_dao.get_session.return_value.__enter__.return_value

    # Mock the database to return an empty list
    test_session.query.return_value.all.return_value = []

    req = ListToolTemplatesRequest()
    res = list_tool_templates(req, cml=None, dao=test_dao)

    # Validate the response
    assert isinstance(res, ListToolTemplatesResponse)
    assert len(res.templates) == 0



@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.join")
def test_list_tool_templates_file_read_error(mock_join, mock_open):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="some/path.png",
        ))
        session.commit()

    # Mock file paths
    mock_join.side_effect = lambda *args: "/".join(args)

    # Simulate file read errors
    mock_open.side_effect = IOError("File read error")

    req = ListToolTemplatesRequest()
    res = list_tool_templates(req, cml=None, dao=test_dao)

    # Validate the response
    assert isinstance(res, ListToolTemplatesResponse)
    assert len(res.templates) == 1
    assert not res.templates[0].is_valid  # Should be invalid due to file read error


# Tests for get_tool_template
@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.join")
def test_get_tool_template(mock_join, mock_open):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    # Insert a mock tool template into the database
    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="some/path.png",
        ))
        session.commit()

    # Mock file paths
    mock_join.side_effect = lambda *args: "/".join(args)

    # Mock file reads
    mock_open.return_value.__enter__.return_value.read.side_effect = [
"""
class UserParameters(BaseModel):
    param1: str
    param2: str
    
class NewTool(StudioBaseTool):
    pass
""",
"""
package==1.0
"""   
    ]

    # Create a request for the tool template
    req = GetToolTemplateRequest(tool_template_id="t1")
    
    # Call the function being tested
    res = get_tool_template(req, cml=None, dao=test_dao)

    # Validate the response
    assert isinstance(res, GetToolTemplateResponse)
    assert res.template.name == "template1"
    assert res.template.is_valid  # Ensure it is valid since the mocked content is correct
    assert "param1" in json.loads(res.template.tool_metadata)["user_params"]


@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.join")
def test_get_tool_template_missing_python_file(mock_join, mock_open):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="some/path.png",
        ))
        session.commit()

    # Mock file paths
    mock_join.side_effect = lambda *args: "/".join(args)

    # Simulate missing Python file
    mock_open.side_effect = [IOError("File not found"), "package==1.0"]

    req = GetToolTemplateRequest(tool_template_id="t1")
    res = get_tool_template(req, cml=None, dao=test_dao)

    # Validate the response
    assert isinstance(res, GetToolTemplateResponse)
    assert not res.template.is_valid  # Should be invalid due to missing Python file



@patch('studio.tools.tool_template.cc_utils.create_slug_from_name')
@patch('studio.tools.tool_template.cc_utils.get_random_compact_string')
@patch('studio.tools.tool_template.uuid4')
@patch('os.makedirs')
@patch('shutil.copytree')
def test_add_tool_template_success(mock_copytree, mock_makedirs, mock_uuid4, mock_random_string, mock_create_slug):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    # Mock UUID and other utils
    mock_uuid4.return_value = "test-uuid"
    mock_random_string.return_value = "random123"
    mock_create_slug.return_value = "valid-tool"
    
    req = AddToolTemplateRequest(
        tool_template_name="Valid Tool",
        workflow_template_id=None
    )
    
    res = add_tool_template(req, cml=None, dao=test_dao)
    
    assert res.tool_template_id == "test-uuid"
    mock_makedirs.assert_called()
    mock_copytree.assert_called()

def test_add_tool_template_duplicate_name():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    # Add first template with a valid name
    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="Valid Template",  # Changed to valid name format
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="/path/to/image.png",
            is_venv_tool=True,
            workflow_template_id=None
        ))
        session.commit()

    # Try to add template with same name
    req = AddToolTemplateRequest(
        tool_template_name="Valid Template"  # Match the name exactly
    )

    with pytest.raises(RuntimeError) as exc_info:
        add_tool_template(req, cml=None, dao=test_dao)
    assert "A global tool template with this name already exists" in str(exc_info.value)

@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.join")
def test_list_tool_templates_with_docstring(mock_join, mock_open):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="/path/to/image.png",
            is_venv_tool=True,
            workflow_template_id=None
        ))
        session.commit()

    mock_join.side_effect = lambda *args: "/".join(args)
    
    # Mock file content with docstring
    python_code = '''"""
This is a test tool description
"""
def some_function():
    pass
'''
    mock_open.return_value.__enter__.return_value.read.side_effect = [python_code, "requirements"]

    res = list_tool_templates(ListToolTemplatesRequest(), cml=None, dao=test_dao)
    
    assert len(res.templates) == 1
    assert res.templates[0].tool_description.strip() == "This is a test tool description"

@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.join")
def test_list_tool_templates_invalid_python(mock_join, mock_open):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="/path/to/image.png",  # Add required field
            is_venv_tool=True
        ))
        session.commit()

    mock_join.side_effect = lambda *args: "/".join(args)
    
    # Mock invalid Python code
    mock_open.return_value.__enter__.return_value.read.side_effect = ["invalid python code {", "requirements"]

    res = list_tool_templates(ListToolTemplatesRequest(), cml=None, dao=test_dao)
    
    assert len(res.templates) == 1
    assert res.templates[0].tool_description == "Unable to read tool description"

@patch("os.path.exists")
@patch("os.makedirs")
@patch("shutil.copytree")
@patch("studio.tools.tool_template.uuid4")
def test_add_tool_template_with_invalid_name(mock_uuid4, mock_copytree, mock_makedirs, mock_exists):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    req = AddToolTemplateRequest(tool_template_name="Invalid@Tool#")
    
    with pytest.raises(RuntimeError) as exc_info:
        add_tool_template(req, cml=None, dao=test_dao)
    assert "Tool template name must only contain alphabets, numbers, and spaces" in str(exc_info.value)

@patch("os.path.exists")
def test_add_tool_template_with_invalid_image(mock_exists):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_exists.return_value = True
    
    req = AddToolTemplateRequest(
        tool_template_name="Valid Tool",
        tmp_tool_image_path="/path/to/image.gif"
    )
    
    with pytest.raises(RuntimeError) as exc_info:
        add_tool_template(req, cml=None, dao=test_dao)
    assert "Tool image must be PNG, JPG or JPEG format" in str(exc_info.value)

@patch("os.path.exists")
@patch("os.path.basename")
@patch("shutil.copy")
@patch("os.remove")
def test_update_tool_template_with_image(mock_remove, mock_copy, mock_basename, mock_exists):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    # Add template to update
    with test_dao.get_session() as session:
        # First, add another template to test uniqueness check
        session.add(db_model.ToolTemplate(
            id="t2",
            name="other_template",
            source_folder_path="/path/t2",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="/path/to/other.png",
            is_venv_tool=True,
            workflow_template_id=None
        ))
        
        # Add the template we'll update
        template = db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="/path/to/old.png",
            is_venv_tool=True,
            workflow_template_id=None
        )
        session.add(template)
        session.commit()

    # Mock all path operations
    mock_exists.return_value = True
    mock_basename.return_value = "tool_dir"
    
    # Create request
    class MockRequest:
        def __init__(self):
            self.tool_template_id = "t1"
            self.tool_template_name = "Updated Template"
            self.tmp_tool_image_path = "/path/to/new.png"
            self.workflow_template_id = None

    req = MockRequest()
    
    # Mock the file operations
    mock_copy.return_value = None
    mock_remove.return_value = None
    
    res = update_tool_template(req, cml=None, dao=test_dao)
    
    # Verify the results
    assert res.tool_template_id == "t1"
    mock_copy.assert_called_once()
    mock_remove.assert_called_once()
    mock_basename.assert_called_once_with("/path/t1")

    # Verify the update was successful
    with test_dao.get_session() as session:
        updated = session.query(db_model.ToolTemplate).filter_by(id="t1").one()
        assert updated.name == "Updated Template"

def test_remove_tool_template_prebuilt():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            pre_built=True,
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="/path/to/image.png",
            is_venv_tool=True,
            workflow_template_id=None
        ))
        session.commit()

    req = RemoveToolTemplateRequest(tool_template_id="t1")
    
    with pytest.raises(RuntimeError) as exc_info:
        remove_tool_template(req, cml=None, dao=test_dao)
    assert "is pre-built and cannot be removed" in str(exc_info.value)

@patch("os.path.exists")
@patch("shutil.rmtree")
@patch("os.remove")
def test_remove_tool_template_with_cleanup(mock_remove, mock_rmtree, mock_exists):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_exists.return_value = True
    
    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            tool_image_path="/path/to/image.png",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            is_venv_tool=True
        ))
        session.commit()

    req = RemoveToolTemplateRequest(tool_template_id="t1")
    res = remove_tool_template(req, cml=None, dao=test_dao)
    
    mock_rmtree.assert_called_once_with("/path/t1")
    mock_remove.assert_called_once_with("/path/to/image.png")
