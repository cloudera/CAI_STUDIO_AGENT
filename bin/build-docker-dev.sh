docker build \
  --platform=linux/amd64 \
  --provenance=false \
  -t agent-studio-dev \
  -f Dockerfile.dev \
  .