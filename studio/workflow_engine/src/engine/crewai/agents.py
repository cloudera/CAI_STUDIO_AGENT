# No top level studio.db imports allowed to support wokrflow model deployment

from typing import List, Optional
from crewai import LLM as CrewAILLM, Agent
from crewai.tools import BaseTool

import engine.types as input_types
from engine.crewai.wrappers import AgentStudioCrewAIAgent


def get_crewai_agent(
    agent: input_types.Input__Agent,
    crewai_tools: Optional[List[BaseTool]] = None,
    llm_model: Optional[CrewAILLM] = None,
) -> Agent:
    return AgentStudioCrewAIAgent(
        agent_studio_id=agent.id,
        role=agent.crew_ai_role,
        backstory=agent.crew_ai_backstory,
        goal=agent.crew_ai_goal,
        allow_delegation=agent.crew_ai_allow_delegation,
        verbose=agent.crew_ai_verbose,
        cache=agent.crew_ai_cache,
        max_iter=10 if agent.crew_ai_max_iter <= 0 else agent.crew_ai_max_iter,
        tools=crewai_tools or list(),
        llm=llm_model,
    )
