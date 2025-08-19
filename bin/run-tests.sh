export APP_DIR="$(pwd)"
export AGENT_STUDIO_DEPLOY_MODE=amp 

# Run pytest and generate coverage.
uv run pytest -v \
  --cov=studio \
  --cov-report=html \
  --cov-report=xml \
  --cov-report=term-missing \
  --ignore=studio/proto/ \
  -s tests/


# Open up the coverage report.
# python -m http.server --directory htmlcov/