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
        if dao is not None:
            with dao.get_session() as session:
                response = _create_mcp_instance_impl(request, session)
                session.commit()
                return response
        else:
            session = preexisting_db_session
            return _create_mcp_instance_impl(request, session)

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
    activated_tools = list(request.activated_tools)
    mcp_instance = db_model.MCPInstance(
        id=instance_uuid,
        workflow_id=request.workflow_id,
        name=mcp_instance_name,
        type=associated_mcp_template.type,
        args=associated_mcp_template.args,
        env_names=associated_mcp_template.env_names,
        activated_tools=activated_tools,
        status=consts.MCPStatus.VALIDATING.value,
        mcp_image_path="",
    )
    session.add(mcp_instance)

    get_thread_pool().submit(
        mcp_utils._update_mcp_tools,
        instance_uuid,
        db_model.MCPInstance,
    )

    return CreateMcpInstanceResponse(mcp_instance_name=mcp_instance_name, mcp_instance_id=instance_uuid)


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
        mcp_instance.name = request.name
    if request.tmp_mcp_image_path:
        mcp_instance.mcp_image_path = request.tmp_mcp_image_path
    new_activated_tools = list(request.activated_tools) or []

    # Update the activated tools anyway even if the list is empty: empty list means all tools are activated
    mcp_instance.activated_tools = new_activated_tools

    return UpdateMcpInstanceResponse(mcp_instance_id=mcp_instance.id)


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
            tools=json.dumps(list(m.tools)),
            activated_tools=list(m.activated_tools),
            status=str(m.status),
            workflow_id=str(m.workflow_id),
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
            tools=json.dumps(list(mcp_instance.tools)),
            activated_tools=list(mcp_instance.activated_tools),
            status=str(mcp_instance.status),
            workflow_id=str(mcp_instance.workflow_id),
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
    session.delete(mcp_instance)
    return RemoveMcpInstanceResponse()
