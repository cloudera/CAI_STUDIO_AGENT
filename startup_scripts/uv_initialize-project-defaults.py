import subprocess
import sys
import os

def ensure_dotenv() -> bool:
    """Ensure python-dotenv package is installed."""
    try:
        import dotenv
        return True
    except ImportError:
        print("python-dotenv not found. Installing...")
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', 'python-dotenv'], check=True)
            print("Successfully installed python-dotenv")
            
            # Force reload of the site-packages and try importing again
            import importlib
            import site
            importlib.reload(site)
            
            # Try importing again after reloading site-packages
            try:
                import dotenv
                return True
            except ImportError:
                # If still fails, try adding the site-packages to path manually
                import sysconfig
                site_packages = sysconfig.get_paths()["purelib"]
                if site_packages not in sys.path:
                    sys.path.insert(0, site_packages)
                import dotenv
                return True
                
        except subprocess.CalledProcessError as e:
            print(f"Failed to install python-dotenv: {e}")
            return False
        except ImportError as e:
            print(f"Failed to import dotenv after installation: {e}")
            print("Note: You may need to restart the Python process for the installation to take effect.")
            return False


def load_dotenv_file() -> None:
    """Load environment variables from .env file if it exists."""
    if ensure_dotenv():
        try:
            from dotenv import load_dotenv as _load_dotenv
            # Try multiple possible locations for .env file
            env_files = ['.env', '.env.local']
            for env_file in env_files:
                if os.path.exists(env_file):
                    _load_dotenv(env_file)
                    print(f"Loaded environment variables from {env_file}")
                    break
            else:
                print("No .env file found in common locations")
        except Exception as e:
            print(f"Error loading .env file: {e}")


def ensure_correct_base_path() -> tuple[str, str]:
    """
    Ensure we have entered the correct base path, APP_DATA_DIR,
    for the application.
    """
    app_data_dir = os.getenv("APP_DATA_DIR", "/home/cdsw")
    app_dir = os.getenv("APP_DIR", os.getcwd())

    # Validate required environment variables
    if not app_data_dir:
        raise ValueError("APP_DATA_DIR environment variable is required")
    if not app_dir:
        raise ValueError("APP_DIR environment variable is required")

    # Determine whether this application is being ran in a composable environment
    # (i.e. AI Studios mode), in which case we also explicitly set our working
    # directory.
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    if is_composable:
        subdirectory = "agent-studio"
        app_data_dir = os.path.join("/home/cdsw", subdirectory)
        app_dir = os.path.join("/home/cdsw", subdirectory)

    print(f"Application directory: {app_dir}")
    print(f"Application data directory: {app_data_dir}")

    if not os.path.exists(app_data_dir):
        os.makedirs(app_data_dir)
    os.chdir(app_data_dir)

    # Add our baseline app directory to the path.
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)
    
    # Also set PYTHONPATH environment variable for subprocesses
    pythonpath = os.environ.get("PYTHONPATH", "")
    if pythonpath:
        os.environ["PYTHONPATH"] = f"{app_dir}:{pythonpath}"
    else:
        os.environ["PYTHONPATH"] = app_dir
    
    return app_data_dir, app_dir


# Initialize project defaults. This is a wrapper around the main initialization script. This
# wrapper is primarily used to set the correct working directory (to APP_DATA_DIR) for the
# script execution. NOTE: this script is only used in the AMP installation. For Agent Studio
# runtimes, project defaults are initialized in the app initialization logic directly.

# Load environment and execution directory.
load_dotenv_file()
app_data_dir, app_dir = ensure_correct_base_path()
os.environ["APP_DIR"] = app_dir
os.environ["APP_DATA_DIR"] = app_data_dir

try:        
    os.chdir(app_dir)
    out = subprocess.run(
        [f"VIRTUAL_ENV=.venv uv run --no-sync bin/initialize-project-defaults.py"], 
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
