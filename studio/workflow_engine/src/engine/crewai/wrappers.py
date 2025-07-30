from typing import Optional


from crewai import Agent, Task, LLM
from crewai.tools import BaseTool


class AgentStudioCrewAILLM(LLM):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id


class AgentStudioCrewAIAgent(Agent):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id


class AgentStudioCrewAITask(Task):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id


class AgentStudioCrewAITool(BaseTool):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
