from typing import List
from uuid import uuid4
from google.protobuf.json_format import MessageToDict
import os
import shutil

from cmlapi import CMLServiceApi

from studio.db.dao import AgentStudioDao
from studio.api import *
from studio.db import model as db_model
from studio.proto.utils import is_field_set
from studio import consts


def list_agent_templates(
    request: ListAgentTemplatesRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> ListAgentTemplatesResponse:
    with dao.get_session() as session:
        agent_templates: List[db_model.AgentTemplate] = session.query(db_model.AgentTemplate).all()

        # Filter by specific agent template
        if is_field_set(request, "workflow_template_id"):
            agent_templates = list(
                filter(lambda x: x.workflow_template_id == request.workflow_template_id, agent_templates)
            )

        return ListAgentTemplatesResponse(
            agent_templates=[agent_template.to_protobuf() for agent_template in agent_templates]
        )


def get_agent_template(
    request: GetAgentTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> GetAgentTemplateResponse:
    with dao.get_session() as session:
        agent_template: db_model.AgentTemplate = (
            session.query(db_model.AgentTemplate).filter_by(id=request.id).one_or_none()
        )
        return GetAgentTemplateResponse(agent_template=agent_template.to_protobuf())


def add_agent_template(
    request: AddAgentTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> AddAgentTemplateResponse:
    new_agent_template_id = str(uuid4())
    try:
        with dao.get_session() as session:
            # Handle agent template image
            agent_image_path = ""
            if request.tmp_agent_image_path:
                if not os.path.exists(request.tmp_agent_image_path):
                    raise ValueError(f"Agent image path '{request.tmp_agent_image_path}' does not exist.")
                _, ext = os.path.splitext(request.tmp_agent_image_path)
                ext = ext.lower()
                if ext not in [".png", ".jpg", ".jpeg"]:
                    raise ValueError(f"Agent image must be PNG, JPG or JPEG format. Got: {ext}")
                os.makedirs(consts.AGENT_TEMPLATE_ICONS_LOCATION, exist_ok=True)
                agent_image_path = os.path.join(
                    consts.AGENT_TEMPLATE_ICONS_LOCATION, f"{new_agent_template_id}_icon{ext}"
                )
                shutil.copy(request.tmp_agent_image_path, agent_image_path)
                os.remove(request.tmp_agent_image_path)

            agent_template_dict = {"id": new_agent_template_id, "agent_image_path": agent_image_path}
            agent_template_dict.update(MessageToDict(request, preserving_proto_field_name=True))
            agent_template_dict.pop("tmp_agent_image_path", None)
            agent_template: db_model.AgentTemplate = db_model.AgentTemplate.from_dict(agent_template_dict)
            session.add(agent_template)
            return AddAgentTemplateResponse(id=agent_template.id)
    except Exception as e:
        raise ValueError(f"Failed to add agent template: {e}")


def update_agent_template(
    request: UpdateAgentTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> UpdateAgentTemplateResponse:
    try:
        with dao.get_session() as session:
            agent_template = session.query(db_model.AgentTemplate).filter_by(id=request.agent_template_id).one_or_none()
            if not agent_template:
                raise ValueError(f"Agent template with id {request.id} not found")
            if agent_template.pre_packaged:
                raise ValueError("Cannot update pre-packaged agent templates")

            # Handle agent template image update
            if request.tmp_agent_image_path:
                if not os.path.exists(request.tmp_agent_image_path):
                    raise ValueError(f"Agent image path '{request.tmp_agent_image_path}' does not exist.")
                _, ext = os.path.splitext(request.tmp_agent_image_path)
                ext = ext.lower()
                if ext not in [".png", ".jpg", ".jpeg"]:
                    raise ValueError(f"Agent image must be PNG, JPG or JPEG format. Got: {ext}")

                # Remove old image if it exists
                if agent_template.agent_image_path and os.path.exists(agent_template.agent_image_path):
                    os.remove(agent_template.agent_image_path)

                os.makedirs(consts.AGENT_TEMPLATE_ICONS_LOCATION, exist_ok=True)
                agent_image_path = os.path.join(consts.AGENT_TEMPLATE_ICONS_LOCATION, f"{agent_template.id}_icon{ext}")
                shutil.copy(request.tmp_agent_image_path, agent_image_path)
                os.remove(request.tmp_agent_image_path)
                agent_template.agent_image_path = agent_image_path

            agent_template_dict = MessageToDict(
                request, preserving_proto_field_name=True, always_print_fields_with_no_presence=True
            )
            agent_template_dict.pop("agent_template_id", None)
            agent_template_dict.pop("tmp_agent_image_path", None)
            for key, value in agent_template_dict.items():
                if hasattr(agent_template, key) and value is not None:
                    setattr(agent_template, key, value)

            session.commit()
            return UpdateAgentTemplateResponse(id=agent_template.id)
    except Exception as e:
        raise ValueError(f"Failed to update agent template: {e}")


def remove_agent_template(
    request: RemoveAgentTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> RemoveAgentTemplateResponse:
    try:
        with dao.get_session() as session:
            agent_template = session.query(db_model.AgentTemplate).filter_by(id=request.id).one_or_none()
            if not agent_template:
                raise ValueError(f"Agent template with id {request.id} not found")
            if agent_template.pre_packaged:
                raise ValueError("Cannot remove pre-packaged agent templates")

            # Remove agent template image if it exists
            if agent_template.agent_image_path and os.path.exists(agent_template.agent_image_path):
                try:
                    os.remove(agent_template.agent_image_path)
                except Exception as e:
                    print(f"Failed to delete agent template image: {e}")

            session.delete(agent_template)
            return RemoveAgentTemplateResponse()
    except Exception as e:
        raise ValueError(f"Failed to remove agent template: {e}")
