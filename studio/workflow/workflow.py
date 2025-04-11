import os
import shutil
from uuid import uuid4
from typing import List
from sqlalchemy.exc import SQLAlchemyError
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.api import *
from studio.proto.utils import is_field_set
from studio.task.task import extract_placeholders
from studio.task.task import remove_task
from studio.agents.agent import remove_agent, add_agent
from studio.tools.tool_instance import remove_tool_instance
from studio.cross_cutting.global_thread_pool import get_thread_pool
import studio.workflow.utils as workflow_utils
from cmlapi import CMLServiceApi
from typing import List, Set
from crewai import Process

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/worfklow_engine/src")
from engine.crewai.tools import is_venv_prepared_for_tool


def _validate_agents(metadata: CrewAIWorkflowMetadata, cml: CMLServiceApi, dao: AgentStudioDao = None) -> None:
    """
    Validate the contents of a workflow metadata object.
    """
    with dao.get_session() as session:
        # Validate if all agent IDs exist
        for agent_id in metadata.agent_id:
            agent: db_model.Agent = session.query(db_model.Agent).filter_by(id=agent_id).one_or_none()
            if not agent:
                raise ValueError(f"Agent with ID '{agent_id}' does not exist.")
    return


def _validate_tasks(
    metadata: CrewAIWorkflowMetadata, is_conversational: bool, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> None:
    """
    Validate the contents of a workflow metadata object.
    """
    with dao.get_session() as session:
        # Validate if all agent IDs exist
        for i, task_id in enumerate(metadata.task_id):
            task = session.query(db_model.Task).filter_by(id=task_id).one_or_none()
            if not task:
                raise ValueError(f"Task with ID '{task_id}' does not exist.")

            # Ensure the first task description contains only allowed placeholders for Conversational workflow
            if i == 0 and is_conversational:
                description = task.description
                fixed_placeholders = {"{user_input}", "{context}"}

                # Extract placeholders from the description
                extracted_placeholders = extract_placeholders(description)

                # Normalize extracted placeholders (e.g., ensure braces and strip whitespace)
                normalized_placeholders = {f"{{{ph.strip()}}}" for ph in extracted_placeholders}

                # Validate the placeholders
                if normalized_placeholders != fixed_placeholders:
                    raise ValueError(
                        f"First task description must contain exactly and only the placeholders {fixed_placeholders}. "
                        f"Found placeholders: {extracted_placeholders}. Current description: '{description}'"
                    )

    return


def _validate_manager_agent_or_model(
    metadata: CrewAIWorkflowMetadata, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> None:
    """
    Validate the contents of a workflow metadata object.
    """
    with dao.get_session() as session:
        # Validate manager agent ID
        if metadata.manager_agent_id:
            manager_agent = session.query(db_model.Agent).filter_by(id=metadata.manager_agent_id).one_or_none()
            if not manager_agent:
                raise ValueError(f"Manager agent with ID '{metadata.manager_agent_id}' does not exist.")

        # Validate manager_llm_model_provider_id
        manager_llm_model_provider_id = metadata.manager_llm_model_provider_id
        if manager_llm_model_provider_id and manager_llm_model_provider_id.strip():  # Check if non-empty string
            model = session.query(db_model.Model).filter_by(model_id=manager_llm_model_provider_id).one_or_none()
            if not model:
                raise ValueError(f"Model with ID '{manager_llm_model_provider_id}' does not exist.")
    return


def _validate_process(metadata: CrewAIWorkflowMetadata, cml: CMLServiceApi, dao: AgentStudioDao = None) -> None:
    """
    Validate the process type.
    """
    with dao.get_session() as session:
        # Consider empty string as falsy value for manager_llm_model_provider_id
        has_manager = metadata.manager_agent_id or (
            metadata.manager_llm_model_provider_id and metadata.manager_llm_model_provider_id.strip()
        )

        if has_manager:
            if metadata.process == Process.sequential:
                raise ValueError("Sequential process cannot have a manager agent or LLM model provider.")
    return


def add_workflow_from_template(
    request: AddWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> AddWorkflowResponse:
    """
    Add a workflow from a pre-existing workflow template.
    """

    # Assign a workflow id.
    workflow_id = str(uuid4())

    # Grab the workflow template
    with dao.get_session() as session:
        workflow_template: db_model.WorkflowTemplate = (
            session.query(db_model.WorkflowTemplate).filter_by(id=request.workflow_template_id).one()
        )

        # Create a workflow object and extract baseline content.
        workflow: db_model.Workflow = db_model.Workflow()
        workflow.id = workflow_id
        workflow.name = request.name if is_field_set(request, "name") else workflow_template.name
        workflow.description = workflow_template.description
        workflow.crew_ai_process = workflow_template.process
        workflow.is_conversational = workflow_template.is_conversational
        workflow.is_draft = True
        wf_dir = workflow_utils.get_fresh_workflow_directory(workflow.name)
        workflow.directory = wf_dir
        os.makedirs(wf_dir, exist_ok=True)

        # Create workflow pre-emptively in the database.
        session.add(workflow)

        # Create all agents
        agent_templates_to_created_agent_id: dict[str, str] = {}
        for agent_template_id in list(workflow_template.agent_template_ids):
            agent_template: db_model.AgentTemplate = (
                session.query(db_model.AgentTemplate).filter_by(id=agent_template_id).one()
            )

            add_agent_resp = add_agent(
                AddAgentRequest(
                    template_id=agent_template_id,
                    workflow_id=workflow_id,
                ),
                cml=cml,
                dao=None,
                preexisting_db_session=session,
            )
            agent_templates_to_created_agent_id[agent_template_id] = add_agent_resp.agent_id

        # Create all associated tasks
        tasks: list[db_model.Task] = []
        for task_template_id in list(workflow_template.task_template_ids):
            task_template: db_model.TaskTemplate = (
                session.query(db_model.TaskTemplate).filter_by(id=task_template_id).one()
            )
            task: db_model.Task = db_model.Task(
                id=str(uuid4()),
                name=task_template.name,
                workflow_id=workflow_id,
                description=task_template.description,
                expected_output=task_template.expected_output,
            )
            # Assign the task to the created agent
            if task_template.assigned_agent_template_id:
                task.assigned_agent_id = agent_templates_to_created_agent_id[task_template.assigned_agent_template_id]

            # Add the task
            session.add(task)
            tasks.append(task)

        # Add all agent IDs and task IDs to the workflow
        workflow.crew_ai_agents = list(agent_templates_to_created_agent_id.values())
        workflow.crew_ai_tasks = [X.id for X in tasks]

        # Add the manager agent if appropriate.
        # NOTE: manager agents do not have tools associated with them.
        if workflow_template.process == Process.hierarchical and workflow_template.manager_agent_template_id:
            agent_template: db_model.AgentTemplate = (
                session.query(db_model.AgentTemplate).filter_by(id=workflow_template.manager_agent_template_id).one()
            )
            agent: db_model.Agent = db_model.Agent(
                id=str(uuid4()),
                workflow_id=workflow_id,
                name=agent_template.name,
                crew_ai_role=agent_template.role,
                crew_ai_backstory=agent_template.backstory,
                crew_ai_goal=agent_template.goal,
                crew_ai_allow_delegation=agent_template.allow_delegation,
                crew_ai_verbose=agent_template.verbose,
                crew_ai_cache=agent_template.cache,
                crew_ai_temperature=agent_template.temperature,
                crew_ai_max_iter=agent_template.max_iter,
                tool_ids=[],
            )
            session.add(agent)
            workflow.crew_ai_manager_agent = agent.id

        session.commit()

        return AddWorkflowResponse(workflow_id=workflow.id)


def add_workflow(request: AddWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None) -> AddWorkflowResponse:
    """
    Add a new workflow based on the request parameters.
    """
    try:
        # See if this is a workflow add request from a pre-existing workflow template.
        if is_field_set(request, "workflow_template_id"):
            return add_workflow_from_template(request, cml, dao)

        # TODO: add folder creation for regular workflow adds too

        _validate_agents(request.crew_ai_workflow_metadata, cml, dao)
        _validate_tasks(request.crew_ai_workflow_metadata, request.is_conversational, cml, dao)
        _validate_manager_agent_or_model(request.crew_ai_workflow_metadata, cml, dao)
        _validate_process(request.crew_ai_workflow_metadata, cml, dao)

        with dao.get_session() as session:
            # Convert RepeatedScalarContainer to standard Python lists
            agent_ids: List[str] = list(request.crew_ai_workflow_metadata.agent_id)
            task_ids: List[str] = list(request.crew_ai_workflow_metadata.task_id)
            manager_agent_id = request.crew_ai_workflow_metadata.manager_agent_id
            manager_llm_model_provider_id = request.crew_ai_workflow_metadata.manager_llm_model_provider_id

            wf_dir = workflow_utils.get_fresh_workflow_directory(request.name)
            os.makedirs(wf_dir, exist_ok=True)

            # Create a new workflow
            workflow = db_model.Workflow(
                id=str(uuid4()),
                name=request.name,
                description=request.description,
                crew_ai_process=request.crew_ai_workflow_metadata.process,
                crew_ai_agents=agent_ids,  # Use converted list
                crew_ai_tasks=task_ids,  # Use converted list
                crew_ai_manager_agent=manager_agent_id,
                crew_ai_llm_provider_model_id=manager_llm_model_provider_id,
                is_conversational=request.is_conversational,
                is_draft=True,
                directory=wf_dir,
            )
            session.add(workflow)
            session.commit()
            return AddWorkflowResponse(workflow_id=workflow.id)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to add workflow: {str(e)}")
    except ValueError as ve:
        raise RuntimeError(f"Validation error: {str(ve)}")


def list_workflows(
    request: ListWorkflowsRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> ListWorkflowsResponse:
    """
    List all workflows with metadata, including full agent, task, and manager agent details,
    and extract unique placeholders from task descriptions.
    """
    try:
        with dao.get_session() as session:
            workflows: List[db_model.Workflow] = session.query(db_model.Workflow).all()
            if not workflows:
                return ListWorkflowsResponse(workflows=[])

            workflow_list = []
            for workflow in workflows:
                # Include workflow metadata with extracted placeholders
                workflow_list.append(
                    Workflow(
                        workflow_id=workflow.id,
                        name=workflow.name,
                        description=workflow.description,
                        crew_ai_workflow_metadata=CrewAIWorkflowMetadata(
                            agent_id=workflow.crew_ai_agents,
                            task_id=workflow.crew_ai_tasks,
                            manager_agent_id=workflow.crew_ai_manager_agent,
                            process=workflow.crew_ai_process,
                            manager_llm_model_provider_id=workflow.crew_ai_llm_provider_model_id,
                        ),
                        # No need to do expensive computation on list operation.
                        is_ready=False,
                        is_conversational=workflow.is_conversational,
                        is_draft=workflow.is_draft,
                        directory=workflow.directory,
                    )
                )
            return ListWorkflowsResponse(workflows=workflow_list)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to list workflows: {str(e)}")


def get_workflow(request: GetWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None) -> GetWorkflowResponse:
    """
    Get details of a specific workflow by its ID, including full agent, task, and manager agent metadata,
    and extract unique placeholders from task descriptions.
    """
    try:
        if not request.workflow_id:
            raise ValueError("Workflow ID is required.")

        with dao.get_session() as session:
            workflow = session.query(db_model.Workflow).filter_by(id=request.workflow_id).one_or_none()
            if not workflow:
                raise ValueError(f"Workflow with ID '{request.workflow_id}' not found.")

            agent_ids = workflow.crew_ai_agents or []
            agents: List[db_model.Agent] = []
            if agent_ids:
                agents = session.query(db_model.Agent).filter(db_model.Agent.id.in_(agent_ids)).all()

            # Collect all tool IDs from agents
            tool_instance_ids: Set[str] = set()
            for agent in agents:
                if agent.tool_ids:
                    tool_instance_ids.update(agent.tool_ids)

            # Get all tool instances in a single query
            tool_instances: List[db_model.ToolInstance] = []
            if tool_instance_ids:
                tool_instances = (
                    session.query(db_model.ToolInstance)
                    .filter(db_model.ToolInstance.id.in_(list(tool_instance_ids)))
                    .all()
                )

            are_all_tools_ready = all(
                is_venv_prepared_for_tool(t_.source_folder_path, t_.python_requirements_file_name)
                for t_ in tool_instances
            )

            # Include workflow metadata with extracted placeholders
            workflow_metadata = Workflow(
                workflow_id=workflow.id,
                name=workflow.name,
                description=workflow.description,
                crew_ai_workflow_metadata=CrewAIWorkflowMetadata(
                    agent_id=workflow.crew_ai_agents,
                    task_id=workflow.crew_ai_tasks,
                    manager_agent_id=workflow.crew_ai_manager_agent,
                    process=workflow.crew_ai_process,
                    manager_llm_model_provider_id=workflow.crew_ai_llm_provider_model_id,
                ),
                is_ready=are_all_tools_ready,
                is_conversational=workflow.is_conversational,
                is_draft=workflow.is_draft,
                directory=workflow.directory,
            )
            return GetWorkflowResponse(workflow=workflow_metadata)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to get workflow: {str(e)}")


def update_workflow(
    request: UpdateWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> UpdateWorkflowResponse:
    """
    Update the configuration of an existing workflow.
    """
    try:
        if not request.workflow_id:
            raise ValueError("Workflow ID is required.")

        with dao.get_session() as session:
            # Fetch the existing workflow
            workflow = session.query(db_model.Workflow).filter_by(id=request.workflow_id).one_or_none()
            if not workflow:
                raise ValueError(f"Workflow with ID '{request.workflow_id}' not found.")

            # Update workflow name if provided
            if is_field_set(request, "name"):
                workflow.name = request.name

            # Update workflow name if provided
            if is_field_set(request, "description"):
                workflow.description = request.description

            # Update is_conversational - handle both True and False values
            if hasattr(request, "is_conversational"):
                workflow.is_conversational = bool(request.is_conversational)

            # Process metadata updates
            if is_field_set(request, "crew_ai_workflow_metadata"):
                metadata = request.crew_ai_workflow_metadata

                # Validate and update agent IDs
                if is_field_set(metadata, "agent_id"):
                    _validate_agents(metadata, cml, dao)
                    workflow.crew_ai_agents = list(metadata.agent_id)

                # Validate and update task IDs
                if is_field_set(metadata, "task_id"):
                    is_conversational = (
                        request.is_conversational
                        if hasattr(request, "is_conversational")
                        else workflow.is_conversational
                    )
                    _validate_tasks(metadata, is_conversational, cml, dao)
                    workflow.crew_ai_tasks = list(metadata.task_id)

                # Update manager agent ID
                if hasattr(metadata, "manager_agent_id"):
                    if metadata.manager_agent_id and metadata.manager_agent_id.strip():
                        _validate_manager_agent_or_model(metadata, cml, dao)
                        workflow.crew_ai_manager_agent = metadata.manager_agent_id
                    else:
                        workflow.crew_ai_manager_agent = ""

                # Update manager LLM model provider ID
                if hasattr(metadata, "manager_llm_model_provider_id"):
                    if metadata.manager_llm_model_provider_id and metadata.manager_llm_model_provider_id.strip():
                        _validate_manager_agent_or_model(metadata, cml, dao)
                        workflow.crew_ai_llm_provider_model_id = metadata.manager_llm_model_provider_id
                    else:
                        workflow.crew_ai_llm_provider_model_id = ""

                # Update process if provided
                if is_field_set(metadata, "process"):
                    _validate_process(metadata, cml, dao)
                    workflow.crew_ai_process = metadata.process

            # Workflow enters draft mode after committing a change to the workflow. If the
            # workflow is published, that published workflow then goes stale.
            workflow.is_draft = True

            # Any deployed workflow instances have now entered a stale state.
            deployed_workflow_instances = (
                session.query(db_model.DeployedWorkflowInstance).filter_by(workflow_id=workflow.id).all()
            )
            for deployed_workflow_instance in deployed_workflow_instances:
                deployed_workflow_instance.is_stale = True

            # Commit the updated workflow
            session.commit()
            return UpdateWorkflowResponse()

    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to update workflow: {str(e)}")
    except ValueError as ve:
        raise RuntimeError(f"Validation error: {str(ve)}")


def _delete_workflow_directory(directory: str):
    try:
        if os.path.exists(directory):
            shutil.rmtree(directory)
            print(f"Deleted workflow directory: {directory}")
    except Exception as e:
        print(f"Failed to delete workflow directory: {e}")


def remove_workflow(
    request: RemoveWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> RemoveWorkflowResponse:
    """
    Remove an existing workflow by its ID.
    """
    try:
        if not request.workflow_id:
            raise ValueError("Workflow ID is required.")

        with dao.get_session() as session:
            workflow = session.query(db_model.Workflow).filter_by(id=request.workflow_id).one_or_none()
            if not workflow:
                raise ValueError(f"Workflow with ID '{request.workflow_id}' not found.")

            # Delete all tasks associated with this workflow
            tasks: List[db_model.Task] = session.query(db_model.Task).filter_by(workflow_id=request.workflow_id)
            for task in tasks:
                remove_task(RemoveTaskRequest(task_id=task.id), cml, dao=dao)

            # Delete all agents associated with this workflow
            agents: List[db_model.Agent] = session.query(db_model.Agent).filter_by(workflow_id=request.workflow_id)
            for agent in agents:
                remove_agent(RemoveAgentRequest(agent_id=agent.id), cml, dao=dao)

            # Delete all tool instances associated with this workflow
            tool_instances: List[db_model.ToolInstance] = session.query(db_model.ToolInstance).filter_by(
                workflow_id=request.workflow_id
            )
            for tool_instance in tool_instances:
                remove_tool_instance(
                    RemoveToolInstanceRequest(tool_instance_id=tool_instance.id),
                    cml,
                    delete_tool_directory=False,
                    dao=None,
                    preexisting_db_session=session,
                )

            # Finally, delete the workflow

            get_thread_pool().submit(
                _delete_workflow_directory,
                workflow.directory,
            )

            session.delete(workflow)
            return RemoveWorkflowResponse()
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to remove workflow: {str(e)}")
