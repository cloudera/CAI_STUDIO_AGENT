# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Dict
from crewai import Crew, Agent
from crewai.tools import BaseTool

import engine.types as input_types
from engine.crewai.llms import get_crewai_llm
from engine.crewai.tools import get_crewai_tool
from engine.crewai.mcp import get_mcp_tools
from engine.crewai.agents import get_crewai_agent
from engine.crewai.wrappers import *


def create_crewai_objects(
    workflow_directory: str,
    collated_input: input_types.CollatedInput,
    tool_config: Dict[str, Dict[str, str]],
    mcp_config: Dict[str, Dict[str, str]],
    llm_config: Dict[str, Dict[str, str]],
) -> input_types.CrewAIObjects:
    language_models: Dict[str, AgentStudioCrewAILLM] = {}
    for l_ in collated_input.language_models:
        language_models[l_.model_id] = get_crewai_llm(l_, llm_config.get(l_.model_id, {}))

    tools: Dict[str, BaseTool] = {}
    for t_ in collated_input.tool_instances:
        tools[t_.id] = get_crewai_tool(t_, tool_config.get(t_.id, {}), workflow_directory)

    mcps: Dict[str, input_types.MCPObjects] = {}
    for m_ in collated_input.mcp_instances:
        mcps[m_.id] = get_mcp_tools(m_, mcp_config.get(m_.id, {}), workflow_directory)

    agents: Dict[str, AgentStudioCrewAIAgent] = {}
    for agent in collated_input.agents:
        crewai_tools = [tools[tool_id] for tool_id in agent.tool_instance_ids]
        for mcp_id in agent.mcp_instance_ids:
            crewai_tools.extend(mcps[mcp_id].tools)
        model_id = agent.llm_provider_model_id
        if not model_id:
            model_id = collated_input.default_language_model_id
        agents[agent.id] = get_crewai_agent(agent, crewai_tools, language_models[model_id])

    tasks: Dict[str, AgentStudioCrewAITask] = {}
    for task_input in collated_input.tasks:
        agent_for_task: Agent = agents[task_input.assigned_agent_id] if task_input.assigned_agent_id else None
        tasks[task_input.id] = AgentStudioCrewAITask(
            agent_studio_id=task_input.id,
            description=task_input.description,
            expected_output=task_input.expected_output,
            agent=agent_for_task,
            tools=agent_for_task.tools if agent_for_task else None,
        )

    workflow_input = collated_input.workflow
    crew = Crew(
        name=workflow_input.name,
        process=workflow_input.crew_ai_process,
        agents=[agents[agent_id] for agent_id in workflow_input.agent_ids],
        tasks=[tasks[task_id] for task_id in workflow_input.task_ids],
        manager_agent=agents[workflow_input.manager_agent_id] if workflow_input.manager_agent_id else None,
        manager_llm=language_models[workflow_input.llm_provider_model_id]
        if workflow_input.llm_provider_model_id
        else None,
        verbose=False,
    )

    return input_types.CrewAIObjects(
        language_models=language_models,
        tools=tools,
        mcps=mcps,
        agents=agents,
        tasks=tasks,
        crews={workflow_input.id: crew},
    )
