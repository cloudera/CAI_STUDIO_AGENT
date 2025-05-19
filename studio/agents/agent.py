import os
import shutil
from uuid import uuid4
from typing import List, Optional
from sqlalchemy.exc import SQLAlchemyError
from studio import consts
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model, DbSession
from studio.api import *
from studio.tools.tool_instance import get_tool_instance
from studio.tools.tool_template import get_tool_template
from studio.as_mcp.mcp_instances import get_mcp_instance
from cmlapi import CMLServiceApi
from studio.workflow.utils import invalidate_workflow
from studio.proto.utils import is_field_set
from studio.tools.tool_instance import create_tool_instance, remove_tool_instance


def list_agents(
    request: ListAgentsRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> ListAgentsResponse:
    """
    List all agents with metadata.
    """
    try:
        if not request.workflow_id:
            raise ValueError("Every ListAgents request must specify a workflow ID.")

        with dao.get_session() as session:
            agents: List[db_model.Agent] = (
                session.query(db_model.Agent).filter_by(workflow_id=request.workflow_id).all()
            )
            if not agents:
                return ListAgentsResponse(agents=[])

            agent_list = []
            for agent in agents:
                # Check if llm_provider_model_id exists in models table
                is_valid = (
                    session.query(db_model.Model).filter_by(model_id=agent.llm_provider_model_id).one_or_none()
                    is not None
                )

                # Validate tools associated with the agent
                tools_valid = True
                for tool_id in agent.tool_ids or []:
                    try:
                        tool_request = GetToolInstanceRequest(tool_instance_id=tool_id)
                        tool_response = get_tool_instance(tool_request, cml, dao=None, preexisting_db_session=session)
                        tool_template_id = tool_response.tool_instance.tool_template_id
                        tool_template = get_tool_template(
                            GetToolTemplateRequest(tool_template_id=tool_template_id), cml, dao
                        ).template
                        if not tool_template.is_valid:
                            tools_valid = False
                            break
                    except Exception:
                        tools_valid = False
                        break

                # Validate MCP instances associated with the agent
                mcp_instances_valid = True  # TODO: add MCP instance validation logic

                is_valid = is_valid and tools_valid and mcp_instances_valid

                agent_image_uri = ""
                if agent.agent_image_path:
                    agent_image_uri = os.path.relpath(agent.agent_image_path, consts.DYNAMIC_ASSETS_LOCATION)

                agent_list.append(
                    AgentMetadata(
                        id=agent.id,
                        workflow_id=agent.workflow_id,
                        name=agent.name,
                        llm_provider_model_id=agent.llm_provider_model_id,
                        tools_id=agent.tool_ids or [],
                        mcp_instance_ids=agent.mcp_instance_ids or [],
                        crew_ai_agent_metadata=CrewAIAgentMetadata(
                            role=agent.crew_ai_role,
                            backstory=agent.crew_ai_backstory,
                            goal=agent.crew_ai_goal,
                            allow_delegation=agent.crew_ai_allow_delegation,
                            verbose=agent.crew_ai_verbose,
                            cache=agent.crew_ai_cache,
                            temperature=agent.crew_ai_temperature,
                            max_iter=agent.crew_ai_max_iter,
                        ),
                        agent_image_uri=agent_image_uri,
                        is_valid=is_valid,
                    )
                )

            return ListAgentsResponse(agents=agent_list)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to list agents: {str(e)}")


def get_agent(request: GetAgentRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None) -> GetAgentResponse:
    """
    Get details of a specific agent by its ID.
    """
    try:
        if not request.agent_id:
            raise ValueError("Agent ID is required.")

        with dao.get_session() as session:
            agent = session.query(db_model.Agent).filter_by(id=request.agent_id).one_or_none()
            if not agent:
                raise ValueError(f"Agent with ID '{request.agent_id}' not found.")

            # Check if llm_provider_model_id exists in models table
            is_valid = (
                session.query(db_model.Model).filter_by(model_id=agent.llm_provider_model_id).one_or_none() is not None
            )

            # Validate tools associated with the agent
            tools_valid = True
            for tool_id in agent.tool_ids or []:
                try:
                    tool_request = GetToolInstanceRequest(tool_instance_id=tool_id)
                    tool_response = get_tool_instance(tool_request, cml, dao=None, preexisting_db_session=session)
                    tool_template_id = tool_response.tool_instance.tool_template_id
                    tool_template = get_tool_template(
                        GetToolTemplateRequest(tool_template_id=tool_template_id), cml, dao
                    ).template
                    if not tool_template.is_valid:
                        tools_valid = False
                        break
                except Exception:
                    tools_valid = False
                    break

            # Validate MCP instances associated with the agent
            mcp_instances_valid = True  # TODO: add MCP instance validation logic

            is_valid = is_valid and tools_valid and mcp_instances_valid

            agent_image_uri = ""
            if agent.agent_image_path:
                agent_image_uri = os.path.relpath(agent.agent_image_path, consts.DYNAMIC_ASSETS_LOCATION)

            agent_metadata = AgentMetadata(
                id=agent.id,
                workflow_id=agent.workflow_id,
                name=agent.name,
                llm_provider_model_id=agent.llm_provider_model_id,
                tools_id=agent.tool_ids or [],
                mcp_instance_ids=agent.mcp_instance_ids or [],
                crew_ai_agent_metadata=CrewAIAgentMetadata(
                    role=agent.crew_ai_role,
                    backstory=agent.crew_ai_backstory,
                    goal=agent.crew_ai_goal,
                    allow_delegation=agent.crew_ai_allow_delegation,
                    verbose=agent.crew_ai_verbose,
                    cache=agent.crew_ai_cache,
                    temperature=agent.crew_ai_temperature,
                    max_iter=agent.crew_ai_max_iter,
                ),
                agent_image_uri=agent_image_uri,
                is_valid=is_valid,
            )
            return GetAgentResponse(agent=agent_metadata)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to get agent: {str(e)}")


def _add_agent_from_template(
    request: AddAgentRequest, cml: CMLServiceApi = None, db_session: DbSession = None
) -> AddAgentResponse:
    """
    Add a new agent based on the request parameters.
    """
    new_agent_id = str(uuid4())
    agent_template: db_model.AgentTemplate = (
        db_session.query(db_model.AgentTemplate).filter_by(id=request.template_id).one_or_none()
    )
    if not agent_template:
        raise ValueError(f"Agent template with ID '{request.template_id}' not found.")

    tool_instance_ids: list[str] = []
    for tool_template_id in list(agent_template.tool_template_ids or []):
        tool_template: db_model.ToolTemplate = (
            db_session.query(db_model.ToolTemplate).filter_by(id=tool_template_id).one()
        )
        if not tool_template:
            raise ValueError(f"Tool template with ID '{tool_template_id}' not found.")
        response: CreateToolInstanceResponse = create_tool_instance(
            CreateToolInstanceRequest(
                workflow_id=request.workflow_id, name=tool_template.name, tool_template_id=tool_template.id
            ),
            cml=cml,
            dao=None,
            preexisting_db_session=db_session,
        )
        tool_instance_ids.append(response.tool_instance_id)

    # copy image
    new_agent_image_path = ""
    if agent_template.agent_image_path:
        os.makedirs(consts.AGENT_ICONS_LOCATION, exist_ok=True)
        new_agent_image_path = os.path.join(consts.AGENT_ICONS_LOCATION, f"{new_agent_id}_icon.png")
        shutil.copy(agent_template.agent_image_path, new_agent_image_path)

    agent = db_model.Agent(
        id=new_agent_id,
        workflow_id=request.workflow_id,
        name=request.name or agent_template.name,
        llm_provider_model_id=request.llm_provider_model_id,
        tool_ids=tool_instance_ids,
        mcp_instance_ids=list(),  # TODO: add MCP instance IDs when they are incorporated into the agent template
        crew_ai_role=agent_template.role,
        crew_ai_backstory=agent_template.backstory,
        crew_ai_goal=agent_template.goal,
        crew_ai_allow_delegation=agent_template.allow_delegation,
        crew_ai_verbose=agent_template.verbose,
        crew_ai_cache=agent_template.cache,
        crew_ai_temperature=agent_template.temperature,
        crew_ai_max_iter=agent_template.max_iter,
        agent_image_path=new_agent_image_path,
    )
    db_session.add(agent)

    return AddAgentResponse(agent_id=new_agent_id)


def _add_agent_impl(request: AddAgentRequest, cml: CMLServiceApi, session: DbSession) -> AddAgentResponse:
    """
    Add a new agent based on the request parameters.
    """
    new_agent_id = str(uuid4())
    try:
        # Fetch default LLM model if llm_provider_model_id is not provided or is empty
        llm_provider_model_id = request.llm_provider_model_id

        # Validate if llm_provider_model_id exists
        if llm_provider_model_id:
            if not session.query(db_model.Model).filter_by(model_id=llm_provider_model_id).one_or_none():
                raise ValueError(f"Model with ID '{llm_provider_model_id}' does not exist.")

        if request.template_id:
            return _add_agent_from_template(request, cml, session)

        if not request.name:
            raise ValueError("Agent name is required.")

        tool_instance_ids = []
        # If we have tool templates, create tool instances from these templates
        if request.tool_template_ids:
            for tool_template_id in list(request.tool_template_ids):
                tool_template: db_model.ToolTemplate = (
                    session.query(db_model.ToolTemplate).filter_by(id=tool_template_id).one()
                )
                response: CreateToolInstanceResponse = create_tool_instance(
                    CreateToolInstanceRequest(
                        workflow_id=request.workflow_id, name=tool_template.name, tool_template_id=tool_template_id
                    ),
                    cml=cml,
                    dao=None,
                    preexisting_db_session=session,
                )
                tool_instance_ids.append(response.tool_instance_id)
        # If we have tool instance IDs, validate them
        elif request.tools_id:
            tools_ids = list(request.tools_id)
            for tool_id in tools_ids:
                try:
                    tool_request = GetToolInstanceRequest(tool_instance_id=tool_id)
                    tool_response = get_tool_instance(tool_request, cml, dao=None, preexisting_db_session=session)
                    # Only add valid tools to the list
                    tool_instance_ids.append(tool_id)
                except Exception as e:
                    # Log the error but continue processing other tools
                    print(f"Warning: Unable to validate tool ID '{tool_id}': {str(e)}. Skipping this tool.")
                    continue

        mcp_instance_ids = []
        if request.mcp_instance_ids:
            for m_id in list(request.mcp_instance_ids):
                try:
                    mcp_response = get_mcp_instance(
                        GetMcpInstanceRequest(mcp_instance_id=m_id), cml, dao=None, preexisting_db_session=session
                    )
                    mcp_instance_ids.append(m_id)
                except Exception as e:
                    # log the error but continue processing other MCP instances
                    print(
                        f"Warning: Unable to validate MCP instance ID '{m_id}': {str(e)}. Skipping this MCP instance."
                    )
                    continue

        # Handle agent image
        agent_image_path = ""
        if request.tmp_agent_image_path:
            if not os.path.exists(request.tmp_agent_image_path):
                raise ValueError(f"Agent image path '{request.tmp_agent_image_path}' does not exist.")
            _, ext = os.path.splitext(request.tmp_agent_image_path)
            ext = ext.lower()
            if ext not in [".png", ".jpg", ".jpeg"]:
                raise ValueError(f"Agent image must be PNG, JPG or JPEG format. Got: {ext}")
            os.makedirs(consts.AGENT_ICONS_LOCATION, exist_ok=True)
            agent_image_path = os.path.join(consts.AGENT_ICONS_LOCATION, f"{new_agent_id}_icon{ext}")
            shutil.copy(request.tmp_agent_image_path, agent_image_path)
            os.remove(request.tmp_agent_image_path)

        # Create a new agent
        agent = db_model.Agent(
            id=new_agent_id,
            workflow_id=request.workflow_id,
            name=request.name,
            llm_provider_model_id=llm_provider_model_id,
            tool_ids=tool_instance_ids,
            mcp_instance_ids=mcp_instance_ids,
            crew_ai_role=request.crew_ai_agent_metadata.role,
            crew_ai_backstory=request.crew_ai_agent_metadata.backstory,
            crew_ai_goal=request.crew_ai_agent_metadata.goal,
            crew_ai_allow_delegation=request.crew_ai_agent_metadata.allow_delegation,
            crew_ai_verbose=request.crew_ai_agent_metadata.verbose,
            crew_ai_cache=request.crew_ai_agent_metadata.cache,
            crew_ai_temperature=request.crew_ai_agent_metadata.temperature,
            crew_ai_max_iter=request.crew_ai_agent_metadata.max_iter,
            agent_image_path=agent_image_path,
        )
        session.add(agent)

        return AddAgentResponse(agent_id=new_agent_id)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to add agent: {str(e)}")


def add_agent(
    request: AddAgentRequest,
    cml: CMLServiceApi = None,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> AddAgentResponse:
    """
    Add a new agent based on the request parameters.
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _add_agent_impl(request, cml, session)
                session.commit()
                return response
        else:
            session = preexisting_db_session
            return _add_agent_impl(request, cml, session)
    except Exception as e:
        raise RuntimeError(f"Unexpected error occurred: {str(e)}")


def _update_agent_impl(request: UpdateAgentRequest, cml: CMLServiceApi, session: DbSession) -> UpdateAgentResponse:
    """
    Update the configuration of an existing agent.
    """
    try:
        if not request.agent_id:
            raise ValueError("Agent ID is required.")

        agent = session.query(db_model.Agent).filter_by(id=request.agent_id).one_or_none()
        if not agent:
            raise ValueError(f"Agent with ID '{request.agent_id}' not found.")

        # Validate if llm_provider_model_id exists
        if request.llm_provider_model_id:
            if not session.query(db_model.Model).filter_by(model_id=request.llm_provider_model_id).one_or_none():
                raise ValueError(f"Model with ID '{request.llm_provider_model_id}' does not exist.")
            agent.llm_provider_model_id = request.llm_provider_model_id

        # Handle tool updates
        if is_field_set(request, "tool_template_ids") and request.tool_template_ids:
            # Remove existing tool instances
            for existing_tool_instance_id in list(agent.tool_ids):
                remove_tool_instance(
                    RemoveToolInstanceRequest(tool_instance_id=existing_tool_instance_id),
                    cml=cml,
                    delete_tool_directory=True,
                    dao=None,
                    preexisting_db_session=session,
                )
            # Create new tool instances from templates
            tool_instance_ids = []
            for tool_template_id in list(request.tool_template_ids):
                tool_template: db_model.ToolTemplate = (
                    session.query(db_model.ToolTemplate).filter_by(id=tool_template_id).one()
                )
                response: CreateToolInstanceResponse = create_tool_instance(
                    CreateToolInstanceRequest(
                        workflow_id=agent.workflow_id, name=tool_template.name, tool_template_id=tool_template_id
                    ),
                    cml=cml,
                    dao=None,
                    preexisting_db_session=session,
                )
                tool_instance_ids.append(response.tool_instance_id)
            agent.tool_ids = tool_instance_ids
        # Handle tool instance updates
        elif request.tools_id is not None:  # Handle empty lists explicitly
            tools_ids = list(request.tools_id)
            validated_tool_ids = []
            for tool_id in tools_ids:
                try:
                    tool_request = GetToolInstanceRequest(tool_instance_id=tool_id)
                    tool_response = get_tool_instance(tool_request, cml, dao=None, preexisting_db_session=session)
                    # Add to validated list if tool exists
                    validated_tool_ids.append(tool_id)
                except Exception as e:
                    # Log the error but continue processing other tools
                    print(f"Warning: Unable to validate tool ID '{tool_id}': {str(e)}. Skipping this tool.")
                    continue
            agent.tool_ids = validated_tool_ids

        if request.mcp_instance_ids is not None:
            validated_mcp_instance_ids = []
            for m_id in list(request.mcp_instance_ids):
                try:
                    mcp_response = get_mcp_instance(
                        GetMcpInstanceRequest(mcp_instance_id=m_id), cml, dao=None, preexisting_db_session=session
                    )
                    validated_mcp_instance_ids.append(m_id)
                except Exception as e:
                    print(
                        f"Warning: Unable to validate MCP instance ID '{m_id}': {str(e)}. Skipping this MCP instance."
                    )
                    continue
            agent.mcp_instance_ids = validated_mcp_instance_ids

        # Handle agent image update
        if request.tmp_agent_image_path:
            if not os.path.exists(request.tmp_agent_image_path):
                raise ValueError(f"Agent image path '{request.tmp_agent_image_path}' does not exist.")
            _, ext = os.path.splitext(request.tmp_agent_image_path)
            ext = ext.lower()
            if ext not in [".png", ".jpg", ".jpeg"]:
                raise ValueError(f"Agent image must be PNG, JPG or JPEG format. Got: {ext}")

            # Remove old image if it exists
            if agent.agent_image_path and os.path.exists(agent.agent_image_path):
                os.remove(agent.agent_image_path)

            os.makedirs(consts.AGENT_ICONS_LOCATION, exist_ok=True)
            agent_image_path = os.path.join(consts.AGENT_ICONS_LOCATION, f"{agent.id}_icon{ext}")
            shutil.copy(request.tmp_agent_image_path, agent_image_path)
            os.remove(request.tmp_agent_image_path)
            agent.agent_image_path = agent_image_path

        # Update other fields only if provided in the request
        if request.name:
            agent.name = request.name
        if request.crew_ai_agent_metadata:
            metadata = request.crew_ai_agent_metadata
            if metadata.role:
                agent.crew_ai_role = metadata.role
            if metadata.backstory:
                agent.crew_ai_backstory = metadata.backstory
            if metadata.goal:
                agent.crew_ai_goal = metadata.goal
            if metadata.allow_delegation is not None:
                agent.crew_ai_allow_delegation = metadata.allow_delegation
            if metadata.verbose is not None:
                agent.crew_ai_verbose = metadata.verbose
            if metadata.cache is not None:
                agent.crew_ai_cache = metadata.cache
            if metadata.temperature is not None:
                agent.crew_ai_temperature = metadata.temperature
            if metadata.max_iter is not None:
                agent.crew_ai_max_iter = metadata.max_iter

        invalidate_workflow(session, db_model.Workflow.crew_ai_agents.contains([agent.id]))

        return UpdateAgentResponse()
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to update agent: {str(e)}")


def update_agent(
    request: UpdateAgentRequest,
    cml: CMLServiceApi = None,
    dao: Optional[AgentStudioDao] = None,
    preexisting_db_session: Optional[DbSession] = None,
) -> UpdateAgentResponse:
    """
    Update the configuration of an existing agent.
    """
    try:
        if dao is not None:
            with dao.get_session() as session:
                response = _update_agent_impl(request, cml, session)
                session.commit()
                return response
        else:
            session = preexisting_db_session
            return _update_agent_impl(request, cml, session)
    except Exception as e:
        raise RuntimeError(f"Unexpected error occurred: {str(e)}")


def remove_agent(
    request: RemoveAgentRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> RemoveAgentResponse:
    """
    Remove an existing agent by its ID.
    """
    try:
        if not request.agent_id:
            raise ValueError("Agent ID is required.")

        with dao.get_session() as session:
            agent = session.query(db_model.Agent).filter_by(id=request.agent_id).one_or_none()
            if not agent:
                raise ValueError(f"Agent with ID '{request.agent_id}' not found.")

            invalidate_workflow(session, db_model.Workflow.crew_ai_agents.contains([agent.id]))

            # Try to remove tool instances but continue even if they fail
            for tool_instance_id in agent.tool_ids:
                try:
                    remove_tool_instance(
                        RemoveToolInstanceRequest(tool_instance_id=tool_instance_id),
                        cml,
                        delete_tool_directory=False,
                        dao=None,
                        preexisting_db_session=session,
                    )
                except Exception as e:
                    # Log the error but continue with agent deletion
                    print(f"Failed to remove tool instance {tool_instance_id}: {str(e)}")
                    continue

            # Remove agent image if it exists
            if agent.agent_image_path and os.path.exists(agent.agent_image_path):
                try:
                    os.remove(agent.agent_image_path)
                except Exception as e:
                    print(f"Failed to delete agent image: {e}")

            session.delete(agent)
            session.commit()

        return RemoveAgentResponse()
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to remove agent: {str(e)}")
