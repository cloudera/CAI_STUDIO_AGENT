# Backward-compatible re-exports for smart/plain wrappers
# This module intentionally re-exports classes from modularized wrappers
# to avoid duplication while preserving existing import paths.

from engine.crewai.wrappers_smart import (
    AgentStudioCrewAILLM,
    AgentStudioManagerCrewAILLM,
    AgentStudioCrewAIAgent,
    AgentStudioCrewAITask,
    AgentStudioCrewAITool,
    AgentStudioDelegateWorkTool,
    AgentStudioAskQuestionTool,
)

from engine.crewai.wrappers_plain import (
    PlainCrewAILLM,
    PlainManagerCrewAILLM,
    PlainAgentStudioCrewAIAgent,
)

__all__ = [
    # Smart wrappers
    "AgentStudioCrewAILLM",
    "AgentStudioManagerCrewAILLM",
    "AgentStudioCrewAIAgent",
    "AgentStudioCrewAITask",
    "AgentStudioCrewAITool",
    "AgentStudioDelegateWorkTool",
    "AgentStudioAskQuestionTool",
    # Plain wrappers
    "PlainCrewAILLM",
    "PlainManagerCrewAILLM",
    "PlainAgentStudioCrewAIAgent",
]

