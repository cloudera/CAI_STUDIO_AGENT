#!/bin/bash

set -eox pipefail

# Check to make sure both $1 and $22 are set.
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
  echo "Missing docker-sandbox project/repo, or version, or maintenance version, or any of the above."
  echo "Usage: $0 <version> <short_version> <maintenance_version>"
  echo "Example: ./bin/build-docker-dev.sh jev/agent-studio 1.0.0 1"
  echo "The above will lead to the image being tagged as docker-sandbox.infra.cloudera.com/jev/agent-studio:1.0.0-b1, and"
  echo "the actual runtime version being set to 1.0.0.1, i.e. 1.0.0 with a maintenance version of 1."
  exit 1
fi

RT_SHORT_VERSION=$2
ML_RUNTIME_EDITION="sandbox:$1"
ML_MAINTENANCE_VERSION=$3

docker build \
  --build-arg RT_SHORT_VERSION="$RT_SHORT_VERSION" \
  --build-arg ML_RUNTIME_EDITION="$ML_RUNTIME_EDITION" \
  --build-arg RT_BUILD_NUMBER="$ML_MAINTENANCE_VERSION" \
  --platform=linux/amd64 \
  --provenance=false \
  -t agent-studio:$2-b$3 \
  -f Dockerfile \
  .

docker tag agent-studio:$2-b$3 docker-sandbox.infra.cloudera.com/$1:$2-b$3
docker push docker-sandbox.infra.cloudera.com/$1:$2-b$3