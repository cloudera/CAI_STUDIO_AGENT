# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Dict, Optional, Type
from pydantic import BaseModel
import sys
from contextlib import contextmanager
import os
import importlib
from crewai.tools import BaseTool
import ast
from typing import Optional

import engine.types as input_types


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


def extract_tool_class_name(code: str) -> str:
    try:
        parsed_ast = ast.parse(code)
        tool_class_node: Optional[ast.ClassDef] = None
        for node in ast.walk(parsed_ast):
            if isinstance(node, ast.ClassDef):
                for base in node.bases:
                    if isinstance(base, ast.Name) and base.id == "StudioBaseTool":
                        tool_class_node = node
                        break
        if tool_class_node is None:
            raise ValueError("CrewAI tool class not found.")
        return tool_class_node.name
    except SyntaxError as e:
        raise ValueError(f"Error parsing Python code: {e}")


def get_embedded_crewai_tool(
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
        agent_studio_id: str = tool_instance.id
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
