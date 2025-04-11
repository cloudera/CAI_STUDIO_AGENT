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
import subprocess
import json
from textwrap import dedent, indent
import threading
import hashlib
import re
import shutil
import venv

import engine.types as input_types
from engine.types import *


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


def _get_skeleton_tool_code(code: str) -> str:
    """
    Extract the Tool class, ToolParameters class, UserParameters class, and the _run function from the given Python code.
    Replace the _run function with a pass statement.
    """
    parsed_ast = ast.parse(code)

    # Find UserParameters class
    user_parameters_class_node: Optional[ast.ClassDef] = None
    for node in ast.walk(parsed_ast):
        if isinstance(node, ast.ClassDef) and node.name == "UserParameters":
            user_parameters_class_node = node
            break
    if user_parameters_class_node is None:
        raise ValueError("UserParameters class not found.")

    # Find Tool class
    tool_class_name = extract_tool_class_name(code)
    tool_class_node: Optional[ast.ClassDef] = None
    for node in ast.walk(parsed_ast):
        if isinstance(node, ast.ClassDef) and node.name == tool_class_name:
            tool_class_node = node
            break
    if tool_class_node is None:
        raise ValueError("Tool class not found.")

    inner_tool_parameter_class_node: Optional[ast.ClassDef] = None
    for inner_node in ast.walk(tool_class_node):
        if isinstance(inner_node, ast.ClassDef):
            if inner_node.name == "ToolParameters":
                inner_tool_parameter_class_node = inner_node
                break
    if inner_tool_parameter_class_node is None:
        raise ValueError("ToolParameters class not found.")

    fields: Dict[str, Optional[ast.AnnAssign]] = {"name": None, "description": None, "args_schema": None}
    run_function_node = None
    for field in ast.walk(tool_class_node):
        if isinstance(field, ast.AnnAssign):
            if field.target.id in fields:
                fields[field.target.id] = field
        if isinstance(field, ast.FunctionDef):
            if field.name == "_run":
                run_function_node = field

    if not run_function_node:
        raise ValueError("Tool class must have a _run function.")

    if not all(fields.values()):
        raise ValueError(f"Tool class must have all the fields: {', '.join(fields.keys())}.")

    modified_user_parameters_class_node_body = [
        field for field in user_parameters_class_node.body if (isinstance(field, ast.AnnAssign) and field.annotation)
    ]
    if len(modified_user_parameters_class_node_body) == 0:
        modified_user_parameters_class_node_body = [ast.Pass(lineno=0, col_offset=0)]
    modified_user_parameters_class_node = ast.ClassDef(
        name=user_parameters_class_node.name,
        bases=user_parameters_class_node.bases,
        keywords=user_parameters_class_node.keywords,
        body=modified_user_parameters_class_node_body,
        decorator_list=user_parameters_class_node.decorator_list,
        lineno=user_parameters_class_node.lineno,
        col_offset=user_parameters_class_node.col_offset,
    )

    modified_inner_tool_parameter_class_node = ast.ClassDef(
        name=inner_tool_parameter_class_node.name,
        bases=inner_tool_parameter_class_node.bases,
        keywords=inner_tool_parameter_class_node.keywords,
        body=[field for field in inner_tool_parameter_class_node.body if isinstance(field, ast.AnnAssign)],
        decorator_list=inner_tool_parameter_class_node.decorator_list,
        lineno=inner_tool_parameter_class_node.lineno,
        col_offset=inner_tool_parameter_class_node.col_offset,
    )

    modified_run_function_node = ast.FunctionDef(
        name=run_function_node.name,
        args=run_function_node.args,
        body=[ast.Pass(lineno=0, col_offset=0)],
        decorator_list=run_function_node.decorator_list,
        returns=run_function_node.returns,
        type_comment=run_function_node.type_comment,
        lineno=run_function_node.lineno,
        col_offset=run_function_node.col_offset,
    )

    modified_tool_class_node = ast.ClassDef(
        name=tool_class_node.name,
        bases=[ast.Name(id="BaseTool")],
        keywords=tool_class_node.keywords,
        body=[modified_inner_tool_parameter_class_node]
        + [field_node for field_node in fields.values() if field_node]
        + [modified_run_function_node],
        decorator_list=tool_class_node.decorator_list,
        lineno=tool_class_node.lineno,
        col_offset=tool_class_node.col_offset,
    )

    typing_imports_matching_regex = r"^\s*(from\s+(pydantic|typing|textwrap|crewai(?:\.\w+)?)\s+import.*|import\s+(pydantic|typing|textwrap|crewai)(\.\w+)?(\s+as\s+\w+)?)"
    typing_import_matches = [
        match[0].strip() for match in re.findall(typing_imports_matching_regex, code, re.MULTILINE) if match[0]
    ]

    # Create a new file with the modified classes

    content = (
        "\n".join(typing_import_matches)
        + "\n"
        + "from crewai.tools import BaseTool"
        + "\n\n"
        + ast.unparse(modified_user_parameters_class_node)
        + "\n\n"
        + ast.unparse(modified_tool_class_node)
        + "\n\n"
    )
    return content


def run_code_in_thread(code):
    """
    Runs the given Python code in a separate thread and returns the result.
    The code should assign the object to be returned in a variable name 'result'.
    """

    result = None

    def target():
        nonlocal result
        try:
            # Create a new namespace for the exec
            namespace = {}
            exec(code, namespace)

            # If you want to return a specific object, assign it to 'result'
            if "result" in namespace:
                result = namespace["result"]
        except Exception as e:
            result = e

    thread = threading.Thread(target=target)
    thread.start()
    thread.join()

    if isinstance(result, Exception):
        raise result
    return result


def get_tool_instance_proxy(tool_instance: Input__ToolInstance, user_params_kv: Dict[str, str]) -> BaseTool:
    """
    Get the tool instance proxy callable for the tool instance.
    """

    if not is_venv_prepared_for_tool(tool_instance.source_folder_path, tool_instance.python_requirements_file_name):
        raise ValueError(f"Virtual environment not prepared for tool '{tool_instance.name}'.")

    tool_file_path = os.path.join(tool_instance.source_folder_path, tool_instance.python_code_file_name)
    with open(tool_file_path, "r") as tool_file:
        tool_code = tool_file.read()
    tool_class_name = extract_tool_class_name(tool_code)
    python_executable = os.path.join(tool_instance.source_folder_path, ".venv", "bin", "python")
    path_to_add = os.path.join(tool_instance.source_folder_path, ".venv", "bin")

    skeleton_tool_code = _get_skeleton_tool_code(tool_code)

    replacement_code = f"""
    function_arguments = {{k: v for k, v in locals().items() if k != 'self'}}
    tool_class_name = self.__class__.__name__
    tool_file = "{tool_file_path}"
    python_executable = "{python_executable}"
    path_to_add = "{path_to_add}"
    user_kwargs = {user_params_kv}

    with tempfile.NamedTemporaryFile(mode="w+", delete=True, dir="/tmp") as tmp_file:
        tmp_file_name = tmp_file.name
        with open(tool_file, "r") as file:
            tool_code = file.read()
            augmented_tool_code = (
                tool_code + "\\n\\n"
                + "import json\\n\\n"
                + f"user_kwargs = {{user_kwargs}}\\n"
                + f"tool_kwargs = {{function_arguments}}\\n"
                + f"_tool_obj = {{tool_class_name}}(user_parameters=user_kwargs)\\n"
                + f"with open('{{tmp_file_name}}', 'w') as output_file:\\n"
                + "    json.dump(_tool_obj._run(**tool_kwargs), output_file)\\n"
            )
        new_envs = os.environ.copy()
        new_envs["PATH"] = path_to_add + ":" + new_envs["PATH"]
        result = subprocess.run([python_executable, "-c", augmented_tool_code], capture_output=True, text=True, check=False, env=new_envs)
        if result.stderr:
            raise ValueError(f"Error in executing tool: {{result.stderr}}")
        with open(tmp_file_name, "r") as output_file:
            output = json.load(output_file)
        return output
    """

    proxy_code = "import os, json, subprocess, tempfile\n" + skeleton_tool_code.replace(
        "        pass", indent(dedent(replacement_code), "        ")
    )

    _tool: BaseTool = run_code_in_thread(proxy_code + f"\n\nresult = {tool_class_name}()")

    class EmbeddedCrewAITool(BaseTool):
        agent_studio_id: str = tool_instance.id
        name: str = _tool.name
        description: str = _tool.description
        args_schema: Type[BaseModel] = _tool.args_schema

        def _run(self, *args, **kwargs):
            return _tool._run(*args, **kwargs)

    crewai_tool: BaseTool = EmbeddedCrewAITool()
    print(str(crewai_tool))

    crewai_tool.name = tool_instance.name
    crewai_tool._generate_description()

    return crewai_tool


def is_venv_prepared_for_tool(source_folder_path: str, requirements_file_name: str) -> bool:
    venv_dir = os.path.join(source_folder_path, ".venv")
    if not os.path.exists(venv_dir):
        return False
    hash_file_path = os.path.join(source_folder_path, ".requirements_hash.txt")
    if not os.path.exists(hash_file_path):
        return False
    with open(hash_file_path, "r") as hash_file:
        previous_hash = hash_file.read().strip()
    with open(os.path.join(source_folder_path, requirements_file_name), "r") as requirements_file:
        requirements_content = requirements_file.read()
        requirements_hash = hashlib.md5(requirements_content.encode()).hexdigest()
    return requirements_hash == previous_hash


def _prepare_virtual_env_for_tool_impl(
    source_folder_path: str, requirements_file_name: str, with_: Literal["venv", "uv"]
):
    venv_dir = os.path.join(source_folder_path, ".venv")
    uv_bin = shutil.which("uv")

    try:
        if with_ == "uv":
            uv_venv_setup_command = [uv_bin, "venv", venv_dir]
            out = subprocess.run(
                uv_venv_setup_command,
                check=True,
                capture_output=True,
                text=True,
            )
            print(f"stdout for uv venv setup for tool {source_folder_path}: {out.stdout}")
            print(f"stderr for uv venv setup for tool {source_folder_path}: {out.stderr}")
        else:
            venv.create(venv_dir, with_pip=True)
    except Exception as e:
        print(f"Error creating virtual environment for tool directory {source_folder_path}: {e.with_traceback()}")
        return

    # Check for previous requirements file hash
    hash_file_path = os.path.join(source_folder_path, ".requirements_hash.txt")
    previous_hash = ""
    if os.path.exists(hash_file_path):
        with open(hash_file_path, "r") as hash_file:
            previous_hash = hash_file.read().strip()

    # Calculate the hash of the requirements file
    requirements_file_path = os.path.join(source_folder_path, requirements_file_name)
    with open(requirements_file_path, "r") as requirements_file:
        requirements_content = requirements_file.read()
        requirements_hash = hashlib.md5(requirements_content.encode()).hexdigest()

    # If the hash has changed, install the requirements
    try:
        if requirements_hash != previous_hash:
            if with_ == "uv":
                pip_install_command = [uv_bin, "pip", "install", "-r", requirements_file_path]
            else:
                python_exe = os.path.join(venv_dir, "bin", "python")
                pip_install_command = [
                    python_exe,
                    "-m",
                    "pip",
                    "install",
                    "--no-user",
                    "-r",
                    requirements_file_path,
                ]
            out = subprocess.run(
                pip_install_command,
                check=True,
                capture_output=True,
                text=True,
                env={"VIRTUAL_ENV": venv_dir} if with_ == "uv" else None,
            )
            print(f"stdout for pip install for tool {source_folder_path}: {out.stdout}")
            print(f"stderr for pip install for tool {source_folder_path}: {out.stderr}")

            with open(hash_file_path, "w") as hash_file:
                hash_file.write(requirements_hash)
    except subprocess.CalledProcessError as e:
        # We're not raising error as this will bring down the whole studio, as it's running in a thread
        print(f"Error installing venv requirements for tool directory {source_folder_path}: {e.with_traceback()}")


def prepare_virtual_env_for_tool(source_folder_path: str, requirements_file_name: str):
    return _prepare_virtual_env_for_tool_impl(source_folder_path, requirements_file_name, "venv")


def get_venv_tool_output_key(code: str) -> Optional[str]:
    """
    Parse the code with ast, look for a line like:
        OUTPUT_KEY = 'some_string'
    Return the string if found, else None.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise ValueError(f"Error parsing Python code: {e}")

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            # node.targets can be a list of targets (e.g. multiple assignment)
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "OUTPUT_KEY":
                    # Make sure it's assigned a string literal
                    if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                        return node.value.value
    return None


def get_venv_tool_python_executable(tool_instance: input_types.Input__ToolInstance) -> str:
    return os.path.join(tool_instance.source_folder_path, ".venv", "bin", "python")


def get_venv_tool_tool_parameters_type(code: str) -> Type[BaseModel]:
    """
    1. Parse the given Python source code into an AST.
    2. Locate the class named 'ToolParameters'.
    3. Create a new ClassDef that keeps only certain nodes (e.g., AnnAssign fields).
    4. Insert that ClassDef into a minimal AST Module with an import of BaseModel.
    5. Compile & exec that new module in the current Python environment.
    6. Return the resulting class object from namespace.
    """
    # Parse the entire file into an AST
    tree = ast.parse(code)

    # Find the ToolParameters class node
    tool_params_node: Optional[ast.ClassDef] = None
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "ToolParameters":
            tool_params_node = node
            break

    if tool_params_node is None:
        raise ValueError("ToolParameters class not found in the code.")

    # Make a new ClassDef that keeps only certain statements (e.g. AnnAssign)
    # or anything else you'd like to preserve.
    stripped_body = [
        stmt
        for stmt in tool_params_node.body
        if isinstance(stmt, ast.AnnAssign)
        # You could also allow ast.Assign if you want un-annotated assignments, etc.
    ]

    modified_tool_parameters = ast.ClassDef(
        name=tool_params_node.name,  # "ToolParameters"
        bases=tool_params_node.bases,  # e.g. [ast.Name(id="BaseModel", ...)]
        keywords=tool_params_node.keywords,  # e.g. if there's a metaclass or something
        body=stripped_body,  # keep only field definitions
        decorator_list=tool_params_node.decorator_list,
        lineno=tool_params_node.lineno,
        col_offset=tool_params_node.col_offset,
        end_lineno=getattr(tool_params_node, "end_lineno", None),
        end_col_offset=getattr(tool_params_node, "end_col_offset", None),
    )

    # Build a new AST module with:
    #   from pydantic import BaseModel
    #   <modified classdef>
    module_body = [
        ast.ImportFrom(module="typing", names=[ast.alias(name="*", asname=None)], level=0),
        ast.ImportFrom(module="pydantic", names=[ast.alias(name="*", asname=None)], level=0),
        modified_tool_parameters,
    ]

    new_module = ast.Module(
        body=module_body,
        type_ignores=[],  # For Python 3.8+; on older versions, you may omit or use `[]`
    )

    # Fix any missing line/column info in the AST so Python can compile it
    ast.fix_missing_locations(new_module)

    # Compile and execute this brand-new module in a scratch namespace
    ns = {}
    compiled = compile(new_module, filename="<ast>", mode="exec")
    exec(compiled, ns)

    # Retrieve the newly-defined "ToolParameters" class
    dynamic_cls = ns["ToolParameters"]

    # Confirm it’s a subclass of BaseModel (optional sanity check)
    if not issubclass(dynamic_cls, BaseModel):
        raise ValueError("Extracted ToolParameters is not a subclass of BaseModel.")

    return dynamic_cls


def get_venv_tool(tool_instance: input_types.Input__ToolInstance, user_params_kv: Dict[str, str]) -> BaseTool:
    relative_module_dir = os.path.abspath(tool_instance.source_folder_path)
    with open(os.path.join(relative_module_dir, tool_instance.python_code_file_name), "r") as code_file:
        tool_code = code_file.read()
    user_params = user_params_kv

    class AgentStudioCrewAIVenvTool(BaseTool):
        agent_studio_id: str = tool_instance.id
        output_key: Optional[str] = get_venv_tool_output_key(tool_code)
        python_executable: str = get_venv_tool_python_executable(tool_instance)
        python_file: str = os.path.join(tool_instance.source_folder_path, tool_instance.python_code_file_name)
        name: str = tool_instance.name
        description: str = ""  # eventually tool_instance.description
        args_schema: Type[BaseModel] = get_venv_tool_tool_parameters_type(tool_code)

        def _run(self, *args, **kwargs):
            try:
                result = subprocess.run(
                    [
                        self.python_executable,
                        self.python_file,
                        "--user-params",
                        json.dumps(dict(user_params)),
                        "--tool-params",
                        json.dumps(dict(kwargs)),
                    ],
                    capture_output=True,
                    text=True,
                )
            except Exception as e:
                return f"Tool call failed: {e}"
            if result.returncode != 0:
                return f"Error: {result.stderr or 'No error details found'}"
            if result.stderr:
                return f"Error: {result.stderr or 'No error details found'}"
            output = str(result.stdout)
            if self.output_key and self.output_key in output:
                output = output.split(self.output_key, 1)[-1].strip()
            return output

    tool = AgentStudioCrewAIVenvTool()

    return tool
