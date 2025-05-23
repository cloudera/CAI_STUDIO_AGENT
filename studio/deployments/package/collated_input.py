import json
from typing import List
import json

from studio.db import model as db_model
from studio.models.utils import get_studio_default_model_id
import studio.consts as consts
from studio.tools.utils import read_tool_instance_code, extract_user_params_from_code

from studio.db.model import Workflow
from sqlalchemy.orm.session import Session

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src")

import engine.types as input_types


def create_collated_input(workflow: Workflow, session: Session) -> input_types.CollatedInput:
    """
    Create a serializable collated input type that can be written to a JSON
    file to be used for packaging up workflows, or alternatively be passed as
    part of a payload to a workflow engine test runner. NOTE: LLM API keys are
    also extracted from the CML environment here.
    """

    # For now, we only allow one a singular generation config
    # shared across all LLMs. This can be updated in the future
    # if we need it to be. To control generation config for a deployment,
    # you must pass it during deploy job time in the form of
    # deployment_config.generation_config.
    llm_generation_config = consts.DEFAULT_GENERATION_CONFIG

    default_llm = session.query(db_model.Model).filter_by(is_studio_default=True).one_or_none()
    if not default_llm:
        raise ValueError(f"Default model not found.")

    task_ids = list(workflow.crew_ai_tasks) or list()
    agent_ids = set(workflow.crew_ai_agents) or set()
    if workflow.crew_ai_manager_agent:
        agent_ids.add(workflow.crew_ai_manager_agent)
    tool_instance_ids, mcp_instance_ids = set(), set()
    language_model_ids = set([default_llm.model_id])
    if workflow.crew_ai_llm_provider_model_id:
        language_model_ids.add(workflow.crew_ai_llm_provider_model_id)

    task_db_models = session.query(db_model.Task).filter(db_model.Task.id.in_(task_ids)).all()
    task_inputs: List[input_types.Input__Task] = []
    for task_id in task_ids:
        task_db_model = next((t for t in task_db_models if t.id == task_id), None)
        if not task_db_model:
            raise ValueError(f"Task with ID '{task_id}' not found.")
        task_inputs.append(
            input_types.Input__Task(
                id=task_db_model.id,
                description=task_db_model.description,
                expected_output=task_db_model.expected_output,
                assigned_agent_id=task_db_model.assigned_agent_id,
            )
        )
        if task_db_model.assigned_agent_id:
            agent_ids.add(task_db_model.assigned_agent_id)

    agent_db_models = session.query(db_model.Agent).filter(db_model.Agent.id.in_(agent_ids)).all()
    agent_inputs: List[input_types.Input__Agent] = []
    for agent_id in agent_ids:
        agent_db_model = next((a for a in agent_db_models if a.id == agent_id), None)
        if not agent_db_model:
            raise ValueError(f"Agent with ID '{agent_id}' not found.")
        agent_inputs.append(
            input_types.Input__Agent(
                id=agent_db_model.id,
                name=agent_db_model.name,
                llm_provider_model_id=agent_db_model.llm_provider_model_id,
                crew_ai_role=agent_db_model.crew_ai_role,
                crew_ai_backstory=agent_db_model.crew_ai_backstory,
                crew_ai_goal=agent_db_model.crew_ai_goal,
                crew_ai_allow_delegation=agent_db_model.crew_ai_allow_delegation,
                crew_ai_verbose=agent_db_model.crew_ai_verbose,
                crew_ai_cache=agent_db_model.crew_ai_cache,
                # crew_ai_temperature=agent_db_model.crew_ai_temperature,  # NOTE: temperature from schema is unused
                crew_ai_max_iter=agent_db_model.crew_ai_max_iter,
                tool_instance_ids=list(agent_db_model.tool_ids) if agent_db_model.tool_ids else [],
                mcp_instance_ids=list(agent_db_model.mcp_instance_ids) if agent_db_model.mcp_instance_ids else [],
                agent_image_uri=agent_db_model.agent_image_path or "",
            )
        )
        if agent_db_model.llm_provider_model_id:
            language_model_ids.add(agent_db_model.llm_provider_model_id)
        tool_instance_ids.update(list(agent_db_model.tool_ids or []))
        mcp_instance_ids.update(list(agent_db_model.mcp_instance_ids or []))

    tool_instance_db_models = (
        session.query(db_model.ToolInstance).filter(db_model.ToolInstance.id.in_(tool_instance_ids)).all()
    )
    tool_instance_inputs: List[input_types.Input__ToolInstance] = []
    for t_id in tool_instance_ids:
        tool_instance_db_model = next((t for t in tool_instance_db_models if t.id == t_id), None)
        if not tool_instance_db_model:
            raise ValueError(f"Tool Instance with ID '{t_id}' not found.")

        status_message = ""
        try:
            tool_code, _ = read_tool_instance_code(tool_instance_db_model)
            user_params_dict = extract_user_params_from_code(tool_code)
        except Exception as e:
            status_message = f"Could not extract user param metadata from code: {str(e)}"

        tool_instance_inputs.append(
            input_types.Input__ToolInstance(
                id=tool_instance_db_model.id,
                name=tool_instance_db_model.name,
                python_code_file_name=tool_instance_db_model.python_code_file_name,
                python_requirements_file_name=tool_instance_db_model.python_requirements_file_name,
                source_folder_path=tool_instance_db_model.source_folder_path,
                tool_metadata=json.dumps(
                    {
                        "user_params": list(user_params_dict.keys()),
                        "user_params_metadata": user_params_dict,
                        "status": status_message,
                    }
                ),
                tool_image_uri=tool_instance_db_model.tool_image_path or "",
                is_venv_tool=tool_instance_db_model.is_venv_tool,
            )
        )

    mcp_instance_db_models = (
        session.query(db_model.MCPInstance).filter(db_model.MCPInstance.id.in_(mcp_instance_ids)).all()
    )
    mcp_instance_inputs: List[input_types.Input__MCPInstance] = []
    for m_id in mcp_instance_ids:
        mcp_instance_db_model = next((m for m in mcp_instance_db_models if m.id == m_id), None)
        if not mcp_instance_db_model:
            raise ValueError(f"MCP Instance with ID '{m_id}' not found.")

        mcp_instance_inputs.append(
            input_types.Input__MCPInstance(
                id=str(mcp_instance_db_model.id),
                name=str(mcp_instance_db_model.name),
                type=str(mcp_instance_db_model.type),
                args=list(mcp_instance_db_model.args) if mcp_instance_db_model.args else [],
                env_names=list(mcp_instance_db_model.env_names) if mcp_instance_db_model.env_names else [],
                tools=list(mcp_instance_db_model.activated_tools) if mcp_instance_db_model.activated_tools else [],
                mcp_image_uri="",  # MCP icons not supported yet
            )
        )

    language_model_db_models = (
        session.query(db_model.Model).filter(db_model.Model.model_id.in_(language_model_ids)).all()
    )
    language_model_inputs: List[input_types.Input__LanguageModel] = []
    for lm_id in language_model_ids:
        language_model_db_model = next((lm for lm in language_model_db_models if lm.model_id == lm_id), None)
        if not language_model_db_model:
            raise ValueError(f"Language Model with ID '{lm_id}' not found.")
        language_model_inputs.append(
            input_types.Input__LanguageModel(
                model_id=language_model_db_model.model_id,
                model_name=language_model_db_model.model_name,
                generation_config=llm_generation_config,
            )
        )

    # If we have a default manager, assign to the default model for testing.
    llm_provider_model_id = ""
    if workflow.crew_ai_process == "hierarchical" and not workflow.crew_ai_manager_agent:
        llm_provider_model_id = (
            workflow.crew_ai_llm_provider_model_id
            or get_studio_default_model_id(dao=None, preexisting_db_session=session)[1]
        )

    workflow_input = input_types.Input__Workflow(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        crew_ai_process=workflow.crew_ai_process,
        agent_ids=list(workflow.crew_ai_agents) if workflow.crew_ai_agents else [],
        task_ids=list(workflow.crew_ai_tasks) if workflow.crew_ai_tasks else [],
        manager_agent_id=workflow.crew_ai_manager_agent or None,
        llm_provider_model_id=llm_provider_model_id or None,
        is_conversational=workflow.is_conversational,
    )

    collated_input = input_types.CollatedInput(
        default_language_model_id=default_llm.model_id,
        language_models=language_model_inputs,
        tool_instances=tool_instance_inputs,
        mcp_instances=mcp_instance_inputs,
        agents=agent_inputs,
        tasks=task_inputs,
        workflow=workflow_input,
    )
    return collated_input
