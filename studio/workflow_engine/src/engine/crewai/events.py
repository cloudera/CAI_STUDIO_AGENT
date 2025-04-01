from crewai.utilities.events import (
    CrewKickoffStartedEvent,
    CrewKickoffCompletedEvent,
    CrewKickoffFailedEvent,
    AgentExecutionStartedEvent,
    AgentExecutionCompletedEvent,
    AgentExecutionErrorEvent,
    TaskStartedEvent,
    TaskCompletedEvent,
    TaskFailedEvent,
    TaskEvaluationEvent,
    ToolUsageFinishedEvent,
    ToolUsageErrorEvent,
    ToolUsageStartedEvent,
    ToolExecutionErrorEvent,
    ToolSelectionErrorEvent,
    ToolUsageEvent,
    ToolValidateInputErrorEvent,
    LLMCallCompletedEvent,
    LLMCallFailedEvent,
    LLMCallStartedEvent,
)
from crewai.utilities.events.base_event_listener import BaseEventListener


EVENT_TYPES = [
    CrewKickoffStartedEvent,
    CrewKickoffCompletedEvent,
    CrewKickoffFailedEvent,
    AgentExecutionStartedEvent,
    AgentExecutionCompletedEvent,
    AgentExecutionErrorEvent,
    TaskStartedEvent,
    TaskCompletedEvent,
    TaskFailedEvent,
    TaskEvaluationEvent,
    ToolUsageFinishedEvent,
    ToolUsageErrorEvent,
    ToolUsageStartedEvent,
    ToolExecutionErrorEvent,
    ToolSelectionErrorEvent,
    ToolUsageEvent,
    ToolValidateInputErrorEvent,
    LLMCallCompletedEvent,
    LLMCallFailedEvent,
    LLMCallStartedEvent,
]


class PhoenixEventListener(BaseEventListener):
    def __init__(self):
        super().__init__()

    def setup_listeners(self, crewai_event_bus):
        for event_type in EVENT_TYPES:

            @crewai_event_bus.on(event_type)
            def event_forwarder(source, event):
                print("AHHHHHHHH IT'S WORKING")
