# No top level studio.db imports allowed to support wokrflow model deployment
import asyncio
from contextvars import Context

from typing import Dict, Any
from opentelemetry.context import attach, detach

from engine.crewai.trace_context import set_trace_id
from engine.crewai.crew import create_crewai_objects


def run_workflow(
    collated_input: Any,
    tool_user_params: Dict[str, Dict[str, str]],
    mcp_instance_env_vars: Dict[str, Dict[str, str]],
    inputs: Dict[str, Any],
    parent_context: Context,
    events_trace_id: str,
) -> None:
    """
    Runs a CrewAI workflow inside the given context.
    Intended to be launched either directly or via an executor thread.
    """
    token = attach(parent_context)
    try:
        set_trace_id(events_trace_id)
        crewai_objects = create_crewai_objects(collated_input, tool_user_params, mcp_instance_env_vars)
        crew = crewai_objects.crews[collated_input.workflow.id]
        crew.kickoff(inputs=dict(inputs))
    finally:
        detach(token)
        for mcp_object in crewai_objects.mcps.values():
            try:
                mcp_object.local_session.stop()
            except Exception as e:
                print(f"Error stopping MCP: {e}")


async def run_workflow_async(
    collated_input: Any,
    tool_user_params: Dict[str, Dict[str, str]],
    mcp_instance_env_vars: Dict[str, Dict[str, str]],
    inputs: Dict[str, Any],
    parent_context: Any,  # Use the parent context
    events_trace_id,
) -> None:
    """
    Run the workflow task in the background using the parent context.

    TODO: determine why this is required and asyncio.to_thread()
    cannot be used here
    """
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        run_workflow,
        collated_input,
        tool_user_params,
        mcp_instance_env_vars,
        inputs,
        parent_context,
        events_trace_id,
    )
