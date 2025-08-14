from uuid import uuid4
from typing import List
from sqlalchemy.exc import SQLAlchemyError
from studio.db.dao import AgentStudioDao
from studio.db import model as db_model
from studio.api import *
from cmlapi import CMLServiceApi
import re
from studio.proto.utils import is_field_set


def add_task(request: AddTaskRequest, cml: CMLServiceApi, dao: AgentStudioDao = None) -> AddTaskResponse:
    """
    Add a new task based on the request parameters.
    """
    try:
        with dao.get_session() as session:
            # Validate assigned agent ID if provided
            if request.add_crew_ai_task_request.assigned_agent_id:
                agent: db_model.Agent = (
                    session.query(db_model.Agent)
                    .filter_by(id=request.add_crew_ai_task_request.assigned_agent_id)
                    .one_or_none()
                )
                if not agent:
                    raise ValueError(
                        f"Assigned agent with ID '{request.add_crew_ai_task_request.assigned_agent_id}' does not exist."
                    )

            # Create a new task
            new_task = db_model.Task(
                id=str(uuid4()),
                description=request.add_crew_ai_task_request.description,
                expected_output=request.add_crew_ai_task_request.expected_output,
                assigned_agent_id=request.add_crew_ai_task_request.assigned_agent_id or None,
                workflow_id=request.workflow_id,
            )
            session.add(new_task)
            session.commit()
            return AddTaskResponse(task_id=new_task.id)
    except ValueError as e:
        raise RuntimeError(f"Validation error: {str(e)}")
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to add task: {str(e)}")


def update_task(request: UpdateTaskRequest, cml: CMLServiceApi, dao: AgentStudioDao = None) -> UpdateTaskResponse:
    """
    Update the configuration of an existing task.
    """
    try:
        with dao.get_session() as session:
            # Retrieve the task to be updated
            task = session.query(db_model.Task).filter_by(id=request.task_id).one_or_none()
            if not task:
                raise ValueError(f"Task with ID '{request.task_id}' not found.")

            # Validate assigned agent ID if provided
            if request.UpdateCrewAITaskRequest.assigned_agent_id:
                agent: db_model.Agent = (
                    session.query(db_model.Agent)
                    .filter_by(id=request.UpdateCrewAITaskRequest.assigned_agent_id)
                    .one_or_none()
                )
                if not agent:
                    raise ValueError(
                        f"Assigned agent with ID '{request.UpdateCrewAITaskRequest.assigned_agent_id}' does not exist."
                    )

            # Update fields only if provided in the request
            if request.UpdateCrewAITaskRequest.description:
                task.description = request.UpdateCrewAITaskRequest.description
            if request.UpdateCrewAITaskRequest.expected_output:
                task.expected_output = request.UpdateCrewAITaskRequest.expected_output
            if request.UpdateCrewAITaskRequest.assigned_agent_id is not None:
                task.assigned_agent_id = request.UpdateCrewAITaskRequest.assigned_agent_id or None

            session.commit()
            return UpdateTaskResponse()
    except ValueError as e:
        raise RuntimeError(f"Validation error: {str(e)}")
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to update task: {str(e)}")


def list_tasks(request: ListTasksRequest, cml: CMLServiceApi, dao: AgentStudioDao = None) -> ListTasksResponse:
    """
    List all tasks with metadata, ensuring assigned agent IDs exist or are empty.
    """
    try:
        with dao.get_session() as session:
            tasks: List[db_model.Task] = session.query(db_model.Task).all()
            if not tasks:
                return ListTasksResponse(tasks=[])

            # Filter by workflow id
            if is_field_set(request, "workflow_id"):
                tasks = list(filter(lambda x: x.workflow_id == request.workflow_id, tasks))

            task_list = []
            for task in tasks:
                is_valid = True  # Default to true if assigned_agent_id is empty
                # Validate assigned agent ID only if it's not an empty string
                if task.assigned_agent_id:
                    agent_exists = session.query(db_model.Agent).filter_by(id=task.assigned_agent_id).one_or_none()
                    is_valid = bool(agent_exists)

                task_list.append(
                    CrewAITaskMetadata(
                        task_id=task.id,
                        workflow_id=task.workflow_id,
                        description=task.description,
                        expected_output=task.expected_output,
                        assigned_agent_id=task.assigned_agent_id,
                        is_valid=is_valid,
                        inputs=extract_placeholders(task.description),
                    )
                )

            return ListTasksResponse(tasks=task_list)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to list tasks: {str(e)}")


def get_task(request: GetTaskRequest, cml: CMLServiceApi, dao: AgentStudioDao = None) -> GetTaskResponse:
    """
    Get details of a specific task by its ID, ensuring the assigned agent ID exists or is empty.
    """
    try:
        if not request.task_id:
            raise ValueError("Task ID is required.")

        with dao.get_session() as session:
            task = session.query(db_model.Task).filter_by(id=request.task_id).one_or_none()
            if not task:
                raise ValueError(f"Task with ID '{request.task_id}' not found.")

            is_valid = True  # Default to true if assigned_agent_id is empty
            # Validate assigned agent ID only if it's not an empty string
            if task.assigned_agent_id:
                agent_exists = session.query(db_model.Agent).filter_by(id=task.assigned_agent_id).one_or_none()
                is_valid = bool(agent_exists)

            task_metadata = CrewAITaskMetadata(
                task_id=task.id,
                workflow_id=task.workflow_id,
                description=task.description,
                expected_output=task.expected_output,
                assigned_agent_id=task.assigned_agent_id,
                is_valid=is_valid,
                inputs=extract_placeholders(task.description),
            )
            return GetTaskResponse(task=task_metadata)
    except ValueError as e:
        raise RuntimeError(f"Validation error: {str(e)}")
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to get task: {str(e)}")


def remove_task(request: RemoveTaskRequest, cml: CMLServiceApi, dao: AgentStudioDao = None) -> RemoveTaskResponse:
    """
    Remove an existing task by its ID.
    """
    try:
        if not request.task_id:
            raise ValueError("Task ID is required.")

        with dao.get_session() as session:
            task = session.query(db_model.Task).filter_by(id=request.task_id).one_or_none()
            if not task:
                raise ValueError(f"Task with ID '{request.task_id}' not found.")

            session.delete(task)
            session.commit()
            return RemoveTaskResponse()
    except ValueError as e:
        raise RuntimeError(f"Validation error: {str(e)}")
    except SQLAlchemyError as e:
        raise RuntimeError(f"Failed to remove task: {str(e)}")


def extract_placeholders(description: str) -> List[str]:
    """
    Extract unique placeholders enclosed in curly braces from a description.
    """
    return list(set(re.findall(r"{(.*?)}", description)))


def parse_description(description: str, inputs: dict) -> str:
    """
    Replace placeholders in the task description with corresponding input values.
    """
    for key, value in inputs.items():
        placeholder = f"{{{key}}}"
        description = description.replace(placeholder, value)
    return description
