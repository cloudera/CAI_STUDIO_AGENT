import subprocess
import sys
import os
from startup_scripts.startup_utils import load_dotenv_file, ensure_correct_base_path

# Initialize project defaults. This is a wrapper around the main initialization script. This
# wrapper is primarily used to set the correct working directory (to APP_DATA_DIR) for the
# script execution. NOTE: this script is only used in the AMP installation. For Agent Studio
# runtimes, project defaults are initialized in the app initialization logic directly.

# Load environment and execution directory.
load_dotenv_file()
ensure_correct_base_path()

try:        
    app_dir = os.getenv("APP_DIR", os.getcwd())
    os.chdir(app_dir)
    out = subprocess.run(
        [f"VIRTUAL_ENV=.venv uv run bin/initialize-project-defaults.py"], 
        shell=True, 
        capture_output=True, 
        text=True
    )
    print(out.stdout)
    print(out.stderr)
    if out.returncode != 0:
        print("Failed to initialize project defaults. Exited with code: ", out.returncode)
        sys.exit(1)
except subprocess.CalledProcessError as e:
    print(e.stdout)
    print(e.stderr) 
    print("Failed to initialize project defaults. Exception occurred. Exited with code: ", e.returncode)
    sys.exit(1)
