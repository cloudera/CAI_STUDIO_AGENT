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


#!/bin/bash

# APP_DATA_DIR is necessary for our deployed workflow apps to specify where our phoenix ops server data will run.
export APP_DATA_DIR=/home/cdsw/agent-studio/studio-data/deployable_workflows/737e0e8e-1435-43b4-8de2-a888db50c4e2

# This is the ID of the deployed model. This can be extracted from the actual application.
export AGENT_STUDIO_DEPLOYED_MODEL_ID="28a079f6-dc17-42be-906f-39e9c023fc35" # populate this


export AGENT_STUDIO_RENDER_MODE=workflow
export AGENT_STUDIO_GRPC_MODE=disabled
export AGENT_STUDIO_DEPLOYMENT_CONFIG=dev
python startup_scripts/run-app.py