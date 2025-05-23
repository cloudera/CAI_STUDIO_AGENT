__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import pytest
from unittest.mock import patch, MagicMock, call, ANY
import os
import shutil
from uuid import UUID

from studio.api import *
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.tools.tool_instance import (
    create_tool_instance,
    remove_tool_instance,
    list_tool_instances,
    get_tool_instance,
    update_tool_instance
)
import json
from studio.proto.agent_studio_pb2 import (
    CreateToolInstanceRequest, CreateToolInstanceResponse,
    RemoveToolInstanceRequest, RemoveToolInstanceResponse,
    ListToolInstancesRequest, ListToolInstancesResponse,
    GetToolInstanceRequest, GetToolInstanceResponse,
    UpdateToolInstanceRequest
)

@patch('os.makedirs')
@patch('shutil.copytree')
@patch('studio.tools.tool_instance.uuid4')
@patch('studio.tools.tool_instance.get_thread_pool')
def test_create_tool_instance_success(mock_thread_pool, mock_uuid4, mock_copytree, mock_makedirs):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    # Add a workflow first
    with test_dao.get_session() as session:
        workflow = db_model.Workflow(
            id="workflow1",
            name="Test Workflow",
            directory="/path/workflow"
        )
        session.add(workflow)
        session.commit()

    # Mock UUID
    mock_uuid4.return_value = "test-instance-uuid"
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance

    # Create request with correct field name (name instead of tool_instance_name)
    req = CreateToolInstanceRequest(
        name="Test Instance",  # Changed from tool_instance_name
        workflow_id="workflow1"
    )

    res = create_tool_instance(req, cml=None, dao=test_dao)
    assert res.tool_instance_id == "test-instance-uuid"

@patch('studio.tools.tool_instance.get_thread_pool')
@patch('os.makedirs')
def test_create_tool_instance_template_not_found(mock_makedirs, mock_thread_pool):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    mock_makedirs.return_value = None
    
    # Add a workflow first
    with test_dao.get_session() as session:
        workflow = db_model.Workflow(
            id="workflow1",
            name="Test Workflow",
            directory="/path/workflow"
        )
        session.add(workflow)
        session.commit()

    req = CreateToolInstanceRequest(
        name="Test Instance",
        workflow_id="workflow1",
        tool_template_id="nonexistent"
    )

    with pytest.raises(RuntimeError) as exc_info:
        create_tool_instance(req, cml=None, dao=test_dao)
    assert "ToolTemplate with id nonexistent not found" in str(exc_info.value)

@patch('os.path.exists')
@patch('shutil.rmtree')
@patch('studio.tools.tool_instance.get_thread_pool')
def test_remove_tool_instance_success(mock_thread_pool, mock_rmtree, mock_exists):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    
    with test_dao.get_session() as session:
        instance = db_model.ToolInstance(
            id="instance1",
            name="Test Instance",
            workflow_id="workflow1",
            source_folder_path="/path/instance",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="",
            is_venv_tool=True
        )
        session.add(instance)
        session.commit()

    mock_exists.return_value = True

    req = RemoveToolInstanceRequest(tool_instance_id="instance1")
    remove_tool_instance(req, cml=None, dao=test_dao)

    # Verify instance was removed
    with test_dao.get_session() as session:
        instance = session.query(db_model.ToolInstance).filter_by(id="instance1").one_or_none()
        assert instance is None

@patch('studio.tools.tool_instance.get_thread_pool')
def test_remove_tool_instance_not_found(mock_thread_pool):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    mock_cml = MagicMock()  # Add mock CML instance

    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance

    req = RemoveToolInstanceRequest(tool_instance_id="nonexistent")
    
    # Add mock_cml to the function call
    remove_tool_instance(req, cml=mock_cml, dao=test_dao)
    # Verify the tool instance was not found but handled gracefully

@patch('builtins.open', new_callable=MagicMock)
@patch('os.path.join')
@patch('studio.tools.tool_instance.get_thread_pool')
def test_list_tool_instances(mock_thread_pool, mock_join, mock_open):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    
    with test_dao.get_session() as session:
        session.add(db_model.ToolInstance(
            id="instance1",
            name="Instance 1",
            workflow_id="workflow1",
            source_folder_path="/path/instance1",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="",
            is_venv_tool=True
        ))
        session.add(db_model.ToolInstance(
            id="instance2",
            name="Instance 2",
            workflow_id="workflow2",
            source_folder_path="/path/instance2",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="",
            is_venv_tool=True
        ))
        session.commit()

    mock_join.side_effect = lambda *args: "/".join(args)
    mock_open.return_value.__enter__.return_value.read.return_value = "test code"

    req = ListToolInstancesRequest(workflow_id="workflow1")
    res = list_tool_instances(req, cml=None, dao=test_dao)
    
    assert len(res.tool_instances) == 1
    assert res.tool_instances[0].name == "Instance 1"

@patch('builtins.open', new_callable=MagicMock)
@patch('os.path.join')
@patch('studio.tools.tool_instance.get_thread_pool')
def test_get_tool_instance(mock_thread_pool, mock_join, mock_open):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    
    with test_dao.get_session() as session:
        session.add(db_model.ToolInstance(
            id="instance1",
            name="Test Instance",
            workflow_id="workflow1",
            source_folder_path="/path/instance",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="",
            is_venv_tool=True
        ))
        session.commit()

    mock_join.side_effect = lambda *args: "/".join(args)
    mock_open.return_value.__enter__.return_value.read.return_value = "test code"

    req = GetToolInstanceRequest(tool_instance_id="instance1")
    res = get_tool_instance(req, cml=None, dao=test_dao)

    assert res.tool_instance.id == "instance1"
    assert res.tool_instance.name == "Test Instance"

@patch('studio.tools.tool_instance.get_thread_pool')
def test_get_tool_instance_not_found(mock_thread_pool):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    
    req = GetToolInstanceRequest(tool_instance_id="nonexistent")
    
    with pytest.raises(RuntimeError) as exc_info:
        get_tool_instance(req, cml=None, dao=test_dao)
    assert "Tool Instance with id 'nonexistent' not found" in str(exc_info.value)

@patch('os.path.exists')
@patch('shutil.copy')
@patch('os.remove')
@patch('os.makedirs')
@patch('studio.tools.tool_instance.get_thread_pool')
def test_update_tool_instance_success(mock_thread_pool, mock_makedirs, mock_remove, mock_copy, mock_exists):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    
    # Add a tool instance
    with test_dao.get_session() as session:
        instance = db_model.ToolInstance(
            id="instance1",
            name="Test Instance",
            workflow_id="workflow1",
            source_folder_path="/path/instance",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="",
            is_venv_tool=True
        )
        session.add(instance)
        session.commit()

    mock_exists.return_value = True

    req = UpdateToolInstanceRequest(
        tool_instance_id="instance1",
        name="Updated Instance",
        tmp_tool_image_path="/path/to/new.png"
    )

    res = update_tool_instance(req, cml=None, dao=test_dao)
    assert res.tool_instance_id == "instance1"

@patch('studio.tools.tool_instance.get_thread_pool')
@patch('os.makedirs')
@patch('shutil.copytree')
@patch('studio.tools.tool_instance.uuid4')
def test_create_tool_instance_without_template(mock_uuid4, mock_copytree, mock_makedirs, mock_thread_pool):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    mock_makedirs.return_value = None
    mock_copytree.return_value = None
    mock_uuid4.return_value = "test-uuid"
    
    # Add a workflow first
    with test_dao.get_session() as session:
        workflow = db_model.Workflow(
            id="workflow1",
            name="Test Workflow",
            directory="/path/workflow"
        )
        session.add(workflow)
        session.commit()

    req = CreateToolInstanceRequest(
        name="New Instance",
        workflow_id="workflow1"
    )

    res = create_tool_instance(req, cml=None, dao=test_dao)
    assert res.tool_instance_id == "test-uuid"

def test_update_tool_instance_not_found():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    req = UpdateToolInstanceRequest(
        tool_instance_id="nonexistent",
        name="Updated Name"
    )
    
    with pytest.raises(RuntimeError) as exc_info:
        update_tool_instance(req, cml=None, dao=test_dao)
    assert "Tool Instance with id 'nonexistent' not found" in str(exc_info.value)

@patch('studio.tools.tool_instance.get_thread_pool')
@patch('os.path.exists')
def test_update_tool_instance_invalid_image(mock_exists, mock_thread_pool):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    mock_exists.return_value = True  # Make file exist check pass
    
    # Add a tool instance
    with test_dao.get_session() as session:
        instance = db_model.ToolInstance(
            id="instance1",
            name="Test Instance",
            workflow_id="workflow1",
            source_folder_path="/path/instance",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            tool_image_path="",
            is_venv_tool=True
        )
        session.add(instance)
        session.commit()

    req = UpdateToolInstanceRequest(
        tool_instance_id="instance1",
        tmp_tool_image_path="/path/to/image.gif"
    )
    
    with pytest.raises(RuntimeError) as exc_info:
        update_tool_instance(req, cml=None, dao=test_dao)
    assert "Invalid image file extension" in str(exc_info.value)

@patch('os.path.exists')
@patch('studio.tools.tool_instance.get_thread_pool')
def test_remove_tool_instance_with_image(mock_thread_pool, mock_exists):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    
    mock_thread_pool_instance = MagicMock()
    mock_thread_pool.return_value = mock_thread_pool_instance
    
    with test_dao.get_session() as session:
        instance = db_model.ToolInstance(
            id="instance1",
            name="Test Instance",
            workflow_id="workflow1",
            source_folder_path="/path/instance",
            tool_image_path="/path/to/image.png",
            python_code_file_name="code.py",
            python_requirements_file_name="requirements.txt",
            is_venv_tool=True
        )
        session.add(instance)
        session.commit()

    mock_exists.return_value = True
    
    req = RemoveToolInstanceRequest(tool_instance_id="instance1")
    res = remove_tool_instance(req, cml=None, dao=test_dao) 