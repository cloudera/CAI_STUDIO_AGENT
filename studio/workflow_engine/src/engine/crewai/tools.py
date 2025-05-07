# No top level studio.db imports allowed to support wokrflow model deployment

from typing import Dict, Optional, Type
from pydantic import BaseModel
import os
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
            subprocess.run(
                uv_venv_setup_command,
                check=True,
                text=True,
            )
        else:
            venv.create(venv_dir, with_pip=True)
    except Exception as e:
        print(f"Error creating virtual environment for tool directory {source_folder_path}: {e.with_traceback()}")
        raise RuntimeError(f"COULD NOT CREATE VENV: {e.with_traceback()}")
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
            if os.path.exists(hash_file_path):
                os.remove(hash_file_path)
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
            subprocess.run(
                pip_install_command,
                check=True,
                text=True,
                env={"VIRTUAL_ENV": venv_dir} if with_ == "uv" else None,
            )

            with open(hash_file_path, "w") as hash_file:
                hash_file.write(requirements_hash)
    except subprocess.CalledProcessError as e:
        # We're not raising error as this will bring down the whole studio, as it's running in a thread
        print(f"Error installing venv requirements for tool directory {source_folder_path}: {e.with_traceback()}")
        raise RuntimeError(f"COULD NOT INSTALL REQUIREMENTS: {e.with_traceback()}")


def prepare_virtual_env_for_tool(source_folder_path: str, requirements_file_name: str):
    return _prepare_virtual_env_for_tool_impl(source_folder_path, requirements_file_name, "uv")


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
        description: str = ast.get_docstring(ast.parse(tool_code))
        args_schema: Type[BaseModel] = get_venv_tool_tool_parameters_type(tool_code)

        def _run(self, *args, **kwargs):
            try:
                cmd = [
                    self.python_executable,
                    self.python_file,
                    "--user-params", json.dumps(dict(user_params)),
                    "--tool-params", json.dumps(dict(kwargs)),
                ]
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    check=False,
                )
            except Exception as e:
                return f"Tool call failed: {e}"
            if result.returncode != 0:
                return f"Error: {result.stderr or 'No error details found'}"
            if result.stdout:
                output = str(result.stdout)
                if self.output_key and self.output_key in output:
                    output = output.split(self.output_key, 1)[-1].strip()
                return output
            if result.stderr:
                return f"stderr: {result.stderr or 'No error details found'}\n\n\nstdout: {result.stdout}"
            return f"Error running tool - no output"

    tool = AgentStudioCrewAIVenvTool()

    return tool


def is_venv_tool(tool_code: str) -> bool:
    """
    Checks to see whether a tool is a venv tool (V2 Tool) or not. This is determined
    by the existence of ToolParameters at the upper level of the entrypoint
    module for the tool. venv tools have ToolParameters at the root of the module,
    whereas "V1" tools have ToolParameters defined nested in the StudioBaseTool.

    NOTE: this is NOT a tool validation script. This is just a hueristic to determine
    whether a tool is *probably* a valid V1 or V2 tool. We should put more time into
    introspecting our tool code and revamping validate_tool_code() to handle V2 tools.
    """

    parsed_ast = ast.parse(tool_code)

    # Search for ToolParameters class in the base node
    for node in parsed_ast.body:
        if isinstance(node, ast.ClassDef) and node.name == "ToolParameters":
            return True
    return False


def get_crewai_tool(tool_instance: input_types.Input__ToolInstance, user_params_kv: Dict[str, str]) -> BaseTool:
    """
    Agent Studio currently supports two different tool template types - one which is a "V2" venv tool (multiple
    files and packages, custom main entrypoint), and the "V1" tool (requires some class structure, only
    single file tool, etc.). This method determines what tool type is running and then either loads the
    V1 tool or the V2 tool.
    """
    relative_module_dir = os.path.abspath(tool_instance.source_folder_path)
    with open(os.path.join(relative_module_dir, tool_instance.python_code_file_name), "r") as code_file:
        tool_code = code_file.read()
    if is_venv_tool(tool_code):
        return get_venv_tool(tool_instance, user_params_kv)
    else:
        return get_tool_instance_proxy(tool_instance, user_params_kv)
