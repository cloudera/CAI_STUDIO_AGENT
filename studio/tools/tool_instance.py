import shutil
from uuid import uuid4
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model, DbSession
from typing import Optional
from studio.api import *
from studio.api.types import ToolInstanceStatus
from cmlapi import CMLServiceApi
import json
import os
import ast
import studio.tools.utils as tool_utils
from studio.cross_cutting.global_thread_pool import get_thread_pool
import studio.consts as consts
import studio.cross_cutting.utils as cc_utils
from studio.tools.utils import read_tool_instance_code, extract_tool_params_from_code
from studio.workflow.runners import get_workflow_runners
from studio.proto import agent_studio_pb2
import requests


def create_tool_instance(
    request: CreateToolInstanceRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> CreateToolInstanceResponse:
    """
    Create a tool instance from a tool template
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _create_tool_instance_impl(request, session)
                session.commit()
                return response
        else:
            session = preexisting_db_session
            return _create_tool_instance_impl(request, session)

    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _create_tool_instance_impl(request: CreateToolInstanceRequest, session: DbSession) -> CreateToolInstanceResponse:
    """
    Implementation of tool instance creation logic
    """
    associated_tool_template: Optional[db_model.ToolTemplate] = None
    if request.tool_template_id:
        associated_tool_template = session.query(db_model.ToolTemplate).filter_by(id=request.tool_template_id).first()
        if not associated_tool_template:
            raise ValueError(f"ToolTemplate with id {request.tool_template_id} not found")

    workflow_obj = session.query(db_model.Workflow).filter_by(id=request.workflow_id).first()
    if not workflow_obj:
        raise ValueError(f"Workflow with id {request.workflow_id} not found")
    workflow_dir = workflow_obj.directory

    instance_uuid = str(uuid4())
    tool_instance_name = request.name or (
        associated_tool_template.name if associated_tool_template else "Tool Instance"
    )
    tool_instance_dir = os.path.join(
        workflow_dir,
        "tools",
        cc_utils.create_slug_from_name(tool_instance_name) + "_" + cc_utils.get_random_compact_string(),
    )
    os.makedirs(tool_instance_dir, exist_ok=True)

    if associated_tool_template:
        shutil.copytree(associated_tool_template.source_folder_path, tool_instance_dir, dirs_exist_ok=True)

        tool_image_path = ""
        if associated_tool_template.tool_image_path:
            _, ext = os.path.splitext(associated_tool_template.tool_image_path)
            os.makedirs(consts.TOOL_INSTANCE_ICONS_LOCATION, exist_ok=True)
            tool_image_path = os.path.join(consts.TOOL_INSTANCE_ICONS_LOCATION, f"{instance_uuid}_icon{ext}")
            shutil.copy(associated_tool_template.tool_image_path, tool_image_path)

        tool_instance = db_model.ToolInstance(
            id=instance_uuid,
            workflow_id=request.workflow_id,
            name=tool_instance_name,
            python_code_file_name=associated_tool_template.python_code_file_name,
            python_requirements_file_name=associated_tool_template.python_requirements_file_name,
            source_folder_path=tool_instance_dir,
            tool_image_path=tool_image_path,
            is_venv_tool=associated_tool_template.is_venv_tool,
            status=ToolInstanceStatus.CREATED.value,
        )
        session.add(tool_instance)
    else:
        shutil.copytree(consts.TOOL_TEMPLATE_SAMPLE_DIR, tool_instance_dir, dirs_exist_ok=True)
        tool_instance = db_model.ToolInstance(
            id=instance_uuid,
            workflow_id=request.workflow_id,
            name=tool_instance_name,
            python_code_file_name="tool.py",
            python_requirements_file_name="requirements.txt",
            source_folder_path=tool_instance_dir,
            tool_image_path="",
            is_venv_tool=True,
            status=ToolInstanceStatus.CREATED.value,
        )
        session.add(tool_instance)
    session.commit()

    get_thread_pool().submit(
        tool_utils.prepare_tool_instance,
        instance_uuid,
    )
    return CreateToolInstanceResponse(
        tool_instance_id=instance_uuid,
        tool_instance_name=tool_instance_name,
    )


def update_tool_instance(
    request: UpdateToolInstanceRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> UpdateToolInstanceResponse:
    """
    Update a tool instance
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _update_tool_instance_impl(request, session)
                session.commit()
                return response
        else:
            session = preexisting_db_session
            return _update_tool_instance_impl(request, session)
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _update_tool_instance_impl(request: UpdateToolInstanceRequest, session: DbSession) -> UpdateToolInstanceResponse:
    """
    Update a tool instance
    """
    tool_instance = session.query(db_model.ToolInstance).filter_by(id=request.tool_instance_id).first()
    if not tool_instance:
        raise ValueError(f"Tool Instance with id '{request.tool_instance_id}' not found")

    # Check tool status before deciding whether to prepare venv
    current_status = tool_instance.status
    should_prepare_venv = current_status in [
        ToolInstanceStatus.CREATED.value,
        ToolInstanceStatus.READY.value,
        ToolInstanceStatus.FAILED.value,
    ]

    if request.name:
        tool_instance.name = request.name
    if request.tmp_tool_image_path:
        if not os.path.exists(request.tmp_tool_image_path):
            raise ValueError(f"Temporary tool image file '{request.tmp_tool_image_path}' does not exist")

        _, ext = os.path.splitext(request.tmp_tool_image_path)
        ext = ext.lower()
        if ext not in [".png", ".jpg", ".jpeg"]:
            raise ValueError(f"Invalid image file extension '{ext}'. Must be .png, .jpg, or .jpeg")
        os.makedirs(consts.TOOL_INSTANCE_ICONS_LOCATION, exist_ok=True)
        tool_image_path = os.path.join(consts.TOOL_INSTANCE_ICONS_LOCATION, f"{request.tool_instance_id}_icon{ext}")
        shutil.copy(request.tmp_tool_image_path, tool_image_path)
        tool_instance.tool_image_path = tool_image_path
        os.remove(request.tmp_tool_image_path)

    # Only submit venv preparation if tool is not already preparing
    if should_prepare_venv:
        get_thread_pool().submit(
            tool_utils.prepare_tool_instance,
            request.tool_instance_id,
        )
    else:
        print(f"Skipping venv preparation for tool instance {request.tool_instance_id} - status is {current_status}")

    return UpdateToolInstanceResponse(tool_instance_id=tool_instance.id)


def get_tool_instance(
    request: GetToolInstanceRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> GetToolInstanceResponse:
    """
    Get a tool instance by id
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                return _get_tool_instance_impl(request, session)
        else:
            session = preexisting_db_session
            return _get_tool_instance_impl(request, session)
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _get_tool_instance_impl(request: GetToolInstanceRequest, session: DbSession) -> GetToolInstanceResponse:
    """
    Implementation of get tool instance logic
    """
    tool_instance: ToolInstance = session.query(db_model.ToolInstance).filter_by(id=request.tool_instance_id).first()
    if not tool_instance:
        raise ValueError(f"Tool Instance with id '{request.tool_instance_id}' not found")

    tool_instance_dir = tool_instance.source_folder_path
    tool_code = ""
    tool_requirements = ""
    status_message = ""
    is_valid = True

    # Try to read tool code and requirements
    try:
        tool_code, tool_requirements = read_tool_instance_code(tool_instance)
    except FileNotFoundError as e:
        status_message = f"Tool instance files not found: {str(e)}"
        is_valid = False
    except Exception as e:
        status_message = f"Error reading tool instance files: {str(e)}"
        is_valid = False

    user_params_dict = {}
    tool_params_dict = {}
    try:
        if tool_code:
            user_params_dict = tool_utils.extract_user_params_from_code(tool_code)
            tool_params_dict = extract_tool_params_from_code(tool_code)
    except Exception as e:
        status_message = f"Error extracting user/tool params: {str(e)}"
        is_valid = False

    tool_image_uri = ""
    if tool_instance.tool_image_path:
        tool_image_uri = os.path.relpath(tool_instance.tool_image_path, consts.DYNAMIC_ASSETS_LOCATION)

    try:
        tool_description = ast.get_docstring(ast.parse(tool_code)) if tool_code else ""
    except Exception:
        tool_description = "Unable to read tool description"

    return GetToolInstanceResponse(
        tool_instance=ToolInstance(
            id=tool_instance.id,
            name=tool_instance.name,
            workflow_id=tool_instance.workflow_id,
            python_code=tool_code,
            python_requirements=tool_requirements,
            source_folder_path=tool_instance_dir,
            tool_metadata=json.dumps(
                {
                    "user_params": list(user_params_dict.keys()),
                    "user_params_metadata": user_params_dict,
                    "tool_params_metadata": tool_params_dict,
                    "status": status_message,
                }
            ),
            is_valid=is_valid,
            tool_image_uri=tool_image_uri,
            tool_description=tool_description,
            is_venv_tool=tool_instance.is_venv_tool,
            status=tool_instance.status,
        )
    )


def list_tool_instances(
    request: ListToolInstancesRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> ListToolInstancesResponse:
    """
    List all tool instances
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                return _list_tool_instances_impl(request, session)
        else:
            session = preexisting_db_session
            return _list_tool_instances_impl(request, session)
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _list_tool_instances_impl(request: ListToolInstancesRequest, session: DbSession) -> ListToolInstancesResponse:
    """
    Implementation of list tool instances logic
    """
    if not request.workflow_id:
        raise ValueError("Every ListToolInstances request must specify a workflow ID.")

    tool_instances = session.query(db_model.ToolInstance).filter_by(workflow_id=request.workflow_id).all()

    tool_instances_response = []
    for tool_instance in tool_instances:
        tool_code = ""
        tool_requirements = ""
        status_message = ""
        is_valid = True

        # Try to read tool code and requirements
        try:
            tool_code, tool_requirements = read_tool_instance_code(tool_instance)
        except FileNotFoundError as e:
            status_message = f"Tool instance files not found: {str(e)}"
            is_valid = False
        except Exception as e:
            status_message = f"Error reading tool instance files: {str(e)}"
            is_valid = False

        user_params_dict = {}
        tool_params_dict = {}
        try:
            if tool_code:
                user_params_dict = tool_utils.extract_user_params_from_code(tool_code)
                tool_params_dict = extract_tool_params_from_code(tool_code)
        except Exception as e:
            status_message = f"Error extracting user/tool params: {str(e)}"
            is_valid = False

        tool_image_uri = ""
        if tool_instance.tool_image_path:
            tool_image_uri = os.path.relpath(tool_instance.tool_image_path, consts.DYNAMIC_ASSETS_LOCATION)

        try:
            tool_description = ast.get_docstring(ast.parse(tool_code)) if tool_code else ""
        except Exception:
            tool_description = "Unable to read tool description"

        tool_instances_response.append(
            ToolInstance(
                id=tool_instance.id,
                name=tool_instance.name,
                workflow_id=tool_instance.workflow_id,
                python_code=tool_code,
                python_requirements=tool_requirements,
                source_folder_path=tool_instance.source_folder_path,
                tool_metadata=json.dumps(
                    {
                        "user_params": list(user_params_dict.keys()),
                        "user_params_metadata": user_params_dict,
                        "tool_params_metadata": tool_params_dict,
                        "status": status_message,
                    }
                ),
                is_valid=is_valid,
                tool_image_uri=tool_image_uri,
                tool_description=tool_description,
                is_venv_tool=tool_instance.is_venv_tool,
                status=tool_instance.status,
            )
        )
    return ListToolInstancesResponse(tool_instances=tool_instances_response)


def _delete_tool_instance_directory(source_folder_path: str):
    try:
        if os.path.exists(source_folder_path):
            shutil.rmtree(source_folder_path)
            print(f"Deleted tool instance directory: {source_folder_path}")
        else:
            print(f"Tool instance directory not found: {source_folder_path}")
    except Exception as e:
        print(f"Failed to delete tool instance directory: {e}")


def remove_tool_instance(
    request: RemoveToolInstanceRequest,
    cml: CMLServiceApi,
    delete_tool_directory: bool = True,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> RemoveToolInstanceResponse:
    """
    Remove a tool instance by id
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _remove_tool_instance_impl(request, session, delete_tool_directory)
                session.commit()
                return response
        else:
            session = preexisting_db_session
            return _remove_tool_instance_impl(request, session, delete_tool_directory)
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _remove_tool_instance_impl(
    request: RemoveToolInstanceRequest, session: DbSession, delete_tool_directory: bool
) -> RemoveToolInstanceResponse:
    """
    Implementation of remove tool instance logic
    """
    tool_instance = session.query(db_model.ToolInstance).filter_by(id=request.tool_instance_id).first()
    if not tool_instance:
        print(f"Tool Instance with id '{request.tool_instance_id}' not found, assuming already deleted")
        return RemoveToolInstanceResponse()

    if delete_tool_directory:
        get_thread_pool().submit(
            _delete_tool_instance_directory,
            tool_instance.source_folder_path,
        )

    if tool_instance.tool_image_path:
        try:
            if os.path.exists(tool_instance.tool_image_path):
                os.remove(tool_instance.tool_image_path)
                print(f"Deleted tool instance image: {tool_instance.tool_image_path}")
            else:
                print(f"Tool instance image not found: {tool_instance.tool_image_path}")
        except Exception as e:
            print(f"Failed to delete tool instance image: {e}")

    session.delete(tool_instance)
    return RemoveToolInstanceResponse()


def test_tool_instance(request, cml: CMLServiceApi = None, dao: AgentStudioDao = None):
    """
    Test a tool instance by id. Ensures venv is ready, then sends test request to runner.
    """
    if dao is None:
        dao = AgentStudioDao()
    with dao.get_session() as session:
        # 1. Fetch tool instance details
        try:
            tool_instance_resp = _get_tool_instance_impl(
                agent_studio_pb2.GetToolInstanceRequest(tool_instance_id=request.tool_instance_id), session
            )
            tool = tool_instance_resp.tool_instance
        except Exception as e:
            raise RuntimeError(f"Failed to fetch tool instance: {e}")

        # 2. Check validity and status
        if not tool.is_valid:
            raise RuntimeError("Tool instance is not valid. Please check the code and requirements.")
        # 3. Select available runner
        workflow_runners = get_workflow_runners()
        available_runners = [r for r in workflow_runners if not r["busy"]]
        if not available_runners:
            raise RuntimeError("No workflow runners currently available to test tool instance!")
        runner = available_runners[0]
        runner_url = f"{runner['endpoint']}/test_tool_instance"

        # 4. Prepare payload
        trace_id = str(uuid4())
        payload = {
            "tool_instance_id": tool.id,
            "tool_directory": tool.source_folder_path,
            "user_params": dict(request.user_params),
            "tool_params": dict(request.tool_params),
            "trace_id": trace_id,
        }
        try:
            resp = requests.post(runner_url, json=payload)
            resp.raise_for_status()
        except Exception as e:
            raise RuntimeError(f"Failed to send test request to runner: {e}")

        # Just return the trace_id so the UI/other service can fetch events
        return agent_studio_pb2.TestToolInstanceResponse(trace_id=trace_id)
