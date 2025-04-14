import pytest
from unittest.mock import patch, MagicMock

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
    assert params == ["param1", "param2"]


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
@patch("studio.tools.utils.validate_tool_code")
@patch("builtins.open", new_callable=MagicMock)
@patch("os.path.join")
def test_get_tool_template(mock_join, mock_open, mock_validate):
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

    # Mock validate_tool_template_code to return True
    mock_validate.return_value = (True, [])

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



@patch("os.makedirs")
@patch("builtins.open")
@patch("os.path.join")
@patch("studio.tools.utils.validate_tool_code")
@patch("studio.db.dao.AgentStudioDao")
@patch("studio.tools.tool_template.cc_utils.create_slug_from_name")
@patch("studio.tools.tool_template.cc_utils.get_random_compact_string")
@patch("studio.tools.tool_template.shutil")
def test_add_tool_template_success(
    mock_shutil,
    mock_get_random_string, 
    mock_create_slug, 
    mock_dao, 
    mock_validate, 
    mock_join, 
    mock_open, 
    mock_makedirs
):
    
    mock_get_random_string.return_value = "xyz123"
    mock_create_slug.return_value = "tool_slug"
    
    # Mock DAO session
    test_dao = mock_dao.return_value
    test_session = test_dao.get_session.return_value.__enter__.return_value

    # Mock the database query for duplicates to return None
    test_session.query.return_value.filter_by.return_value.first.return_value = None

    # Mock validate_tool_template_code to return valid
    mock_validate.return_value = (True, [])

    # Mock file operations
    # mock_open.return_value.__enter__.return_value.write = MagicMock()
    mock_join.side_effect = lambda *args: "/".join(args)

    # Mock directory creation
    mock_makedirs.return_value = None

    # Prepare the AddToolTemplateRequest
    req = AddToolTemplateRequest(
        tool_template_name="Valid Tool",
    )

    # Call the function being tested
    res = add_tool_template(req, cml=None, dao=test_dao)

    # Validate the response
    assert isinstance(res, AddToolTemplateResponse)
    assert res.tool_template_id is not None

    # Validate that the template was added to the database
    test_session.add.assert_called_once()
    test_session.commit.assert_called_once()

    # Validate file operations
    mock_makedirs.assert_called_once()


def test_add_tool_template_duplicate_name():
    # Mock DAO and session
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

    # Prepare the AddToolTemplateRequest
    req = AddToolTemplateRequest(
        tool_template_name="template1",
    )

    # Expect a RuntimeError due to the duplicate tool template
    with pytest.raises(RuntimeError) as excinfo:
        add_tool_template(req, cml=None, dao=test_dao)

    # Verify the error message contains the duplicate name error
    assert "Unexpected error while adding tool template" in str(excinfo.value)
    assert "A tool template with this name already exists." in str(excinfo.value)


def test_update_tool_template_not_found():
    # Mock DAO and session
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    # Prepare the UpdateToolTemplateRequest
    req = UpdateToolTemplateRequest(
        tool_template_id="nonexistent",
    )

    # Call update_tool_template and assert it raises the expected RuntimeError
    with pytest.raises(RuntimeError) as excinfo:
        update_tool_template(req, cml=None, dao=test_dao)

    # Assert the error message
    assert "Unexpected error while updating tool template" in str(excinfo.value)
    assert "Tool template with ID 'nonexistent' not found" in str(excinfo.value)



def test_update_tool_template_pre_built():
    # Mock DAO and session
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    with test_dao.get_session() as session:
        session.add(db_model.ToolTemplate(
            id="t1",
            name="template1",
            source_folder_path="/path/t1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="some/path.png",
            pre_built=True,
        ))
        session.commit()

    # Prepare the UpdateToolTemplateRequest
    req = UpdateToolTemplateRequest(
        tool_template_id="t1",
    )

    # Call update_tool_template and assert it raises the expected RuntimeError
    with pytest.raises(RuntimeError) as excinfo:
        update_tool_template(req, cml=None, dao=test_dao)

    # Validate the error message
    assert "Unexpected error while updating tool template" in str(excinfo.value)
    assert "Tool template with ID 't1' is pre-built and cannot be updated" in str(excinfo.value)
