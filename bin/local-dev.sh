#!/bin/bash


# For local development, we need to make a local telemetry
# proxy server (due to CORS issues when iframing). Also for local
# development, we want to use `npm run dev`, whereas for production
# builds we want to fully build the application with `npm run build`
# and `npm run start`. For these reasons and other reasons, we are using
# an environment variable (which will become available in both the gRPC server
# and the node server) that specifies whether this is a development deployment
# or a production deployment.
#
# This can be completed by setting the env variable before running the app:
# > AGENT_STUDIO_DEPLOYMENT_CONFIG=dev python bin/run-app.py
#
# Alternatively, developers can run this file directly:
# > ./bin/local-dev.sh

export AGENT_STUDIO_RENDER_MODE=studio
export AGENT_STUDIO_GRPC_MODE=enabled
export AGENT_STUDIO_DEPLOYMENT_CONFIG=dev 
export AGENT_STUDIO_NUM_WORKFLOW_RUNNERS=1
python startup_scripts/run-app.py