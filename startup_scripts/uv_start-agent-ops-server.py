"""
Agent Studio - Agent Ops & Metrics Server

This is a heritage application entrypoint driver for Agent Studio's legacy
Ops & Metrics server. The only time this script should be ran is if there is
a legacy Ops & Metrics application from a previous AMP build. Runtime-type
Agent Studio will never have a standalone Ops & Metrics application, so we will assume
that this script is only running in non-runtime mode. Any new workflow deployments
in EITHER mode will no longer use this legacy application and will rather route to dedicated
telemetry stores per each deployed workflow.
"""

import os
import subprocess 

# Because we're guaranteed to run this script in AMP mode, we can 
# safely assume the directory based on our two AMP configurations - 
# AI Studios Composable mode, and raw AMP mode.

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

!uv run bin/start-agent-ops-server.py