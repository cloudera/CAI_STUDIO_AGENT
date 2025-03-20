#!/bin/bash

set -euo pipefail

# If a user has a proxy configured and if we are routing https traffic
# through an http endpoint, there is a chance that this MITM-type proxy will
# lead to certification issues with some tools. This is a common corporate
# proxy pattern. The below ensures that we can still install agent studio
# dependencies (which use wget, curl, git npm, nvm, etc.) in this specific
# proxy configuration.
if [[ "${https_proxy:-}" =~ ^http:// ]]; then
    echo "HTTPS over HTTP proxy identified. Disabling SSL checks for install..."

    wget() {
        command wget --no-check-certificate "$@"
    }
    curl() {
        command curl --insecure "$@"
    }
    git config --global http.sslVerify false
fi

# Install python dependencies in uv created environment
# This uses pyproject.toml & uv.lock file to install dependencies
# this should create a subdirectory called .venv (if it doesn't exist)
uv sync

# Get node
export NVM_DIR="$(pwd)/.nvm"
mkdir -p $NVM_DIR
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm install 22
nvm use 22
echo $(which node)
echo $(which npm)

if [[ "${https_proxy:-}" =~ ^http:// ]]; then
    npm config set strict-ssl false
fi 

# Install frontend dependencies and run build
rm -rf node_modules/
npm install 
npm run build