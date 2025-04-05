import os
import re
import ast
import shutil
import venv
from textwrap import dedent, indent
import subprocess
import threading
import hashlib
from pydantic import BaseModel
from typing import Dict, Tuple, List, Optional, Literal, Type
from crewai.tools import BaseTool

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src/")
from engine.types import Input__ToolInstance


def extract_user_params_from_code(code: str) -> List[str]:
    """
    Extract the user parameters from the wrapper function in the Python code.
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
            return []

        user_params: List[str] = list()

        for field in user_parameter_class_node.body:
            if isinstance(field, ast.AnnAssign) and field.annotation:
                user_params.append(field.target.id)

        return user_params
    except SyntaxError as e:
        raise ValueError(f"Error parsing Python code: {e}")


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


def extract_tool_description(code: str) -> str:
    try:
        parsed_ast = ast.parse(code)
        tool_class_node: Optional[ast.ClassDef] = None
        for node in ast.walk(parsed_ast):
            if isinstance(node, ast.ClassDef):
                for base in node.bases:
                    if isinstance(base, ast.Name) and base.id == "StudioBaseTool":
                        tool_class_node = node
                        break
        description_node: Optional[ast.AnnAssign] = None
        if tool_class_node:
            for field in ast.walk(tool_class_node):
                if isinstance(field, ast.AnnAssign):
                    if field.target.id == "description":
                        description_node = field
                        break
        if description_node:
            exec_namespace = {}
            exec(
                "from textwrap import dedent\n" + f"description_string = {ast.unparse(description_node.value)}",
                exec_namespace,
            )
            return exec_namespace["description_string"]
        return ""
    except SyntaxError as e:
        return ""


def validate_tool_code(code: str) -> Tuple[bool, List[str]]:
    errors: List[str] = []
    try:
        parsed_ast = ast.parse(code)

        # Search for UserParameters class
        user_parameter_class_node: Optional[ast.ClassDef] = None
        for node in ast.walk(parsed_ast):
            if isinstance(node, ast.ClassDef) and node.name == "UserParameters":
                user_parameter_class_node = node
                break
        else:
            errors.append("UserParameters class not found.")

        # Check all the fields of UserParameters are either str or Optional[str]
        if user_parameter_class_node:
            for field in user_parameter_class_node.body:
                if isinstance(field, ast.AnnAssign) and field.annotation:
                    if not (
                        (isinstance(field.annotation, ast.Name) and field.annotation.id == "str")
                        or (
                            isinstance(field.annotation, ast.Subscript)
                            and isinstance(field.annotation.value, ast.Name)
                            and field.annotation.value.id == "Optional"
                            and isinstance(field.annotation.slice, ast.Name)
                            and field.annotation.slice.id == "str"
                        )
                    ):
                        errors.append(f"Field: {field.target.id} is not annotated as str or Optional[str]")

        tool_class_node: Optional[ast.ClassDef] = None
        for node in ast.walk(parsed_ast):
            if isinstance(node, ast.ClassDef):
                for base in node.bases:
                    if isinstance(base, ast.Name) and base.id == "StudioBaseTool":
                        tool_class_node = node
                        break
        if tool_class_node is None:
            errors.append("StudioBaseTool class not found.")

        if tool_class_node:
            inner_tool_parameter_class_node: Optional[ast.ClassDef] = None
            for inner_node in ast.walk(tool_class_node):
                if isinstance(inner_node, ast.ClassDef):
                    if inner_node.name == "ToolParameters":
                        inner_tool_parameter_class_node = inner_node
                        break
            if inner_tool_parameter_class_node is None:
                errors.append("ToolParameters class not found.")

            fields: Dict[str, Optional[ast.AnnAssign]] = {
                "name": None,
                "description": None,
                "args_schema": None,
                "user_parameters": None,
            }
            run_function_node = None
            for field in ast.walk(tool_class_node):
                if isinstance(field, ast.Assign) and field.targets:
                    if isinstance(field.targets[0], ast.Name) and field.targets[0].id in fields:
                        errors.append(f"Tool class field '{field.targets[0].id}' should have a type annotation.")
                if isinstance(field, ast.AnnAssign):
                    if field.target.id in fields:
                        fields[field.target.id] = field
                if isinstance(field, ast.FunctionDef):
                    if field.name == "_run":
                        run_function_node = field

            if not run_function_node:
                errors.append("Tool class must have a _run function.")

            if not all(fields.values()):
                errors.append(f"Tool class must have all the fields: {', '.join(fields.keys())}.")

            # Check that the _run function has the same parameters as ToolParameters
            if run_function_node and inner_tool_parameter_class_node:
                run_function_args = run_function_node.args.args
                inner_tool_parameter_class_fields = [
                    field for field in ast.walk(inner_tool_parameter_class_node) if isinstance(field, ast.AnnAssign)
                ]
                run_function_args_names = sorted([str(arg.arg) for arg in run_function_args if arg.arg != "self"])
                inner_tool_parameter_class_fields_names = sorted(
                    [str(field.target.id) for field in inner_tool_parameter_class_fields]
                )
                if run_function_args_names != inner_tool_parameter_class_fields_names:
                    errors.append(
                        f"The _run function must have the same parameters as ToolParameters. Expected: {', '.join(inner_tool_parameter_class_fields_names)}. Found: {', '.join(run_function_args_names)} ."
                    )

            # Check that `name` and `description` are annotated as str
            if fields["name"] and not (
                isinstance(fields["name"].annotation, ast.Name) and fields["name"].annotation.id == "str"
            ):
                errors.append("Field 'name' must be annotated as str.")
            if fields["description"] and not (
                isinstance(fields["description"].annotation, ast.Name) and fields["description"].annotation.id == "str"
            ):
                errors.append("Field 'description' must be annotated as str.")

            # Check that `user_parameters` is annotated as UserParameters
            if fields["user_parameters"] and not (
                isinstance(fields["user_parameters"].annotation, ast.Name)
                and fields["user_parameters"].annotation.id == "UserParameters"
            ):
                errors.append("Field 'user_parameters' must be annotated as UserParameters.")

    except SyntaxError as e:
        errors.append(f"Syntax error in Python code: {e}")
    return len(errors) == 0, errors
