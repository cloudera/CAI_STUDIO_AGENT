#!/bin/bash

set -eox pipefail

# Check to make sure both $1 and $22 are set.
if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Missing docker-sandbox project/repo, or version, or both."
  echo "Usage: $0 <version> <short_version>"
  echo "Example: ./bin/build-docker-dev.sh jev/agent-studio 1.0.0"
  exit 1
fi

RT_SHORT_VERSION=$2
ML_RUNTIME_EDITION="sandbox:$1"

docker build \
  --build-arg RT_SHORT_VERSION="$RT_SHORT_VERSION" \
  --build-arg ML_RUNTIME_EDITION="$ML_RUNTIME_EDITION" \
  --build-arg RT_BUILD_NUMBER="1" \
  --platform=linux/amd64 \
  --provenance=false \
  -t agent-studio:$2 \
  -f Dockerfile \
  .

docker tag agent-studio:$2 docker-sandbox.infra.cloudera.com/$1:$2
docker push docker-sandbox.infra.cloudera.com/$1:$2