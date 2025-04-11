#!/bin/bash

# Install python dependencies in uv created environment
# This uses pyproject.toml & uv.lock file to install dependencies
# this should create a subdirectory called .venv (if it doesn't exist)
uv sync --all-extras

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
rm -rf .venv
uv venv
VIRTUAL_ENV=.venv uv sync --all-extras