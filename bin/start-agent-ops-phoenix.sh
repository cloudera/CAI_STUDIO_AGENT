#!/bin/bash

# Start up the Arize Phoenix observability platform on a specified port. 
# We do not inherently serve the ops platform on $CDSW_APP_PORT because this
# port MAY be proxied with authentication, which affects both our /v1/trace calls
# and the /graphql calls to this endpoint. Instead, we serve on a dedicated
# port in the container, and forward all traffic to CDSW_APP_PORT with
# python middleware.
AGENT_STUDIO_OPS_PORT=${AGENT_STUDIO_OPS_PORT:-50051}

PHOENIX_PORT=$AGENT_STUDIO_OPS_PORT PHOENIX_HOST=0.0.0.0 phoenix serve &