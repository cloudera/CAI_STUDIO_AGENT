#!/bin/bash


cd $AGENT_STUDIO_LANGGRAPH_APPLICATION_DIRECTORY
rm -rf .venv/
uv venv 
VIRTUAL_ENV=.venv uv run langgraph dev --port $CDSW_APP_PORT
# VIRTUAL_ENV=.venv uv run langgraph-ui-proxy.py

