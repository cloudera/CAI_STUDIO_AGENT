#!/bin/bash

# Bootstrap development environment for Agent Studio runtime/container. This only needs to be ran 
# every time the dev container is rebuilt. 
# 
# Because runtime images store base python dependencies in /home/cdsw/.local, and because we grab
# uv for the base python, you can technically mount your source code directly into the 
# home directory so we have ~/.local persist as well. Ideally, however, we should be completely
# agnostic to having our app code exist outside of /home/cdsw, which is why we are purposefully
# NOT mountinng the source code into the home directory.
#
# Because this script is dependent on the startup_scripts/ package, we need to run this
# script from APP_DIR.

# Get the app directory from environment
export APP_DIR=${APP_DIR:-$(pwd)}
export APP_DATA_DIR=${APP_DATA_DIR:-$(pwd)}
cd $APP_DIR
export PYTHONPATH=$APP_DIR:$PYTHONPATH

# Load environment variables from .env files if they exist
if [ -f ".env" ]; then
    echo "Loading environment variables from .env"
    export $(grep -v '^#' ".env" | xargs)
fi

# Load local overrides if they exist
if [ -f ".env.local" ]; then
    echo "Loading environment variables from .env.local"
    export $(grep -v '^#' ".env.local" | xargs)
fi

# Run pre-install check
python startup_scripts/pre_install_check.py

# Install uv if not present for cdsw user. This will install uv in the
# base python environment, which stores site packages in /home/cdsw/.local/lib/python3.10/site-packages.
# Note that this will not span across container lifetimes if you do not mount your source code into
# the home directory.
python startup_scripts/ensure-uv-package-manager.py

# Now that we have uv installed we can install other dependencies. This will create a virtual environment
# in $APP_DIR and in $APP_DIR/studio/workflow_engine/. The reason we don't use the 
# install-dependencies.py script directly is because we don't want to build the frontend.
export UV_HTTP_TIMEOUT=3600
VIRTUAL_ENV=.venv uv sync --all-extras

# Install Node. Note: because this is for bootstrapping our dev environment, we wanto to install
# node in our APP_DIR, which will be where our package.json is, etc. However, during execution time,
# we also want Node available in our APP_DATA_DIR, which will be the node that is used during runtime
# of Agent Studio to handle Node-based MCPs, etc.
cd $APP_DIR
export NVM_DIR="$APP_DIR/.nvm"
mkdir -p $NVM_DIR
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm install 22
nvm use 22
npm install 

# Build the workflow engine
cd $APP_DIR/studio/workflow_engine
VIRTUAL_ENV=.venv uv sync --all-extras
cd $APP_DIR