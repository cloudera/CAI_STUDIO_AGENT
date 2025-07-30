import os
import shutil
import re
from uuid import uuid4
from typing import Optional
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model, DbSession
from studio.api import *
from studio.cross_cutting.global_thread_pool import get_thread_pool
import studio.consts as consts
import studio.as_mcp.utils as mcp_utils
from cmlapi import CMLServiceApi
import json


def _delete_icon_file(icon_path):
    if icon_path and os.path.exists(icon_path):
        try:
            os.remove(icon_path)
        except Exception:
            pass


def create_mcp_instance(
    request: CreateMcpInstanceRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> CreateMcpInstanceResponse:
    """
    Create a new MCP instance
    """
    try:
        response = None
        if dao is not None:
            with dao.get_session() as session:
                response = _create_mcp_instance_impl(request, session)
                session.commit()
        else:
            session = preexisting_db_session
            response = _create_mcp_instance_impl(request, session)
        get_thread_pool().submit(
            mcp_utils._update_mcp_tools,
            response.mcp_instance_id,
            db_model.MCPInstance,
        )
        return response

    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _create_mcp_instance_impl(request: CreateMcpInstanceRequest, session: DbSession) -> CreateMcpInstanceResponse:
    associated_mcp_template: db_model.MCPTemplate = (
        session.query(db_model.MCPTemplate).filter_by(id=request.mcp_template_id).first()
    )
    if not associated_mcp_template:
        raise ValueError(f"MCP Template with id {request.mcp_template_id} not found")

    workflow_obj = session.query(db_model.Workflow).filter_by(id=request.workflow_id).first()
    if not workflow_obj:
        raise ValueError(f"Workflow with id {request.workflow_id} not found")

    instance_uuid = str(uuid4())
    mcp_instance_name = request.name or (associated_mcp_template.name if associated_mcp_template else "MCP Instance")

    # Validate instance name if provided
    if request.name and not re.match(r"^[a-zA-Z0-9 _-]+$", request.name):
        raise ValueError("MCP instance name must only contain alphabets, numbers, spaces, underscores, and hyphens.")

    activated_tools = list(request.activated_tools)

    # ICON HANDLING: from MCP template
    mcp_image_path = ""
    if associated_mcp_template.mcp_image_path:
        _, ext = os.path.splitext(associated_mcp_template.mcp_image_path)
        os.makedirs(consts.MCP_INSTANCE_ICONS_LOCATION, exist_ok=True)
        mcp_image_path = os.path.join(consts.MCP_INSTANCE_ICONS_LOCATION, f"{instance_uuid}_icon{ext}")
        shutil.copy(associated_mcp_template.mcp_image_path, mcp_image_path)

    mcp_instance = db_model.MCPInstance(
        id=instance_uuid,
        workflow_id=request.workflow_id,
        name=mcp_instance_name,
        type=associated_mcp_template.type,
        args=associated_mcp_template.args,
        env_names=associated_mcp_template.env_names,
        activated_tools=activated_tools,
        status=consts.MCPStatus.VALIDATING.value,
        mcp_image_path=mcp_image_path,
    )
    session.add(mcp_instance)

    return CreateMcpInstanceResponse(
        mcp_instance_name=mcp_instance_name,
        mcp_instance_id=instance_uuid,
    )


def update_mcp_instance(
    request: UpdateMcpInstanceRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> UpdateMcpInstanceResponse:
    """
    Update an existing MCP instance
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _update_mcp_instance_impl(request, session)
                session.commit()
                return response
        else:
            session = preexisting_db_session
            return _update_mcp_instance_impl(request, session)
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _update_mcp_instance_impl(request: UpdateMcpInstanceRequest, session: DbSession) -> UpdateMcpInstanceResponse:
    mcp_instance = session.query(db_model.MCPInstance).filter_by(id=request.mcp_instance_id).first()
    if not mcp_instance:
        raise ValueError(f"MCP Instance with id {request.mcp_instance_id} not found")

    if request.name:
        # Validate instance name
        if not re.match(r"^[a-zA-Z0-9 _-]+$", request.name):
            raise ValueError(
                "MCP instance name must only contain alphabets, numbers, spaces, underscores, and hyphens."
            )
        mcp_instance.name = request.name
    if request.tmp_mcp_image_path:
        if not os.path.exists(request.tmp_mcp_image_path):
            raise ValueError(f"Temporary MCP image path {request.tmp_mcp_image_path} does not exist.")
        _, ext = os.path.splitext(request.tmp_mcp_image_path)
        ext = ext.lower()
        if ext not in [".png", ".jpg", ".jpeg"]:
            raise ValueError(f"Invalid MCP image extension {ext}, must be .png/.jpg/.jpeg")
        mcp_image_path = os.path.join(consts.MCP_INSTANCE_ICONS_LOCATION, f"{mcp_instance.id}_icon{ext}")
        os.makedirs(consts.MCP_INSTANCE_ICONS_LOCATION, exist_ok=True)
        shutil.copy(request.tmp_mcp_image_path, mcp_image_path)
        os.remove(request.tmp_mcp_image_path)
        mcp_instance.mcp_image_path = mcp_image_path
    new_activated_tools = list(request.activated_tools) or []
    mcp_instance.activated_tools = new_activated_tools

    return UpdateMcpInstanceResponse(
        mcp_instance_id=mcp_instance.id,
    )


def list_mcp_instances(
    request: ListMcpInstancesRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> ListMcpInstancesResponse:
    """
    List all MCP instances
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _list_mcp_instances_impl(request, session)
                return response
        else:
            session = preexisting_db_session
            return _list_mcp_instances_impl(request, session)
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _list_mcp_instances_impl(request: ListMcpInstancesRequest, session: DbSession) -> ListMcpInstancesResponse:
    mcp_instances = session.query(db_model.MCPInstance).all()
    mcp_instances_proto = [
        McpInstance(
            id=str(m.id),
            name=str(m.name),
            type=str(m.type),
            args=list(m.args),
            env_names=list(m.env_names),
            tools=json.dumps(list(m.tools or [])),
            activated_tools=list(m.activated_tools),
            status=str(m.status),
            workflow_id=str(m.workflow_id),
            image_uri=(os.path.relpath(m.mcp_image_path, consts.DYNAMIC_ASSETS_LOCATION) if m.mcp_image_path else ""),
        )
        for m in mcp_instances
    ]
    return ListMcpInstancesResponse(mcp_instances=mcp_instances_proto)


def get_mcp_instance(
    request: GetMcpInstanceRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> GetMcpInstanceResponse:
    """
    Get an MCP instance by id
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _get_mcp_instance_impl(request, session)
                return response
        else:
            session = preexisting_db_session
            return _get_mcp_instance_impl(request, session)
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _get_mcp_instance_impl(request: GetMcpInstanceRequest, session: DbSession) -> GetMcpInstanceResponse:
    mcp_instance = session.query(db_model.MCPInstance).filter_by(id=request.mcp_instance_id).first()
    if not mcp_instance:
        raise ValueError(f"MCP Instance with id {request.mcp_instance_id} not found")
    return GetMcpInstanceResponse(
        mcp_instance=McpInstance(
            id=str(mcp_instance.id),
            name=str(mcp_instance.name),
            type=str(mcp_instance.type),
            args=list(mcp_instance.args),
            env_names=list(mcp_instance.env_names),
            tools=json.dumps(list(mcp_instance.tools or [])),
            activated_tools=list(mcp_instance.activated_tools),
            status=str(mcp_instance.status),
            workflow_id=str(mcp_instance.workflow_id),
            image_uri=(
                os.path.relpath(mcp_instance.mcp_image_path, consts.DYNAMIC_ASSETS_LOCATION)
                if mcp_instance.mcp_image_path
                else ""
            ),
        )
    )


def remove_mcp_instance(
    request: RemoveMcpInstanceRequest,
    cml: CMLServiceApi,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> RemoveMcpInstanceResponse:
    """
    Remove an MCP instance by id
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _remove_mcp_instance_impl(request, session)
                session.commit()
                return response
        else:
            session = preexisting_db_session
            return _remove_mcp_instance_impl(request, session)
    except Exception as e:
        raise RuntimeError(f"An unexpected error occurred: {e}")


def _remove_mcp_instance_impl(request: RemoveMcpInstanceRequest, session: DbSession) -> RemoveMcpInstanceResponse:
    mcp_instance = session.query(db_model.MCPInstance).filter_by(id=request.mcp_instance_id).first()
    if not mcp_instance:
        raise ValueError(f"MCP Instance with id {request.mcp_instance_id} not found")
    _delete_icon_file(mcp_instance.mcp_image_path)
    session.delete(mcp_instance)
    return RemoveMcpInstanceResponse()
