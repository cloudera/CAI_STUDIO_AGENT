import requests
import os

from crewai.utilities.events import *
from crewai.utilities.events.base_event_listener import BaseEventListener

from engine.ops import get_ops_endpoint

EVENT_PROCESSORS = {
    CrewKickoffStartedEvent: lambda x: {"inputs": x.inputs},
    CrewKickoffCompletedEvent: lambda x: {"output": x.output.raw},
    CrewKickoffFailedEvent: lambda x: {"error": x.error},
    CrewTrainStartedEvent: lambda x: {},
    CrewTrainCompletedEvent: lambda x: {},
    CrewTrainFailedEvent: lambda x: {},
    CrewTestStartedEvent: lambda x: {},
    CrewTestCompletedEvent: lambda x: {},
    CrewTestFailedEvent: lambda x: {},
    AgentExecutionStartedEvent: lambda x: {
        "agent": {"agent_studio_id": getattr(x.agent, "agent_studio_id", None)},
        "task": {
            "agent_studio_id": getattr(x.task, "agent_studio_id", None),
            "name": x.task.name,
            "description": x.task.description,
            "expected_output": x.task.expected_output,
        },
    },
    AgentExecutionCompletedEvent: lambda x: {
        "agent": {"agent_studio_id": getattr(x.agent, "agent_studio_id", None)},
        "task": {"agent_studio_id": getattr(x.task, "agent_studio_id", None)},
        "output": x.output,
    },
    AgentExecutionErrorEvent: lambda x: {"error": x.error},
    TaskStartedEvent: lambda x: {"context": x.context},
    TaskCompletedEvent: lambda x: {"outout": x.output.raw},
    TaskFailedEvent: lambda x: {"error": x.error},
    TaskEvaluationEvent: lambda x: {},
    FlowCreatedEvent: lambda x: {},
    FlowStartedEvent: lambda x: {},
    FlowFinishedEvent: lambda x: {},
    FlowPlotEvent: lambda x: {},
    MethodExecutionStartedEvent: lambda x: {},
    MethodExecutionFinishedEvent: lambda x: {},
    MethodExecutionFailedEvent: lambda x: {},
    ToolUsageFinishedEvent: lambda x: {
        "tool_name": x.tool_name,
        "tool_class": x.tool_class,
        "tool_args": x.tool_args,
        "run_attempts": x.run_attempts,
        "delegations": x.delegations,
        "started_at": str(x.started_at),
        "finished_at": str(x.finished_at),
    },
    ToolUsageErrorEvent: lambda x: {
        "tool_name": x.tool_name,
        "tool_class": x.tool_class,
        "error": x.error,
        "tool_args": x.tool_args,
        "run_attempts": x.run_attempts,
        "delegations": x.delegations,
    },
    ToolUsageStartedEvent: lambda x: {
        "tool_name": x.tool_name,
        "tool_class": x.tool_class,
        "tool_args": x.tool_args,
        "run_attempts": x.run_attempts,
        "delegations": x.delegations,
    },
    ToolExecutionErrorEvent: lambda x: {},
    ToolSelectionErrorEvent: lambda x: {},
    ToolUsageEvent: lambda x: {},
    ToolValidateInputErrorEvent: lambda x: {},
    LLMCallCompletedEvent: lambda x: {"response": x.response},
    LLMCallFailedEvent: lambda x: {"error": x.error},
    LLMCallStartedEvent: lambda x: {"messages": x.messages},
    LLMStreamChunkEvent: lambda x: {},
}


def process_event(event):
    base_event = {
        "type": str(event.type),
        "timestamp": str(event.timestamp),
    }
    if event.__class__ in list(EVENT_PROCESSORS.keys()):
        base_event.update(EVENT_PROCESSORS[event.__class__](event))
    return base_event


class OpsServerMessageQueueEventListener(BaseEventListener):
    def __init__(self, trace_id):
        super().__init__()
        self._trace_id = trace_id
        self._endpoint = f"{get_ops_endpoint()}/events"

    def _post_event(self, source, event):
        event_dict = {
            "timestamp": str(event.timestamp),
            "type": str(event.type),
            "agent_studio_id": getattr(source, "agent_studio_id", None),
        }
        event_dict.update(process_event(event))

        out = requests.post(
            url=self._endpoint,
            headers={"Authorization": f"Bearer {os.getenv('CDSW_APIV2_KEY')}"},
            json={"trace_id": self._trace_id, "event": event_dict},
        )

    def setup_listeners(self, crewai_event_bus):
        for event_type_cls in list(EVENT_PROCESSORS.keys()):

            @crewai_event_bus.on(event_type_cls)
            def on_crew_started(source, event):
                self._post_event(source, event)
