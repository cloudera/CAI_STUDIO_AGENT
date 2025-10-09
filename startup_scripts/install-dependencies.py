import subprocess
import os
from startup_scripts.startup_utils import ensure_correct_base_path, load_dotenv_file

# Load environment and execution directory.
load_dotenv_file()
ensure_correct_base_path()

out = subprocess.run([f"bash ./bin/install-dependencies-script.sh"], shell=True, check=True)
print(out)

print("Dependencies installed.")
