import ast
from typing import List, Optional

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
