#!/usr/bin/env python3
"""
Utility functions for Agent Studio startup scripts.
"""

import subprocess
import os
import sys
from typing import Optional


def ensure_correct_base_path() -> tuple[str, str]:
    """
    Ensure we're in the correct directory for composable environments.
    Returns (working_dir, app_dir) tuple.
    """
    working_dir = os.getenv("APP_DATA_DIR")
    app_dir = os.getenv("APP_DIR")

    # Validate required environment variables
    if not working_dir:
        raise ValueError("APP_DATA_DIR environment variable is required")
    if not app_dir:
        raise ValueError("APP_DIR environment variable is required")

    print(f"Application directory: {app_dir}")
    print(f"Working directory: {working_dir}")
    if not os.path.exists(working_dir):
        os.makedirs(working_dir)
    os.chdir(working_dir)

    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)
    
    # Also set PYTHONPATH environment variable for subprocesses
    pythonpath = os.environ.get("PYTHONPATH", "")
    if pythonpath:
        os.environ["PYTHONPATH"] = f"{app_dir}:{pythonpath}"
    else:
        os.environ["PYTHONPATH"] = app_dir
    
    return working_dir, app_dir


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
        print("cmlapi installed successfully from remote URL", result.returncode)
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