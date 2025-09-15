import os
import subprocess
import json
from datetime import datetime
from engine.tool.events import (
    ToolTestStartedEvent,
    ToolTestFailedEvent,
    ToolVenvCreationStartedEvent,
    ToolVenvCreationFinishedEvent,
    ToolVenvCreationFailedEvent,
    ToolOutputEvent,
    process_tool_event,
)
from engine.ops import get_ops_endpoint
import requests
import shutil
import traceback
from engine.crewai.tools import create_virtual_env, get_venv_tool_output_key
import ast

# Utility to post tool events


def post_tool_event(trace_id, event):
    event_dict = {
        "timestamp": str(event.timestamp),
        "type": str(event.type),
    }
    event_dict.update(process_tool_event(event))
    requests.post(
        url=f"{get_ops_endpoint()}/events",
        headers={
            "Authorization": f"Bearer {os.getenv('CDSW_APIV2_KEY')}",
        },
        json={"trace_id": trace_id, "event": event_dict},
    )


def ensure_venv_and_requirements(
    tool_dir: str, requirements_file: str = "requirements.txt", trace_id=None, tool_instance_id=None, silent=False
):
    venv_dir = os.path.join(tool_dir, ".venv")
    uv_bin = shutil.which("uv")
    if not uv_bin:
        error_msg = "uv is not installed or not found in PATH."
        if trace_id and tool_instance_id:
            post_tool_event(
                trace_id,
                ToolVenvCreationFailedEvent(
                    timestamp=datetime.utcnow(),
                    tool_instance_id=tool_instance_id,
                    tool_dir=tool_dir,
                    requirements_file=requirements_file,
                    error=error_msg,
                    pip_output="",
                    pip_error="",
                ),
            )
        raise RuntimeError(error_msg)
    # Post event for venv creation/requirements install
    if trace_id and tool_instance_id and not silent:
        post_tool_event(
            trace_id,
            ToolVenvCreationStartedEvent(
                timestamp=datetime.utcnow(),
                tool_instance_id=tool_instance_id,
                tool_dir=tool_dir,
                requirements_file=requirements_file,
            ),
        )
    # Create virtual environment if it doesn't exist (using the same logic as crewai/tools.py)
    create_virtual_env(tool_dir, "uv")

    requirements_path = os.path.join(tool_dir, requirements_file)
    pip_output = ""
    pip_error = ""
    pip_install_command = [uv_bin, "pip", "install", "-r", requirements_path]
    try:
        if os.path.exists(requirements_path):
            proc = subprocess.run(
                pip_install_command,
                capture_output=True,
                text=True,
                env={"VIRTUAL_ENV": venv_dir},
            )
            pip_output = proc.stdout
            pip_error = proc.stderr
            # Always post finished event
            if trace_id and tool_instance_id and not silent:
                post_tool_event(
                    trace_id,
                    ToolVenvCreationFinishedEvent(
                        timestamp=datetime.utcnow(),
                        tool_instance_id=tool_instance_id,
                        tool_dir=tool_dir,
                        requirements_file=requirements_file,
                        pip_output=pip_output,
                        pip_error=pip_error,
                    ),
                )
            if proc.returncode != 0:
                if trace_id and tool_instance_id:
                    post_tool_event(
                        trace_id,
                        ToolVenvCreationFailedEvent(
                            timestamp=datetime.utcnow(),
                            tool_instance_id=tool_instance_id,
                            tool_dir=tool_dir,
                            requirements_file=requirements_file,
                            error=f"pip install failed: {pip_error}",
                            pip_output=pip_output,
                            pip_error=pip_error,
                        ),
                    )
                raise RuntimeError(f"pip install failed: {pip_error}")
        else:
            # No requirements.txt, still post finished event
            if trace_id and tool_instance_id and not silent:
                post_tool_event(
                    trace_id,
                    ToolVenvCreationFinishedEvent(
                        timestamp=datetime.utcnow(),
                        tool_instance_id=tool_instance_id,
                        tool_dir=tool_dir,
                        requirements_file=requirements_file,
                        pip_output="",
                        pip_error="",
                    ),
                )
    except subprocess.CalledProcessError as e:
        error_msg = f"Error installing venv requirements for tool directory {tool_dir}:\n"
        error_msg += f"Command: {' '.join(pip_install_command)}\n"
        error_msg += f"Return code: {e.returncode}\n"
        if e.stdout:
            error_msg += f"STDOUT:\n{e.stdout}\n"
        if e.stderr:
            error_msg += f"STDERR:\n{e.stderr}\n"
        print(error_msg)
        if trace_id and tool_instance_id:
            post_tool_event(
                trace_id,
                ToolVenvCreationFailedEvent(
                    timestamp=datetime.utcnow(),
                    tool_instance_id=tool_instance_id,
                    tool_dir=tool_dir,
                    requirements_file=requirements_file,
                    error=error_msg,
                    pip_output=e.stdout or "",
                    pip_error=e.stderr or "",
                ),
            )
        raise RuntimeError(f"COULD NOT INSTALL REQUIREMENTS: {error_msg}")


def validate_tool_code(tool_py_path):
    """
    Validates that the tool code at tool_py_path contains:
    - UserParameters class (Pydantic)
    - ToolParameters class (Pydantic)
    - run_tool(config, args)
    - Proper __main__ block with argparse and validation
    Returns None if valid, or a string error message if invalid.
    """
    with open(tool_py_path, "r") as f:
        code = f.read()
    try:
        tree = ast.parse(code)
    except Exception as e:
        return f"Python syntax error: {e}"

    # Check for UserParameters and ToolParameters classes
    class_names = {node.name for node in tree.body if isinstance(node, ast.ClassDef)}
    missing = []
    if "UserParameters" not in class_names:
        missing.append("UserParameters class")
    if "ToolParameters" not in class_names:
        missing.append("ToolParameters class")

    # Check for run_tool function
    has_run_tool = any(isinstance(node, ast.FunctionDef) and node.name == "run_tool" for node in tree.body)
    if not has_run_tool:
        missing.append("run_tool function")

    # Check for __main__ block
    has_main = False
    for node in tree.body:
        if isinstance(node, ast.If):
            # if __name__ == "__main__":
            if (
                isinstance(node.test, ast.Compare)
                and isinstance(node.test.left, ast.Name)
                and node.test.left.id == "__name__"
                and any(isinstance(op, ast.Eq) for op in node.test.ops)
                and any(isinstance(c, ast.Constant) and c.value == "__main__" for c in node.test.comparators)
            ):
                has_main = True
    if not has_main:
        missing.append("if __name__ == '__main__' block")

    if missing:
        return f"Tool code is missing required elements: {', '.join(missing)}"

    return None  # Valid


def run_tool_test(tool_instance_id, tool_dir, user_params, tool_params, trace_id):
    # Validate required arguments
    missing_args = []
    if not tool_instance_id:
        missing_args.append("tool_instance_id")
    if not tool_dir:
        missing_args.append("tool_dir")
    if not trace_id:
        missing_args.append("trace_id")
    if missing_args:
        error_msg = f"Missing required argument(s): {', '.join(missing_args)}"
        post_tool_event(
            trace_id or "unknown",
            ToolTestFailedEvent(
                timestamp=datetime.utcnow(),
                tool_instance_id=tool_instance_id or "unknown",
                error=error_msg,
            ),
        )
        return {"status": "Tool test failed", "trace_id": trace_id, "error": error_msg}

    post_tool_event(
        trace_id,
        ToolTestStartedEvent(
            timestamp=datetime.utcnow(),
            tool_instance_id=tool_instance_id,
            params={"user_params": user_params, "tool_params": tool_params},
        ),
    )
    try:
        # Ensure venv and requirements (now posts ToolVenvCreationStartedEvent and ToolVenvCreationFinishedEvent)
        try:
            ensure_venv_and_requirements(tool_dir, trace_id=trace_id, tool_instance_id=tool_instance_id, silent=True)
        except Exception as venv_err:
            tb = traceback.format_exc()
            post_tool_event(
                trace_id,
                ToolOutputEvent(
                    timestamp=datetime.utcnow(),
                    tool_instance_id=tool_instance_id,
                    error=f"venv/requirements error: {str(venv_err)}\n{tb}",
                    success=False,
                ),
            )
            return {
                "status": "Tool test failed",
                "trace_id": trace_id,
                "error": f"venv/requirements error: {str(venv_err)}\n{tb}",
            }

        venv_python = os.path.join(tool_dir, ".venv", "bin", "python")
        tool_py = os.path.join(tool_dir, "tool.py")

        if not os.path.exists(tool_py):
            error_msg = f"tool.py not found in {tool_dir}"
            post_tool_event(
                trace_id,
                ToolOutputEvent(
                    timestamp=datetime.utcnow(),
                    tool_instance_id=tool_instance_id,
                    error=error_msg,
                    success=False,
                ),
            )
            return {"status": "Tool test failed", "trace_id": trace_id, "error": error_msg}

        # --- TOOL CODE VALIDATION ---
        validation_error = validate_tool_code(tool_py)
        if validation_error:
            error_msg = (
                f"Tool code validation failed: {validation_error}\n"
                "Your tool must define UserParameters and ToolParameters (Pydantic), "
                "a run_tool(config, args) function, and a main block that parses --user-params and --tool-params, "
                "validates them, and calls run_tool."
            )
            post_tool_event(
                trace_id,
                ToolOutputEvent(
                    timestamp=datetime.utcnow(),
                    tool_instance_id=tool_instance_id,
                    error=error_msg,
                    success=False,
                ),
            )
            return {"status": "Tool test failed", "trace_id": trace_id, "error": error_msg}
        # --- END TOOL CODE VALIDATION ---

        user_params_str = json.dumps(user_params)
        tool_params_str = json.dumps(tool_params)
        cmd = [venv_python, tool_py, "--user-params", user_params_str, "--tool-params", tool_params_str]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        except Exception as sub_err:
            tb = traceback.format_exc()
            post_tool_event(
                trace_id,
                ToolOutputEvent(
                    timestamp=datetime.utcnow(),
                    tool_instance_id=tool_instance_id,
                    error=f"subprocess error: {str(sub_err)}\n{tb}\nIf you see ModuleNotFoundError, check if the package is in requirements.txt and that pip install succeeded.",
                    success=False,
                ),
            )
            return {
                "status": "Tool test failed",
                "trace_id": trace_id,
                "error": f"subprocess error: {str(sub_err)}\n{tb}\nIf you see ModuleNotFoundError, check if the package is in requirements.txt and that pip install succeeded.",
            }
        output = proc.stdout.strip()
        error = proc.stderr.strip()
        if proc.returncode == 0:
            try:
                with open(tool_py, "r") as f:
                    tool_code = f.read()
                output_key = get_venv_tool_output_key(tool_code)

                if output_key and output_key in output:
                    output = output.split(output_key, 1)[-1].strip()
            except Exception as e:
                pass

            post_tool_event(
                trace_id,
                ToolOutputEvent(
                    timestamp=datetime.utcnow(),
                    tool_instance_id=tool_instance_id,
                    output=output,
                    error=error,
                    success=True,
                ),
            )
            return {"status": "Tool test completed", "trace_id": trace_id, "output": output}
        else:
            error_msg = error or output or f"Tool exited with code {proc.returncode}"
            post_tool_event(
                trace_id,
                ToolOutputEvent(
                    timestamp=datetime.utcnow(),
                    tool_instance_id=tool_instance_id,
                    error=error_msg,
                    success=False,
                ),
            )
            return {"status": "Tool test failed", "trace_id": trace_id, "error": error_msg}
    except Exception as e:
        tb = traceback.format_exc()
        post_tool_event(
            trace_id,
            ToolOutputEvent(
                timestamp=datetime.utcnow(),
                tool_instance_id=tool_instance_id,
                error=f"unexpected error: {str(e)}\n{tb}",
                success=False,
            ),
        )
        return {"status": "Tool test failed", "trace_id": trace_id, "error": f"unexpected error: {str(e)}\n{tb}"}
