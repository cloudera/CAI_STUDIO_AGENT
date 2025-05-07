# Currenly this build file is used just to set up basic packages for workflow deployment as a Workbench Model.
# Tool specific packages are installed in the workflow deployment script during runtime.

# NOTE: running this cdsw-build.sh script implies that the calling workbench has the
# model root dir feature of Workbench Models enabled. There is a separate build 
# script for workbenches that do not have this feature enabled.

# Install UV for venv tool usage
python -m pip install uv

# Install engine code
pip install .
