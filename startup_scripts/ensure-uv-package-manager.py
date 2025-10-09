#!/usr/bin/env python3

import subprocess
import sys
from startup_scripts.startup_utils import load_dotenv_file, ensure_correct_base_path

# Load environment and execution directory.
load_dotenv_file()
ensure_correct_base_path()

def check_uv_installed():
    """Check if uv package manager is installed."""
    try:
        subprocess.run(['uv', '--version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def install_uv():
    """Install uv package manager using pip."""
    print("Installing uv package manager...")
    try:
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'uv'], check=True)
        print("Successfully installed uv package manager")
    except subprocess.CalledProcessError as e:
        print(f"Failed to install uv package manager: {e}")
        sys.exit(1)

def main():
    if not check_uv_installed():
        install_uv()
    else:
        print("uv package manager is already installed")

if __name__ == "__main__":
    main()
