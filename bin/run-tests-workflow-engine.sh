# Run pytest and generate coverage.

cd studio/workflow_engine/

PYTHONPATH=./src:$PYTHONPATH VIRTUAL_ENV=.venv uv run pytest -v \
  --cov=src/ \
  --cov-report=html \
  --cov-report=xml \
  --cov-report=term-missing \
  -s tests/


# Open up the coverage report.
# python -m http.server --directory htmlcov/