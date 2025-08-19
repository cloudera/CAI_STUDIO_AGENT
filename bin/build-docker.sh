docker build \
  --platform=linux/amd64 \
  --provenance=false \
  -t agent-studio \
  -f Dockerfile \
  .