export APP_DIR="$(pwd)"
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