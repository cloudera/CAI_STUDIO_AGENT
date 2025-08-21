from studio.db.utils import import_defaults
from studio.db.dao import get_sqlite_db_location, delete_database
import os
import subprocess
from pathlib import Path


def ensure_correct_base_path():
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    is_runtime = os.getenv("AGENT_STUDIO_DEPLOY_MODE", "amp").lower() == "runtime"
    if is_composable:
        app_data_dir = "/home/cdsw/agent-studio"
    else:
        app_data_dir = "/home/cdsw"

    if is_runtime:
        app_dir = os.getenv("APP_DIR")
    else:
        app_dir = app_data_dir

    os.environ["APP_DIR"] = app_dir
    os.environ["APP_DATA_DIR"] = app_data_dir


def main():
    ensure_correct_base_path()
    
    # Make the app state location if it's not yet created.
    os.makedirs(os.path.dirname(get_sqlite_db_location()), exist_ok=True)
    
    # Also run any and all DB upgrades. Our upgrades need to be compatible with our
    # style of project defaults here - which means that if project defaults gets updated with
    # new schemas, then alembic still needs to go through the entire ugrade lineage even though
    # the new schemas alredy exist. This is to support both old users and new users of agent studio.
    # This means that, for example, if there was an alembic version upgrade to add a column, we need
    # to first check if that column already exists. If the column already exists, someone new must have
    # pulled down agent studio and ran a fresh project-defaults. If the column does not exist, that 
    # means we are performing an upgrade.
    if Path(get_sqlite_db_location()).exists():
        subprocess.run(["uv run alembic upgrade head"], shell=True, capture_output=True, text=True)

    # Import project defaults.
    import_defaults()
    
    return



if __name__ == "__main__":
    main()
