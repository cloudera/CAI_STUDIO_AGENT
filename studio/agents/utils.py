import os
import shutil
from typing import List
from uuid import uuid4
from crewai import Agent as CrewAIAgent
from crewai.tools import tool, BaseTool

from studio.db import model as db_model, DbSession
import studio.tools.utils as tool_utils
import studio.as_mcp.utils as mcp_utils
import studio.models.utils as model_utils
import studio.consts as consts


def get_crewai_agent_instance(agent_id: str, preexisting_db_session: DbSession = None) -> CrewAIAgent:
    """
    Get a CrewAI agent instance from a database agent model.
    """
    session = preexisting_db_session

    agent_model = session.query(db_model.Agent).filter_by(id=agent_id).one_or_none()
    if not agent_model:
        raise ValueError(f"Agent with ID '{agent_id}' not found.")
    tool_instance_ids = agent_model.tool_ids or []
    crewai_tools: List[BaseTool] = list()
    for t_id in tool_instance_ids:
        tool_proxy_callable = tool_utils.get_tool_instance_proxy(
            t_id, dao=dao, preexisting_db_session=preexisting_db_session
        )
        crewai_tools.append(tool(tool_proxy_callable))
    crewai_llm = model_utils.get_crewai_llm_object(
        agent_model.llm_provider_model_id, dao=dao, preexisting_db_session=preexisting_db_session
    )
    agent = CrewAIAgent(
        role=agent_model.crew_ai_role,
        backstory=agent_model.crew_ai_backstory,
        goal=agent_model.crew_ai_goal,
        allow_delegation=agent_model.crew_ai_allow_delegation,
        verbose=agent_model.crew_ai_verbose,
        cache=agent_model.crew_ai_cache,
        max_iter=agent_model.crew_ai_max_iter,
        tools=crewai_tools or None,
        llm=crewai_llm,
    )

    return agent


def clone_agent(agent_id: str, target_workflow_id: str, db_session: DbSession) -> str:
    workflow_obj = db_session.query(db_model.Workflow).filter_by(id=target_workflow_id).first()
    if not workflow_obj:
        raise ValueError(f"Workflow with id {target_workflow_id} not found")

    original_agent = db_session.query(db_model.Agent).filter_by(id=agent_id).first()
    if not original_agent:
        raise ValueError(f"Agent with id {agent_id} not found")

    new_agent_id = str(uuid4())
    new_agent_name = original_agent.name

    # Clone tool instances
    new_tool_instance_ids = []
    for tool_instance_id in original_agent.tool_ids or []:
        try:
            new_tool_id = tool_utils.clone_tool_instance(tool_instance_id, target_workflow_id, db_session)
            new_tool_instance_ids.append(new_tool_id)
        except Exception as e:
            # Log the error but continue processing other tools
            print(f"Warning: Unable to clone tool instance '{tool_instance_id}': {str(e)}. Skipping this tool.")
            continue

    # Clone MCP instances
    new_mcp_instance_ids = []
    for mcp_instance_id in original_agent.mcp_instance_ids or []:
        try:
            new_mcp_id = mcp_utils.clone_mcp_instance(mcp_instance_id, target_workflow_id, db_session)
            new_mcp_instance_ids.append(new_mcp_id)
        except Exception as e:
            # Log the error but continue processing other MCP instances
            print(f"Warning: Unable to clone MCP instance '{mcp_instance_id}': {str(e)}. Skipping this MCP instance.")
            continue

    # Handle agent image cloning
    new_agent_image_path = ""
    if original_agent.agent_image_path:
        _, ext = os.path.splitext(original_agent.agent_image_path)
        os.makedirs(consts.AGENT_ICONS_LOCATION, exist_ok=True)
        new_agent_image_path = os.path.join(consts.AGENT_ICONS_LOCATION, f"{new_agent_id}_icon{ext}")
        shutil.copy(original_agent.agent_image_path, new_agent_image_path)

    new_agent = db_model.Agent(
        id=new_agent_id,
        workflow_id=target_workflow_id,
        name=new_agent_name,
        llm_provider_model_id=original_agent.llm_provider_model_id,
        tool_ids=new_tool_instance_ids,
        mcp_instance_ids=new_mcp_instance_ids,
        crew_ai_role=original_agent.crew_ai_role,
        crew_ai_backstory=original_agent.crew_ai_backstory,
        crew_ai_goal=original_agent.crew_ai_goal,
        crew_ai_allow_delegation=original_agent.crew_ai_allow_delegation,
        crew_ai_verbose=original_agent.crew_ai_verbose,
        crew_ai_cache=original_agent.crew_ai_cache,
        crew_ai_temperature=original_agent.crew_ai_temperature,
        crew_ai_max_iter=original_agent.crew_ai_max_iter,
        agent_image_path=new_agent_image_path,
    )

    # Add to session and commit
    db_session.add(new_agent)
    db_session.commit()

    return new_agent_id
