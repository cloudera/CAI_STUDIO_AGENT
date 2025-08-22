#!/bin/bash

#
# Code Formatting and Linting Script
#
# This script formats and lints both Python and JavaScript/TypeScript code in the project.
# 
# Usage:
#   ./bin/format.sh --check    Check if files adhere to proper formatting/linting (exit code 1 if issues found)
#   ./bin/format.sh --run      Apply formatting and linting fixes to files
#

# Check if an argument was provided
if [ $# -eq 0 ]; then
    echo "Error: No arguments provided."
    echo ""
    echo "Usage:"
    echo "  ./bin/format.sh --check    Check if files adhere to proper formatting/linting"
    echo "  ./bin/format.sh --run      Apply formatting and linting fixes to files"
    exit 1
fi

# Parse command line arguments
case "$1" in
    --check)
        echo "Running formatting and linting checks..."
        echo ""
        
        # Track if any checks fail
        EXIT_CODE=0
        
        # Check for unused imports with autoflake
        echo "Checking for unused imports..."
        if ! uv run -m autoflake --check --remove-all-unused-imports --ignore-init-module-imports --recursive studio/; then
            echo "❌ autoflake check failed - unused imports found"
            EXIT_CODE=1
        else
            echo "✅ autoflake check passed"
        fi
        echo ""
        
        # Check Python code formatting with ruff
        echo "Checking Python code formatting..."
        if ! uv run -m ruff format --check studio/; then
            echo "❌ ruff format check failed - formatting issues found"
            EXIT_CODE=1
        else
            echo "✅ ruff format check passed"
        fi
        echo ""
        
        # Check React app code formatting
        echo "Checking React app code formatting..."
        if ! npm run format-check; then
            echo "❌ npm format check failed - formatting issues found"
            EXIT_CODE=1
        else
            echo "✅ npm format check passed"
        fi
        echo ""
        
        # Check React app linting
        echo "Checking React app linting..."
        if ! npm run lint-check; then
            echo "❌ npm lint check failed - linting issues found"
            EXIT_CODE=1
        else
            echo "✅ npm lint check passed"
        fi
        echo ""

        # Check eslint rules
        echo "Checking eslint rules..."
        if ! npm run lint; then
            echo "❌ npm eslint check failed - eslint issues found"
            EXIT_CODE=1
        else
            echo "✅ npm eslint check passed"
        fi
        echo ""
        
        if [ $EXIT_CODE -eq 0 ]; then
            echo "🎉 All formatting and linting checks passed!"
        else
            echo "💥 Some formatting or linting checks failed. Run './bin/format.sh --run' to fix issues. For resolving eslint issues please do required code change"
        fi
        
        exit $EXIT_CODE
        ;;
        
    --run)
        echo "Applying formatting and linting fixes..."
        echo ""
        
        # Run autoflake to remove unused imports
        echo "Removing unused imports..."
        uv run -m autoflake --in-place --remove-all-unused-imports --ignore-init-module-imports --recursive studio/
        echo "✅ autoflake completed"
        echo ""
        
        # Run ruff to format the code
        echo "Formatting Python code..."
        uv run -m ruff format studio/
        echo "✅ ruff format completed"
        echo ""
        
        # Format React app code
        echo "Formatting React app code..."
        npm run format-fix
        echo "✅ npm format completed"
        echo ""
        
        # Lint React app code
        echo "Linting React app code..."
        npm run lint-fix
        echo "✅ npm lint completed"
        echo ""
        
        echo "🎉 All formatting and linting fixes applied!"
        ;;
        
    *)
        echo "Error: Invalid argument '$1'"
        echo ""
        echo "Usage:"
        echo "  ./bin/format.sh --check    Check if files adhere to proper formatting/linting"
        echo "  ./bin/format.sh --run      Apply formatting and linting fixes to files"
        exit 1
        ;;
esac