# Custom Workflows

Workflows can be shipped from outside of Agent Studio and can be deployed using Agent Studio's hosting infrastructure. This allows developers to build custom workflows completely
outside of the workflow builder UI. This allows customers to define workflows in a dedicated GitHub repository, for example, and use Agent Studio to deploy the workflows
to highly available endpoints.

## CollatedInput Structure

The `CollatedInput` is the core data structure that defines a complete workflow configuration. It serves as the serialized representation of all workflow components.

### Schema Overview

```python
class CollatedInput(BaseModel):
    default_language_model_id: str
    language_models: List[Input__LanguageModel]
    tool_instances: List[Input__ToolInstance]
    mcp_instances: List[Input__MCPInstance]
    agents: List[Input__Agent]
    tasks: List[Input__Task]
    workflow: Input__Workflow
```

### Detailed Field Specifications

#### Language Models

**`default_language_model_id`**: String identifier for the default LLM to use across the workflow

**`language_models`**: List of available language models, each containing:

```python
class Input__LanguageModel(BaseModel):
    model_id: str                    # Unique identifier
    model_name: str                  # Human-readable name
    generation_config: Dict          # Model-specific parameters
```

**Language Model Configuration**:
```python
class Input__LanguageModelConfig(BaseModel):
    provider_model: str              # Provider-specific model identifier
    model_type: SupportedModelTypes  # Model type enumeration
    api_base: Optional[str]          # Custom API endpoint
    api_key: Optional[str]           # Authentication key
```

#### Tool Instances

**`tool_instances`**: List of custom tools available to agents

```python
class Input__ToolInstance(BaseModel):
    id: str                          # Unique tool identifier
    name: str                        # Human-readable tool name
    python_code_file_name: str       # Main Python file
    python_requirements_file_name: str # Dependencies file
    source_folder_path: str          # Tool source directory
    tool_metadata: str               # JSON-encoded metadata
    tool_image_uri: Optional[str]    # Container image URI
    is_venv_tool: Optional[bool]     # Virtual environment flag
```

#### MCP Instances

**`mcp_instances`**: List of Model Context Protocol server configurations

```python
class Input__MCPInstance(BaseModel):
    id: str                          # Unique MCP identifier
    name: str                        # Human-readable name
    type: str                        # MCP server type
    args: List[str]                  # Server startup arguments
    env_names: List[str]             # Required environment variables
    tools: Optional[List[str]]       # Available tool names
    mcp_image_uri: Optional[str]     # Container image URI
```

#### Agents

**`agents`**: List of AI agents in the workflow

```python
class Input__Agent(BaseModel):
    id: str                          # Unique agent identifier
    name: str                        # Human-readable name
    llm_provider_model_id: Optional[str] # Specific LLM override
    crew_ai_role: str                # Agent's role description
    crew_ai_backstory: str           # Agent's background context
    crew_ai_goal: str                # Agent's primary objective
    crew_ai_allow_delegation: Optional[bool] = True    # Delegation permissions
    crew_ai_verbose: Optional[bool] = True             # Logging verbosity
    crew_ai_cache: Optional[bool] = True               # Response caching
    crew_ai_temperature: Optional[float]               # Response randomness
    crew_ai_max_iter: Optional[int]                    # Maximum iterations
    tool_instance_ids: List[str]     # Available tools
    mcp_instance_ids: List[str]      # Available MCP servers
    agent_image_uri: Optional[str]   # Container image URI
```

#### Tasks

**`tasks`**: List of tasks to be executed by agents

```python
class Input__Task(BaseModel):
    id: str                          # Unique task identifier
    description: Optional[str]       # Task description
    expected_output: Optional[str]   # Expected result format
    assigned_agent_id: Optional[str] # Assigned agent (if not hierarchical)
```

#### Workflow Configuration

**`workflow`**: Main workflow configuration

```python
class Input__Workflow(BaseModel):
    id: str                          # Unique workflow identifier
    name: str                        # Human-readable name
    description: Optional[str]       # Workflow description
    crew_ai_process: Literal[Process.sequential, Process.hierarchical] # Execution mode
    agent_ids: List[str]            # Participating agents
    task_ids: List[str]             # Workflow tasks
    manager_agent_id: Optional[str] # Manager for hierarchical workflows
    llm_provider_model_id: Optional[str] # Default LLM override
    is_conversational: bool          # Conversational mode flag
```

## Deployment Configuration

### Resource Profiles

**Workbench Resource Profile**:
```python
class WorkbenchDeploymentResourceProfile(BaseModel):
    num_replicas: int = 1           # Number of model replicas
    cpu: int = 2                    # CPU cores per replica
    mem: int = 4                    # Memory in GB per replica
```

**Application Resource Profile**:
```python
class ApplicationDeploymentResourceProfile(BaseModel):
    cpu: int = 2                    # CPU cores for application
    mem: int = 8                    # Memory in GB for application
```

### Deployment Configuration

```python
class DeploymentConfig(BaseModel):
    generation_config: Dict = {}     # Default LLM generation parameters
    tool_config: Dict[str, Dict[str, str]] = {}  # Tool-specific configurations
    mcp_config: Dict[str, Dict[str, str]] = {}   # MCP server configurations
    llm_config: Dict = {}           # LLM API keys and endpoints
    environment: Dict = {}          # Additional environment variables
```

### Environment Variables

The workbench model receives several environment variables:

- `AGENT_STUDIO_OPS_ENDPOINT`: Operations endpoint for monitoring
- `AGENT_STUDIO_WORKFLOW_ARTIFACT`: Path to workflow artifact
- `AGENT_STUDIO_WORKFLOW_DEPLOYMENT_CONFIG`: JSON deployment configuration
- `AGENT_STUDIO_MODEL_EXECUTION_DIR`: Execution directory path
- `CDSW_APIV2_KEY`: CML API v2 authentication key
- `CDSW_PROJECT_ID`: CML project identifier
- `CREWAI_DISABLE_TELEMETRY`: Disables CrewAI telemetry

## Integration Examples

### API Integration

```python
import requests
import json
import base64

# Prepare workflow inputs
inputs = {"query": "Analyze the quarterly sales data"}
encoded_inputs = base64.b64encode(json.dumps(inputs).encode()).decode()

# Execute workflow
payload = {
    "action_type": "kickoff",
    "kickoff_inputs": encoded_inputs
}

response = requests.post(
    "https://your-cml-domain/model/your-model-id/predict",
    json=payload,
    headers={"Authorization": "Bearer your-api-key"}
)

trace_id = response.json()["trace_id"]
```

### Configuration Retrieval

```python
# Get workflow configuration
payload = {"action_type": "get-configuration"}

response = requests.post(
    "https://your-cml-domain/model/your-model-id/predict",
    json=payload,
    headers={"Authorization": "Bearer your-api-key"}
)

config = response.json()["configuration"]
```

## Best Practices

### Resource Allocation
- **CPU Requirements**: Start with 2 CPU cores and scale based on workflow complexity
- **Memory Requirements**: Allocate 4GB minimum, increase for large language models
- **Replica Count**: Use multiple replicas for high-availability production workloads

### Security Considerations
- **API Key Management**: Store sensitive keys in deployment configuration, not in workflow definitions
- **Environment Isolation**: Use separate deployments for different environments (dev/staging/prod)
- **Access Control**: Leverage CML's built-in authentication and authorization

### Performance Optimization
- **Caching**: Enable agent response caching for repeated operations
- **Resource Monitoring**: Monitor CPU and memory usage to optimize resource allocation
- **Batch Processing**: Design workflows to handle multiple inputs efficiently 