import requests
import os

from crewai.utilities.events import *

from engine.crewai.trace_context import get_trace_id
from engine.ops import get_ops_endpoint


# List of event processors. These are lambdas that
# can add individual fields to CrewAI events, which are
# pydantic BaseModels with event-specific fields. Only fields
# that are explicitly added to these event processors are sent
# to the workflow's event stream. These must be JSON serializable.
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
        "error": str(x.error),
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
    """
    Process a specific event. Will only add fields
    that are explicitly added in our EVENT_PROCESSORS.
    """
    processed_event = {}
    if event.__class__ in list(EVENT_PROCESSORS.keys()):
        processed_event.update(EVENT_PROCESSORS[event.__class__](event))
    return processed_event


def post_event(source, event):
    """
    Post a specific event to a specific queue in the Ops & Metrics
    message broker (Kombu). The queu is the trace ID, which is a
    context variable set specifically for the async workflow task.
    """
    trace_id = get_trace_id()

    # Maintain baseline event information
    # across all event types. Optionally, many of our crewAI classes
    # are inherited base classes with an appended agent_studio_id
    # (specifically tasks, agents, and llms). These agent studio
    # specific IDs can help in building frontend visualizations.
    event_dict = {
        "timestamp": str(event.timestamp),
        "type": str(event.type),
        "agent_studio_id": getattr(source, "agent_studio_id", None),
    }

    # Process the event given the specific event type
    event_dict.update(process_event(event))

    requests.post(
        url=f"{get_ops_endpoint()}/events",
        headers={"Authorization": f"Bearer {os.getenv('CDSW_APIV2_KEY')}"},
        json={"trace_id": trace_id, "event": event_dict},
    )


# Globalsafety flag to avoid double registration
_handlers_registered = False


def register_global_handlers():
    """
    Register global handlers that can be used on this specific workflow
    engine process. The handlers are shared and used across all execution workflows
    (across all async tasks), but each handler uses a contextvar to represent
    trace id, which is different across every task. This effectively means that
    handlers can be global (which plays nicely with CrewAI's crewai_event_bus
    global singleton) while still only reporting events to a specific
    context-specific trace ID.
    """
    global _handlers_registered
    if _handlers_registered:
        return

    for event_cls in EVENT_PROCESSORS:
        crewai_event_bus.on(event_cls)(post_event)

    _handlers_registered = True
