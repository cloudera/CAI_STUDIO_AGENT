#!/bin/bash

# Configure Phoenix to store its data in APP_DATA_DIR instead of the default ~/.phoenix/
export PHOENIX_WORKING_DIR=${APP_DATA_DIR:-$(pwd)}/.phoenix

# Use internal port for Phoenix, proxy will forward to the external port
INTERNAL_PHOENIX_PORT=${INTERNAL_PHOENIX_PORT:-50053}
INTERNAL_PHOENIX_HOST=${INTERNAL_PHOENIX_HOST:-0.0.0.0}
PHOENIX_PORT=$INTERNAL_PHOENIX_PORT PHOENIX_HOST=$INTERNAL_PHOENIX_HOST phoenix serve &