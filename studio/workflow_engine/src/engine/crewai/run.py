# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Dict, Any
from opentelemetry.context import attach, detach
import asyncio
from crewai import Crew, Agent
from crewai.tools import BaseTool
from crewai.utilities.events import crewai_event_bus

import engine.types as input_types
from engine.crewai.llms import get_crewai_llm_object_direct
from engine.crewai.tools import get_embedded_crewai_tool
from engine.crewai.agents import get_crewai_agent
from engine.crewai.events import OpsServerMessageQueueEventListener
from engine.crewai.wrappers import *


def create_crewai_objects(
    collated_input: input_types.CollatedInput,
    tool_user_params: Dict[str, Dict[str, str]],
    tracer=None,
) -> input_types.CrewAIObjects:
    language_models: Dict[str, AgentStudioCrewAILLM] = {}
    for language_model in collated_input.language_models:
        language_models[language_model.model_id] = get_crewai_llm_object_direct(language_model)

    tools: Dict[str, BaseTool] = {}
    for t_ in collated_input.tool_instances:
        tools[t_.id] = get_embedded_crewai_tool(t_, tool_user_params.get(t_.id, {}))

    agents: Dict[str, AgentStudioCrewAIAgent] = {}
    for agent in collated_input.agents:
        crewai_tools = [tools[tool_id] for tool_id in agent.tool_instance_ids]
        model_id = agent.llm_provider_model_id
        if not model_id:
            model_id = collated_input.default_language_model_id
        agents[agent.id] = get_crewai_agent(agent, crewai_tools, language_models[model_id], tracer)

    tasks: Dict[str, AgentStudioCrewAITask] = {}
    for task_input in collated_input.tasks:
        agent_for_task: Agent = agents[task_input.assigned_agent_id] if task_input.assigned_agent_id else None
        tasks[task_input.id] = AgentStudioCrewAITask(
            agent_studio_id=task_input.id,
            description=task_input.description,
            expected_output=task_input.expected_output,
            agent=agent_for_task,
            tools=agent_for_task.tools if agent_for_task else None,
        )

    workflow_input = collated_input.workflow
    crew = Crew(
        name=workflow_input.name,
        process=workflow_input.crew_ai_process,
        agents=[agents[agent_id] for agent_id in workflow_input.agent_ids],
        tasks=[tasks[task_id] for task_id in workflow_input.task_ids],
        manager_agent=agents[workflow_input.manager_agent_id] if workflow_input.manager_agent_id else None,
        manager_llm=language_models[workflow_input.llm_provider_model_id]
        if workflow_input.llm_provider_model_id
        else None,
        verbose=True,
    )

    return input_types.CrewAIObjects(
        language_models=language_models,
        tools=tools,
        agents=agents,
        tasks=tasks,
        crews={workflow_input.id: crew},
    )


async def run_workflow_async(
    collated_input: Any,
    tool_user_params: Dict[str, Dict[str, str]],
    inputs: Dict[str, Any],
    parent_context: Any,  # Use the parent context
    trace_id,
    tracer=None,
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
                listener = OpsServerMessageQueueEventListener(trace_id)

                # Run the actual workflow logic within the propagated context
                crewai_objects = create_crewai_objects(collated_input, tool_user_params, tracer)
                crew = crewai_objects.crews[collated_input.workflow.id]

                # Perform the kickoff
                crew.kickoff(inputs=dict(inputs))

        finally:
            # Detach the context when done
            detach(token)

    # Run the task in a dedicated thread
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, executor_task)
