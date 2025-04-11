import tempfile
import json
import zipfile
import os
import shutil
from typing import List, Dict
from uuid import uuid4
from google.protobuf.json_format import MessageToDict

from cmlapi import CMLServiceApi

from studio.db.dao import AgentStudioDao
from studio.api import *
from studio.db import model as db_model
from studio.agents.agent_templates import remove_agent_template
from studio.task.task_templates import remove_task_template, add_task_template
from studio.tools.tool_template import remove_tool_template
from studio.proto.utils import is_field_set
import studio.db.utils as db_utils
import studio.consts as consts
import studio.cross_cutting.utils as cc_utils

from crewai import Process


def list_workflow_templates(
    request: ListWorkflowTemplatesRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> ListWorkflowTemplatesResponse:
    with dao.get_session() as session:
        workflow_templates: List[db_model.WorkflowTemplate] = session.query(db_model.WorkflowTemplate).all()
        return ListWorkflowTemplatesResponse(
            workflow_templates=[workflow_template.to_protobuf() for workflow_template in workflow_templates]
        )


def get_workflow_template(
    request: GetWorkflowTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> GetWorkflowTemplateResponse:
    with dao.get_session() as session:
        workflow_template: db_model.WorkflowTemplate = (
            session.query(db_model.WorkflowTemplate).filter_by(id=request.id).one_or_none()
        )
        return GetWorkflowTemplateResponse(workflow_template=workflow_template.to_protobuf())


def add_workflow_template_from_workflow(
    workflow_id: str, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> AddWorkflowTemplateResponse:
    """
    Add a new workflow template explictly from an existing workflow.
    """

    workflow_template_id: str = str(uuid4())

    with dao.get_session() as session:
        # Get the actual workflow
        workflow: db_model.Workflow = session.query(db_model.Workflow).filter_by(id=workflow_id).one()

        # Create a baseline workflow template
        workflow_template: db_model.WorkflowTemplate = db_model.WorkflowTemplate(id=workflow_template_id)
        # TODO: might want to override name with the request in some way
        workflow_template.name = f"Template: {workflow.name}"
        workflow_template.description = workflow.description
        workflow_template.is_conversational = workflow.is_conversational
        workflow_template.process = workflow.crew_ai_process

        # If we have a default manager, mark a default manager in the workflow template.
        if workflow.crew_ai_process == Process.hierarchical and not workflow.crew_ai_manager_agent:
            workflow_template.use_default_manager = True

        # If we have a custom manager, add that manager as an agent template
        # and add it to the workflow template.
        # NOTE: manager agents do not have tools, so no need to check.
        if workflow.crew_ai_manager_agent and not workflow.crew_ai_llm_provider_model_id:
            agent: db_model.Agent = session.query(db_model.Agent).filter_by(id=workflow.crew_ai_manager_agent).one()
            agent_template_id = str(uuid4())
            agent_template: db_model.AgentTemplate = db_model.AgentTemplate(
                id=agent_template_id,
                allow_delegation=agent.crew_ai_allow_delegation,
                backstory=agent.crew_ai_backstory,
                cache=agent.crew_ai_cache,
                description=agent.name,  # TODO: add description to agent
                goal=agent.crew_ai_goal,
                max_iter=agent.crew_ai_max_iter,
                name=agent.name,
                pre_packaged=False,
                role=agent.crew_ai_role,
                temperature=agent.crew_ai_temperature,
                verbose=agent.crew_ai_verbose,
                workflow_template_id=workflow_template_id,
            )
            session.add(agent_template)
            workflow_template.manager_agent_template_id = agent_template_id
            workflow_template.use_default_manager = False

        # Add all of the tool instances as tool templates
        agent_template_ids = []
        agent_to_agent_template = {}
        for agent_id in list(workflow.crew_ai_agents):
            agent: db_model.Agent = session.query(db_model.Agent).filter_by(id=agent_id).one()
            agent_template_image_path = ""
            agent_template_id = str(uuid4())
            if agent.agent_image_path:
                _, ext = os.path.splitext(agent.agent_image_path)
                os.makedirs(consts.AGENT_TEMPLATE_ICONS_LOCATION, exist_ok=True)
                agent_template_image_path = os.path.join(
                    consts.AGENT_TEMPLATE_ICONS_LOCATION, f"{agent_template_id}_icon{ext}"
                )
                shutil.copy(agent.agent_image_path, agent_template_image_path)

            agent_template: db_model.AgentTemplate = db_model.AgentTemplate(
                id=agent_template_id,
                allow_delegation=agent.crew_ai_allow_delegation,
                backstory=agent.crew_ai_backstory,
                cache=agent.crew_ai_cache,
                description=agent.name,  # TODO: add description to agent
                goal=agent.crew_ai_goal,
                max_iter=agent.crew_ai_max_iter,
                name=agent.name,
                pre_packaged=False,
                agent_image_path=agent_template_image_path,
                role=agent.crew_ai_role,
                temperature=agent.crew_ai_temperature,
                verbose=agent.crew_ai_verbose,
                workflow_template_id=workflow_template_id,
            )

            # Add tools
            tool_template_ids = []
            for tool_instance_id in list(agent.tool_ids):
                tool_instance: db_model.ToolInstance = (
                    session.query(db_model.ToolInstance).filter_by(id=tool_instance_id).one()
                )

                tool_template_id = str(uuid4())

                tool_template_dir_basename = (
                    cc_utils.create_slug_from_name(tool_instance.name) + "_" + cc_utils.get_random_compact_string()
                )
                tool_template_dir = os.path.join(consts.TOOL_TEMPLATE_CATALOG_LOCATION, tool_template_dir_basename)
                os.makedirs(tool_template_dir, exist_ok=True)

                def tool_dir_ignore(src, names):
                    return {".venv", ".requirements_hash.txt", "__pycache__"}

                shutil.copytree(
                    tool_instance.source_folder_path, tool_template_dir, dirs_exist_ok=True, ignore=tool_dir_ignore
                )

                tool_image_path = ""
                if tool_instance.tool_image_path:
                    _, ext = os.path.splitext(tool_instance.tool_image_path)
                    os.makedirs(consts.TOOL_TEMPLATE_ICONS_LOCATION, exist_ok=True)
                    tool_image_path = os.path.join(
                        consts.TOOL_TEMPLATE_ICONS_LOCATION, f"{tool_template_dir_basename}_icon{ext}"
                    )
                    shutil.copy(tool_instance.tool_image_path, tool_image_path)

                tool_template: db_model.ToolTemplate = db_model.ToolTemplate(
                    id=tool_template_id,
                    workflow_template_id=workflow_template_id,
                    name=tool_instance.name,
                    python_code_file_name="tool.py",
                    python_requirements_file_name="requirements.txt",
                    source_folder_path=tool_template_dir,
                    tool_image_path=tool_image_path,
                    is_venv_tool=tool_instance.is_venv_tool,
                )

                tool_template_ids.append(tool_template_id)
                session.add(tool_template)

            # Add all new tool templates to the agent template
            agent_template.tool_template_ids = tool_template_ids

            # Append agent template id
            session.add(agent_template)
            agent_template_ids.append(agent_template.id)
            agent_to_agent_template[agent_id] = agent_template_id

        # Add agent template ids to the workflow
        workflow_template.agent_template_ids = agent_template_ids

        # Add all tasks as task templates that are owned by this workflow template
        task_template_ids = []
        for task_id in list(workflow.crew_ai_tasks):
            task: db_model.Task = session.query(db_model.Task).filter_by(id=task_id).one()
            response: AddTaskTemplateResponse = add_task_template(
                AddTaskTemplateRequest(
                    name=task.name,
                    description=task.description,
                    expected_output=task.expected_output,
                    assigned_agent_template_id=agent_to_agent_template.get(task.assigned_agent_id, None),
                    workflow_template_id=workflow_template_id,
                ),
                cml=cml,
                dao=None,
                preexisting_db_session=session,
            )
            task_template_ids.append(response.id)
        workflow_template.task_template_ids = task_template_ids

        workflow_template.pre_packaged = False  # Not shipped with the studio
        # Finally, add the workflow template
        session.add(workflow_template)
        return AddWorkflowTemplateResponse(id=workflow_template_id)


def add_workflow_template(
    request: AddWorkflowTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> AddWorkflowTemplateResponse:
    """
    Add a new workflow template.

    NOTE: this RPC call is explicitly designed for workflow templates that
    use GLOBAL task templates, tool templates, and agent templates that exist
    outside of the scope of a workflow template. When creating a workflow template
    from a previously existing workflow, containing pre-instantiated agents, tools
    and tasks, dedicated logic is provided where agent templates, tool templates and
    task templates are created and tied explicitly to this new workflow template.
    """

    # Create a workflow template from a pre-existing workflow.
    if is_field_set(request, "workflow_id"):
        workflow_id: str = request.workflow_id
        return add_workflow_template_from_workflow(workflow_id, cml, dao)

    with dao.get_session() as session:
        workflow_template_dict = {"id": str(uuid4())}
        workflow_template_dict.update(MessageToDict(request, preserving_proto_field_name=True))
        workflow_template_dict["pre_packaged"] = False  # Not shipped with the studio
        workflow_template: db_model.WorkflowTemplate = db_model.WorkflowTemplate.from_dict(workflow_template_dict)
        session.add(workflow_template)
        return AddWorkflowTemplateResponse(id=workflow_template.id)


def remove_workflow_template(
    request: RemoveWorkflowTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> RemoveWorkflowTemplateResponse:
    with dao.get_session() as session:
        workflow_template: db_model.WorkflowTemplate = (
            session.query(db_model.WorkflowTemplate).filter_by(id=request.id).one_or_none()
        )
        if not workflow_template:
            raise ValueError(f"Workflow template with ID '{request.id}' does not exist.")
        if workflow_template.pre_packaged:
            raise ValueError(f"Workflow template with ID '{request.id}' is pre-packaged and cannot be removed.")

        # Delete all agent templates, task templates and tool templates
        # explicitly tied to this workflow template. Note that global templates
        # will not be removed here if they are not explicitly tied to a workflow
        # template.
        agent_templates: list[db_model.AgentTemplate] = (
            session.query(db_model.AgentTemplate).filter_by(workflow_template_id=request.id).all()
        )
        for agent_template in agent_templates:
            remove_agent_template(RemoveAgentTemplateRequest(id=agent_template.id), cml, dao)
        task_templates: list[db_model.TaskTemplate] = (
            session.query(db_model.TaskTemplate).filter_by(workflow_template_id=request.id).all()
        )
        for task_template in task_templates:
            remove_task_template(RemoveTaskTemplateRequest(id=task_template.id), cml, dao)
        tool_templates: list[db_model.ToolTemplate] = (
            session.query(db_model.ToolTemplate).filter_by(workflow_template_id=request.id).all()
        )
        for tool_template in tool_templates:
            remove_tool_template(RemoveToolTemplateRequest(tool_template_id=tool_template.id), cml, dao)

        # Finally, remove the workflow template
        session.delete(workflow_template)
        return RemoveWorkflowTemplateResponse()


def export_workflow_template(
    request: ExportWorkflowTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> ExportWorkflowTemplateResponse:
    with dao.get_session() as session:
        try:
            workflow_template: db_model.WorkflowTemplate = (
                session.query(db_model.WorkflowTemplate).filter_by(id=request.id).one_or_none()
            )
            if not workflow_template:
                raise ValueError(f"Workflow template with ID '{request.id}' does not exist.")
            agent_template_ids = (
                list(workflow_template.agent_template_ids) if workflow_template.agent_template_ids else []
            )
            if workflow_template.manager_agent_template_id:
                agent_template_ids.append(workflow_template.manager_agent_template_id)
            task_template_ids = list(workflow_template.task_template_ids) if workflow_template.task_template_ids else []

            agent_templates: list[db_model.AgentTemplate] = (
                session.query(db_model.AgentTemplate).filter(db_model.AgentTemplate.id.in_(agent_template_ids)).all()
            )
            tool_template_ids: List[str] = []
            for agent_template in agent_templates:
                if agent_template.tool_template_ids:
                    tool_template_ids.extend(agent_template.tool_template_ids)
            tool_templates: list[db_model.ToolTemplate] = (
                session.query(db_model.ToolTemplate).filter(db_model.ToolTemplate.id.in_(tool_template_ids)).all()
            )
            task_templates: list[db_model.TaskTemplate] = (
                session.query(db_model.TaskTemplate).filter(db_model.TaskTemplate.id.in_(task_template_ids)).all()
            )

            # Change UUIDs to different UUIDs
            uuid_change_map: Dict[str, str] = dict()
            uuid_change_map[workflow_template.id] = str(uuid4())
            workflow_template.id = uuid_change_map[workflow_template.id]
            workflow_template.pre_packaged = False
            for tool_template in tool_templates:
                uuid_change_map[tool_template.id] = str(uuid4())
                tool_template.id = uuid_change_map[tool_template.id]
                tool_template.pre_built = False
                tool_template.workflow_template_id = workflow_template.id
            for agent_template in agent_templates:
                uuid_change_map[agent_template.id] = str(uuid4())
                agent_template.id = uuid_change_map[agent_template.id]
                agent_template.pre_packaged = False
                agent_template.workflow_template_id = workflow_template.id
                if agent_template.tool_template_ids:
                    agent_template.tool_template_ids = [uuid_change_map[id] for id in agent_template.tool_template_ids]
            for task_template in task_templates:
                uuid_change_map[task_template.id] = str(uuid4())
                task_template.id = uuid_change_map[task_template.id]
                task_template.workflow_template_id = workflow_template.id
                if task_template.assigned_agent_template_id:
                    task_template.assigned_agent_template_id = uuid_change_map[task_template.assigned_agent_template_id]

            if workflow_template.manager_agent_template_id:
                workflow_template.manager_agent_template_id = uuid_change_map[
                    workflow_template.manager_agent_template_id
                ]
            if workflow_template.agent_template_ids:
                workflow_template.agent_template_ids = [
                    uuid_change_map[id] for id in workflow_template.agent_template_ids
                ]
            if workflow_template.task_template_ids:
                workflow_template.task_template_ids = [
                    uuid_change_map[id] for id in workflow_template.task_template_ids
                ]

            # prepare the json file
            template_dict = {
                "template_version": "0.0.1",
                "workflow_template": workflow_template.to_dict(),
                "agent_templates": [agent_template.to_dict() for agent_template in agent_templates],
                "tool_templates": [tool_template.to_dict() for tool_template in tool_templates],
                "task_templates": [task_template.to_dict() for task_template in task_templates],
            }

            # Create a temporary directory for the export
            os.makedirs(consts.TEMP_FILES_LOCATION, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="workflow_template_", dir=consts.TEMP_FILES_LOCATION) as temp_dir:
                template_file_path = os.path.join(temp_dir, "workflow_template.json")
                with open(template_file_path, "w") as f:
                    json.dump(template_dict, f, indent=2)

                # Create directory for tool templates & dynamic assets
                os.makedirs(os.path.join(temp_dir, consts.TOOL_TEMPLATE_CATALOG_LOCATION), exist_ok=True)
                os.makedirs(os.path.join(temp_dir, consts.TOOL_TEMPLATE_ICONS_LOCATION), exist_ok=True)
                os.makedirs(os.path.join(temp_dir, consts.AGENT_TEMPLATE_ICONS_LOCATION), exist_ok=True)

                # Copy tool templates
                for tool_template in tool_templates:
                    shutil.copytree(
                        tool_template.source_folder_path, os.path.join(temp_dir, tool_template.source_folder_path)
                    )
                    if tool_template.tool_image_path:
                        shutil.copy(
                            tool_template.tool_image_path, os.path.join(temp_dir, tool_template.tool_image_path)
                        )

                # Copy agent templates
                for agent_template in agent_templates:
                    if agent_template.agent_image_path:
                        shutil.copy(
                            agent_template.agent_image_path, os.path.join(temp_dir, agent_template.agent_image_path)
                        )

                # Create a zip file
                zip_file_path = os.path.join(consts.TEMP_FILES_LOCATION, os.path.basename(temp_dir))
                shutil.make_archive(zip_file_path, "zip", temp_dir)

                # Return the zip file
                return ExportWorkflowTemplateResponse(file_path=zip_file_path + ".zip")
        finally:
            session.rollback()  # This is a read-only operation. Rollback any transactions.


def import_workflow_template(
    request: ImportWorkflowTemplateRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> ImportWorkflowTemplateResponse:
    abs_file_path: str = request.file_path

    # Always expect absolute path
    if not os.path.isabs(abs_file_path):
        raise ValueError(f"File path must be absolute: {abs_file_path}")

    # Check if the file exists
    if not os.path.exists(abs_file_path):
        raise ValueError(f"File does not exist: {abs_file_path}")

    # Create a temporary directory for the export
    os.makedirs(consts.TEMP_FILES_LOCATION, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="extracted_workflow_template_", dir=consts.TEMP_FILES_LOCATION) as temp_dir:
        # Unzip the file
        with zipfile.ZipFile(abs_file_path, "r") as zip_ref:
            zip_ref.extractall(temp_dir)

        # Load the JSON file
        template_file_path = os.path.join(temp_dir, "workflow_template.json")
        with open(template_file_path, "r") as f:
            template_dict: Dict = json.load(f)

        new_workflow_template_id: str = str(uuid4())

        changed_uuids: Dict[str, str] = dict()
        tool_templates: List[Dict] = template_dict["tool_templates"]
        for _t in tool_templates:
            changed_uuids[_t["id"]] = str(uuid4())
            new_tool_template_id = changed_uuids[_t["id"]]
            _t["id"] = new_tool_template_id
            _t["workflow_template_id"] = new_workflow_template_id
            tool_template_dir_basename = (
                cc_utils.create_slug_from_name(_t["name"]) + "_" + cc_utils.get_random_compact_string()
            )
            tool_template_dir = os.path.join(consts.TOOL_TEMPLATE_CATALOG_LOCATION, tool_template_dir_basename)
            os.rename(os.path.join(temp_dir, _t["source_folder_path"]), os.path.join(temp_dir, tool_template_dir))
            _t["source_folder_path"] = tool_template_dir
            if _t.get("tool_image_path"):
                _, ext = os.path.splitext(_t["tool_image_path"])
                ext = ext.lower()
                new_image_path = os.path.join(
                    consts.TOOL_TEMPLATE_ICONS_LOCATION, f"{tool_template_dir_basename}_icon{ext}"
                )
                os.rename(os.path.join(temp_dir, _t["tool_image_path"]), os.path.join(temp_dir, new_image_path))
                _t["tool_image_path"] = new_image_path

        agent_templates: List[Dict] = template_dict["agent_templates"]
        for _a in agent_templates:
            changed_uuids[_a["id"]] = str(uuid4())
            _a["id"] = changed_uuids[_a["id"]]
            _a["workflow_template_id"] = new_workflow_template_id
            if _a.get("agent_image_path"):
                _, ext = os.path.splitext(_a["agent_image_path"])
                ext = ext.lower()
                new_image_path = os.path.join(consts.AGENT_TEMPLATE_ICONS_LOCATION, f"{_a['id']}_icon{ext}")
                os.rename(os.path.join(temp_dir, _a["agent_image_path"]), os.path.join(temp_dir, new_image_path))
                _a["agent_image_path"] = new_image_path
            if _a.get("tool_template_ids"):
                _a["tool_template_ids"] = [changed_uuids[t_id] for t_id in _a["tool_template_ids"]]

        task_templates: List[Dict] = template_dict["task_templates"]
        for _t in task_templates:
            changed_uuids[_t["id"]] = str(uuid4())
            _t["id"] = changed_uuids[_t["id"]]
            _t["workflow_template_id"] = new_workflow_template_id
            if _t.get("assigned_agent_template_id"):
                _t["assigned_agent_template_id"] = changed_uuids[_t["assigned_agent_template_id"]]

        workflow_template: Dict = template_dict["workflow_template"]
        workflow_template["id"] = new_workflow_template_id
        if workflow_template.get("manager_agent_template_id"):
            workflow_template["manager_agent_template_id"] = changed_uuids[
                workflow_template["manager_agent_template_id"]
            ]
        if workflow_template.get("agent_template_ids"):
            workflow_template["agent_template_ids"] = [
                changed_uuids[a_id] for a_id in workflow_template["agent_template_ids"]
            ]
        if workflow_template.get("task_template_ids"):
            workflow_template["task_template_ids"] = [
                changed_uuids[t_id] for t_id in workflow_template["task_template_ids"]
            ]
        template_dict["workflow_template"] = workflow_template

        # copy the .studio-data inside the temp directory to project wide .studio-data
        shutil.copytree(
            os.path.join(temp_dir, consts.ALL_STUDIO_DATA_LOCATION), consts.ALL_STUDIO_DATA_LOCATION, dirs_exist_ok=True
        )

        template_dict.pop("template_version", None)
        template_dict["workflow_templates"] = [template_dict.pop("workflow_template")]

        db_utils.import_from_dict(template_dict, dao)

        return ImportWorkflowTemplateResponse(id=new_workflow_template_id)
