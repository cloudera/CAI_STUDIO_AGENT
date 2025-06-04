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


class AgentStudioCrewAIMcpTool(BaseTool):
    agent_studio_id: Optional[str] = None
    _vanilla_tool_instance: Optional[BaseTool] = None

    def __init__(self, agent_studio_id: str, crewai_tool: BaseTool):
        super().__init__(**crewai_tool.model_dump())
        self.name = self.name + f"__instance_{agent_studio_id}"
        self._generate_description()
        self.agent_studio_id = agent_studio_id
        self._vanilla_tool_instance = crewai_tool

    def _run(self, *args, **kwargs):
        return self._vanilla_tool_instance._run(*args, **kwargs)
