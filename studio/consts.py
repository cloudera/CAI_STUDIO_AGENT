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
AGENT_STUDIO_UPGRADE_JOB_NAME = "Agent Studio - Upgrade"

ALL_STUDIO_DATA_LOCATION = "studio-data"
TOOL_TEMPLATE_CATALOG_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/tool_templates"
TOOL_TEMPLATE_SAMPLE_DIR = f"{TOOL_TEMPLATE_CATALOG_LOCATION}/sample_tool"
DYNAMIC_ASSETS_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/dynamic_assets"
TOOL_TEMPLATE_ICONS_LOCATION = f"{DYNAMIC_ASSETS_LOCATION}/tool_template_icons"
TOOL_INSTANCE_ICONS_LOCATION = f"{DYNAMIC_ASSETS_LOCATION}/tool_instance_icons"
AGENT_ICONS_LOCATION = f"{DYNAMIC_ASSETS_LOCATION}/agent_icons"
AGENT_TEMPLATE_ICONS_LOCATION = f"{DYNAMIC_ASSETS_LOCATION}/agent_template_icons"
TEMP_FILES_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/temp_files"
DEPLOYABLE_WORKFLOWS_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/deployable_workflows"
WORKFLOWS_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/workflows"
WORKFLOW_MODEL_FILE_PATH = f"./studio/workflow/deploy_workflow_model_v2.py"


DEFAULT_GENERATION_CONFIG = {
    "do_sample": True,
    "temperature": 0.7,
    "max_new_tokens": 4096,
    "top_p": 1,
    "top_k": 50,
    "num_beams": 1,
    "max_length": None,  # Explicity set max_length to Null to compensate for max_new_tokens
}
