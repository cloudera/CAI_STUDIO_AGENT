from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import (
    ClassVar as _ClassVar,
    Iterable as _Iterable,
    Mapping as _Mapping,
    Optional as _Optional,
    Union as _Union,
)

DESCRIPTOR: _descriptor.FileDescriptor

class Model(_message.Message):
    __slots__ = ("model_id", "model_name", "provider_model", "model_type", "api_base", "is_studio_default")
    MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    MODEL_NAME_FIELD_NUMBER: _ClassVar[int]
    PROVIDER_MODEL_FIELD_NUMBER: _ClassVar[int]
    MODEL_TYPE_FIELD_NUMBER: _ClassVar[int]
    API_BASE_FIELD_NUMBER: _ClassVar[int]
    IS_STUDIO_DEFAULT_FIELD_NUMBER: _ClassVar[int]
    model_id: str
    model_name: str
    provider_model: str
    model_type: str
    api_base: str
    is_studio_default: bool
    def __init__(
        self,
        model_id: _Optional[str] = ...,
        model_name: _Optional[str] = ...,
        provider_model: _Optional[str] = ...,
        model_type: _Optional[str] = ...,
        api_base: _Optional[str] = ...,
        is_studio_default: bool = ...,
    ) -> None: ...

class ListModelsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListModelsResponse(_message.Message):
    __slots__ = ("model_details",)
    MODEL_DETAILS_FIELD_NUMBER: _ClassVar[int]
    model_details: _containers.RepeatedCompositeFieldContainer[Model]
    def __init__(self, model_details: _Optional[_Iterable[_Union[Model, _Mapping]]] = ...) -> None: ...

class GetModelRequest(_message.Message):
    __slots__ = ("model_id",)
    MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    model_id: str
    def __init__(self, model_id: _Optional[str] = ...) -> None: ...

class GetModelResponse(_message.Message):
    __slots__ = ("model_details",)
    MODEL_DETAILS_FIELD_NUMBER: _ClassVar[int]
    model_details: Model
    def __init__(self, model_details: _Optional[_Union[Model, _Mapping]] = ...) -> None: ...

class AddModelRequest(_message.Message):
    __slots__ = ("model_name", "provider_model", "model_type", "api_base", "api_key")
    MODEL_NAME_FIELD_NUMBER: _ClassVar[int]
    PROVIDER_MODEL_FIELD_NUMBER: _ClassVar[int]
    MODEL_TYPE_FIELD_NUMBER: _ClassVar[int]
    API_BASE_FIELD_NUMBER: _ClassVar[int]
    API_KEY_FIELD_NUMBER: _ClassVar[int]
    model_name: str
    provider_model: str
    model_type: str
    api_base: str
    api_key: str
    def __init__(
        self,
        model_name: _Optional[str] = ...,
        provider_model: _Optional[str] = ...,
        model_type: _Optional[str] = ...,
        api_base: _Optional[str] = ...,
        api_key: _Optional[str] = ...,
    ) -> None: ...

class AddModelResponse(_message.Message):
    __slots__ = ("model_id",)
    MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    model_id: str
    def __init__(self, model_id: _Optional[str] = ...) -> None: ...

class RemoveModelRequest(_message.Message):
    __slots__ = ("model_id",)
    MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    model_id: str
    def __init__(self, model_id: _Optional[str] = ...) -> None: ...

class RemoveModelResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class UpdateModelRequest(_message.Message):
    __slots__ = ("model_id", "model_name", "provider_model", "api_base", "api_key")
    MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    MODEL_NAME_FIELD_NUMBER: _ClassVar[int]
    PROVIDER_MODEL_FIELD_NUMBER: _ClassVar[int]
    API_BASE_FIELD_NUMBER: _ClassVar[int]
    API_KEY_FIELD_NUMBER: _ClassVar[int]
    model_id: str
    model_name: str
    provider_model: str
    api_base: str
    api_key: str
    def __init__(
        self,
        model_id: _Optional[str] = ...,
        model_name: _Optional[str] = ...,
        provider_model: _Optional[str] = ...,
        api_base: _Optional[str] = ...,
        api_key: _Optional[str] = ...,
    ) -> None: ...

class UpdateModelResponse(_message.Message):
    __slots__ = ("model_id",)
    MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    model_id: str
    def __init__(self, model_id: _Optional[str] = ...) -> None: ...

class TestModelRequest(_message.Message):
    __slots__ = ("model_id", "completion_role", "completion_content", "temperature", "max_tokens", "timeout")
    MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    COMPLETION_ROLE_FIELD_NUMBER: _ClassVar[int]
    COMPLETION_CONTENT_FIELD_NUMBER: _ClassVar[int]
    TEMPERATURE_FIELD_NUMBER: _ClassVar[int]
    MAX_TOKENS_FIELD_NUMBER: _ClassVar[int]
    TIMEOUT_FIELD_NUMBER: _ClassVar[int]
    model_id: str
    completion_role: str
    completion_content: str
    temperature: float
    max_tokens: int
    timeout: int
    def __init__(
        self,
        model_id: _Optional[str] = ...,
        completion_role: _Optional[str] = ...,
        completion_content: _Optional[str] = ...,
        temperature: _Optional[float] = ...,
        max_tokens: _Optional[int] = ...,
        timeout: _Optional[int] = ...,
    ) -> None: ...

class TestModelResponse(_message.Message):
    __slots__ = ("response",)
    RESPONSE_FIELD_NUMBER: _ClassVar[int]
    response: str
    def __init__(self, response: _Optional[str] = ...) -> None: ...

class SetStudioDefaultModelRequest(_message.Message):
    __slots__ = ("model_id",)
    MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    model_id: str
    def __init__(self, model_id: _Optional[str] = ...) -> None: ...

class SetStudioDefaultModelResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetStudioDefaultModelRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetStudioDefaultModelResponse(_message.Message):
    __slots__ = ("is_default_model_configured", "model_details")
    IS_DEFAULT_MODEL_CONFIGURED_FIELD_NUMBER: _ClassVar[int]
    MODEL_DETAILS_FIELD_NUMBER: _ClassVar[int]
    is_default_model_configured: bool
    model_details: Model
    def __init__(
        self, is_default_model_configured: bool = ..., model_details: _Optional[_Union[Model, _Mapping]] = ...
    ) -> None: ...

class ListToolTemplatesRequest(_message.Message):
    __slots__ = ("workflow_template_id",)
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_template_id: str
    def __init__(self, workflow_template_id: _Optional[str] = ...) -> None: ...

class ListToolTemplatesResponse(_message.Message):
    __slots__ = ("templates",)
    TEMPLATES_FIELD_NUMBER: _ClassVar[int]
    templates: _containers.RepeatedCompositeFieldContainer[ToolTemplate]
    def __init__(self, templates: _Optional[_Iterable[_Union[ToolTemplate, _Mapping]]] = ...) -> None: ...

class GetToolTemplateRequest(_message.Message):
    __slots__ = ("tool_template_id",)
    TOOL_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_template_id: str
    def __init__(self, tool_template_id: _Optional[str] = ...) -> None: ...

class GetToolTemplateResponse(_message.Message):
    __slots__ = ("template",)
    TEMPLATE_FIELD_NUMBER: _ClassVar[int]
    template: ToolTemplate
    def __init__(self, template: _Optional[_Union[ToolTemplate, _Mapping]] = ...) -> None: ...

class AddToolTemplateRequest(_message.Message):
    __slots__ = ("tool_template_name", "tmp_tool_image_path", "workflow_template_id")
    TOOL_TEMPLATE_NAME_FIELD_NUMBER: _ClassVar[int]
    TMP_TOOL_IMAGE_PATH_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_template_name: str
    tmp_tool_image_path: str
    workflow_template_id: str
    def __init__(
        self,
        tool_template_name: _Optional[str] = ...,
        tmp_tool_image_path: _Optional[str] = ...,
        workflow_template_id: _Optional[str] = ...,
    ) -> None: ...

class AddToolTemplateResponse(_message.Message):
    __slots__ = ("tool_template_id",)
    TOOL_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_template_id: str
    def __init__(self, tool_template_id: _Optional[str] = ...) -> None: ...

class UpdateToolTemplateRequest(_message.Message):
    __slots__ = ("tool_template_id", "tool_template_name", "tmp_tool_image_path")
    TOOL_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    TOOL_TEMPLATE_NAME_FIELD_NUMBER: _ClassVar[int]
    TMP_TOOL_IMAGE_PATH_FIELD_NUMBER: _ClassVar[int]
    tool_template_id: str
    tool_template_name: str
    tmp_tool_image_path: str
    def __init__(
        self,
        tool_template_id: _Optional[str] = ...,
        tool_template_name: _Optional[str] = ...,
        tmp_tool_image_path: _Optional[str] = ...,
    ) -> None: ...

class UpdateToolTemplateResponse(_message.Message):
    __slots__ = ("tool_template_id",)
    TOOL_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_template_id: str
    def __init__(self, tool_template_id: _Optional[str] = ...) -> None: ...

class RemoveToolTemplateRequest(_message.Message):
    __slots__ = ("tool_template_id",)
    TOOL_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_template_id: str
    def __init__(self, tool_template_id: _Optional[str] = ...) -> None: ...

class RemoveToolTemplateResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListToolInstancesRequest(_message.Message):
    __slots__ = ("workflow_id",)
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    def __init__(self, workflow_id: _Optional[str] = ...) -> None: ...

class ListToolInstancesResponse(_message.Message):
    __slots__ = ("tool_instances",)
    TOOL_INSTANCES_FIELD_NUMBER: _ClassVar[int]
    tool_instances: _containers.RepeatedCompositeFieldContainer[ToolInstance]
    def __init__(self, tool_instances: _Optional[_Iterable[_Union[ToolInstance, _Mapping]]] = ...) -> None: ...

class GetToolInstanceRequest(_message.Message):
    __slots__ = ("tool_instance_id",)
    TOOL_INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_instance_id: str
    def __init__(self, tool_instance_id: _Optional[str] = ...) -> None: ...

class GetToolInstanceResponse(_message.Message):
    __slots__ = ("tool_instance",)
    TOOL_INSTANCE_FIELD_NUMBER: _ClassVar[int]
    tool_instance: ToolInstance
    def __init__(self, tool_instance: _Optional[_Union[ToolInstance, _Mapping]] = ...) -> None: ...

class CreateToolInstanceRequest(_message.Message):
    __slots__ = ("workflow_id", "name", "tool_template_id")
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    TOOL_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    name: str
    tool_template_id: str
    def __init__(
        self, workflow_id: _Optional[str] = ..., name: _Optional[str] = ..., tool_template_id: _Optional[str] = ...
    ) -> None: ...

class CreateToolInstanceResponse(_message.Message):
    __slots__ = ("tool_instance_name", "tool_instance_id")
    TOOL_INSTANCE_NAME_FIELD_NUMBER: _ClassVar[int]
    TOOL_INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_instance_name: str
    tool_instance_id: str
    def __init__(self, tool_instance_name: _Optional[str] = ..., tool_instance_id: _Optional[str] = ...) -> None: ...

class UpdateToolInstanceRequest(_message.Message):
    __slots__ = ("tool_instance_id", "name", "description", "tmp_tool_image_path")
    TOOL_INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    TMP_TOOL_IMAGE_PATH_FIELD_NUMBER: _ClassVar[int]
    tool_instance_id: str
    name: str
    description: str
    tmp_tool_image_path: str
    def __init__(
        self,
        tool_instance_id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        description: _Optional[str] = ...,
        tmp_tool_image_path: _Optional[str] = ...,
    ) -> None: ...

class UpdateToolInstanceResponse(_message.Message):
    __slots__ = ("tool_instance_id",)
    TOOL_INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_instance_id: str
    def __init__(self, tool_instance_id: _Optional[str] = ...) -> None: ...

class RemoveToolInstanceRequest(_message.Message):
    __slots__ = ("tool_instance_id",)
    TOOL_INSTANCE_ID_FIELD_NUMBER: _ClassVar[int]
    tool_instance_id: str
    def __init__(self, tool_instance_id: _Optional[str] = ...) -> None: ...

class RemoveToolInstanceResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ToolTemplate(_message.Message):
    __slots__ = (
        "id",
        "name",
        "python_code",
        "python_requirements",
        "source_folder_path",
        "tool_metadata",
        "is_valid",
        "pre_built",
        "tool_image_uri",
        "tool_description",
        "workflow_template_id",
        "is_venv_tool",
    )
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    PYTHON_CODE_FIELD_NUMBER: _ClassVar[int]
    PYTHON_REQUIREMENTS_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FOLDER_PATH_FIELD_NUMBER: _ClassVar[int]
    TOOL_METADATA_FIELD_NUMBER: _ClassVar[int]
    IS_VALID_FIELD_NUMBER: _ClassVar[int]
    PRE_BUILT_FIELD_NUMBER: _ClassVar[int]
    TOOL_IMAGE_URI_FIELD_NUMBER: _ClassVar[int]
    TOOL_DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    IS_VENV_TOOL_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    python_code: str
    python_requirements: str
    source_folder_path: str
    tool_metadata: str
    is_valid: bool
    pre_built: bool
    tool_image_uri: str
    tool_description: str
    workflow_template_id: str
    is_venv_tool: bool
    def __init__(
        self,
        id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        python_code: _Optional[str] = ...,
        python_requirements: _Optional[str] = ...,
        source_folder_path: _Optional[str] = ...,
        tool_metadata: _Optional[str] = ...,
        is_valid: bool = ...,
        pre_built: bool = ...,
        tool_image_uri: _Optional[str] = ...,
        tool_description: _Optional[str] = ...,
        workflow_template_id: _Optional[str] = ...,
        is_venv_tool: bool = ...,
    ) -> None: ...

class ToolInstance(_message.Message):
    __slots__ = (
        "id",
        "name",
        "workflow_id",
        "python_code",
        "python_requirements",
        "source_folder_path",
        "tool_metadata",
        "is_valid",
        "tool_image_uri",
        "tool_description",
        "is_venv_tool",
    )
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    PYTHON_CODE_FIELD_NUMBER: _ClassVar[int]
    PYTHON_REQUIREMENTS_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FOLDER_PATH_FIELD_NUMBER: _ClassVar[int]
    TOOL_METADATA_FIELD_NUMBER: _ClassVar[int]
    IS_VALID_FIELD_NUMBER: _ClassVar[int]
    TOOL_IMAGE_URI_FIELD_NUMBER: _ClassVar[int]
    TOOL_DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    IS_VENV_TOOL_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    workflow_id: str
    python_code: str
    python_requirements: str
    source_folder_path: str
    tool_metadata: str
    is_valid: bool
    tool_image_uri: str
    tool_description: str
    is_venv_tool: bool
    def __init__(
        self,
        id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        workflow_id: _Optional[str] = ...,
        python_code: _Optional[str] = ...,
        python_requirements: _Optional[str] = ...,
        source_folder_path: _Optional[str] = ...,
        tool_metadata: _Optional[str] = ...,
        is_valid: bool = ...,
        tool_image_uri: _Optional[str] = ...,
        tool_description: _Optional[str] = ...,
        is_venv_tool: bool = ...,
    ) -> None: ...

class ListAgentsRequest(_message.Message):
    __slots__ = ("workflow_id",)
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    def __init__(self, workflow_id: _Optional[str] = ...) -> None: ...

class ListAgentsResponse(_message.Message):
    __slots__ = ("agents",)
    AGENTS_FIELD_NUMBER: _ClassVar[int]
    agents: _containers.RepeatedCompositeFieldContainer[AgentMetadata]
    def __init__(self, agents: _Optional[_Iterable[_Union[AgentMetadata, _Mapping]]] = ...) -> None: ...

class GetAgentRequest(_message.Message):
    __slots__ = ("agent_id",)
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    agent_id: str
    def __init__(self, agent_id: _Optional[str] = ...) -> None: ...

class GetAgentResponse(_message.Message):
    __slots__ = ("agent",)
    AGENT_FIELD_NUMBER: _ClassVar[int]
    agent: AgentMetadata
    def __init__(self, agent: _Optional[_Union[AgentMetadata, _Mapping]] = ...) -> None: ...

class AddAgentRequest(_message.Message):
    __slots__ = (
        "name",
        "llm_provider_model_id",
        "tools_id",
        "crew_ai_agent_metadata",
        "template_id",
        "workflow_id",
        "tmp_agent_image_path",
        "tool_template_ids",
    )
    NAME_FIELD_NUMBER: _ClassVar[int]
    LLM_PROVIDER_MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    TOOLS_ID_FIELD_NUMBER: _ClassVar[int]
    CREW_AI_AGENT_METADATA_FIELD_NUMBER: _ClassVar[int]
    TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    TMP_AGENT_IMAGE_PATH_FIELD_NUMBER: _ClassVar[int]
    TOOL_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    name: str
    llm_provider_model_id: str
    tools_id: _containers.RepeatedScalarFieldContainer[str]
    crew_ai_agent_metadata: CrewAIAgentMetadata
    template_id: str
    workflow_id: str
    tmp_agent_image_path: str
    tool_template_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(
        self,
        name: _Optional[str] = ...,
        llm_provider_model_id: _Optional[str] = ...,
        tools_id: _Optional[_Iterable[str]] = ...,
        crew_ai_agent_metadata: _Optional[_Union[CrewAIAgentMetadata, _Mapping]] = ...,
        template_id: _Optional[str] = ...,
        workflow_id: _Optional[str] = ...,
        tmp_agent_image_path: _Optional[str] = ...,
        tool_template_ids: _Optional[_Iterable[str]] = ...,
    ) -> None: ...

class AddAgentResponse(_message.Message):
    __slots__ = ("agent_id",)
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    agent_id: str
    def __init__(self, agent_id: _Optional[str] = ...) -> None: ...

class UpdateAgentRequest(_message.Message):
    __slots__ = (
        "agent_id",
        "name",
        "llm_provider_model_id",
        "tools_id",
        "crew_ai_agent_metadata",
        "tmp_agent_image_path",
        "tool_template_ids",
    )
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    LLM_PROVIDER_MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    TOOLS_ID_FIELD_NUMBER: _ClassVar[int]
    CREW_AI_AGENT_METADATA_FIELD_NUMBER: _ClassVar[int]
    TMP_AGENT_IMAGE_PATH_FIELD_NUMBER: _ClassVar[int]
    TOOL_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    agent_id: str
    name: str
    llm_provider_model_id: str
    tools_id: _containers.RepeatedScalarFieldContainer[str]
    crew_ai_agent_metadata: CrewAIAgentMetadata
    tmp_agent_image_path: str
    tool_template_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(
        self,
        agent_id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        llm_provider_model_id: _Optional[str] = ...,
        tools_id: _Optional[_Iterable[str]] = ...,
        crew_ai_agent_metadata: _Optional[_Union[CrewAIAgentMetadata, _Mapping]] = ...,
        tmp_agent_image_path: _Optional[str] = ...,
        tool_template_ids: _Optional[_Iterable[str]] = ...,
    ) -> None: ...

class UpdateAgentResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class RemoveAgentRequest(_message.Message):
    __slots__ = ("agent_id",)
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    agent_id: str
    def __init__(self, agent_id: _Optional[str] = ...) -> None: ...

class RemoveAgentResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class AgentMetadata(_message.Message):
    __slots__ = (
        "id",
        "name",
        "llm_provider_model_id",
        "tools_id",
        "crew_ai_agent_metadata",
        "agent_image_uri",
        "is_valid",
        "workflow_id",
    )
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    LLM_PROVIDER_MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    TOOLS_ID_FIELD_NUMBER: _ClassVar[int]
    CREW_AI_AGENT_METADATA_FIELD_NUMBER: _ClassVar[int]
    AGENT_IMAGE_URI_FIELD_NUMBER: _ClassVar[int]
    IS_VALID_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    llm_provider_model_id: str
    tools_id: _containers.RepeatedScalarFieldContainer[str]
    crew_ai_agent_metadata: CrewAIAgentMetadata
    agent_image_uri: str
    is_valid: bool
    workflow_id: str
    def __init__(
        self,
        id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        llm_provider_model_id: _Optional[str] = ...,
        tools_id: _Optional[_Iterable[str]] = ...,
        crew_ai_agent_metadata: _Optional[_Union[CrewAIAgentMetadata, _Mapping]] = ...,
        agent_image_uri: _Optional[str] = ...,
        is_valid: bool = ...,
        workflow_id: _Optional[str] = ...,
    ) -> None: ...

class CrewAIAgentMetadata(_message.Message):
    __slots__ = ("role", "backstory", "goal", "allow_delegation", "verbose", "cache", "temperature", "max_iter")
    ROLE_FIELD_NUMBER: _ClassVar[int]
    BACKSTORY_FIELD_NUMBER: _ClassVar[int]
    GOAL_FIELD_NUMBER: _ClassVar[int]
    ALLOW_DELEGATION_FIELD_NUMBER: _ClassVar[int]
    VERBOSE_FIELD_NUMBER: _ClassVar[int]
    CACHE_FIELD_NUMBER: _ClassVar[int]
    TEMPERATURE_FIELD_NUMBER: _ClassVar[int]
    MAX_ITER_FIELD_NUMBER: _ClassVar[int]
    role: str
    backstory: str
    goal: str
    allow_delegation: bool
    verbose: bool
    cache: bool
    temperature: float
    max_iter: int
    def __init__(
        self,
        role: _Optional[str] = ...,
        backstory: _Optional[str] = ...,
        goal: _Optional[str] = ...,
        allow_delegation: bool = ...,
        verbose: bool = ...,
        cache: bool = ...,
        temperature: _Optional[float] = ...,
        max_iter: _Optional[int] = ...,
    ) -> None: ...

class TestAgentRequest(_message.Message):
    __slots__ = ("agent_id", "user_input", "context")
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    USER_INPUT_FIELD_NUMBER: _ClassVar[int]
    CONTEXT_FIELD_NUMBER: _ClassVar[int]
    agent_id: str
    user_input: str
    context: str
    def __init__(
        self, agent_id: _Optional[str] = ..., user_input: _Optional[str] = ..., context: _Optional[str] = ...
    ) -> None: ...

class TestAgentResponse(_message.Message):
    __slots__ = ("response",)
    RESPONSE_FIELD_NUMBER: _ClassVar[int]
    response: str
    def __init__(self, response: _Optional[str] = ...) -> None: ...

class AddWorkflowRequest(_message.Message):
    __slots__ = ("name", "crew_ai_workflow_metadata", "is_conversational", "workflow_template_id", "description")
    NAME_FIELD_NUMBER: _ClassVar[int]
    CREW_AI_WORKFLOW_METADATA_FIELD_NUMBER: _ClassVar[int]
    IS_CONVERSATIONAL_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    name: str
    crew_ai_workflow_metadata: CrewAIWorkflowMetadata
    is_conversational: bool
    workflow_template_id: str
    description: str
    def __init__(
        self,
        name: _Optional[str] = ...,
        crew_ai_workflow_metadata: _Optional[_Union[CrewAIWorkflowMetadata, _Mapping]] = ...,
        is_conversational: bool = ...,
        workflow_template_id: _Optional[str] = ...,
        description: _Optional[str] = ...,
    ) -> None: ...

class AddWorkflowResponse(_message.Message):
    __slots__ = ("workflow_id",)
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    def __init__(self, workflow_id: _Optional[str] = ...) -> None: ...

class ListWorkflowsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListWorkflowsResponse(_message.Message):
    __slots__ = ("workflows",)
    WORKFLOWS_FIELD_NUMBER: _ClassVar[int]
    workflows: _containers.RepeatedCompositeFieldContainer[Workflow]
    def __init__(self, workflows: _Optional[_Iterable[_Union[Workflow, _Mapping]]] = ...) -> None: ...

class GetWorkflowRequest(_message.Message):
    __slots__ = ("workflow_id",)
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    def __init__(self, workflow_id: _Optional[str] = ...) -> None: ...

class GetWorkflowResponse(_message.Message):
    __slots__ = ("workflow",)
    WORKFLOW_FIELD_NUMBER: _ClassVar[int]
    workflow: Workflow
    def __init__(self, workflow: _Optional[_Union[Workflow, _Mapping]] = ...) -> None: ...

class UpdateWorkflowRequest(_message.Message):
    __slots__ = ("workflow_id", "name", "crew_ai_workflow_metadata", "is_conversational", "description")
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    CREW_AI_WORKFLOW_METADATA_FIELD_NUMBER: _ClassVar[int]
    IS_CONVERSATIONAL_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    name: str
    crew_ai_workflow_metadata: CrewAIWorkflowMetadata
    is_conversational: bool
    description: str
    def __init__(
        self,
        workflow_id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        crew_ai_workflow_metadata: _Optional[_Union[CrewAIWorkflowMetadata, _Mapping]] = ...,
        is_conversational: bool = ...,
        description: _Optional[str] = ...,
    ) -> None: ...

class UpdateWorkflowResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class TestWorkflowToolUserParameters(_message.Message):
    __slots__ = ("parameters",)
    class ParametersEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...

    PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    parameters: _containers.ScalarMap[str, str]
    def __init__(self, parameters: _Optional[_Mapping[str, str]] = ...) -> None: ...

class TestWorkflowRequest(_message.Message):
    __slots__ = ("workflow_id", "inputs", "tool_user_parameters", "generation_config")
    class InputsEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...

    class ToolUserParametersEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: TestWorkflowToolUserParameters
        def __init__(
            self, key: _Optional[str] = ..., value: _Optional[_Union[TestWorkflowToolUserParameters, _Mapping]] = ...
        ) -> None: ...

    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    INPUTS_FIELD_NUMBER: _ClassVar[int]
    TOOL_USER_PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    GENERATION_CONFIG_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    inputs: _containers.ScalarMap[str, str]
    tool_user_parameters: _containers.MessageMap[str, TestWorkflowToolUserParameters]
    generation_config: str
    def __init__(
        self,
        workflow_id: _Optional[str] = ...,
        inputs: _Optional[_Mapping[str, str]] = ...,
        tool_user_parameters: _Optional[_Mapping[str, TestWorkflowToolUserParameters]] = ...,
        generation_config: _Optional[str] = ...,
    ) -> None: ...

class TestWorkflowResponse(_message.Message):
    __slots__ = ("message", "trace_id")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    TRACE_ID_FIELD_NUMBER: _ClassVar[int]
    message: str
    trace_id: str
    def __init__(self, message: _Optional[str] = ..., trace_id: _Optional[str] = ...) -> None: ...

class DeployWorkflowRequest(_message.Message):
    __slots__ = (
        "workflow_id",
        "env_variable_overrides",
        "tool_user_parameters",
        "bypass_authentication",
        "generation_config",
    )
    class EnvVariableOverridesEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: str
        def __init__(self, key: _Optional[str] = ..., value: _Optional[str] = ...) -> None: ...

    class ToolUserParametersEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: TestWorkflowToolUserParameters
        def __init__(
            self, key: _Optional[str] = ..., value: _Optional[_Union[TestWorkflowToolUserParameters, _Mapping]] = ...
        ) -> None: ...

    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    ENV_VARIABLE_OVERRIDES_FIELD_NUMBER: _ClassVar[int]
    TOOL_USER_PARAMETERS_FIELD_NUMBER: _ClassVar[int]
    BYPASS_AUTHENTICATION_FIELD_NUMBER: _ClassVar[int]
    GENERATION_CONFIG_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    env_variable_overrides: _containers.ScalarMap[str, str]
    tool_user_parameters: _containers.MessageMap[str, TestWorkflowToolUserParameters]
    bypass_authentication: bool
    generation_config: str
    def __init__(
        self,
        workflow_id: _Optional[str] = ...,
        env_variable_overrides: _Optional[_Mapping[str, str]] = ...,
        tool_user_parameters: _Optional[_Mapping[str, TestWorkflowToolUserParameters]] = ...,
        bypass_authentication: bool = ...,
        generation_config: _Optional[str] = ...,
    ) -> None: ...

class DeployWorkflowResponse(_message.Message):
    __slots__ = ("deployed_workflow_name", "deployed_workflow_id", "cml_deployed_model_id")
    DEPLOYED_WORKFLOW_NAME_FIELD_NUMBER: _ClassVar[int]
    DEPLOYED_WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    CML_DEPLOYED_MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    deployed_workflow_name: str
    deployed_workflow_id: str
    cml_deployed_model_id: str
    def __init__(
        self,
        deployed_workflow_name: _Optional[str] = ...,
        deployed_workflow_id: _Optional[str] = ...,
        cml_deployed_model_id: _Optional[str] = ...,
    ) -> None: ...

class UndeployWorkflowRequest(_message.Message):
    __slots__ = ("deployed_workflow_id",)
    DEPLOYED_WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    deployed_workflow_id: str
    def __init__(self, deployed_workflow_id: _Optional[str] = ...) -> None: ...

class UndeployWorkflowResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListDeployedWorkflowsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListDeployedWorkflowsResponse(_message.Message):
    __slots__ = ("deployed_workflows",)
    DEPLOYED_WORKFLOWS_FIELD_NUMBER: _ClassVar[int]
    deployed_workflows: _containers.RepeatedCompositeFieldContainer[DeployedWorkflow]
    def __init__(self, deployed_workflows: _Optional[_Iterable[_Union[DeployedWorkflow, _Mapping]]] = ...) -> None: ...

class RemoveWorkflowRequest(_message.Message):
    __slots__ = ("workflow_id",)
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    def __init__(self, workflow_id: _Optional[str] = ...) -> None: ...

class RemoveWorkflowResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class DeployedWorkflow(_message.Message):
    __slots__ = (
        "deployed_workflow_id",
        "workflow_id",
        "workflow_name",
        "deployed_workflow_name",
        "cml_deployed_model_id",
        "is_stale",
        "application_url",
        "application_status",
        "application_deep_link",
        "model_deep_link",
    )
    DEPLOYED_WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_NAME_FIELD_NUMBER: _ClassVar[int]
    DEPLOYED_WORKFLOW_NAME_FIELD_NUMBER: _ClassVar[int]
    CML_DEPLOYED_MODEL_ID_FIELD_NUMBER: _ClassVar[int]
    IS_STALE_FIELD_NUMBER: _ClassVar[int]
    APPLICATION_URL_FIELD_NUMBER: _ClassVar[int]
    APPLICATION_STATUS_FIELD_NUMBER: _ClassVar[int]
    APPLICATION_DEEP_LINK_FIELD_NUMBER: _ClassVar[int]
    MODEL_DEEP_LINK_FIELD_NUMBER: _ClassVar[int]
    deployed_workflow_id: str
    workflow_id: str
    workflow_name: str
    deployed_workflow_name: str
    cml_deployed_model_id: str
    is_stale: bool
    application_url: str
    application_status: str
    application_deep_link: str
    model_deep_link: str
    def __init__(
        self,
        deployed_workflow_id: _Optional[str] = ...,
        workflow_id: _Optional[str] = ...,
        workflow_name: _Optional[str] = ...,
        deployed_workflow_name: _Optional[str] = ...,
        cml_deployed_model_id: _Optional[str] = ...,
        is_stale: bool = ...,
        application_url: _Optional[str] = ...,
        application_status: _Optional[str] = ...,
        application_deep_link: _Optional[str] = ...,
        model_deep_link: _Optional[str] = ...,
    ) -> None: ...

class Workflow(_message.Message):
    __slots__ = (
        "workflow_id",
        "name",
        "crew_ai_workflow_metadata",
        "is_valid",
        "is_ready",
        "is_conversational",
        "is_draft",
        "description",
        "directory",
    )
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    CREW_AI_WORKFLOW_METADATA_FIELD_NUMBER: _ClassVar[int]
    IS_VALID_FIELD_NUMBER: _ClassVar[int]
    IS_READY_FIELD_NUMBER: _ClassVar[int]
    IS_CONVERSATIONAL_FIELD_NUMBER: _ClassVar[int]
    IS_DRAFT_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    DIRECTORY_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    name: str
    crew_ai_workflow_metadata: CrewAIWorkflowMetadata
    is_valid: bool
    is_ready: bool
    is_conversational: bool
    is_draft: bool
    description: str
    directory: str
    def __init__(
        self,
        workflow_id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        crew_ai_workflow_metadata: _Optional[_Union[CrewAIWorkflowMetadata, _Mapping]] = ...,
        is_valid: bool = ...,
        is_ready: bool = ...,
        is_conversational: bool = ...,
        is_draft: bool = ...,
        description: _Optional[str] = ...,
        directory: _Optional[str] = ...,
    ) -> None: ...

class CrewAIWorkflowMetadata(_message.Message):
    __slots__ = ("agent_id", "task_id", "manager_agent_id", "process", "manager_llm_model_provider_id")
    AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    MANAGER_AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    PROCESS_FIELD_NUMBER: _ClassVar[int]
    MANAGER_LLM_MODEL_PROVIDER_ID_FIELD_NUMBER: _ClassVar[int]
    agent_id: _containers.RepeatedScalarFieldContainer[str]
    task_id: _containers.RepeatedScalarFieldContainer[str]
    manager_agent_id: str
    process: str
    manager_llm_model_provider_id: str
    def __init__(
        self,
        agent_id: _Optional[_Iterable[str]] = ...,
        task_id: _Optional[_Iterable[str]] = ...,
        manager_agent_id: _Optional[str] = ...,
        process: _Optional[str] = ...,
        manager_llm_model_provider_id: _Optional[str] = ...,
    ) -> None: ...

class AddTaskRequest(_message.Message):
    __slots__ = ("name", "add_crew_ai_task_request", "workflow_id", "template_id")
    NAME_FIELD_NUMBER: _ClassVar[int]
    ADD_CREW_AI_TASK_REQUEST_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    name: str
    add_crew_ai_task_request: AddCrewAITaskRequest
    workflow_id: str
    template_id: str
    def __init__(
        self,
        name: _Optional[str] = ...,
        add_crew_ai_task_request: _Optional[_Union[AddCrewAITaskRequest, _Mapping]] = ...,
        workflow_id: _Optional[str] = ...,
        template_id: _Optional[str] = ...,
    ) -> None: ...

class AddTaskResponse(_message.Message):
    __slots__ = ("task_id",)
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    def __init__(self, task_id: _Optional[str] = ...) -> None: ...

class ListTasksRequest(_message.Message):
    __slots__ = ("workflow_id",)
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_id: str
    def __init__(self, workflow_id: _Optional[str] = ...) -> None: ...

class ListTasksResponse(_message.Message):
    __slots__ = ("tasks",)
    TASKS_FIELD_NUMBER: _ClassVar[int]
    tasks: _containers.RepeatedCompositeFieldContainer[CrewAITaskMetadata]
    def __init__(self, tasks: _Optional[_Iterable[_Union[CrewAITaskMetadata, _Mapping]]] = ...) -> None: ...

class GetTaskRequest(_message.Message):
    __slots__ = ("task_id",)
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    def __init__(self, task_id: _Optional[str] = ...) -> None: ...

class GetTaskResponse(_message.Message):
    __slots__ = ("task",)
    TASK_FIELD_NUMBER: _ClassVar[int]
    task: CrewAITaskMetadata
    def __init__(self, task: _Optional[_Union[CrewAITaskMetadata, _Mapping]] = ...) -> None: ...

class UpdateTaskRequest(_message.Message):
    __slots__ = ("task_id", "UpdateCrewAITaskRequest")
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    UPDATECREWAITASKREQUEST_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    UpdateCrewAITaskRequest: UpdateCrewAITaskRequest
    def __init__(
        self,
        task_id: _Optional[str] = ...,
        UpdateCrewAITaskRequest: _Optional[_Union[UpdateCrewAITaskRequest, _Mapping]] = ...,
    ) -> None: ...

class UpdateTaskResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class RemoveTaskRequest(_message.Message):
    __slots__ = ("task_id",)
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    def __init__(self, task_id: _Optional[str] = ...) -> None: ...

class RemoveTaskResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class CrewAITaskMetadata(_message.Message):
    __slots__ = ("task_id", "description", "expected_output", "assigned_agent_id", "is_valid", "inputs", "workflow_id")
    TASK_ID_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ASSIGNED_AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    IS_VALID_FIELD_NUMBER: _ClassVar[int]
    INPUTS_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    task_id: str
    description: str
    expected_output: str
    assigned_agent_id: str
    is_valid: bool
    inputs: _containers.RepeatedScalarFieldContainer[str]
    workflow_id: str
    def __init__(
        self,
        task_id: _Optional[str] = ...,
        description: _Optional[str] = ...,
        expected_output: _Optional[str] = ...,
        assigned_agent_id: _Optional[str] = ...,
        is_valid: bool = ...,
        inputs: _Optional[_Iterable[str]] = ...,
        workflow_id: _Optional[str] = ...,
    ) -> None: ...

class UpdateCrewAITaskRequest(_message.Message):
    __slots__ = ("description", "expected_output", "assigned_agent_id")
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ASSIGNED_AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    description: str
    expected_output: str
    assigned_agent_id: str
    def __init__(
        self,
        description: _Optional[str] = ...,
        expected_output: _Optional[str] = ...,
        assigned_agent_id: _Optional[str] = ...,
    ) -> None: ...

class AddCrewAITaskRequest(_message.Message):
    __slots__ = ("description", "expected_output", "assigned_agent_id")
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ASSIGNED_AGENT_ID_FIELD_NUMBER: _ClassVar[int]
    description: str
    expected_output: str
    assigned_agent_id: str
    def __init__(
        self,
        description: _Optional[str] = ...,
        expected_output: _Optional[str] = ...,
        assigned_agent_id: _Optional[str] = ...,
    ) -> None: ...

class GetAssetDataRequest(_message.Message):
    __slots__ = ("asset_uri_list",)
    ASSET_URI_LIST_FIELD_NUMBER: _ClassVar[int]
    asset_uri_list: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, asset_uri_list: _Optional[_Iterable[str]] = ...) -> None: ...

class GetAssetDataResponse(_message.Message):
    __slots__ = ("asset_data", "unavailable_assets")
    class AssetDataEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: bytes
        def __init__(self, key: _Optional[str] = ..., value: _Optional[bytes] = ...) -> None: ...

    ASSET_DATA_FIELD_NUMBER: _ClassVar[int]
    UNAVAILABLE_ASSETS_FIELD_NUMBER: _ClassVar[int]
    asset_data: _containers.ScalarMap[str, bytes]
    unavailable_assets: _containers.RepeatedScalarFieldContainer[str]
    def __init__(
        self, asset_data: _Optional[_Mapping[str, bytes]] = ..., unavailable_assets: _Optional[_Iterable[str]] = ...
    ) -> None: ...

class FileChunk(_message.Message):
    __slots__ = ("content", "file_name", "is_last_chunk")
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    FILE_NAME_FIELD_NUMBER: _ClassVar[int]
    IS_LAST_CHUNK_FIELD_NUMBER: _ClassVar[int]
    content: bytes
    file_name: str
    is_last_chunk: bool
    def __init__(
        self, content: _Optional[bytes] = ..., file_name: _Optional[str] = ..., is_last_chunk: bool = ...
    ) -> None: ...

class NonStreamingTemporaryFileUploadRequest(_message.Message):
    __slots__ = ("full_content", "file_name")
    FULL_CONTENT_FIELD_NUMBER: _ClassVar[int]
    FILE_NAME_FIELD_NUMBER: _ClassVar[int]
    full_content: bytes
    file_name: str
    def __init__(self, full_content: _Optional[bytes] = ..., file_name: _Optional[str] = ...) -> None: ...

class FileUploadResponse(_message.Message):
    __slots__ = ("message", "file_path")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    FILE_PATH_FIELD_NUMBER: _ClassVar[int]
    message: str
    file_path: str
    def __init__(self, message: _Optional[str] = ..., file_path: _Optional[str] = ...) -> None: ...

class DownloadTemporaryFileRequest(_message.Message):
    __slots__ = ("file_path",)
    FILE_PATH_FIELD_NUMBER: _ClassVar[int]
    file_path: str
    def __init__(self, file_path: _Optional[str] = ...) -> None: ...

class GetParentProjectDetailsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetParentProjectDetailsResponse(_message.Message):
    __slots__ = ("project_base", "studio_subdirectory")
    PROJECT_BASE_FIELD_NUMBER: _ClassVar[int]
    STUDIO_SUBDIRECTORY_FIELD_NUMBER: _ClassVar[int]
    project_base: str
    studio_subdirectory: str
    def __init__(self, project_base: _Optional[str] = ..., studio_subdirectory: _Optional[str] = ...) -> None: ...

class ListAgentTemplatesRequest(_message.Message):
    __slots__ = ("workflow_template_id",)
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_template_id: str
    def __init__(self, workflow_template_id: _Optional[str] = ...) -> None: ...

class ListAgentTemplatesResponse(_message.Message):
    __slots__ = ("agent_templates",)
    AGENT_TEMPLATES_FIELD_NUMBER: _ClassVar[int]
    agent_templates: _containers.RepeatedCompositeFieldContainer[AgentTemplateMetadata]
    def __init__(
        self, agent_templates: _Optional[_Iterable[_Union[AgentTemplateMetadata, _Mapping]]] = ...
    ) -> None: ...

class GetAgentTemplateRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class GetAgentTemplateResponse(_message.Message):
    __slots__ = ("agent_template",)
    AGENT_TEMPLATE_FIELD_NUMBER: _ClassVar[int]
    agent_template: AgentTemplateMetadata
    def __init__(self, agent_template: _Optional[_Union[AgentTemplateMetadata, _Mapping]] = ...) -> None: ...

class AddAgentTemplateRequest(_message.Message):
    __slots__ = (
        "name",
        "description",
        "tool_template_ids",
        "role",
        "backstory",
        "goal",
        "allow_delegation",
        "verbose",
        "cache",
        "temperature",
        "max_iter",
        "tmp_agent_image_path",
        "workflow_template_id",
    )
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    TOOL_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    BACKSTORY_FIELD_NUMBER: _ClassVar[int]
    GOAL_FIELD_NUMBER: _ClassVar[int]
    ALLOW_DELEGATION_FIELD_NUMBER: _ClassVar[int]
    VERBOSE_FIELD_NUMBER: _ClassVar[int]
    CACHE_FIELD_NUMBER: _ClassVar[int]
    TEMPERATURE_FIELD_NUMBER: _ClassVar[int]
    MAX_ITER_FIELD_NUMBER: _ClassVar[int]
    TMP_AGENT_IMAGE_PATH_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    name: str
    description: str
    tool_template_ids: _containers.RepeatedScalarFieldContainer[str]
    role: str
    backstory: str
    goal: str
    allow_delegation: bool
    verbose: bool
    cache: bool
    temperature: float
    max_iter: int
    tmp_agent_image_path: str
    workflow_template_id: str
    def __init__(
        self,
        name: _Optional[str] = ...,
        description: _Optional[str] = ...,
        tool_template_ids: _Optional[_Iterable[str]] = ...,
        role: _Optional[str] = ...,
        backstory: _Optional[str] = ...,
        goal: _Optional[str] = ...,
        allow_delegation: bool = ...,
        verbose: bool = ...,
        cache: bool = ...,
        temperature: _Optional[float] = ...,
        max_iter: _Optional[int] = ...,
        tmp_agent_image_path: _Optional[str] = ...,
        workflow_template_id: _Optional[str] = ...,
    ) -> None: ...

class AddAgentTemplateResponse(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class UpdateAgentTemplateRequest(_message.Message):
    __slots__ = (
        "agent_template_id",
        "name",
        "description",
        "tool_template_ids",
        "role",
        "backstory",
        "goal",
        "allow_delegation",
        "verbose",
        "cache",
        "temperature",
        "max_iter",
        "tmp_agent_image_path",
    )
    AGENT_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    TOOL_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    BACKSTORY_FIELD_NUMBER: _ClassVar[int]
    GOAL_FIELD_NUMBER: _ClassVar[int]
    ALLOW_DELEGATION_FIELD_NUMBER: _ClassVar[int]
    VERBOSE_FIELD_NUMBER: _ClassVar[int]
    CACHE_FIELD_NUMBER: _ClassVar[int]
    TEMPERATURE_FIELD_NUMBER: _ClassVar[int]
    MAX_ITER_FIELD_NUMBER: _ClassVar[int]
    TMP_AGENT_IMAGE_PATH_FIELD_NUMBER: _ClassVar[int]
    agent_template_id: str
    name: str
    description: str
    tool_template_ids: _containers.RepeatedScalarFieldContainer[str]
    role: str
    backstory: str
    goal: str
    allow_delegation: bool
    verbose: bool
    cache: bool
    temperature: float
    max_iter: int
    tmp_agent_image_path: str
    def __init__(
        self,
        agent_template_id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        description: _Optional[str] = ...,
        tool_template_ids: _Optional[_Iterable[str]] = ...,
        role: _Optional[str] = ...,
        backstory: _Optional[str] = ...,
        goal: _Optional[str] = ...,
        allow_delegation: bool = ...,
        verbose: bool = ...,
        cache: bool = ...,
        temperature: _Optional[float] = ...,
        max_iter: _Optional[int] = ...,
        tmp_agent_image_path: _Optional[str] = ...,
    ) -> None: ...

class UpdateAgentTemplateResponse(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class RemoveAgentTemplateRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class RemoveAgentTemplateResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class AgentTemplateMetadata(_message.Message):
    __slots__ = (
        "id",
        "name",
        "description",
        "tool_template_ids",
        "role",
        "backstory",
        "goal",
        "allow_delegation",
        "verbose",
        "cache",
        "temperature",
        "max_iter",
        "agent_image_uri",
        "workflow_template_id",
        "pre_packaged",
    )
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    TOOL_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    BACKSTORY_FIELD_NUMBER: _ClassVar[int]
    GOAL_FIELD_NUMBER: _ClassVar[int]
    ALLOW_DELEGATION_FIELD_NUMBER: _ClassVar[int]
    VERBOSE_FIELD_NUMBER: _ClassVar[int]
    CACHE_FIELD_NUMBER: _ClassVar[int]
    TEMPERATURE_FIELD_NUMBER: _ClassVar[int]
    MAX_ITER_FIELD_NUMBER: _ClassVar[int]
    AGENT_IMAGE_URI_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    PRE_PACKAGED_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    description: str
    tool_template_ids: _containers.RepeatedScalarFieldContainer[str]
    role: str
    backstory: str
    goal: str
    allow_delegation: bool
    verbose: bool
    cache: bool
    temperature: float
    max_iter: int
    agent_image_uri: str
    workflow_template_id: str
    pre_packaged: bool
    def __init__(
        self,
        id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        description: _Optional[str] = ...,
        tool_template_ids: _Optional[_Iterable[str]] = ...,
        role: _Optional[str] = ...,
        backstory: _Optional[str] = ...,
        goal: _Optional[str] = ...,
        allow_delegation: bool = ...,
        verbose: bool = ...,
        cache: bool = ...,
        temperature: _Optional[float] = ...,
        max_iter: _Optional[int] = ...,
        agent_image_uri: _Optional[str] = ...,
        workflow_template_id: _Optional[str] = ...,
        pre_packaged: bool = ...,
    ) -> None: ...

class ListWorkflowTemplatesRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListWorkflowTemplatesResponse(_message.Message):
    __slots__ = ("workflow_templates",)
    WORKFLOW_TEMPLATES_FIELD_NUMBER: _ClassVar[int]
    workflow_templates: _containers.RepeatedCompositeFieldContainer[WorkflowTemplateMetadata]
    def __init__(
        self, workflow_templates: _Optional[_Iterable[_Union[WorkflowTemplateMetadata, _Mapping]]] = ...
    ) -> None: ...

class GetWorkflowTemplateRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class GetWorkflowTemplateResponse(_message.Message):
    __slots__ = ("workflow_template",)
    WORKFLOW_TEMPLATE_FIELD_NUMBER: _ClassVar[int]
    workflow_template: WorkflowTemplateMetadata
    def __init__(self, workflow_template: _Optional[_Union[WorkflowTemplateMetadata, _Mapping]] = ...) -> None: ...

class AddWorkflowTemplateRequest(_message.Message):
    __slots__ = (
        "name",
        "description",
        "process",
        "agent_template_ids",
        "task_template_ids",
        "manager_agent_template_id",
        "use_default_manager",
        "is_conversational",
        "workflow_id",
    )
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    PROCESS_FIELD_NUMBER: _ClassVar[int]
    AGENT_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    TASK_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    MANAGER_AGENT_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    USE_DEFAULT_MANAGER_FIELD_NUMBER: _ClassVar[int]
    IS_CONVERSATIONAL_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_ID_FIELD_NUMBER: _ClassVar[int]
    name: str
    description: str
    process: str
    agent_template_ids: _containers.RepeatedScalarFieldContainer[str]
    task_template_ids: _containers.RepeatedScalarFieldContainer[str]
    manager_agent_template_id: str
    use_default_manager: bool
    is_conversational: bool
    workflow_id: str
    def __init__(
        self,
        name: _Optional[str] = ...,
        description: _Optional[str] = ...,
        process: _Optional[str] = ...,
        agent_template_ids: _Optional[_Iterable[str]] = ...,
        task_template_ids: _Optional[_Iterable[str]] = ...,
        manager_agent_template_id: _Optional[str] = ...,
        use_default_manager: bool = ...,
        is_conversational: bool = ...,
        workflow_id: _Optional[str] = ...,
    ) -> None: ...

class AddWorkflowTemplateResponse(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class RemoveWorkflowTemplateRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class RemoveWorkflowTemplateResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class WorkflowTemplateMetadata(_message.Message):
    __slots__ = (
        "id",
        "name",
        "description",
        "process",
        "agent_template_ids",
        "task_template_ids",
        "manager_agent_template_id",
        "use_default_manager",
        "is_conversational",
        "pre_packaged",
    )
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    PROCESS_FIELD_NUMBER: _ClassVar[int]
    AGENT_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    TASK_TEMPLATE_IDS_FIELD_NUMBER: _ClassVar[int]
    MANAGER_AGENT_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    USE_DEFAULT_MANAGER_FIELD_NUMBER: _ClassVar[int]
    IS_CONVERSATIONAL_FIELD_NUMBER: _ClassVar[int]
    PRE_PACKAGED_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    description: str
    process: str
    agent_template_ids: _containers.RepeatedScalarFieldContainer[str]
    task_template_ids: _containers.RepeatedScalarFieldContainer[str]
    manager_agent_template_id: str
    use_default_manager: bool
    is_conversational: bool
    pre_packaged: bool
    def __init__(
        self,
        id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        description: _Optional[str] = ...,
        process: _Optional[str] = ...,
        agent_template_ids: _Optional[_Iterable[str]] = ...,
        task_template_ids: _Optional[_Iterable[str]] = ...,
        manager_agent_template_id: _Optional[str] = ...,
        use_default_manager: bool = ...,
        is_conversational: bool = ...,
        pre_packaged: bool = ...,
    ) -> None: ...

class ExportWorkflowTemplateRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class ExportWorkflowTemplateResponse(_message.Message):
    __slots__ = ("file_path",)
    FILE_PATH_FIELD_NUMBER: _ClassVar[int]
    file_path: str
    def __init__(self, file_path: _Optional[str] = ...) -> None: ...

class ImportWorkflowTemplateRequest(_message.Message):
    __slots__ = ("file_path",)
    FILE_PATH_FIELD_NUMBER: _ClassVar[int]
    file_path: str
    def __init__(self, file_path: _Optional[str] = ...) -> None: ...

class ImportWorkflowTemplateResponse(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class ListTaskTemplatesRequest(_message.Message):
    __slots__ = ("workflow_template_id",)
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    workflow_template_id: str
    def __init__(self, workflow_template_id: _Optional[str] = ...) -> None: ...

class ListTaskTemplatesResponse(_message.Message):
    __slots__ = ("task_templates",)
    TASK_TEMPLATES_FIELD_NUMBER: _ClassVar[int]
    task_templates: _containers.RepeatedCompositeFieldContainer[TaskTemplateMetadata]
    def __init__(self, task_templates: _Optional[_Iterable[_Union[TaskTemplateMetadata, _Mapping]]] = ...) -> None: ...

class GetTaskTemplateRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class GetTaskTemplateResponse(_message.Message):
    __slots__ = ("task_template",)
    TASK_TEMPLATE_FIELD_NUMBER: _ClassVar[int]
    task_template: TaskTemplateMetadata
    def __init__(self, task_template: _Optional[_Union[TaskTemplateMetadata, _Mapping]] = ...) -> None: ...

class AddTaskTemplateRequest(_message.Message):
    __slots__ = ("name", "description", "expected_output", "assigned_agent_template_id", "workflow_template_id")
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ASSIGNED_AGENT_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    name: str
    description: str
    expected_output: str
    assigned_agent_template_id: str
    workflow_template_id: str
    def __init__(
        self,
        name: _Optional[str] = ...,
        description: _Optional[str] = ...,
        expected_output: _Optional[str] = ...,
        assigned_agent_template_id: _Optional[str] = ...,
        workflow_template_id: _Optional[str] = ...,
    ) -> None: ...

class AddTaskTemplateResponse(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class RemoveTaskTemplateRequest(_message.Message):
    __slots__ = ("id",)
    ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    def __init__(self, id: _Optional[str] = ...) -> None: ...

class RemoveTaskTemplateResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class TaskTemplateMetadata(_message.Message):
    __slots__ = ("id", "name", "description", "expected_output", "assigned_agent_template_id", "workflow_template_id")
    ID_FIELD_NUMBER: _ClassVar[int]
    NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_OUTPUT_FIELD_NUMBER: _ClassVar[int]
    ASSIGNED_AGENT_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    WORKFLOW_TEMPLATE_ID_FIELD_NUMBER: _ClassVar[int]
    id: str
    name: str
    description: str
    expected_output: str
    assigned_agent_template_id: str
    workflow_template_id: str
    def __init__(
        self,
        id: _Optional[str] = ...,
        name: _Optional[str] = ...,
        description: _Optional[str] = ...,
        expected_output: _Optional[str] = ...,
        assigned_agent_template_id: _Optional[str] = ...,
        workflow_template_id: _Optional[str] = ...,
    ) -> None: ...

class CheckStudioUpgradeStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class CheckStudioUpgradeStatusResponse(_message.Message):
    __slots__ = ("local_version", "newest_version")
    LOCAL_VERSION_FIELD_NUMBER: _ClassVar[int]
    NEWEST_VERSION_FIELD_NUMBER: _ClassVar[int]
    local_version: str
    newest_version: str
    def __init__(self, local_version: _Optional[str] = ..., newest_version: _Optional[str] = ...) -> None: ...

class UpgradeStudioRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class UpgradeStudioResponse(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HealthCheckRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HealthCheckResponse(_message.Message):
    __slots__ = ("message",)
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    message: str
    def __init__(self, message: _Optional[str] = ...) -> None: ...
