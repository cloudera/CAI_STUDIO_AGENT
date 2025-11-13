# Currenly this build file is used just to set up basic packages for workflow deployment as a Workbench Model.
# Tool specific packages are installed in the workflow deployment script during runtime.

# NOTE: running this cdsw-build.sh script implies that the calling workbench has the
# model root dir feature of Workbench Models enabled. There is a separate build 
# script for workbenches that do not have this feature enabled.

if [ $AGENT_STUDIO_DEPLOY_MODE != "runtime" ]; then
    # Install UV for venv tool usage
    python -m pip install uv

    # Get node
    export NVM_DIR="$(pwd)/.nvm"
    mkdir -p $NVM_DIR
    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    nvm install 22
    nvm use 22
fi

# Extract workflow engine from tar.gz if it exists
echo "Extracting workflow_engine.tar.gz to base directory..."
tar -xzvf workflow_engine.tar.gz -C .
echo "Workflow engine extracted successfully"

if [ $AGENT_STUDIO_DEPLOY_MODE != "runtime" ]; then
    # Install engine code using uv with locked dependencies into system Python
    # Export locked requirements and install with pip (has proper permissions in Docker)
    uv export --frozen --no-hashes > /tmp/requirements.txt
    pip install -r /tmp/requirements.txt
    rm /tmp/requirements.txt
    
    # CRITICAL: Also install the workflow_engine package itself (not just dependencies)
    pip install --no-deps .
fi
