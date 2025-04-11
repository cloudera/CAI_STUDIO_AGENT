import ast
from typing import Dict, Tuple, List, Optional

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src/")


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
