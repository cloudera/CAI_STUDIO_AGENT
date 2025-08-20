from typing import Optional, List
from crewai import LLM, Agent
from crewai.tools import BaseTool


class PlainCrewAILLM(LLM):
    agent_studio_id: Optional[str] = None
    session_directory: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, session_directory: Optional[str] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
        self.session_directory = session_directory


class PlainManagerCrewAILLM(LLM):
    agent_studio_id: Optional[str] = None
    session_directory: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, session_directory: Optional[str] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
        self.session_directory = session_directory


class PlainAgentStudioCrewAIAgent(Agent):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id


