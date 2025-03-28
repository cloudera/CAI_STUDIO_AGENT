# No top level studio.db imports allowed to support wokrflow model deployment

from typing import List, Dict, Literal, Optional, Any, Type
from pydantic import BaseModel
import sys
import studio.cross_cutting.input_types as input_types
from contextlib import contextmanager
import os
import requests
import importlib
from opentelemetry.context import attach, detach, Context
import asyncio
from crewai import Task, Crew, LLM as CrewAILLM, Agent
from crewai.tools import BaseTool

from studio.tools.utils import extract_tool_class_name, get_tool_instance_proxy
from studio.models.utils import get_crewai_llm_object_direct, get_crewai_llm_object_proxied
from studio.workflow.ops_wrappers import WrappedAgent
from studio.cross_cutting import utils as cc_utils
from studio import consts


def is_custom_model_root_dir_feature_enabled() -> bool:
    """
    Currently custom model root dirs for Workbench models are hidden behind
    the ML_ENABLE_COMPOSABLE_AMPS entitlement, which can be checked with
    unauthenticated access at our /sense-bootstrap.json endpoint.
    """

    # Grab the bootstrap data
    bootstrap_data: dict = requests.get(f"https://{os.getenv('CDSW_DOMAIN')}/sense-bootstrap.json").json()

    # Return the result of the entitlement we are looking for
    # and default this to false (for older workbenches). "enable_ai_studios"
    # is translated upstream from ML_ENABLE_COMPOSABLE_AMPS, which is the
    # entitlement that blocks the model root dir feature.
    return bootstrap_data.get("enable_ai_studios", False)


def _import_module_with_isolation(module_name: str, module_path: str):
    """
    Import a module while ensuring isolation from previously imported modules,
    while properly handling relative imports within the module.

    Args:
        module_name: Name of the module to import (without .py extension)
        module_path: Absolute path to the directory containing the module
    """

    @contextmanager
    def temporary_sys_path(path):
        """Temporarily add a path to sys.path"""
        sys.path.insert(0, path)
        try:
            yield
        finally:
            if path in sys.path:
                sys.path.remove(path)

    # Generate a unique name for the module to avoid namespace conflicts
    unique_module_name = f"{module_name}_{hash(module_path)}"

    # Remove any existing module with the same name from sys.modules
    for key in list(sys.modules.keys()):
        if key == unique_module_name or key.startswith(f"{unique_module_name}."):
            del sys.modules[key]

    # Create the full path to the module file
    full_path = os.path.join(module_path, f"{module_name}.py")

    # Load the module specification
    spec = importlib.util.spec_from_file_location(unique_module_name, full_path)
    if spec is None:
        raise ImportError(f"Could not load module specification from {full_path}")

    # Create the module
    module = importlib.util.module_from_spec(spec)

    # Add the module path to sys.modules to handle relative imports
    sys.modules[unique_module_name] = module

    # Add the module's directory to sys.path temporarily and execute the module
    with temporary_sys_path(module_path):
        if spec.loader is None:
            raise ImportError(f"Could not load module from {full_path}")
        try:
            spec.loader.exec_module(module)
        except Exception as e:
            # Clean up sys.modules in case of an error
            if unique_module_name in sys.modules:
                del sys.modules[unique_module_name]
            raise e

    return module


def _get_embedded_crewai_tool(
    tool_instance: input_types.Input__ToolInstance, user_params_kv: Dict[str, str]
) -> BaseTool:
    relative_module_dir = os.path.abspath(tool_instance.source_folder_path)
    module = _import_module_with_isolation(tool_instance.python_code_file_name.replace(".py", ""), relative_module_dir)
    with open(os.path.join(relative_module_dir, tool_instance.python_code_file_name), "r") as code_file:
        tool_code = code_file.read()
        tool_class_name = extract_tool_class_name(tool_code)
    studio_tool_class: Type[BaseModel] = getattr(module, tool_class_name)
    user_param_base_model: Type[BaseModel] = getattr(module, "UserParameters")
    user_params = user_param_base_model(**user_params_kv)
    studio_tool_instance = studio_tool_class(user_parameters=user_params)

    class EmbeddedCrewAITool(BaseTool):
        name: str = studio_tool_instance.name
        description: str = studio_tool_instance.description
        args_schema: Type[BaseModel] = studio_tool_instance.args_schema

        def _run(self, *args, **kwargs):
            return studio_tool_instance._run(*args, **kwargs)

    crewai_tool: BaseTool = EmbeddedCrewAITool()

    # This is a workaround to use DB-specific name in the tool rather
    # than the "mandatory" field set within the tool code.
    crewai_tool.name = tool_instance.name
    crewai_tool._generate_description()
    # Force Python to reload module paths
    importlib.invalidate_caches()
    return crewai_tool


def _get_crewai_agent(
    agent: input_types.Input__Agent,
    crewai_tools: Optional[List[BaseTool]] = None,
    llm_model: Optional[CrewAILLM] = None,
) -> Agent:
    return WrappedAgent(
        agent_studio_id=agent.id,
        role=agent.crew_ai_role,
        backstory=agent.crew_ai_backstory,
        goal=agent.crew_ai_goal,
        allow_delegation=agent.crew_ai_allow_delegation,
        verbose=agent.crew_ai_verbose,
        cache=agent.crew_ai_cache,
        max_iter=10 if agent.crew_ai_max_iter <= 0 else agent.crew_ai_max_iter,
        tools=crewai_tools or list(),
        llm=llm_model,
    )


def get_fresh_workflow_directory(workflow_name: str) -> str:
    return f"{consts.WORKFLOWS_LOCATION}/{cc_utils.create_slug_from_name(workflow_name)}_{cc_utils.get_random_compact_string()}"


def create_crewai_objects(
    collated_input: input_types.CollatedInput,
    tool_user_params: Dict[str, Dict[str, str]],
    for_: Literal["test", "deploy"],
    preexisting_db_session=None,
) -> input_types.CrewAIObjects:
    language_models: Dict[str, CrewAILLM] = {}
    for language_model in collated_input.language_models:
        if for_ == "test":
            language_models[language_model.model_id] = get_crewai_llm_object_proxied(
                language_model, preexisting_db_session
            )
        else:
            language_models[language_model.model_id] = get_crewai_llm_object_direct(language_model)

    tools: Dict[str, BaseTool] = {}
    for t_ in collated_input.tool_instances:
        if for_ == "test":
            tools[t_.id] = get_tool_instance_proxy(t_, tool_user_params.get(t_.id, {}))
        else:
            tools[t_.id] = _get_embedded_crewai_tool(t_, tool_user_params.get(t_.id, {}))

    agents: Dict[str, Agent] = {}
    for agent in collated_input.agents:
        crewai_tools = [tools[tool_id] for tool_id in agent.tool_instance_ids]
        model_id = agent.llm_provider_model_id
        if not model_id:
            model_id = collated_input.default_language_model_id
        agents[agent.id] = _get_crewai_agent(agent, crewai_tools, language_models[model_id])

    tasks: Dict[str, Task] = {}
    for task_input in collated_input.tasks:
        agent_for_task: Agent = agents[task_input.assigned_agent_id] if task_input.assigned_agent_id else None
        tasks[task_input.id] = Task(
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


def invalidate_workflow(preexisting_db_session, condition) -> None:
    """
    Move dependent workflows to draft mode and mark any dependent deployed workflows as stale.
    """
    from studio.db import model as db_model, DbSession

    session: DbSession = preexisting_db_session

    dependent_workflows = session.query(db_model.Workflow).filter(condition).all()
    for workflow in dependent_workflows:
        workflow.is_draft = True
        deployed_workflows: List[db_model.DeployedWorkflowInstance] = (
            session.query(db_model.DeployedWorkflowInstance).filter_by(workflow_id=workflow.id).all()
        )
        for deployed_workflow in deployed_workflows:
            deployed_workflow.is_stale = True
    return


async def run_workflow_task(
    collated_input: Any,
    tool_user_params: Dict[str, Dict[str, str]],
    inputs: Dict[str, Any],
    parent_context: Any,  # Use the parent context
) -> None:
    """
    Run the workflow task in the background using the parent context.
    """

    def workflow_task():
        # Attach the parent context in the background thread
        token = attach(parent_context)

        try:
            # Run the actual workflow logic within the propagated context
            crewai_objects = create_crewai_objects(
                collated_input, tool_user_params, "deploy", preexisting_db_session=None
            )
            crew = crewai_objects.crews[collated_input.workflow.id]

            # Perform the kickoff
            crew.kickoff(inputs=dict(inputs))

        finally:
            # Detach the context when done
            detach(token)

    # Run the task in a dedicated thread
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, workflow_task)


def run_workflow_with_context(crew: Crew, inputs, parent_context: Context):
    """Run workflow with the parent OpenTelemetry context"""
    # Attach the parent context
    token = attach(parent_context)
    try:
        print(f"Running workflow {crew.name} with context")
        return crew.kickoff(inputs=inputs)
    finally:
        # Detach the context
        detach(token)
