#!/bin/bash

RT_SHORT_VERSION="0"
ML_RUNTIME_EDITION="dev - $USER"

docker build \
  --build-arg RT_SHORT_VERSION="$RT_SHORT_VERSION" \
  --build-arg ML_RUNTIME_EDITION="$ML_RUNTIME_EDITION" \
  --platform=linux/amd64 \
  --provenance=false \
  -t agent-studio \
  -f Dockerfile \
  .