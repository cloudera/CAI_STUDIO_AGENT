from enum import Enum

DEFAULT_LITELLM_CONFIG_STORAGE_LOCATION = "/tmp/litellm_config.yaml"
DEFAULT_LITELLM_SERVER_PORT = "7198"
DEFAULT_SQLITE_DB_LOCATION = ".app/state.db"
DEFAULT_AS_GRPC_PORT = "50051"
DEFAULT_AS_PHOENIX_OPS_PLATFORM_PORT = "50051"
DEFAULT_AS_OPS_PROXY_PORT = "8123"
DEFAULT_PROJECT_DEFAULTS_LOCATION = "data/project_defaults.json"


class SupportedModelTypes(str, Enum):
    OPENAI = "OPENAI"
    OPENAI_COMPATIBLE = "OPENAI_COMPATIBLE"
    AZURE_OPENAI = "AZURE_OPENAI"


AGENT_STUDIO_SERVICE_APPLICATION_NAME = "Agent Studio"
AGENT_STUDIO_OPS_APPLICATION_NAME = "Agent Studio - Agent Ops & Metrics"

ALL_STUDIO_DATA_LOCATION = ".studio-data"
TOOL_TEMPLATE_CATALOG_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/tool_templates"
TOOL_INSTANCE_CATALOG_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/tool_instances"
DYNAMIC_ASSETS_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/dynamic_assets"
TOOL_TEMPLATE_ICONS_LOCATION = f"{DYNAMIC_ASSETS_LOCATION}/tool_template_icons"
TOOL_INSTANCE_ICONS_LOCATION = f"{DYNAMIC_ASSETS_LOCATION}/tool_instance_icons"
AGENT_ICONS_LOCATION = f"{DYNAMIC_ASSETS_LOCATION}/agent_icons"
AGENT_TEMPLATE_ICONS_LOCATION = f"{DYNAMIC_ASSETS_LOCATION}/agent_template_icons"
TEMP_FILES_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/temp_files"
DEPLOYABLE_WORKFLOWS_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/deployable_workflows"
WORKFLOWS_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/workflows"
WORKFLOW_MODEL_FILE_PATH = f"./studio/workflow/deploy_workflow_model_v2.py"

TOOL_PYTHON_CODE_TEMPLATE = '''
# File: tool.py

from textwrap import dedent
from typing import Dict, List, Optional, Type
from pydantic import BaseModel, Field
from pydantic import BaseModel as StudioBaseTool # This import is required for the tool to be recognized by the studio

# import <any other requirements(python libraries) for the tool>


class UserParameters(BaseModel):
    """
    This class is used to define the parameters that would be passed by the user.
    These are used to configuire the same tool template for different instances of the service being used by the tool.
    For example,
    This can include URLs, file paths, API keys, etc.

    User parameters can also be an empty class, if the tool does not require any user parameters.
    """

    example_url: str
    example_api_key: str
    example_file_path: Optional[str] = None
    example_other_parameter: Optional[str] = None


class {tool_class_name}(StudioBaseTool):

    class ToolParameters(BaseModel):
        """
        This class is used to define the parameters that would be determined by AI/Agents.
        Make sure to properly annotate the parameters with the correct type and description,
        so that LLMs can understand the meaning of the parameters, and suggest the correct values.
        """

        runtime_parameter_1: str = Field(
            description="Description explaining the utility of the parameter."
        )
        runtime_parameter_2: float = Field(
            description="Description explaining the utility of the parameter."
        )
        runtime_parameter_3: Optional[Dict[str, str]] = Field(
            description="Description explaining the utility of the parameter."
        )

    name: str = "{tool_name}"
    description: str = dedent(
        """
        Please write multiline decsription for the tool, so that LLMs can understand the utility of the tool.
                         
        The description can also be used to describe the parameters of the tool in much more detail.
                         
        Agent studio will also uplevel the description of the tool in the UI.
        """
    )
    args_schema: Type[BaseModel] = ToolParameters
    user_parameters: UserParameters

    def _run(
        self, runtime_parameter_1, runtime_parameter_2, runtime_parameter_3=None
    ) -> str:
        # Implementation for the tool goes here.
        return f"""
            {{self.user_parameters.example_url}}
            {{self.user_parameters.example_api_key}}
            {{self.user_parameters.example_file_path}}
            {{self.user_parameters.example_other_parameter}}
            {{runtime_parameter_1}}
            {{runtime_parameter_2}}
            {{runtime_parameter_3}}
        """

'''


TOOL_PYTHON_REQUIREMENTS_TEMPLATE = """
pydantic==2.10.6

# Refer to https://pip.pypa.io/en/stable/reference/requirements-file-format/ for requirements.txt format
# Please mention the tool specific python packages requirements below:

"""
