from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal, Dict
from enum import Enum
from crewai import Agent, Crew, Task, Process
from crewai.tools import BaseTool
from crewai.tools.base_tool import BaseTool
from crewai import LLM as CrewAILLM


class Input__LanguageModelConfig(BaseModel):
    provider_model: str
    model_type: Literal["OPENAI", "OPENAI_COMPATIBLE", "AZURE_OPENAI"]
    api_base: Optional[str] = None
    api_key: Optional[str] = None


class Input__LanguageModel(BaseModel):
    model_id: str
    model_name: str
    config: Optional[Input__LanguageModelConfig] = None
    generation_config: Dict


class Input__ToolInstance(BaseModel):
    id: str
    name: str
    python_code_file_name: str
    python_requirements_file_name: str
    source_folder_path: str
    tool_image_uri: Optional[str] = None
    is_venv_tool: Optional[bool] = False


class Input__Task(BaseModel):
    id: str
    description: Optional[str] = ""
    expected_output: Optional[str] = ""
    assigned_agent_id: Optional[str] = None


class Input__Agent(BaseModel):
    id: str
    name: str
    llm_provider_model_id: Optional[str] = None
    crew_ai_role: str
    crew_ai_backstory: str
    crew_ai_goal: str
    crew_ai_allow_delegation: Optional[bool] = True
    crew_ai_verbose: Optional[bool] = True
    crew_ai_cache: Optional[bool] = True
    crew_ai_temperature: Optional[float] = None
    crew_ai_max_iter: Optional[int] = None
    tool_instance_ids: List[str]
    agent_image_uri: Optional[str] = None


class Input__Workflow(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    deployment_id: str
    crew_ai_process: Literal[Process.sequential, Process.hierarchical]
    agent_ids: List[str] = list()
    task_ids: List[str] = list()
    manager_agent_id: Optional[str] = None
    llm_provider_model_id: Optional[str] = None
    is_conversational: bool


class CollatedInput(BaseModel):
    default_language_model_id: str
    language_models: List[Input__LanguageModel]
    tool_instances: List[Input__ToolInstance]
    agents: List[Input__Agent]
    tasks: List[Input__Task]
    workflow: Input__Workflow


class CrewAIObjects(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    language_models: Dict[str, CrewAILLM]
    tools: Dict[str, BaseTool]
    agents: Dict[str, Agent]
    tasks: Dict[str, Task]
    crews: Dict[str, Crew]


class DeployedWorkflowActions(str, Enum):
    KICKOFF = "kickoff"
    GET_CONFIGURATION = "get-configuration"
    GET_ASSET_DATA = "get-asset-data"


class ServeWorkflowParameters(BaseModel):
    action_type: DeployedWorkflowActions
    kickoff_inputs: Optional[str] = None
    get_asset_data_inputs: List[str] = list()
