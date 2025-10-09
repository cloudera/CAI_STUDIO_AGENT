"""
Agent Studio - Main Application Entrypoint

This is the main application entrypoint for Agent Studio. It is responsible for
setting up the environment and starting the application to be hosted in the Cloudera
AI Applications framework. Based on pre-set environment variables, this script will
either run Agent Studio as a studio itself, or run a deployed. The largest drivers
for determining a deployed workflow application are AGENT_STUDIO_RENDER_MODE and
APP_DATA_DIR.
"""

import subprocess
import os

def initialize_app_paths():
    app_dir = None
    app_data_dir = None
    is_studio = os.getenv("AGENT_STUDIO_RENDER_MODE", "studio").lower() == "studio"
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    is_runtime = os.getenv("AGENT_STUDIO_DEPLOY_MODE", "amp").lower() == "runtime"
    
    # Set app data directory based on whether we are running in
    # studio mode or workflow mode.
    app_data_dir = os.getenv("APP_DATA_DIR")
    if is_studio:
        app_data_dir = "/home/cdsw/agent-studio" if is_composable else "/home/cdsw"

    # Set the app directory 
    app_dir = os.getenv("APP_DIR", "/home/cdsw/agent-studio") if is_composable else "/home/cdsw"

    # At this point, both environment variables have been configured
    os.environ["APP_DIR"] = app_dir
    os.environ["APP_DATA_DIR"] = app_data_dir

    print(f"Application directory: {app_dir}")
    print(f"Application data directory: {app_data_dir}")

initialize_app_paths()

out = subprocess.run([f"bash {os.getenv('APP_DIR')}/bin/start-app-script.sh"], shell=True, check=True)
print("Application complete.")
