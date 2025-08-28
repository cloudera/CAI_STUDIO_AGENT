from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal, Dict
from enum import Enum
from crewai import Agent, Crew, Task, Process
from crewai.tools import BaseTool
from crewai.tools.base_tool import BaseTool
from crewai import LLM as CrewAILLM
from mcpadapt.core import MCPAdapt
from engine.consts import SupportedModelTypes


class WorkflowArtifactType(str, Enum):
    COLLATED_INPUT = "collated_input"


class DeploymentConfig(BaseModel):
    """
    Generic deployment configuration information.
    """

    generation_config: Dict = {}
    """
    Optional default generational config to use for LLM
    completions. If not specified for an Agent/LLM, an Agent Studio set of
    defaults are used for LLM completions.
    """

    tool_config: Dict[str, Dict[str, str]] = {}
    """
    """

    mcp_config: Dict[str, Dict[str, str]] = {}
    """
    MCP config dict where the key is the MCP instance ID
    and 
    """

    llm_config: Dict = {}
    """
    LLM configs containing API keys, URL bases, etc.
    """

    environment: Dict = {}
    """
    All other environment variable overrides to pass to the deployment target environment.
    """


class Input__LanguageModelConfig(BaseModel):
    provider_model: str
    model_type: SupportedModelTypes
    api_base: Optional[str] = None
    api_key: Optional[str] = None
    extra_headers: Optional[Dict[str, str]] = None
    # AWS Bedrock specific fields
    aws_region_name: Optional[str] = None
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_session_token: Optional[str] = None


class Input__LanguageModel(BaseModel):
    model_id: str
    model_name: str
    generation_config: Dict


class Input__ToolInstance(BaseModel):
    id: str
    name: str
    python_code_file_name: str
    python_requirements_file_name: str
    source_folder_path: str
    tool_metadata: str
    tool_image_uri: Optional[str] = None
    is_venv_tool: Optional[bool] = False


class Input__MCPInstance(BaseModel):
    id: str
    name: str
    type: str
    args: List[str]
    env_names: List[str]
    tools: Optional[List[str]] = None
    mcp_image_uri: Optional[str] = None


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
    mcp_instance_ids: List[str]
    agent_image_uri: Optional[str] = None


class Input__Workflow(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
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
    mcp_instances: List[Input__MCPInstance]
    agents: List[Input__Agent]
    tasks: List[Input__Task]
    workflow: Input__Workflow


class MCPObjects(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    local_session: MCPAdapt
    tools: List[BaseTool]


class CrewAIObjects(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    language_models: Dict[str, CrewAILLM]
    tools: Dict[str, BaseTool]
    mcps: Dict[str, MCPObjects]
    agents: Dict[str, Agent]
    tasks: Dict[str, Task]
    crews: Dict[str, Crew]


class DeployedWorkflowActions(str, Enum):
    KICKOFF = "kickoff"
    GET_CONFIGURATION = "get-configuration"
    GET_ASSET_DATA = "get-asset-data"
    GET_MCP_TOOL_DEFINITIONS = "get-mcp-tool-definitions"


class ServeWorkflowParameters(BaseModel):
    action_type: DeployedWorkflowActions
    kickoff_inputs: Optional[str] = None
    get_asset_data_inputs: List[str] = list()
