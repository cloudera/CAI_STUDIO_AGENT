import json
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


def get_default_llm(session: Session):
    default_llm = session.query(db_model.Model).filter_by(is_studio_default=True).one_or_none()
    if not default_llm:
        raise ValueError("Default model not found.")
    return default_llm


def get_tasks_for_workflow(workflow: Workflow, session: Session):
    task_ids = list(workflow.crew_ai_tasks or [])
    tasks = session.query(db_model.Task).filter(db_model.Task.id.in_(task_ids)).all()

    inputs = []
    agent_ids = set()
    for tid in task_ids:
        task = next((t for t in tasks if t.id == tid), None)
        if not task:
            raise ValueError(f"Task with ID '{tid}' not found.")
        inputs.append(
            input_types.Input__Task(
                id=task.id,
                description=task.description,
                expected_output=task.expected_output,
                assigned_agent_id=task.assigned_agent_id,
            )
        )
        if task.assigned_agent_id:
            agent_ids.add(task.assigned_agent_id)

    return inputs, agent_ids


def get_agents_for_workflow(workflow: Workflow, task_agent_ids: set, session: Session):
    agent_ids = set(workflow.crew_ai_agents or [])
    if workflow.crew_ai_manager_agent:
        agent_ids.add(workflow.crew_ai_manager_agent)
    agent_ids.update(task_agent_ids)

    agents = session.query(db_model.Agent).filter(db_model.Agent.id.in_(agent_ids)).all()
    inputs, tool_ids, mcp_ids, model_ids = [], set(), set(), set()

    if workflow.crew_ai_llm_provider_model_id:
        model_ids.add(workflow.crew_ai_llm_provider_model_id)

    for aid in agent_ids:
        agent = next((a for a in agents if a.id == aid), None)
        if not agent:
            raise ValueError(f"Agent with ID '{aid}' not found.")
        inputs.append(
            input_types.Input__Agent(
                id=agent.id,
                name=agent.name,
                llm_provider_model_id=agent.llm_provider_model_id,
                crew_ai_role=agent.crew_ai_role,
                crew_ai_backstory=agent.crew_ai_backstory,
                crew_ai_goal=agent.crew_ai_goal,
                crew_ai_allow_delegation=agent.crew_ai_allow_delegation,
                crew_ai_verbose=agent.crew_ai_verbose,
                crew_ai_cache=agent.crew_ai_cache,
                crew_ai_max_iter=agent.crew_ai_max_iter,
                tool_instance_ids=list(agent.tool_ids or []),
                mcp_instance_ids=list(agent.mcp_instance_ids or []),
                agent_image_uri=agent.agent_image_path or "",
            )
        )
        tool_ids.update(agent.tool_ids or [])
        mcp_ids.update(agent.mcp_instance_ids or [])
        if agent.llm_provider_model_id:
            model_ids.add(agent.llm_provider_model_id)

    return inputs, tool_ids, mcp_ids, model_ids


def get_tool_instances_for_agents(tool_ids: set, session: Session):
    tools = session.query(db_model.ToolInstance).filter(db_model.ToolInstance.id.in_(tool_ids)).all()
    inputs = []
    for tid in tool_ids:
        tool = next((t for t in tools if t.id == tid), None)
        if not tool:
            raise ValueError(f"Tool Instance with ID '{tid}' not found.")

        try:
            code, _ = read_tool_instance_code(tool)
            params = extract_user_params_from_code(code)
            status = ""
        except Exception as e:
            params, status = {}, f"Could not extract user param metadata from code: {str(e)}"

        inputs.append(
            input_types.Input__ToolInstance(
                id=tool.id,
                name=tool.name,
                python_code_file_name=tool.python_code_file_name,
                python_requirements_file_name=tool.python_requirements_file_name,
                source_folder_path=tool.source_folder_path,
                tool_metadata=json.dumps(
                    {
                        "user_params": list(params.keys()),
                        "user_params_metadata": params,
                        "status": status,
                    }
                ),
                tool_image_uri=tool.tool_image_path or "",
                is_venv_tool=tool.is_venv_tool,
            )
        )
    return inputs


def get_mcp_instances_for_agents(mcp_ids: set, session: Session):
    mcps = session.query(db_model.MCPInstance).filter(db_model.MCPInstance.id.in_(mcp_ids)).all()
    inputs = []
    for mid in mcp_ids:
        mcp = next((m for m in mcps if m.id == mid), None)
        if not mcp:
            raise ValueError(f"MCP Instance with ID '{mid}' not found.")
        inputs.append(
            input_types.Input__MCPInstance(
                id=mcp.id,
                name=mcp.name,
                type=mcp.type,
                args=list(mcp.args or []),
                env_names=list(mcp.env_names or []),
                tools=list(mcp.activated_tools or []),
                mcp_image_uri="",
            )
        )
    return inputs


def get_language_models(model_ids: set, session: Session):
    models = session.query(db_model.Model).filter(db_model.Model.model_id.in_(model_ids)).all()
    inputs = []
    for mid in model_ids:
        model = next((m for m in models if m.model_id == mid), None)
        if not model:
            raise ValueError(f"Language Model with ID '{mid}' not found.")
        inputs.append(
            input_types.Input__LanguageModel(
                model_id=model.model_id,
                model_name=model.model_name,
                generation_config=consts.DEFAULT_GENERATION_CONFIG,
            )
        )
    return inputs


def create_input_workflow(workflow: Workflow, session: Session):
    llm_provider_model_id = workflow.crew_ai_llm_provider_model_id
    if workflow.crew_ai_process == "hierarchical" and not workflow.crew_ai_manager_agent:
        llm_provider_model_id = (
            workflow.crew_ai_llm_provider_model_id
            or get_studio_default_model_id(dao=None, preexisting_db_session=session)[1]
        )
    return input_types.Input__Workflow(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        crew_ai_process=workflow.crew_ai_process,
        agent_ids=list(workflow.crew_ai_agents or []),
        task_ids=list(workflow.crew_ai_tasks or []),
        manager_agent_id=workflow.crew_ai_manager_agent or None,
        llm_provider_model_id=llm_provider_model_id,
        is_conversational=workflow.is_conversational,
    )


def create_collated_input(workflow: Workflow, session: Session) -> input_types.CollatedInput:
    default_llm = get_default_llm(session)
    task_inputs, agent_ids_from_tasks = get_tasks_for_workflow(workflow, session)
    agent_inputs, tool_ids, mcp_ids, language_model_ids = get_agents_for_workflow(
        workflow, agent_ids_from_tasks, session
    )
    # Add default language model to the language model inputs anyway because agents might not have a language model.
    language_model_ids.add(str(default_llm.model_id))

    tool_instance_inputs = get_tool_instances_for_agents(tool_ids, session)
    mcp_instance_inputs = get_mcp_instances_for_agents(mcp_ids, session)
    language_model_inputs = get_language_models(language_model_ids, session)
    workflow_input = create_input_workflow(workflow, session)

    return input_types.CollatedInput(
        default_language_model_id=default_llm.model_id,
        language_models=language_model_inputs,
        tool_instances=tool_instance_inputs,
        mcp_instances=mcp_instance_inputs,
        agents=agent_inputs,
        tasks=task_inputs,
        workflow=workflow_input,
    )
