#!/bin/bash

# ===========================================================
# * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
#
#                        Agent Studio
#
# Main entrypoint for Agent Studio. Will spin up appropraite
# studio or workflow application with corresponding gRPC server,
# and ops server, all based on environment variables.
#
# * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
# ===========================================================


# Function to clean up background processes
cleanup() {
    # kill all processes whose parent is this process
    pkill -P $$
}

for sig in INT QUIT HUP TERM; do
  trap "
    cleanup
    trap - $sig EXIT
    kill -s $sig "'"$$"' "$sig"
done
trap cleanup EXIT

# The app directory containing source and frontend build artifacts
# is the main runtime directory of agent studio. Many components of
# agent studio (such as the gRPC service) begin by immediately changing
# the working directory to $APP_DATA_DIR. However, we ensure that python
# and frontend process are started from $APP_DIR to give us extra features,
# like file watching for FastAPI and Node builds.
cd $APP_DIR
export PYTHONPATH=$APP_DIR:$PYTHONPATH

# Load environment variables from .env files if they exist
if [ -f "$APP_DIR/.env" ]; then
    echo "Loading environment variables from .env"
    export $(grep -v '^#' "$APP_DIR/.env" | xargs)
fi

# Load local overrides if they exist
if [ -f "$APP_DIR/.env.local" ]; then
    echo "Loading environment variables from .env.local"
    export $(grep -v '^#' "$APP_DIR/.env.local" | xargs)
fi

# Specify either "enabled" or "disabled" to determine the type
# of gRPC deployment. If develpoing in "enabled" mode, a gRPC server starts up
# within the pod. If in "disabled" mode, only the Node server
# spins up and the default gRPC server is used (usually the one deployed
# in the main application with IP injected via project envs).
export AGENT_STUDIO_GRPC_MODE=${AGENT_STUDIO_GRPC_MODE:-enabled}
echo "AGENT_STUDIO_GRPC_MODE: $AGENT_STUDIO_GRPC_MODE"

# We share the same frontend build for deployed workflows as we do the main studio. 
# Then, based on whether this is rendering the studio or rendering the workflow, we change the content of the page.
export AGENT_STUDIO_RENDER_MODE=${AGENT_STUDIO_RENDER_MODE:-studio}
echo "AGENT_STUDIO_RENDER_MODE: $AGENT_STUDIO_RENDER_MODE"

# Default value for deployment config (either "prod" build or "dev" build)
export AGENT_STUDIO_DEPLOYMENT_CONFIG=${AGENT_STUDIO_DEPLOYMENT_CONFIG:-prod}
echo "AGENT_STUDIO_DEPLOYMENT_CONFIG: $AGENT_STUDIO_DEPLOYMENT_CONFIG"

# Default ops platform. Currently, only phoenix is supported.
export AGENT_STUDIO_OPS_PROVIDER=${AGENT_STUDIO_OPS_PROVIDER:-phoenix}
echo "AGENT_STUDIO_OPS_PROVIDER: $AGENT_STUDIO_OPS_PROVIDER"

# Number of agent studio workflow runners to spin up for workflow testing purposes.
export AGENT_STUDIO_NUM_WORKFLOW_RUNNERS=${AGENT_STUDIO_NUM_WORKFLOW_RUNNERS:-5}
echo "AGENT_STUDIO_NUM_WORKFLOW_RUNNERS: $AGENT_STUDIO_NUM_WORKFLOW_RUNNERS"

# Agent studio deployment mode. Currently either "amp" or "runtime" based on the installation form factor.
export AGENT_STUDIO_DEPLOY_MODE=${AGENT_STUDIO_DEPLOY_MODE:-amp}
echo "AGENT_STUDIO_DEPLOY_MODE: $AGENT_STUDIO_DEPLOY_MODE"

# Legacy workflow app flag. This is set to true if the application is a legacy workflow app that
# still communicates with the legacy Agent Studio - Agent Ops & Metrics application.
export AGENT_STUDIO_LEGACY_WORKFLOW_APP=${AGENT_STUDIO_LEGACY_WORKFLOW_APP:-false}
echo "AGENT_STUDIO_LEGACY_WORKFLOW_APP: $AGENT_STUDIO_LEGACY_WORKFLOW_APP"

# Disable CrewAI telemetry.
export CREWAI_DISABLE_TELEMETRY=${CREWAI_DISABLE_TELEMETRY:-true}
echo "CREWAI_DISABLE_TELEMETRY: $CREWAI_DISABLE_TELEMETRY"

# Default ports
export DEFAULT_AS_GRPC_PORT=${DEFAULT_AS_GRPC_PORT:-50051}
export DEFAULT_AS_PHOENIX_OPS_PLATFORM_PORT=${DEFAULT_AS_PHOENIX_OPS_PLATFORM_PORT:-50052}
export DEFAULT_WORKFLOW_RUNNER_STARTING_PORT=${DEFAULT_WORKFLOW_RUNNER_STARTING_PORT:-51000}
export DEFAULT_AS_DEBUG_PORT=${DEFAULT_AS_DEBUG_PORT:-5678}

# If we are running in studio mode, and if there is an Ops & Metrics application in the project,
# it's assumed that the main studio application should continue to use the old legacy workflow app.
if [[ "$AGENT_STUDIO_RENDER_MODE" = "studio" ]]; then
  echo "Checking for legacy ops server..."
  APP_RESPONSE=$(curl -s -X GET https://$CDSW_DOMAIN/api/v2/projects/$CDSW_PROJECT_ID/applications?page_size=500 -H "Authorization: Bearer $CDSW_APIV2_KEY")
  if [[ "$APP_RESPONSE" == *"Agent Studio - Agent Ops"* ]]; then
    echo "Legacy ops server detected. Setting AGENT_STUDIO_LEGACY_WORKFLOW_APP to true."
    export AGENT_STUDIO_LEGACY_WORKFLOW_APP=true
  fi
fi

# Default ops endpoint. This i`s specifically used in studio mode where the workflow engine
# sidecars can write to the local ops endpoint. For deployed workflows, start-app-script.sh
# is never ran and the ops endpoint is set purely by the deployed environemnt. Note: we only
# specify the environment variable for non-legacy apps, because legacy apps will explicitly
# search for the existing ops & metrics server if the environment variable is not set.
if [[ "$AGENT_STUDIO_LEGACY_WORKFLOW_APP" = "false" ]]; then
  export AGENT_STUDIO_OPS_ENDPOINT=http://127.0.0.1:$DEFAULT_AS_PHOENIX_OPS_PLATFORM_PORT
fi

# Export a variable indicating whether the parent workbench is TLS-enabled or not.
# Check if CDSW_PROJECT_URL uses HTTPS scheme (same logic as pre_install_check.py)
if [[ -n "$CDSW_PROJECT_URL" && "$CDSW_PROJECT_URL" == https://* ]]; then
  export AGENT_STUDIO_WORKBENCH_TLS_ENABLED=true
else
  export AGENT_STUDIO_WORKBENCH_TLS_ENABLED=false
fi

# Checking for uv installation.
echo "Confirming uv installation..."
if ! uv --version > /dev/null 2>&1; then
  echo "uv is not installed. Installing uv..."
  python startup_scripts/ensure-uv-package-manager.py
fi

# Set UV_LINK_MODE to copy to avoid hardlinking issues on filesystems with link limits
export UV_LINK_MODE=copy
echo "UV_LINK_MODE set to: $UV_LINK_MODE"


# Initialization logic for studio mode.
if [ "$AGENT_STUDIO_RENDER_MODE" = "studio" ]; then

  # Initialize the project defaults by copying $APP_DIR/studio-data into $APP_DATA_DIR/studio-data.
  # this only happens if APP_DIR is different from APP_DATA_DIR. Also check and make sure that
  # AGENT_STUDIO_RENDER_MODE is equal to studio.
  if [[ "$APP_DIR" != "$APP_DATA_DIR" ]]; then
      echo "Copying studio-data from $APP_DIR/studio-data to $APP_DATA_DIR/studio-data..."
      mkdir -p $APP_DATA_DIR/studio-data/
      cp -ar $APP_DIR/studio-data/* $APP_DATA_DIR/studio-data/
  fi

  # Initialize project defaults. These defaults ship with Agent Studio and the user
  # does not have the ability to override them.
  echo "Initializing project defaults..."
  cd $APP_DIR
  VIRTUAL_ENV=.venv uv run startup_scripts/uv_initialize-project-defaults.py

  # Install cmlapi in both the base and workflow engine venvs.
  echo "Installing cmlapi in both the base and workflow engine venvs..."
  cd $APP_DIR 
  VIRTUAL_ENV=.venv uv pip install https://${CDSW_DOMAIN}/api/v2/python.tar.gz --trusted-host ${CDSW_DOMAIN}
  cd $APP_DIR/studio/workflow_engine
  VIRTUAL_ENV=.venv uv pip install https://${CDSW_DOMAIN}/api/v2/python.tar.gz --trusted-host ${CDSW_DOMAIN}
  cd $APP_DIR

  # Run alembic upgrades once to ensure we are at head.
  echo "Upgrading DB..."
  VIRTUAL_ENV=.venv uv run python -m alembic upgrade head

fi

# Activate the node environment that currently ships with the app. In the future,
# Node will become optional (and only used for Node-based MCPs), at which point
# this logic will be updated to optionally install node within APP_DATA_DIR, which
# will be reflected into the project's filesystem.
export NVM_DIR="$APP_DIR/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm use 22

# Array to hold runner process IDs.
declare -a RUNNER_PIDS=()

# Spin up workflow runners.
cd $APP_DIR/studio/workflow_engine
if [ "$AGENT_STUDIO_RENDER_MODE" = "studio" ]; then
  for (( i=0; i<AGENT_STUDIO_NUM_WORKFLOW_RUNNERS; i++ )); do
    PORT_NUM=$((DEFAULT_WORKFLOW_RUNNER_STARTING_PORT + i))
    echo "Starting workflow runner on port $PORT_NUM..."
    
    # Launch the runner using the virtual environment's python
    VIRTUAL_ENV=.venv uv run python -m uvicorn \
     src.engine.entry.runner:app --port "$PORT_NUM" &
    
    # Save the process PID.
    RUNNER_PIDS+=($!)
  done
fi
cd $APP_DIR

# If we are starting up the main app (not the workflow app), then we also want to 
# start up the gRPC server that hosts all application logic.
if [ "$AGENT_STUDIO_RENDER_MODE" = "studio" ]; then
  echo "Starting up studio UI."

  if [ "$AGENT_STUDIO_GRPC_MODE" = "enabled" ]; then

    { # Try to start up the server
      if [ "$AGENT_STUDIO_DEPLOYMENT_CONFIG" = "dev" ]; then
        echo "Starting up the gRPC server with a debug port at $DEFAULT_AS_DEBUG_PORT..."
        VIRTUAL_ENV=.venv uv run -m debugpy --listen $DEFAULT_AS_DEBUG_PORT $APP_DIR/bin/start-grpc-server.py &
      else 
        echo "Starting up the gRPC server..."
        VIRTUAL_ENV=.venv PYTHONUNBUFFERED=1 uv run $APP_DIR/bin/start-grpc-server.py &
      fi
    } || {
      echo "gRPC server initialization script failed. Is there already a local server running in the pod?"
    }

    # Even though we've updated the project environment variables, we still need to update 
    # the local environment variables. This is because the FINE_TUNING_SERVICE_IP/PORT 
    # local env variables are still stale from the previous application dashboard environment,
    # if this application is restarting. As this is updated every time the pod starts, and
    # written to the project environment, other pods in the same namespace can access the
    # gRPC serveri directly via $AGENT_STUDIO_SERVICE_IP:$AGENT_STUDIO_SERVICE_PORT. 
    #
    # These parameters are also set in the project environment variables as part of start-grpc-server.py,
    # but we also set them here to ensure that the Node gRPC client can access the proper pod without
    # having to collect IPs from the CML project.
    export AGENT_STUDIO_SERVICE_IP=$CDSW_IP_ADDRESS
    export AGENT_STUDIO_SERVICE_PORT=$DEFAULT_AS_GRPC_PORT

    echo New AGENT_STUDIO_SERVICE_IP: $AGENT_STUDIO_SERVICE_IP

  else
    echo "gRPC server disabled. Only spinning up Node server."
  fi
else
  echo "Starting up workflow app UI."
fi 

# Start up the ops server. 
if [[ "$AGENT_STUDIO_OPS_PROVIDER" = "phoenix" && "$AGENT_STUDIO_LEGACY_WORKFLOW_APP" = "false" ]]; then
  echo "Starting up embedded Phoenix ops server..."
  VIRTUAL_ENV=.venv uv run python $APP_DIR/bin/start-agent-ops-server-embedded.py $DEFAULT_AS_PHOENIX_OPS_PLATFORM_PORT &
fi

# If running in development mode, run the dev server so we get live
# updates. If in production mode, build the optimized server and serve it.
if [ "$AGENT_STUDIO_DEPLOYMENT_CONFIG" = "dev" ]; then
  echo "Starting up Next.js development server..."
  npm run dev --prefix $APP_DIR
else 
  echo "Running production server..."
  npm run start --prefix $APP_DIR
fi

# If we hit this point in the script, then something went wrong with our
# npm server (this behavior has only been observed in dev mode). Please
# kill your application with ctrl+C and try again.
echo "================================================"
echo "Something went wrong with our npm server."
if [ "$AGENT_STUDIO_DEPLOYMENT_CONFIG" = "dev" ]; then
  echo "Please kill your application with ctrl+C and try again."
  echo "Waiting for kill signal..."
  wait
fi