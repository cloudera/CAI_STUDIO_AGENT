import ast
import os
import shutil
from typing import Optional, Dict
from uuid import uuid4

from studio.api.types import ToolInstanceStatus
from studio.db.dao import AgentStudioDao
from studio.db.model import ToolInstance
from studio.db import model as db_model, DbSession
import studio.cross_cutting.utils as cc_utils
import studio.consts as consts
from studio.cross_cutting.global_thread_pool import get_thread_pool

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

app_dir = os.getenv("APP_DIR")
if app_dir is None:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))

from engine.crewai.tools import prepare_virtual_env_for_tool


def read_tool_instance_code(tool_instance: ToolInstance) -> tuple[str, str]:
    """
    Reads the Python code and requirements from a given tool instance.
    """

    tool_instance_dir = tool_instance.source_folder_path
    with open(os.path.join(tool_instance_dir, tool_instance.python_code_file_name), "r") as f:
        tool_code = f.read()
    with open(os.path.join(tool_instance_dir, tool_instance.python_requirements_file_name), "r") as f:
        tool_requirements = f.read()
    return tool_code, tool_requirements


def extract_user_params_from_code(code: str) -> Dict[str, Dict[str, bool]]:
    """
    Extract the user parameters from the wrapper function in the Python code.
    Handles Pydantic BaseModel style parameter definitions.

    Returns:
        Dict with format: {
            "param_name": {
                "required": bool  # True if parameter is required, False if optional
            }
        }
    """
    try:
        parsed_ast = ast.parse(code)
        # Search for UserParameters class
        user_parameter_class_node: Optional[ast.ClassDef] = None
        for node in ast.walk(parsed_ast):
            if isinstance(node, ast.ClassDef) and node.name == "UserParameters":
                user_parameter_class_node = node
                break

        if user_parameter_class_node is None:
            return {}

        user_params: Dict[str, Dict[str, bool]] = {}

        for field in user_parameter_class_node.body:
            if isinstance(field, ast.AnnAssign):
                param_name = field.target.id

                # Check if type is Optional by looking for Optional[] syntax
                is_optional = False
                if isinstance(field.annotation, ast.Subscript):
                    if isinstance(field.annotation.value, ast.Name):
                        if field.annotation.value.id == "Optional":
                            is_optional = True

                # Also check if there's a default value
                has_default = field.value is not None

                # Parameter is required if it's not Optional and has no default
                is_required = not (is_optional or has_default)

                user_params[param_name] = {"required": is_required}

        return user_params
    except SyntaxError as e:
        raise ValueError(f"Error parsing Python code: {e}")


def extract_tool_params_from_code(code: str) -> Dict[str, Dict[str, bool]]:
    """
    Extract the tool parameters from the ToolParameters class in the Python code.
    Handles Pydantic BaseModel style parameter definitions.

    Returns:
        Dict with format: {
            "param_name": {
                "required": bool  # True if parameter is required, False if optional
            }
        }
    """
    try:
        parsed_ast = ast.parse(code)
        # Search for ToolParameters class
        tool_parameter_class_node: Optional[ast.ClassDef] = None
        for node in ast.walk(parsed_ast):
            if isinstance(node, ast.ClassDef) and node.name == "ToolParameters":
                tool_parameter_class_node = node
                break

        if tool_parameter_class_node is None:
            return {}

        tool_params: Dict[str, Dict[str, bool]] = {}

        for field in tool_parameter_class_node.body:
            if isinstance(field, ast.AnnAssign):
                param_name = field.target.id

                # Check if type is Optional by looking for Optional[] syntax
                is_optional = False
                if isinstance(field.annotation, ast.Subscript):
                    if isinstance(field.annotation.value, ast.Name):
                        if field.annotation.value.id == "Optional":
                            is_optional = True

                # Also check if there's a default value
                has_default = field.value is not None

                # Parameter is required if it's not Optional and has no default
                is_required = not (is_optional or has_default)

                tool_params[param_name] = {"required": is_required}

        return tool_params
    except SyntaxError as e:
        raise ValueError(f"Error parsing Python code: {e}")


def prepare_tool_instance(tool_instance_id: str):
    """
    Prepare virtual environment for a tool instance.
    Updates tool status throughout the process. DAO is created within
    the method because this run on a separate thread.
    """
    dao: AgentStudioDao = AgentStudioDao()

    try:
        # Get tool instance info and check if we need to clean up failed state
        with dao.get_session() as session:
            tool_instance = session.query(db_model.ToolInstance).filter_by(id=tool_instance_id).one()

            # If tool is in PREPARING state, return
            if tool_instance.status == ToolInstanceStatus.PREPARING.value:
                print(f"Tool instance {tool_instance_id} is already being prepared on a separate thread")
                return

            # Get the info we need for venv preparation
            source_folder_path = tool_instance.source_folder_path
            requirements_file_name = tool_instance.python_requirements_file_name
            current_status = tool_instance.status

            # If tool is in FAILED state, remove .venv directory entirely
            if current_status == ToolInstanceStatus.FAILED.value:
                venv_dir = os.path.join(source_folder_path, ".venv")
                if os.path.exists(venv_dir):
                    try:
                        shutil.rmtree(venv_dir)
                        print(f"Removed existing .venv directory for failed tool instance {tool_instance_id}")
                    except Exception as e:
                        print(f"Error removing .venv directory for tool instance {tool_instance_id}: {e}")

            # Set status to PREPARING
            tool_instance.status = ToolInstanceStatus.PREPARING.value
            session.commit()

            # Prepare the virtual environment
            prepare_virtual_env_for_tool(source_folder_path, requirements_file_name)

            tool_instance.status = ToolInstanceStatus.READY.value
            session.commit()

    except Exception as e:
        print(f"Error preparing virtual environment for tool instance {tool_instance_id}: {e}")
        # Set status to FAILED
        try:
            with dao.get_session() as session:
                tool_instance = session.query(db_model.ToolInstance).filter_by(id=tool_instance_id).first()
                if tool_instance:
                    tool_instance.status = ToolInstanceStatus.FAILED.value
                    session.commit()
        except Exception as commit_error:
            print(f"Error updating tool instance {tool_instance_id} status to FAILED: {commit_error}")


def clone_tool_instance(tool_instance_id: str, target_workflow_id: str, db_session: DbSession) -> str:
    workflow_obj = db_session.query(db_model.Workflow).filter_by(id=target_workflow_id).first()
    if not workflow_obj:
        raise ValueError(f"Workflow with id {target_workflow_id} not found")
    workflow_dir = workflow_obj.directory

    original_tool_instance = db_session.query(db_model.ToolInstance).filter_by(id=tool_instance_id).first()
    if not original_tool_instance:
        raise ValueError(f"ToolInstance with id {tool_instance_id} not found")

    new_tool_instance_id = str(uuid4())
    new_tool_instance_name = original_tool_instance.name
    new_tool_instance_dir = os.path.join(
        workflow_dir,
        "tools",
        cc_utils.create_slug_from_name(original_tool_instance.name) + "_" + cc_utils.get_random_compact_string(),
    )
    os.makedirs(new_tool_instance_dir, exist_ok=True)

    shutil.copytree(original_tool_instance.source_folder_path, new_tool_instance_dir, dirs_exist_ok=True)

    new_tool_image_path = ""
    if original_tool_instance.tool_image_path:
        _, ext = os.path.splitext(original_tool_instance.tool_image_path)
        os.makedirs(consts.TOOL_INSTANCE_ICONS_LOCATION, exist_ok=True)
        new_tool_image_path = os.path.join(consts.TOOL_INSTANCE_ICONS_LOCATION, f"{new_tool_instance_id}_icon{ext}")
        shutil.copy(original_tool_instance.tool_image_path, new_tool_image_path)

    tool_instance = db_model.ToolInstance(
        id=new_tool_instance_id,
        workflow_id=target_workflow_id,
        name=new_tool_instance_name,
        python_code_file_name="tool.py",
        python_requirements_file_name="requirements.txt",
        source_folder_path=new_tool_instance_dir,
        tool_image_path=new_tool_image_path,
        is_venv_tool=original_tool_instance.is_venv_tool,
        status=ToolInstanceStatus.CREATED.value,
    )
    db_session.add(tool_instance)
    db_session.commit()

    get_thread_pool().submit(
        prepare_tool_instance,
        new_tool_instance_id,
    )
    return new_tool_instance_id
