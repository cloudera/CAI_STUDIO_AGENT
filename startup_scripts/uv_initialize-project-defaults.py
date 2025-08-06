import subprocess
import sys

def ensure_correct_base_path():
    import os
    working_dir = os.getcwd()
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    if is_composable:
        subdirectory = "agent-studio"
        working_dir = os.path.join("/home/cdsw", subdirectory)
        print(f"Changing working directory to '{working_dir}'")
        os.chdir(working_dir)
    os.environ["APP_DIR"] = working_dir
    os.environ["APP_DATA_DIR"] = working_dir
ensure_correct_base_path()

try:        
    out = subprocess.run(["uv run bin/initialize-project-defaults.py"], shell=True, capture_output=True, text=True)
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
