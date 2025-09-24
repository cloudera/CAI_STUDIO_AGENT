#!/bin/bash

# If APP_DATA_DIR is set to /home/cdsw/agent-studio, but if /home/cdsw/.phoenix/ exists,
# then default the working dir to use /home/cdsw/.phoenix instead of /home/cdsw/agent-studio/.phoenix
if [ "$APP_DATA_DIR" = "/home/cdsw/agent-studio" ] && [ -d "/home/cdsw/.phoenix" ]; then
    echo "Using /home/cdsw/.phoenix as the Phoenix working directory for legacy purposes..."
    export PHOENIX_WORKING_DIR=/home/cdsw/.phoenix
else
    export PHOENIX_WORKING_DIR=${APP_DATA_DIR:-$(pwd)}/.phoenix
fi

# Use internal port for Phoenix, proxy will forward to the external port
INTERNAL_PHOENIX_PORT=${INTERNAL_PHOENIX_PORT:-50053}
INTERNAL_PHOENIX_HOST=${INTERNAL_PHOENIX_HOST:-0.0.0.0}
PHOENIX_PORT=$INTERNAL_PHOENIX_PORT PHOENIX_HOST=$INTERNAL_PHOENIX_HOST phoenix serve &