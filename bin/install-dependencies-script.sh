#!/bin/bash

# Script to install dependencies for Agent Studio. Note: this is only used in the AMP
# installation. For Agent Studio runtimes, the environment is already preconfigured
# with venvs and frontend builds.

# In some slower network environments, UV timeouts will lead
# to installation failures. We can increase this manually for
# the duration of this script.
export UV_HTTP_TIMEOUT=3600

# Install python dependencies in uv created environment
# This uses pyproject.toml & uv.lock file to install dependencies
# this should create a subdirectory called .venv (if it doesn't exist)
uv sync --all-extras
uv pip install https://${CDSW_DOMAIN}/api/v2/python.tar.gz --trusted-host ${CDSW_DOMAIN}

# Get node
export NVM_DIR="$(pwd)/.nvm"
mkdir -p $NVM_DIR
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm install 22
nvm use 22
echo $(which node)
echo $(which npm)

echo "Installing new node dependencies (this may take a while...)"
npm install 

echo "Building new frontend application (this may take a moment...)"
npm run build

echo "Configuring workflow engine virtual environment..."
cd studio/workflow_engine
if [ ! -d ".venv" ]; then
    uv venv
fi
VIRTUAL_ENV=.venv uv sync --all-extras
VIRTUAL_ENV=.venv uv pip install https://${CDSW_DOMAIN}/api/v2/python.tar.gz --trusted-host ${CDSW_DOMAIN}
