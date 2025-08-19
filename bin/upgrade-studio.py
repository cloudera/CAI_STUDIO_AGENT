import os
import subprocess
import sys

def ensure_correct_base_path():
    import os
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

    print(f"Changing working directory to '{app_data_dir}'")
    os.chdir(app_data_dir)
ensure_correct_base_path()

if os.getenv("AGENT_STUDIO_DEPLOY_MODE", "amp").lower() == "runtime":
    print("Upgrade job not supported in runtime mode. Skipping upgrade.")
    sys.exit(0)

try:        
    out = subprocess.run(
        ["uv run python -u studio/jobs/upgrade.py"], 
        shell=True, 
        check=True
        )
except subprocess.CalledProcessError as e:
    print(e.stderr) 
    print("Failed to upgrade studio. Exception occurred. Exited with code: ", e.returncode)
    sys.exit(1)
