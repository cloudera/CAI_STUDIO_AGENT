# No top level studio.db imports allowed to support wokrflow model deployment

from typing import List, Optional
from crewai import LLM as CrewAILLM, Agent
from crewai.tools import BaseTool

import engine.types as input_types
from engine.crewai.wrappers_smart import AgentStudioCrewAIAgent
from engine.crewai.wrappers_plain import PlainAgentStudioCrewAIAgent


def get_crewai_agent(
    agent: input_types.Input__Agent,
    crewai_tools: Optional[List[BaseTool]] = None,
    llm_model: Optional[CrewAILLM] = None,
) -> Agent:
    print(
        f"[Engine][Agents] Creating SMART agent id={agent.id} role={agent.crew_ai_role} "
        f"tools={len(crewai_tools or [])} has_llm={bool(llm_model)}"
    )
    return AgentStudioCrewAIAgent(
        agent_studio_id=agent.id,
        role=agent.crew_ai_role,
        backstory=agent.crew_ai_backstory,
        goal=agent.crew_ai_goal,
        allow_delegation=agent.crew_ai_allow_delegation,
        verbose=False,
        cache=agent.crew_ai_cache,
        max_iter=10 if agent.crew_ai_max_iter <= 0 else agent.crew_ai_max_iter,
        tools=crewai_tools or list(),
        llm=llm_model,
    )


def get_crewai_agent_plain(
    agent: input_types.Input__Agent,
    crewai_tools: Optional[List[BaseTool]] = None,
    llm_model: Optional[CrewAILLM] = None,
) -> Agent:
    print(
        f"[Engine][Agents] Creating PLAIN agent id={agent.id} role={agent.crew_ai_role} "
        f"tools={len(crewai_tools or [])} has_llm={bool(llm_model)}"
    )
    return PlainAgentStudioCrewAIAgent(
        agent_studio_id=agent.id,
        role=agent.crew_ai_role,
        backstory=agent.crew_ai_backstory,
        goal=agent.crew_ai_goal,
        allow_delegation=agent.crew_ai_allow_delegation,
        verbose=False,
        cache=agent.crew_ai_cache,
        max_iter=10 if agent.crew_ai_max_iter <= 0 else agent.crew_ai_max_iter,
        tools=crewai_tools or list(),
        llm=llm_model,
    )
