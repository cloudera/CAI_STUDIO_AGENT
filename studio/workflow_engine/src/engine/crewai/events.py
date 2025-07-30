import requests
import os

from crewai.utilities.events import *

from engine.crewai.trace_context import get_trace_id
from engine.ops import get_ops_endpoint

# Global mapping from (agent_key, tool_name) to tool_instance_id
_AGENT_TOOL_TO_INSTANCE_ID = {}


def _extract_tool_instance_id(event):
    """
    Extract tool instance ID from a tool event.
    Uses agent_key + tool_name mapping since agent is None in finished events.
    """
    try:
        # Create a key from agent_key and tool_name
        agent_key = getattr(event, "agent_key", None)
        tool_name = getattr(event, "tool_name", None)

        if not agent_key or not tool_name:
            return None

        # Skip delegation tools
        if tool_name in ["Delegate work to coworker", "Ask question to coworker"]:
            return None

        cache_key = (agent_key, tool_name)

        # For ToolUsageStartedEvent, extract from agent and cache it
        if hasattr(event, "agent") and event.agent and hasattr(event.agent, "tools"):
            agent_tools = getattr(event.agent, "tools", [])
            for tool in agent_tools:
                if (
                    hasattr(tool, "name")
                    and tool.name == tool_name
                    and hasattr(tool, "agent_studio_id")
                    and tool.agent_studio_id
                ):
                    tool_instance_id = tool.agent_studio_id
                    _AGENT_TOOL_TO_INSTANCE_ID[cache_key] = tool_instance_id
                    return tool_instance_id

        # For ToolUsageFinishedEvent or if not found above, use cached mapping
        if cache_key in _AGENT_TOOL_TO_INSTANCE_ID:
            tool_instance_id = _AGENT_TOOL_TO_INSTANCE_ID[cache_key]
            return tool_instance_id

        return None

    except Exception as e:
        return None


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
        "agent_studio_id": _extract_tool_instance_id(x),
    },
    ToolUsageErrorEvent: lambda x: {
        "tool_name": x.tool_name,
        "tool_class": x.tool_class,
        "error": str(x.error),
        "tool_args": x.tool_args,
        "run_attempts": x.run_attempts,
        "delegations": x.delegations,
        "agent_studio_id": _extract_tool_instance_id(x),
    },
    ToolUsageStartedEvent: lambda x: {
        "tool_name": x.tool_name,
        "tool_class": x.tool_class,
        "tool_args": x.tool_args,
        "run_attempts": x.run_attempts,
        "delegations": x.delegations,
        "agent_studio_id": _extract_tool_instance_id(x),
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
    processed_event_data = process_event(event)

    # Extract agent_studio_id with priority:
    # 1. From processed event data (for tool events)
    # 2. From source object (for other events)
    agent_studio_id = processed_event_data.get("agent_studio_id") or getattr(source, "agent_studio_id", None)

    # Maintain baseline event information
    # across all event types. Optionally, many of our crewAI classes
    # are inherited base classes with an appended agent_studio_id
    # (specifically tasks, agents, and llms). These agent studio
    # specific IDs can help in building frontend visualizations.
    event_dict = {
        "timestamp": str(event.timestamp),
        "type": str(event.type),
        "agent_studio_id": agent_studio_id,
    }

    # Process the event given the specific event type
    event_dict.update(processed_event_data)

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
