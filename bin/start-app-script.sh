#!/bin/bash

# Ensure proper node usage
export NVM_DIR="$(pwd)/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm use 22

# Specify either "enabled" or "disabled" to determine the type
# of gRPC deployment. If develpoing in "enabled" mode, a gRPC server starts up
# within the pod. If in "disabled" mode, only the Node server
# spins up and the default gRPC server is used (usually the one deployed
# in the main application with IP injected via project envs).
export AGENT_STUDIO_GRPC_MODE=${AGENT_STUDIO_GRPC_MODE:-enabled}
echo "AGENT_STUDIO_GRPC_MODE: $AGENT_STUDIO_GRPC_MODE"

# We share the same dependencies from one app to another that are built in react. 
# Then, based on whether this is rendering the studio or rendering the workflow, we change the content of the page.
export AGENT_STUDIO_RENDER_MODE=${AGENT_STUDIO_RENDER_MODE:-studio}
echo "AGENT_STUDIO_RENDER_MODE: $AGENT_STUDIO_RENDER_MODE"

# Default value for deployment config (either "prod" build or "dev" build)
export AGENT_STUDIO_DEPLOYMENT_CONFIG=${AGENT_STUDIO_DEPLOYMENT_CONFIG:-prod}
echo "AGENT_STUDIO_DEPLOYMENT_CONFIG: $AGENT_STUDIO_DEPLOYMENT_CONFIG"

# Default ops platform. Currently, only phoenix is supported.
export AGENT_STUDIO_OPS_PROVIDER=phoenix

# Number of agent studio workflow runners to spin up for workflow testing purposes.
export AGENT_STUDIO_NUM_WORKFLOW_RUNNERS=${AGENT_STUDIO_NUM_WORKFLOW_RUNNERS:-5}

# Array to hold runner process IDs.
declare -a RUNNER_PIDS=()

# Function to clean up background processes
cleanup() {
  echo "Shutting down services..."
  pkill -f "bin/start-grpc-server.py"
  pkill -f "bin/start-ops-proxy.py"
  pkill -f "npm run dev"
  pkill -f "npm run start"

  # Kill our workflow runner processes.
  for pid in "${RUNNER_PIDS[@]}"; do
    if ps -p "$pid" > /dev/null; then
      echo "Killing workflow runner with PID: $pid"
      kill "$pid"
    fi
  done

  exit
}

# Trap SIGINT and SIGTERM signals to run the cleanup function
trap cleanup SIGINT SIGTERM

# Depending on the deployment or development mode, this may
# be injected and used from the value in the project environment.
echo "Current AGENT_STUDIO_SERVICE_IP: $AGENT_STUDIO_SERVICE_IP"

# Spin up workflow runners.
DEFAULT_WORKFLOW_RUNNER_STARTING_PORT=51000
for (( i=0; i<AGENT_STUDIO_NUM_WORKFLOW_RUNNERS; i++ )); do
  PORT_NUM=$((DEFAULT_WORKFLOW_RUNNER_STARTING_PORT + i))
  echo "Starting workflow runner on port $PORT_NUM..."
  
  # Launch the runner using the virtual environment's python
  studio/workflow_engine/.venv/bin/python -m uvicorn \
    studio.workflow_engine.src.engine.entry.fastapi:app \
    --port "$PORT_NUM" &
  
  # Save the process PID.
  RUNNER_PIDS+=($!)
done


# If we are starting up the main app (not the workflow app), then we also want to 
# start up the gRPC server that hosts all application logic.
if [ "$AGENT_STUDIO_RENDER_MODE" = "studio" ]; then
  echo "Starting up studio UI."

  if [ "$AGENT_STUDIO_GRPC_MODE" = "enabled" ]; then
    
    # Only start up the gRPC server if we are in full development mode.
    # gRPC server will spawn on 50051
    PORT=50051

    { # Try to start up the server

      if [ "$AGENT_STUDIO_DEPLOYMENT_CONFIG" = "dev" ]; then
        echo "Starting up the gRPC server with a debug port at 5678..."
        uv run -m debugpy --listen 5678 bin/start-grpc-server.py &
      else 
        echo "Starting up the gRPC server..."
        PYTHONUNBUFFERED=1 uv run bin/start-grpc-server.py & 
      fi
    } || {
      echo "gRPC server initialization script failed. Is there already a local server running in the pod?"
    }

    # Even though we've updated the project environment variables, we still need to update 
    # the local environment variables. This is because the FINE_TUNING_SERVICE_IP/PORT 
    # local env variables are still stale from the previous application dashboard environment,
    # if this application is restarting.
    export AGENT_STUDIO_SERVICE_IP=$CDSW_IP_ADDRESS
    export AGENT_STUDIO_SERVICE_PORT=$PORT

    echo New AGENT_STUDIO_SERVICE_IP: $AGENT_STUDIO_SERVICE_IP

  else
    echo "gRPC server disabled. Only spinning up Node server."
  fi
else
  echo "Starting up workflow app UI."
fi 

# If running in development mode, run the dev server so we get live
# updates. If in production mode, build the optimized server and serve it.
if [ "$AGENT_STUDIO_DEPLOYMENT_CONFIG" = "dev" ]; then
  echo "Starting up Next.js development server..."
  npm run dev
else 
  echo "Running production server..."
  npm run start
fi
