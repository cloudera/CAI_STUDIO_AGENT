# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Dict
import os
from crewai import Crew, Agent as CrewAgent, Task as CrewTask
from crewai.tools import BaseTool

import engine.types as input_types
from engine.crewai.llms import get_crewai_llm, get_crewai_manager_llm
from engine.crewai.tools import get_crewai_tool
from engine.crewai.mcp import get_mcp_tools_for_crewai
from engine.crewai.agents import get_crewai_agent, get_crewai_agent_plain
from engine.crewai.wrappers_smart import AgentStudioCrewAITask


def create_crewai_objects_smart(
    workflow_directory: str,
    collated_input: input_types.CollatedInput,
    tool_config: Dict[str, Dict[str, str]],
    mcp_config: Dict[str, Dict[str, str]],
    llm_config: Dict[str, Dict[str, str]],
    session_directory: str = None,
) -> input_types.CrewAIObjects:
    print("[Engine][Smart] Building language models")
    language_models: Dict[str, AgentStudioCrewAILLM] = {}
    for l_ in collated_input.language_models:
        language_models[l_.model_id] = get_crewai_llm(l_, llm_config.get(l_.model_id, {}), True)
    if session_directory:
        for lm in language_models.values():
            try:
                setattr(lm, "session_directory", session_directory)
            except Exception:
                pass

    print("[Engine][Smart] Building tools and MCPs")
    tools: Dict[str, BaseTool] = {}
    for t_ in collated_input.tool_instances:
        tools[t_.id] = get_crewai_tool(t_, tool_config.get(t_.id, {}), workflow_directory, session_directory)

    mcps: Dict[str, input_types.MCPObjects] = {}
    for m_ in collated_input.mcp_instances:
        mcps[m_.id] = get_mcp_tools_for_crewai(m_, mcp_config.get(m_.id, {}), session_directory)

    print("[Engine][Smart] Building agents")
    agents: Dict[str, Agent] = {}
    for agent in collated_input.agents:
        crewai_tools = [tools[tool_id] for tool_id in agent.tool_instance_ids]
        for mcp_id in agent.mcp_instance_ids:
            crewai_tools.extend(mcps[mcp_id].tools)
        model_id = agent.llm_provider_model_id or collated_input.default_language_model_id
        created_agent = get_crewai_agent(agent, crewai_tools, language_models[model_id])
        if session_directory:
            try:
                setattr(created_agent, "session_directory", session_directory)
            except Exception:
                pass
            try:
                if getattr(created_agent, "llm", None) is not None:
                    setattr(created_agent.llm, "session_directory", session_directory)
            except Exception:
                pass
        agents[agent.id] = created_agent

    print("[Engine][Smart] Building tasks")
    tasks: Dict[str, AgentStudioCrewAITask] = {}
    for task_input in collated_input.tasks:
        agent_for_task: Agent = agents.get(task_input.assigned_agent_id) if task_input.assigned_agent_id else None
        tasks[task_input.id] = AgentStudioCrewAITask(
            agent_studio_id=task_input.id,
            description=task_input.description,
            expected_output=task_input.expected_output,
            agent=agent_for_task,
            tools=agent_for_task.tools if agent_for_task else None,
        )
        if session_directory:
            try:
                setattr(tasks[task_input.id], "session_directory", session_directory)
            except Exception:
                pass

    workflow_input = collated_input.workflow
    print(
        f"[Engine][Smart] Workflow name={workflow_input.name} process={workflow_input.crew_ai_process} "
        f"manager_agent_id={workflow_input.manager_agent_id} planning={getattr(workflow_input, 'planning', None)}"
    )
    # In smart workflows, the manager should not have tools. Clear them if present.
    try:
        manager_agent_id = getattr(workflow_input, "manager_agent_id", None)
        if manager_agent_id and manager_agent_id in agents:
            try:
                agents[manager_agent_id].tools = None
            except Exception:
                pass
    except Exception:
        pass
    manager_agent_id = workflow_input.manager_agent_id
    if manager_agent_id:
        try:
            manager_agent_input = next((a for a in collated_input.agents if a.id == manager_agent_id), None)
            manager_model_id = (
                manager_agent_input.llm_provider_model_id if manager_agent_input and manager_agent_input.llm_provider_model_id else collated_input.default_language_model_id
            )
            language_models_by_id = getattr(collated_input, "language_models_by_id", None)
            lm_input_obj = (
                language_models_by_id.get(manager_model_id) if language_models_by_id else next((lm for lm in collated_input.language_models if lm.model_id == manager_model_id), None)
            )
            if lm_input_obj:
                manager_llm_for_agent = get_crewai_manager_llm(
                    lm_input_obj,
                    llm_config.get(manager_model_id, {}),
                    True,
                )
                # Pass planning flag to manager wrapper and log it
                try:
                    planning_flag = bool(getattr(workflow_input, "planning", False))
                    setattr(manager_llm_for_agent, "planning_enabled", planning_flag)
                    print(f"[Engine][Smart] Manager LLM planning_enabled={planning_flag}")
                except Exception:
                    print("[Engine][Smart] Failed setting planning_enabled on manager LLM")
                    pass
                if session_directory:
                    try:
                        setattr(manager_llm_for_agent, "session_directory", session_directory)
                    except Exception:
                        pass
                try:
                    agents_info: list[dict[str, object]] = []
                    for agent_id in workflow_input.agent_ids:
                        if agent_id == manager_agent_id:
                            continue
                        a = agents[agent_id]
                        tools_context = []
                        try:
                            for t in (getattr(a, "tools", None) or []):
                                try:
                                    t_name = str(getattr(t, "name", "")).strip()
                                except Exception:
                                    t_name = ""
                                try:
                                    t_desc = str(getattr(t, "description", "")).strip()
                                except Exception:
                                    t_desc = ""
                                payload_repr = ""
                                try:
                                    args_schema = getattr(t, "args_schema", None)
                                    # Pydantic v2: model_fields
                                    if args_schema is not None and hasattr(args_schema, "model_fields"):
                                        fields = getattr(args_schema, "model_fields") or {}
                                        pairs = []
                                        for fname, f in fields.items():
                                            try:
                                                ftype = getattr(f, "annotation", None)
                                                ftype_str = getattr(ftype, "__name__", None) or str(ftype)
                                            except Exception:
                                                ftype_str = ""
                                            try:
                                                fdesc = getattr(f, "description", None) or ""
                                            except Exception:
                                                fdesc = ""
                                            pairs.append(f"{fname}: {ftype_str}{' - ' + fdesc if fdesc else ''}")
                                        payload_repr = ", ".join(pairs)
                                except Exception:
                                    payload_repr = ""
                                tools_context.append({
                                    "name": t_name,
                                    "description": t_desc,
                                    "payload": payload_repr,
                                })
                        except Exception:
                            tools_context = []
                        agents_info.append(
                            {
                                "id": agent_id,
                                "role": getattr(a, "role", "") or "",
                                "backstory": getattr(a, "backstory", "") or "",
                                "goal": getattr(a, "goal", "") or "",
                                "tools": tools_context,
                            }
                        )
                    setattr(manager_llm_for_agent, "manager_agents_info", agents_info)
                except Exception:
                    pass
                try:
                    agents[manager_agent_id].llm = manager_llm_for_agent
                except Exception:
                    pass
        except Exception:
            pass

    # Emulate legacy behavior: manager_llm comes from workflow_input.llm_provider_model_id
    manager_lm = None
    try:
        if getattr(workflow_input, "llm_provider_model_id", None):
            manager_lm = language_models.get(workflow_input.llm_provider_model_id)
    except Exception:
        manager_lm = None

    print(
        f"[Engine][Smart] Creating Crew with agents={len(workflow_input.agent_ids)} tasks={len(workflow_input.task_ids)}"
    )
    crew = Crew(
        name=workflow_input.name,
        process=workflow_input.crew_ai_process,
        agents=[agents[agent_id] for agent_id in workflow_input.agent_ids],
        tasks=[tasks[task_id] for task_id in workflow_input.task_ids],
        manager_agent=agents[workflow_input.manager_agent_id] if workflow_input.manager_agent_id else None,
        manager_llm=manager_lm,
        verbose=False,
    )

    return input_types.CrewAIObjects(
        language_models=language_models,
        tools=tools,
        mcps=mcps,
        agents=agents,
        tasks=tasks,
        crews={workflow_input.id: crew},
    )


def create_crewai_objects_plain(
    workflow_directory: str,
    collated_input: input_types.CollatedInput,
    tool_config: Dict[str, Dict[str, str]],
    mcp_config: Dict[str, Dict[str, str]],
    llm_config: Dict[str, Dict[str, str]],
    session_directory: str = None,
) -> input_types.CrewAIObjects:
    print("[Engine][Plain] Building language models")
    language_models = {}
    for l_ in collated_input.language_models:
        language_models[l_.model_id] = get_crewai_llm(l_, llm_config.get(l_.model_id, {}), False)
    if session_directory:
        for lm in language_models.values():
            try:
                setattr(lm, "session_directory", session_directory)
            except Exception:
                pass

    print("[Engine][Plain] Building tools and MCPs")
    tools: Dict[str, BaseTool] = {}
    for t_ in collated_input.tool_instances:
        tools[t_.id] = get_crewai_tool(t_, tool_config.get(t_.id, {}), workflow_directory, session_directory)

    mcps: Dict[str, input_types.MCPObjects] = {}
    for m_ in collated_input.mcp_instances:
        mcps[m_.id] = get_mcp_tools_for_crewai(m_, mcp_config.get(m_.id, {}), session_directory)

    print("[Engine][Plain] Building agents")
    agents: Dict[str, CrewAgent] = {}
    for agent in collated_input.agents:
        crewai_tools = [tools[tool_id] for tool_id in agent.tool_instance_ids]
        for mcp_id in agent.mcp_instance_ids:
            crewai_tools.extend(mcps[mcp_id].tools)
        model_id = agent.llm_provider_model_id or collated_input.default_language_model_id
        created_agent = get_crewai_agent_plain(agent, crewai_tools, language_models[model_id])
        try:
            setattr(created_agent, "agent_studio_id", agent.id)
        except Exception:
            pass
        agents[agent.id] = created_agent

    print("[Engine][Plain] Building tasks")
    tasks: Dict[str, AgentStudioCrewAITask] = {}
    for task_input in collated_input.tasks:
        agent_for_task: CrewAgent = agents.get(task_input.assigned_agent_id) if task_input.assigned_agent_id else None
        tasks[task_input.id] = AgentStudioCrewAITask(
            agent_studio_id=task_input.id,
            description=task_input.description,
            expected_output=task_input.expected_output,
            agent=agent_for_task,
            tools=agent_for_task.tools if agent_for_task else None,
        )

    workflow_input = collated_input.workflow
    print(
        f"[Engine][Plain] Workflow name={workflow_input.name} process={workflow_input.crew_ai_process} "
        f"manager_agent_id={workflow_input.manager_agent_id}"
    )
    # Legacy behavior: manager_llm comes from workflow_input.llm_provider_model_id
    manager_lm = None
    try:
        if getattr(workflow_input, "llm_provider_model_id", None):
            manager_lm = language_models.get(workflow_input.llm_provider_model_id)
    except Exception:
        manager_lm = None

    print(
        f"[Engine][Plain] Creating Crew with agents={len(workflow_input.agent_ids)} tasks={len(workflow_input.task_ids)}"
    )
    crew = Crew(
        name=workflow_input.name,
        process=workflow_input.crew_ai_process,
        agents=[agents[agent_id] for agent_id in workflow_input.agent_ids],
        tasks=[tasks[task_id] for task_id in workflow_input.task_ids],
        manager_agent=agents[workflow_input.manager_agent_id] if workflow_input.manager_agent_id else None,
        manager_llm=manager_lm,
        verbose=False,
    )

    return input_types.CrewAIObjects(
        language_models=language_models,
        tools=tools,
        mcps=mcps,
        agents=agents,
        tasks=tasks,
        crews={workflow_input.id: crew},
    )


def create_crewai_objects(
    workflow_directory: str,
    collated_input: input_types.CollatedInput,
    tool_config: Dict[str, Dict[str, str]],
    mcp_config: Dict[str, Dict[str, str]],
    llm_config: Dict[str, Dict[str, str]],
    session_directory: str = None,
) -> input_types.CrewAIObjects:
    smart = bool(getattr(collated_input.workflow, "smart_workflow", False))
    if smart:
        return create_crewai_objects_smart(
            workflow_directory, collated_input, tool_config, mcp_config, llm_config, session_directory
        )
    else:
        return create_crewai_objects_plain(
            workflow_directory, collated_input, tool_config, mcp_config, llm_config, session_directory
        )
