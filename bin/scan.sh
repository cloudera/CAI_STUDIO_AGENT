#!/bin/bash

docker run \
  -v /tmp:/tmp \
  -v /var/run/docker.sock:/var/run/docker.sock \
  docker-private.infra.cloudera.com/aquasec/scanner:2022.4.720 scan \
  -H https://aquasec.infra.cloudera.com \
  -U $SCAN_USER -P $SCAN_PASSWORD \
  --local agent-studio-dev:latest --htmlfile /tmp/agent-studio-scan.html