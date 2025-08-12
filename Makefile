# Cloudera AI Agent Studio - Makefile
# 
# This Makefile provides convenient commands for common development tasks.
# Usage: make <target>

# Variables
FULL_IMAGE_NAME ?= $(shell yq r $(PWD)/cloudera/docker_images.yaml docker_images.cloudera-ai-agent-studio)
VERSION ?= latest

# Dockerfile build arguments
RT_SHORT_VERSION ?= 1.0.0
RT_GIT_HASH ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
RT_GBN ?=

# Build arguments for Docker
BUILD_ARGS = --build-arg RT_SHORT_VERSION=$(RT_SHORT_VERSION) \
             --build-arg RT_GIT_HASH=$(RT_GIT_HASH) \
             --build-arg RT_GBN=$(RT_GBN)

# Phony targets (targets that don't create files)
.PHONY: build test test-studio test-workflow-engine test-all lint lint-check lint-fix clean

# ============================================================================
# Docker Commands
# ============================================================================

# Build and tag Docker image
docker-build:
	@echo " Building and tagging Docker image: $(FULL_IMAGE_NAME):$(VERSION)"
	@echo " Build arguments:"
	@echo "  RT_SHORT_VERSION=$(RT_SHORT_VERSION)"
	@echo "  RT_GIT_HASH=$(RT_GIT_HASH)"
	@echo "  RT_GBN=$(RT_GBN)"
	docker build $(BUILD_ARGS) -t $(FULL_IMAGE_NAME):$(VERSION) .

docker-push:
	@echo " Pushing Docker image: $(FULL_IMAGE_NAME):$(VERSION)"
	docker push $(FULL_IMAGE_NAME):$(VERSION)

# ============================================================================
# Testing Commands
# ============================================================================

# Run studio unit tests
test-studio:
	@echo "Running Agent Studio unit tests..."
	@chmod +x bin/run-tests.sh
	@./bin/run-tests.sh

# Run workflow engine tests
test-workflow-engine:
	@echo "Running Workflow Engine unit tests..."
	@chmod +x bin/run-tests-workflow-engine.sh
	@./bin/run-tests-workflow-engine.sh

# Run all tests
test: test-studio test-workflow-engine
	@echo "All tests completed"

# Alias for running all tests
test-all: test

# ============================================================================
# Code Quality Commands
# ============================================================================

# Check code formatting and linting
lint-check:
	@echo "Checking code formatting and linting..."
	@chmod +x bin/format.sh
	@./bin/format.sh --check

# Apply formatting and linting fixes
lint-fix:
	@echo "Applying code formatting and linting fixes..."
	@chmod +x bin/format.sh
	@./bin/format.sh --run

# Default lint command (applies fixes)
lint: lint-fix

# ============================================================================
# Cleanup Commands
# ============================================================================

# Clean up build artifacts and caches
clean:
	@echo "🧹 Cleaning up build artifacts and caches..."
	@echo "Removing Python cache files..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "Removing pytest cache..."
	@rm -rf .pytest_cache/ 2>/dev/null || true
	@echo "Removing coverage files..."
	@rm -rf htmlcov/ .coverage coverage.xml 2>/dev/null || true
	@echo "Removing Node.js artifacts..."
	@rm -rf node_modules/.cache 2>/dev/null || true
	@echo "Removing build directories..."
	@rm -rf build/ dist/ *.egg-info/ 2>/dev/null || true
	@echo "Removing ruff cache..."
	@rm -rf .ruff_cache/ 2>/dev/null || true
	@echo "Cleanup completed" 