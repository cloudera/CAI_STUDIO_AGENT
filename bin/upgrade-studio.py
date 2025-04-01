import subprocess
import sys

def ensure_correct_base_path():
    import os
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    if is_composable:
        subdirectory = "agent-studio"
        working_dir = os.path.join("/home/cdsw", subdirectory)
        print(f"Changing working directory to '{working_dir}'")
        os.chdir(working_dir)
ensure_correct_base_path()

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
