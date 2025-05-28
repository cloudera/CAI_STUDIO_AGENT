#!/bin/bash

# Ensure proper node usage (just in case)
export NVM_DIR="$(pwd)/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm use 22

# run the upgrade
PYTHONUNBUFFERED=1 uv run studio/deployments/entry.py
