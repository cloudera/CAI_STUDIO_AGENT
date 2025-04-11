# No top level studio.db imports allowed to support wokrflow model deployment
import asyncio

from typing import Dict, Any
from opentelemetry.context import attach, detach
from crewai.utilities.events import crewai_event_bus

from engine.crewai.events import OpsServerMessageQueueEventListener
from engine.crewai.crew import create_crewai_objects


def run_workflow(
    collated_input: Any,
    tool_user_params: Dict[str, Dict[str, str]],
    inputs: Dict[str, Any],
    parent_context: Any,  # Use the parent context
    events_trace_id,
) -> None:
    """
    Run the workflow task in the background using the parent context.
    """

    def executor_task():
        # Attach the parent context in the background thread
        token = attach(parent_context)

        try:
            with crewai_event_bus.scoped_handlers():
                # Create our message broker
                print("Creating event listener....")
                listener = OpsServerMessageQueueEventListener(events_trace_id)

                # Run the actual workflow logic within the propagated context
                crewai_objects = create_crewai_objects(collated_input, tool_user_params)
                crew = crewai_objects.crews[collated_input.workflow.id]

                # Perform the kickoff
                crew.kickoff(inputs=dict(inputs))

        finally:
            # Detach the context when done
            detach(token)

    # Run the task in a dedicated thread
    executor_task()


async def run_workflow_async(
    collated_input: Any,
    tool_user_params: Dict[str, Dict[str, str]],
    inputs: Dict[str, Any],
    parent_context: Any,  # Use the parent context
    events_trace_id,
) -> None:
    """
    Run the workflow task in the background using the parent context.
    """

    def executor_task():
        # Attach the parent context in the background thread
        token = attach(parent_context)

        try:
            with crewai_event_bus.scoped_handlers():
                # Create our message broker
                print("Creating event listener....")
                listener = OpsServerMessageQueueEventListener(events_trace_id)

                # Run the actual workflow logic within the propagated context
                crewai_objects = create_crewai_objects(collated_input, tool_user_params)
                crew = crewai_objects.crews[collated_input.workflow.id]

                # Perform the kickoff
                crew.kickoff(inputs=dict(inputs))

        finally:
            # Detach the context when done
            detach(token)

    # Run the task in a dedicated thread
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, executor_task)
