import ast
import os
from typing import Optional, Dict

from studio.db.model import ToolInstance

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

app_dir = os.getenv("APP_DIR")
if app_dir is None:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))


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
