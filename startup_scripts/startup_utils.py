#!/usr/bin/env python3
"""
Utility functions for Agent Studio startup scripts.
"""

import subprocess
import os
import sys


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


def install_cmlapi() -> bool:
    """Install cmlapi package."""
    print("Installing cmlapi package...")
    
    cdsw_domain = os.getenv("CDSW_DOMAIN")
    if not cdsw_domain:
        print("CDSW_DOMAIN environment variable not set - stopping application startup")
        return False
    
    app_dir = os.getenv("APP_DIR")
    if not app_dir:
        print("APP_DIR environment variable not set - stopping application startup")
        return False
        
    venv_path = os.path.join(app_dir, ".venv")

    try:
        env_vars = os.environ.copy()
        if os.path.exists(venv_path):
            env_vars["VIRTUAL_ENV"] = venv_path
            env_vars["PATH"] = f"{venv_path}/bin:{env_vars.get('PATH', '')}"
            print(f"Using existing virtual environment at {venv_path}")
        
        # SSL verification disabled
        result = subprocess.run([
            "uv", "pip", "install", 
            f"https://{cdsw_domain}/api/v2/python.tar.gz",
            "--trusted-host", cdsw_domain
        ], check=True, capture_output=True, text=True, env=env_vars)
        print("cmlapi installed successfully for the studio venv")

        # Now install for the workflow engine as well
        env_vars["VIRTUAL_ENV"] = os.path.join(app_dir, "studio", "workflow_engine", ".venv")
        env_vars["PATH"] = f"{venv_path}/bin:{env_vars.get('PATH', '')}"
        result = subprocess.run([
            "uv", "pip", "install", 
            f"https://{cdsw_domain}/api/v2/python.tar.gz",
            "--trusted-host", cdsw_domain
        ], check=True, capture_output=True, text=True, env=env_vars)
        print("cmlapi installed successfully for the workflow engine venv", result.returncode)

        return True
    except subprocess.CalledProcessError as e:
        print(f"Failed to install cmlapi from remote URL: {e}")
        print(f"Return code: {e.returncode}")
        if e.stderr:
            print(f"Stderr: {e.stderr}")
        return False
    except Exception as e:
        print(f"Unexpected error during cmlapi installation: {e}")
        return False 