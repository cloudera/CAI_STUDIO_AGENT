import os
import cmlapi
import ast
from typing import Optional


def get_appliction_by_name(cml: cmlapi.CMLServiceApi, name: str) -> cmlapi.Application:
    """
    Get the most recent running version of a CML application by its name.
    Args:
        cml: CML API client
        name: Base name of the application (e.g. 'Agent Studio')
    Returns:
        The most recent running version of the application
    Raises:
        ValueError: If no running application is found
    """
    applications: list[cmlapi.Application] = cml.list_applications(
        project_id=os.getenv("CDSW_PROJECT_ID"),
        page_size=5000,
    ).applications

    # Filter for applications that:
    # 1. Match the base name
    # 2. Have "running" in their status
    running_apps = [
        app
        for app in applications
        if ((app.name == name) or (name + " v") in app.name)
        and "running" in app.status.lower()  # Changed to check if "running" is in status
    ]

    if not running_apps:
        raise ValueError(f"No running applications found matching '{name}'")

    # Sort by version number (assuming format "Name vX.Y")
    def get_version(app_name: str) -> tuple:
        try:
            version = app_name.split("v")[-1]
            return tuple(map(int, version.split(".")))
        except (IndexError, ValueError):
            return (0, 0)  # Default for apps without version

    # Return the most recent version
    return sorted(running_apps, key=lambda x: get_version(x.name))[-1]


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
