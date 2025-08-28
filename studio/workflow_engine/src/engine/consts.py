from enum import Enum


class SupportedModelTypes(str, Enum):
    OPENAI = "OPENAI"
    OPENAI_COMPATIBLE = "OPENAI_COMPATIBLE"
    AZURE_OPENAI = "AZURE_OPENAI"
    GEMINI = "GEMINI"
    ANTHROPIC = "ANTHROPIC"
    CAII = "CAII"
    BEDROCK = "BEDROCK"


ALL_STUDIO_DATA_LOCATION = "studio-data"
DYNAMIC_ASSETS_LOCATION = f"{ALL_STUDIO_DATA_LOCATION}/dynamic_assets"
AGENT_STUDIO_OPS_APPLICATION_NAME = "Agent Studio - Agent Ops & Metrics"

START_TRACE_ID_KEY = "<start_trace_id>"
END_TRACE_ID_KEY = "<end_trace_id>"
