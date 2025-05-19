import re
from uuid import uuid4
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.api import *
from studio.cross_cutting.global_thread_pool import get_thread_pool
import studio.consts as consts
import studio.as_mcp.utils as mcp_utils
from cmlapi import CMLServiceApi
import json


def add_mcp_template(request: AddMcpTemplateRequest, cml: CMLServiceApi, dao: AgentStudioDao) -> AddMcpTemplateResponse:
    """
    Add a new MCP template to the database.
    """
    mcp_uuid = str(uuid4())

    # Validations
    # Validate tool template name
    if not re.match(r"^[a-zA-Z0-9 ]+$", request.name):
        raise ValueError(
            "MCP name must only contain alphabets, numbers, and spaces, and must not contain special characters."
        )
    # Validate tool template type
    if request.type not in [t.value for t in consts.SupportedMCPTypes]:
        raise ValueError(
            "MCP type must be one of the following: " + ", ".join([t.value for t in consts.SupportedMCPTypes])
        )

    with dao.get_session() as session:
        mcp_db_object = db_model.MCPTemplate(
            id=mcp_uuid,
            name=request.name,
            type=request.type,
            args=list(request.args),
            env_names=list(request.env_names),
            mcp_image_path="",
            status=consts.MCPStatus.VALIDATING.value,
        )
        session.add(mcp_db_object)
        session.commit()

    get_thread_pool().submit(
        mcp_utils._update_mcp_tools,
        mcp_uuid,
        db_model.MCPTemplate,
    )

    return AddMcpTemplateResponse(mcp_template_id=mcp_uuid)


def update_mcp_template(
    request: UpdateMcpTemplateRequest, cml: CMLServiceApi, dao: AgentStudioDao
) -> UpdateMcpTemplateResponse:
    pass


def list_mcp_templates(
    request: ListMcpTemplatesRequest, cml: CMLServiceApi, dao: AgentStudioDao
) -> ListMcpTemplatesResponse:
    with dao.get_session() as session:
        mcp_templates = session.query(db_model.MCPTemplate).all()
        return ListMcpTemplatesResponse(
            mcp_templates=[
                MCPTemplate(
                    id=_t.id,
                    name=_t.name,
                    type=_t.type,
                    args=list(_t.args),
                    env_names=list(_t.env_names),
                    tools=json.dumps(_t.tools),
                    image_uri="",
                    status=_t.status,
                )
                for _t in mcp_templates
            ]
        )


def get_mcp_template(request: GetMcpTemplateRequest, cml: CMLServiceApi, dao: AgentStudioDao) -> GetMcpTemplateResponse:
    with dao.get_session() as session:
        mcp_template = (
            session.query(db_model.MCPTemplate).filter(db_model.MCPTemplate.id == request.mcp_template_id).first()
        )
        if not mcp_template:
            raise ValueError(f"MCP template with id {request.mcp_template_id} not found")
        return GetMcpTemplateResponse(
            mcp_template=MCPTemplate(
                id=mcp_template.id,
                name=mcp_template.name,
                type=mcp_template.type,
                args=list(mcp_template.args),
                env_names=list(mcp_template.env_names),
                tools=json.dumps(mcp_template.tools),
                image_uri="",
                status=mcp_template.status,
            )
        )


def remove_mcp_template(
    request: RemoveMcpTemplateRequest, cml: CMLServiceApi, dao: AgentStudioDao
) -> RemoveMcpTemplateResponse:
    with dao.get_session() as session:
        mcp_template = (
            session.query(db_model.MCPTemplate).filter(db_model.MCPTemplate.id == request.mcp_template_id).first()
        )
        if not mcp_template:
            raise ValueError(f"MCP template with id {request.mcp_template_id} not found")
        session.delete(mcp_template)
        session.commit()
    return RemoveMcpTemplateResponse()
