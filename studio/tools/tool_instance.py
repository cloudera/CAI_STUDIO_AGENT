import shutil
from uuid import uuid4
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model, DbSession
from typing import Optional
from studio.api import *
from cmlapi import CMLServiceApi
import json
import os
import studio.tools.utils as tool_utils
from studio.cross_cutting.global_thread_pool import get_thread_pool
import studio.consts as consts
import studio.cross_cutting.utils as cc_utils

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src/")
from engine.crewai.tools import prepare_virtual_env_for_tool


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
        )
        session.add(tool_instance)

    get_thread_pool().submit(
        prepare_virtual_env_for_tool,
        tool_instance_dir,
        "requirements.txt",
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
    get_thread_pool().submit(
        prepare_virtual_env_for_tool,
        tool_instance.source_folder_path,
        tool_instance.python_requirements_file_name,
    )
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
    with open(os.path.join(tool_instance_dir, tool_instance.python_code_file_name), "r") as f:
        tool_code = f.read()
    with open(os.path.join(tool_instance_dir, tool_instance.python_requirements_file_name), "r") as f:
        tool_requirements = f.read()

    # is_valid, validation_errors = tool_utils.validate_tool_code(tool_code)
    user_params = []
    try:
        user_params = tool_utils.extract_user_params_from_code(tool_code)
    except Exception as e:
        is_valid = False
        # validation_errors.append(f"Error extracting user parameters from python code: {e}")

    tool_image_uri = ""
    if tool_instance.tool_image_path:
        tool_image_uri = os.path.relpath(tool_instance.tool_image_path, consts.DYNAMIC_ASSETS_LOCATION)

    return GetToolInstanceResponse(
        tool_instance=ToolInstance(
            id=tool_instance.id,
            name=tool_instance.name,
            workflow_id=tool_instance.workflow_id,
            python_code=tool_code,
            python_requirements=tool_requirements,
            source_folder_path=tool_instance_dir,
            tool_metadata=json.dumps({"user_params": user_params}),
            is_valid=True,
            tool_image_uri=tool_image_uri,
            tool_description="",
            is_venv_tool=tool_instance.is_venv_tool,
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
    if request.workflow_id:
        tool_instances = session.query(db_model.ToolInstance).filter_by(workflow_id=request.workflow_id).all()
    else:
        tool_instances = session.query(db_model.ToolInstance).all()

    tool_instances_response = []
    for tool_instance in tool_instances:
        tool_instance_dir = tool_instance.source_folder_path
        with open(os.path.join(tool_instance_dir, tool_instance.python_code_file_name), "r") as f:
            tool_code = f.read()
        with open(os.path.join(tool_instance_dir, tool_instance.python_requirements_file_name), "r") as f:
            tool_requirements = f.read()

        # is_valid, validation_errors = tool_utils.validate_tool_code(tool_code)
        user_params = []
        try:
            user_params = tool_utils.extract_user_params_from_code(tool_code)
        except Exception as e:
            is_valid = False
            # validation_errors.append(f"Error extracting user parameters from python code: {e}")

        tool_image_uri = ""
        if tool_instance.tool_image_path:
            tool_image_uri = os.path.relpath(tool_instance.tool_image_path, consts.DYNAMIC_ASSETS_LOCATION)

        tool_instances_response.append(
            ToolInstance(
                id=tool_instance.id,
                name=tool_instance.name,
                workflow_id=tool_instance.workflow_id,
                python_code=tool_code,
                python_requirements=tool_requirements,
                source_folder_path=tool_instance.source_folder_path,
                tool_metadata=json.dumps({"user_params": user_params}),
                is_valid=True,
                tool_image_uri=tool_image_uri,
                tool_description="",
                is_venv_tool=tool_instance.is_venv_tool,
            )
        )
    return ListToolInstancesResponse(tool_instances=tool_instances_response)


def _delete_tool_instance_directory(source_folder_path: str):
    try:
        if os.path.exists(source_folder_path):
            shutil.rmtree(source_folder_path)
            print(f"Deleted tool instance directory: {source_folder_path}")
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
        raise ValueError(f"Tool Instance with id '{request.tool_instance_id}' not found")

    if delete_tool_directory:
        get_thread_pool().submit(
            _delete_tool_instance_directory,
            tool_instance.source_folder_path,
        )

    if tool_instance.tool_image_path:
        try:
            os.remove(tool_instance.tool_image_path)
        except Exception as e:
            print(f"Failed to delete tool instance image: {e}")

    session.delete(tool_instance)
    return RemoveToolInstanceResponse()
