import os
from sqlalchemy import Column, String, Text, Float, JSON, ForeignKey, Integer, Boolean
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.inspection import inspect
from google.protobuf.message import Message
from studio import consts
from studio.api import *


# Define the declarative base
Base = declarative_base()


'''
                Note on Agent Studio DB Upgrades
                --------------------------------

Agent Studio uses alembic for tracking DB schema migrations. Whenever a change
is made to the below DB model, and if you want this schema change as part
of a future release, you'll need to create a new DB revision:

```
uv run alembic revision --autogenerate -m "<Describe the DB changes here>"
```

Once the revision of the DB schema is created, you need to actually update
the database with your new schema:

```
uv run alembic upgrade head
```

For more advanced alembic use cases (for example, custom DB upgrades), visit
the documentation: https://alembic.sqlalchemy.org/en/latest/tutorial.html
'''

class MappedDict:
    @classmethod
    def from_dict(cls, d: dict):
        """
        Create a model item from a dictionary.
        """
        return cls(**d)

    def to_dict(self):
        """
        Extract all of the set key values from an ORM response
        and return a dictionary of key-value pairs.
        """
        result = {}
        for column in inspect(self).mapper.column_attrs:
            value = getattr(self, column.key)
            if value is not None:  # Only include set (non-null) fields
                result[column.key] = value
        return result


class MappedProtobuf:
    """
    Provides methods to map between ORM models and protobuf messages.
    """

    @classmethod
    def from_message(cls, message: Message):
        """
        Generate this ORM base model from a protobuf message.
        """
        set_fields = message.ListFields()
        class_kwargs = {field.name: value for field,
                        value in set_fields if hasattr(cls, field.name)}
        return cls(**class_kwargs)

    def to_protobuf(self, protobuf_cls):
        """
        Convert an ORM model to a protobuf message.
        """
        obj_dict = self.to_dict()
        protobuf_message = protobuf_cls()

        for key, value in obj_dict.items():
            if hasattr(protobuf_message, key):
                setattr(protobuf_message, key, value)

        return protobuf_message


class Model(Base, MappedProtobuf, MappedDict):
    __tablename__ = "models"
    model_id = Column(String, primary_key=True, nullable=False)
    model_name = Column(String, nullable=False, unique=True)
    provider_model = Column(String, nullable=False)
    # "OPENAI", "OPENAI_COMPATIBLE" or "AZURE_OPENAI"
    model_type = Column(String, nullable=False)
    api_base = Column(String, nullable=True)
    api_key = Column(String, nullable=True)
    is_studio_default = Column(Boolean, default=False)


class ToolInstance(Base, MappedProtobuf, MappedDict):
    __tablename__ = "tool_instances"
    id = Column(String, primary_key=True, nullable=False)
    workflow_id = Column(String, ForeignKey("workflows.id"), nullable=False)
    name = Column(String, nullable=False)
    python_code_file_name = Column(Text, nullable=False)
    python_requirements_file_name = Column(Text, nullable=False)
    source_folder_path = Column(Text, nullable=False)
    tool_image_path = Column(Text, nullable=False)
    is_venv_tool = Column(Boolean, default=False)


class ToolTemplate(Base, MappedProtobuf, MappedDict):
    __tablename__ = "tool_templates"
    id = Column(String, primary_key=True, nullable=False)

    # Optional to hide agent template to a specific workflow
    workflow_template_id = Column(String, ForeignKey(
        "workflow_templates.id"), nullable=True)

    name = Column(String, nullable=False)
    python_code_file_name = Column(Text, nullable=False)
    python_requirements_file_name = Column(Text, nullable=False)
    source_folder_path = Column(Text, nullable=False)
    pre_built = Column(Boolean, default=False)
    tool_image_path = Column(Text, nullable=False)
    is_venv_tool = Column(Boolean, default=False)


class Agent(Base, MappedProtobuf, MappedDict):
    __tablename__ = "agents"

    # Primary Key
    # Unique ID for the agent
    id = Column(String, primary_key=True, nullable=False)
    workflow_id = Column(String, ForeignKey("workflows.id"), nullable=False)

    # Basic Attributes
    name = Column(String, nullable=False)                 # Name of the agent
    llm_provider_model_id = Column(
        String, nullable=True)  # ForeignKey to Model
    # Role of the Crew AI agent
    crew_ai_role = Column(String, nullable=True)
    # Backstory of the Crew AI agent
    crew_ai_backstory = Column(Text, nullable=True)
    # Goal of the Crew AI agent
    crew_ai_goal = Column(Text, nullable=True)
    crew_ai_allow_delegation = Column(
        Boolean, default=True)      # Allow delegation flag
    # Verbose mode flag
    crew_ai_verbose = Column(Boolean, default=True)
    crew_ai_cache = Column(Boolean, default=True)                 # Cache flag
    # Temperature setting
    crew_ai_temperature = Column(Float, default=0.7)
    # Maximum iterations
    crew_ai_max_iter = Column(Integer, default=10)

    # JSON Column for  Tool Instance IDs
    # List of Tool Instance IDs stored as JSON
    tool_ids = Column(JSON, nullable=True)

    # Image path for the agent
    agent_image_path = Column(Text, nullable=True)


class Task(Base, MappedProtobuf, MappedDict):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, nullable=False)  # Task ID
    name = Column(String, nullable=True)  # Task name
    workflow_id = Column(String, ForeignKey("workflows.id"), nullable=False)
    description = Column(Text, nullable=True)  # Task description
    expected_output = Column(Text, nullable=True)  # Expected output
    assigned_agent_id = Column(String, nullable=True)  # Assigned Agent ID


class Workflow(Base, MappedProtobuf, MappedDict):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, nullable=False)  # Workflow ID
    name = Column(String, nullable=False)  # Workflow name
    description = Column(String, nullable=True)
    # Process description of the workflow
    crew_ai_process = Column(Text, nullable=True)
    # Agents involved in the workflow
    crew_ai_agents = Column(JSON, nullable=True)
    # Tasks involved in the workflow
    crew_ai_tasks = Column(JSON, nullable=True)
    crew_ai_manager_agent = Column(String, nullable=True)  # Manager Agent ID
    crew_ai_llm_provider_model_id = Column(
        String, nullable=True)  # Manager LLM Model Provider ID
    # Is Workflow Conversational
    is_conversational = Column(Boolean, default=False)
    # Whether or not the model is in draft mode.
    is_draft = Column(Boolean, nullable=True)
    # directory location of the workflow
    directory = Column(String, nullable=False)

    # Relationships
    deployed_workflow_instances = relationship(
        "DeployedWorkflowInstance", back_populates="workflow")


class DeployedWorkflowInstance(Base, MappedProtobuf, MappedDict):
    __tablename__ = "deployed_workflow_instance"

    # Deployed Workflow Instance ID
    id = Column(String, primary_key=True, nullable=False)
    # Name of the deployed workflow instance
    name = Column(String, nullable=False)
    workflow_id = Column(String, ForeignKey(
        "workflows.id"), nullable=False)  # Workflow ID
    cml_deployed_model_id = Column(
        String, nullable=True)  # CML Deployed Model ID
    # Staleness tracker comparing to the published workflow.
    is_stale = Column(Boolean, nullable=True)

    # Relationships
    workflow = relationship(
        "Workflow", back_populates="deployed_workflow_instances")


class WorkflowTemplate(Base, MappedProtobuf, MappedDict):
    __tablename__ = "workflow_templates"

    id = Column(String, primary_key=True, nullable=False)  # Workflow ID
    name = Column(String, nullable=False)  # Workflow name
    description = Column(String, nullable=True)
    # Process description of the workflow
    process = Column(Text, nullable=True)
    # Agents involved in the workflow
    agent_template_ids = Column(JSON, nullable=True)
    # Tasks involved in the workflow
    task_template_ids = Column(JSON, nullable=True)
    manager_agent_template_id = Column(
        String, nullable=True)  # Manager Agent ID
    # Whether to use a default manager or not
    use_default_manager = Column(Boolean, nullable=True)
    # Is Workflow Conversational
    is_conversational = Column(Boolean, default=False)
    # Is the template shipped as part of the studio
    pre_packaged = Column(Boolean, default=False)

    # Manual dict middleman to handle JSON -> repeated string conversions
    def to_protobuf(self):
        self_dict = self.to_dict()
        return WorkflowTemplateMetadata(
            **self_dict
        )


class AgentTemplate(Base, MappedProtobuf, MappedDict):
    __tablename__ = "agent_templates"

    id = Column(String, primary_key=True, nullable=False)  # Agent Template ID

    # Optional to hide agent template to a specific workflow
    workflow_template_id = Column(String, ForeignKey(
        "workflow_templates.id"), nullable=True)

    name = Column(String, nullable=False)  # Agent Template name
    description = Column(String, nullable=True)

    # Role of the Crew AI agent
    role = Column(String, nullable=True)
    # Backstory of the Crew AI agent
    backstory = Column(Text, nullable=True)
    # Goal of the Crew AI agent
    goal = Column(Text, nullable=True)
    allow_delegation = Column(
        Boolean, default=True)      # Allow delegation flag
    # Verbose mode flag
    verbose = Column(Boolean, default=True)
    cache = Column(Boolean, default=True)                 # Cache flag
    # Temperature setting
    temperature = Column(Float, default=0.7)
    # Maximum iterations
    max_iter = Column(Integer, default=10)

    # JSON Column for  Tool Template IDs
    # List of Tool Template IDs stored as JSON
    tool_template_ids = Column(JSON, nullable=True)

    # Is the template shipped as part of the studio
    pre_packaged = Column(Boolean, default=False)

    # Image path for the agent
    agent_image_path = Column(Text, nullable=True)

    # Manual dict middleman to handle JSON -> repeated string conversions
    def to_protobuf(self):
        self_dict = self.to_dict()
        agent_image_uri = ""
        if self.agent_image_path:
            agent_image_uri = os.path.relpath(self.agent_image_path, consts.DYNAMIC_ASSETS_LOCATION)
        self_dict.pop("agent_image_path", None)
        return AgentTemplateMetadata(
            **self_dict,
            agent_image_uri=agent_image_uri
        )


class TaskTemplate(Base, MappedProtobuf, MappedDict):
    __tablename__ = "task_templates"

    id = Column(String, primary_key=True, nullable=False)  # Task ID
    workflow_template_id = Column(String, ForeignKey(
        "workflow_templates.id"), nullable=True)  # Task templates are all assigned to workflow templates
    name = Column(String, nullable=True)  # Task name
    description = Column(Text, nullable=True)  # Task description
    expected_output = Column(Text, nullable=True)  # Expected output
    assigned_agent_template_id = Column(
        String, nullable=True)  # assigned agent template

    # Manual dict middleman to handle JSON -> repeated string conversions
    def to_protobuf(self):
        self_dict = self.to_dict()
        return TaskTemplateMetadata(
            **self_dict
        )


# Table-to-model mapping
TABLE_TO_MODEL_REGISTRY = {
    "models": Model,
    "tool_templates": ToolTemplate,
    "tool_instances": ToolInstance,
    "agents": Agent,
    "tasks": Task,
    # "external_agent_instances": ExternalAgentInstance,
    # "external_agent_family": ExternalAgentFamily,
    # "activated_external_agent_family_instance": ActivatedExternalAgentFamilyInstance,
    "workflows": Workflow,
    "workflow_templates": WorkflowTemplate,
    "agent_templates": AgentTemplate,
    "task_templates": TaskTemplate
}

MODEL_TO_TABLE_REGISTRY = {v: k for k, v in TABLE_TO_MODEL_REGISTRY.items()}
