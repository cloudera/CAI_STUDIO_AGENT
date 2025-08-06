
# This is a startup script to run agent studio using ML Runtime image.
import subprocess
import os
import sys

# Add the app directory to Python path so we can import startup_scripts package
app_dir = os.getenv("APP_DIR", "/studio_app")
if app_dir not in sys.path:
    sys.path.insert(0, app_dir)
# Import utility functions
from startup_scripts.startup_utils import ensure_correct_base_path, install_cmlapi


def main():
    """Main function to run the application."""
    print("Starting Agent Studio...")
    
    # Ensure correct base path
    try:
        working_dir, app_dir = ensure_correct_base_path()
    except ValueError as e:
        print(f"Configuration error: {e}")
        return 1
    
    # Call initialize-project-defaults.py
    try:
        script_path = os.path.join(app_dir, "bin", "initialize-project-defaults.py")
        # Use the virtual environment created during Docker build
        venv_path = os.path.join(app_dir, ".venv")
        env_vars = os.environ.copy()
        env_vars["VIRTUAL_ENV"] = venv_path
        env_vars["PATH"] = f"{venv_path}/bin:{env_vars.get('PATH', '')}"
        print(f"Using existing virtual environment at {venv_path}")
        result = subprocess.run([f"uv run {script_path}"], shell=True, capture_output=True, text=True, env=env_vars)
        print("Project defaults initialization complete.", result.returncode)
        if result.returncode != 0:
            print("=== STDOUT ===")
            print(result.stdout)
            print("=== STDERR ===")
            print(result.stderr)
            return result.returncode
    except subprocess.CalledProcessError as e:
        print(f"Failed to initialize project defaults: {e}")
        print(f"Return code: {e.returncode}")
        if e.stderr:
            print(f"Stderr: {e.stderr}")
        return e.returncode
    except Exception as e:
        print(f"Unexpected error during project defaults initialization: {e}")
        return 1
    
    # Install cmlapi
    try:
        success = install_cmlapi()
        if not success:
            print("cmlapi installation failed - stopping application startup")
            return 1
    except Exception as e:
        print(f"Error during cmlapi installation: {e}")
        print("cmlapi installation failed - stopping application startup")
        return 1
    
    # Call start-agent-ops-server.py
    try:
        script_path = os.path.join(app_dir, "bin", "start-agent-ops-server.py")
        result = subprocess.run([f"uv run {script_path}"], shell=True, capture_output=True, text=True, env=env_vars)
        print("Agent ops server startup complete.", result.returncode)
        if result.returncode != 0:
            print("=== STDOUT ===")
            print(result.stdout)
            print("=== STDERR ===")
            print(result.stderr)
        return result.returncode
    except subprocess.CalledProcessError as e:
        print(f"Failed to start application: {e}")
        print(f"Return code: {e.returncode}")
        if e.stderr:
            print(f"Stderr: {e.stderr}")
        return e.returncode
    except Exception as e:
        print(f"Unexpected error during application startup: {e}")
        return 1


if __name__ == "__main__":
    main()