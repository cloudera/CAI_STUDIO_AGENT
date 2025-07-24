import os
import cmlapi

def get_url_scheme() -> str:
    """
    Get the URL scheme for the current workspace.
    """
    return "https" if os.getenv("AGENT_STUDIO_WORKBENCH_TLS_ENABLED", "false").lower() == "true" else "http"

def get_application_by_name(cml: cmlapi.CMLServiceApi, name: str, only_running: bool = True) -> cmlapi.Application:
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
    if only_running:
        running_apps = [
            app
            for app in applications
            if ((app.name == name) or (name + " v") in app.name)
            and "running" in app.status.lower()  # Changed to check if "running" is in status
        ]
    else:
        running_apps = [app for app in applications if ((app.name == name) or (name + " v") in app.name)]

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
