"""
Python Code Execution Tool - CONTAINER-OPTIMIZED VERSION

This tool allows secure execution of Python code within a session-scoped working directory.
It accepts Python code that can run in headless environment, creates files in the session directory, installs required dependencies,
executes the code, and captures the output to a specified file.

Capabilities:
- The generated python code can be used to execute in headless environment.
- The generated python code can be used to analyse data, select and filter data from big files.
- The generated python code can be used to generate reports, charts, and other visualizations.
- And there are many use cases for which this tool can be used.

Security Features:
- Restricts file operations to the SESSION_DIRECTORY working directory.
- Only allows Python code execution that can run in headless environment.
"""

import os
import sys
import subprocess
import json
import argparse
import venv
import shutil
import ast
import re
import signal
import tempfile
from typing import Optional, Any, List, Tuple, Union
from pydantic import BaseModel, Field, validator

# Try to import psutil for resource monitoring, graceful fallback if not available
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    print("Warning: psutil not available, resource monitoring will be limited")


class UserParameters(BaseModel):
    """
    Parameters placeholder for compatibility.

    NOTE: This tool no longer requires a workspace directory to be passed in user parameters.
    The session working directory is discovered from the environment variable SESSION_DIRECTORY.
    Provide an empty JSON object {} for user parameters.
    """
    pass


def get_session_directory() -> str:
    """
    Resolve and validate the session working directory from the environment variable SESSION_DIRECTORY.
    Ensures the directory exists and is an absolute path. All artifacts and files will be created here.
    """
    session_directory = os.getenv('SESSION_DIRECTORY')
    if not session_directory:
        raise ValueError("Environment variable SESSION_DIRECTORY is not set")
    resolved_path = os.path.abspath(session_directory)
    # Create directory if it doesn't exist; ensure we operate only within this directory
    os.makedirs(resolved_path, exist_ok=True)
    if not os.path.exists(resolved_path):
        raise ValueError(f"Session directory does not exist: {resolved_path}")
    if not os.path.isdir(resolved_path):
        raise ValueError(f"Session path is not a directory: {resolved_path}")
    return resolved_path


class ToolParameters(BaseModel):
    """
    Arguments for the Python code execution tool.
    """
    step_description: str = Field(
        description="Detailed explanation of the objective we are trying to achieve with this code execution step."
    )
    
    step_output: str = Field(
        description="Detailed description of what output results are expected from this code execution."
    )
    
    code: str = Field(
        description="The Python code to be executed for autonomous agents in headless environments. "
                   "Best practices: (1) Use headless backends for visualizations (e.g., matplotlib with 'Agg' backend), "
                   "(2) Include proper error handling and timeouts for network operations, "
                   "(3) Avoid interactive prompts or user input functions, "
                   "(4) Use absolute file paths and validate file permissions, "
                   "(5) Never generate synthetic/fake data unless explicitly requested by the user, "
                   "(6) Include logging and progress indicators for long-running operations, "
                   "(7) Handle resource constraints gracefully with memory management, "
                   "(8) Use environment variables for configuration instead of hardcoded values. "
                   "Only Python code is supported."
    )
    
    code_file_name: str = Field(
        description="The name of the file where the Python code will be stored (e.g., 'script.py'). "
                    "Must have a .py extension."
    )
    
    requirements: Optional[List[str]] = Field(
        default=None,
        description="This is mandatory if you are using python packages in your code. List of Python package requirements to install before executing the code. "
                    "Example: ['pandas==1.5.0', 'numpy', 'requests>=2.25.0']"
    )
    
    output_file_name: str = Field(
        description="The name of the file where the execution output will be stored (e.g., 'output.txt')"
    )
    
    artifact_files: Optional[Union[str, List[dict]]] = Field(
        default=None,
        description="JSON string containing list of expected output/artifact files that this code will produce. "
                    "These are files like CSV data files, PNG/JPG graphs, TXT reports, JSON results, etc. "
                    "Format: [{\"file_name\": \"weather_chart.png\", \"description\": \"Generated weather visualization\"}, "
                    "{\"file_name\": \"data_summary.csv\", \"description\": \"Processed dataset with statistics\"}]"
    )
    
    cleanup_after_execution: bool = Field(
        default=False,
        description="Whether to clean up the virtual environment and temporary files after execution. "
                    "Always recommended to set to False to keep files for debugging."
    )
    
    @validator('code_file_name')
    def validate_code_file_name(cls, v):
        """Validate that the code file name has a .py extension."""
        if not v.endswith('.py'):
            raise ValueError("Code file name must have a .py extension")
        
        # Validate filename doesn't contain path traversal attempts
        if '..' in v or '/' in v or '\\' in v:
            raise ValueError("Code file name cannot contain path separators or '..' sequences")
        
        return v
    
    @validator('output_file_name')
    def validate_output_file_name(cls, v):
        """Validate that the output file name is safe."""
        # Validate filename doesn't contain path traversal attempts
        if '..' in v or '/' in v or '\\' in v:
            raise ValueError("Output file name cannot contain path separators or '..' sequences")
        
        return v
    
    @validator('artifact_files')
    def validate_artifact_files(cls, v):
        """Validate artifact files JSON format (accept str or list and normalize to JSON string)."""
        if v is None:
            return v

        try:
            if isinstance(v, list):
                artifact_list = v
                v_out = json.dumps(v)
            elif isinstance(v, str):
                artifact_list = json.loads(v)
                v_out = v
            else:
                raise ValueError("Artifact files must be valid JSON")

            if not isinstance(artifact_list, list):
                raise ValueError("Artifact files must be a JSON list")

            for item in artifact_list:
                if not isinstance(item, dict) or 'file_name' not in item or 'description' not in item:
                    raise ValueError("Each artifact must have 'file_name' and 'description' fields")

                # Validate filename safety
                file_name = item['file_name']
                if '..' in file_name or '/' in file_name or '\\' in file_name:
                    raise ValueError(f"Artifact file name '{file_name}' cannot contain path separators")

            return v_out
        except (json.JSONDecodeError, TypeError, ValueError):
            raise ValueError("Artifact files must be valid JSON")
    
    @validator('code')
    def validate_code(cls, v):
        """
        Basic validation of Python code.
        
        Note: This performs minimal validation since detailed syntax checking
        and LLM-specific preprocessing happens later in preprocess_llm_code().
        """
        if not v or not isinstance(v, str):
            raise ValueError("Code must be a non-empty string")
        
        # Basic check to ensure it's likely Python code
        # This is not foolproof but helps catch obvious mistakes
        if len(v.strip()) == 0:
            raise ValueError("Code cannot be empty or whitespace only")
        
        return v


def create_virtual_environment(workspace_path: str) -> Tuple[bool, str, str]:
    """
    OPTIMIZED: Create or reuse a virtual environment in the workspace directory.
    
    Args:
        workspace_path: Path to the workspace directory
        
    Returns:
        Tuple of (success: bool, venv_path: str, message: str)
    """
    venv_path = os.path.join(workspace_path, ".venv")
    
    try:
        # Check if virtual environment already exists and is functional
        if os.path.exists(venv_path):
            venv_python = get_venv_python_executable(venv_path)
            if os.path.exists(venv_python):
                # Test the existing virtual environment
                test_result = subprocess.run([
                    venv_python, "-c", "import sys; print('OK')"
                ], capture_output=True, text=True, timeout=10)
                
                if test_result.returncode == 0:
                    return True, venv_path, f"Reusing existing virtual environment at {venv_path}"
        
        # Remove existing venv if it exists but is broken
        if os.path.exists(venv_path):
            shutil.rmtree(venv_path)
        
        # Create new virtual environment preferring uv, fallback to stdlib venv
        uv_bin = shutil.which("uv")
        if uv_bin:
            result = subprocess.run([uv_bin, "venv", venv_path], capture_output=True, text=True, timeout=60)
            if result.returncode != 0:
                return False, "", f"uv venv failed: {result.stderr or result.stdout}"
        else:
            # Fallback: stdlib venv
            venv.create(venv_path, with_pip=True, clear=True, system_site_packages=False)
        
        # Verify the virtual environment was created properly
        venv_python = get_venv_python_executable(venv_path)
        if not os.path.exists(venv_python):
            return False, "", f"Virtual environment Python executable not found after creation: {venv_python}"
        
        # Test the virtual environment by running a simple command
        test_result = subprocess.run([
            venv_python, "-c", "import sys; print(sys.prefix)"
        ], capture_output=True, text=True, timeout=30)
        
        if test_result.returncode != 0:
            return False, "", f"Virtual environment test failed: {test_result.stderr}"
        
        return True, venv_path, f"Virtual environment created and verified at {venv_path}"
        
    except Exception as e:
        return False, "", f"Error creating virtual environment: {str(e)}"


def get_venv_python_executable(venv_path: str) -> str:
    """
    Get the Python executable path for the virtual environment.
    
    Args:
        venv_path: Path to the virtual environment
        
    Returns:
        Path to the Python executable in the virtual environment
    """
    if os.name == 'nt':  # Windows
        return os.path.join(venv_path, "Scripts", "python.exe")
    else:  # Unix/Linux/macOS
        return os.path.join(venv_path, "bin", "python")


def cleanup_workspace(workspace_path: str, cleanup_venv: bool = True, cleanup_temp_files: bool = True) -> Tuple[bool, str]:
    """
    Clean up workspace files and virtual environment after execution.
    
    Args:
        workspace_path: Path to the workspace directory
        cleanup_venv: Whether to remove the virtual environment
        cleanup_temp_files: Whether to remove temporary files (requirements.txt)
        
    Returns:
        Tuple of (success: bool, message: str)
    """
    cleanup_actions = []
    errors = []
    
    try:
        if cleanup_venv:
            venv_path = os.path.join(workspace_path, ".venv")
            if os.path.exists(venv_path):
                shutil.rmtree(venv_path)
                cleanup_actions.append("virtual environment")
        
        if cleanup_temp_files:
            temp_files = ["requirements.txt"]
            for temp_file in temp_files:
                temp_file_path = os.path.join(workspace_path, temp_file)
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                    cleanup_actions.append(f"temporary file {temp_file}")
        
        if cleanup_actions:
            return True, f"Successfully cleaned up: {', '.join(cleanup_actions)}"
        else:
            return True, "No cleanup needed"
            
    except Exception as e:
        return False, f"Cleanup failed: {str(e)}"


def install_requirements(workspace_path: str, requirements: List[str]) -> Tuple[bool, str, str]:
    """
    OPTIMIZED: Install Python requirements only if not already installed.
    
    Args:
        workspace_path: Path to the workspace directory
        requirements: List of package requirements
        
    Returns:
        Tuple of (success: bool, venv_path: str, message: str)
    """
    if not requirements:
        return True, "", "No requirements to install"
    
    try:
        venv_path = os.path.join(workspace_path, ".venv")
        venv_python = get_venv_python_executable(venv_path)
        
        if not os.path.exists(venv_python):
            return False, venv_path, f"Virtual environment Python executable not found at {venv_python}"
        
        uv_bin = shutil.which("uv")
        if uv_bin:
            # Write a temporary requirements.txt representing exact specs
            req_path = os.path.join(workspace_path, "requirements.txt")
            try:
                with open(req_path, "w") as f:
                    f.write("\n".join(requirements) + "\n")
            except Exception as e:
                return False, venv_path, f"Failed to write requirements file: {str(e)}"

            env = os.environ.copy()
            # Ensure persistent shared cache for speed across sessions
            env.setdefault("UV_CACHE_DIR", "/home/cdsw/.cache/uv")
            env["VIRTUAL_ENV"] = venv_path
            result = subprocess.run(
                [uv_bin, "pip", "install", "--quiet", "-r", req_path],
                capture_output=True,
                text=True,
                cwd=workspace_path,
                timeout=300,
                env=env,
            )
            if result.returncode == 0:
                return True, venv_path, "Installed requirements with uv"
            return False, venv_path, f"Failed to install packages with uv: {result.stderr or result.stdout}"
        else:
            # Fallback to pip install directly into the venv
            result = subprocess.run(
                [venv_python, "-m", "pip", "install", "--quiet", "--no-user"] + requirements,
                capture_output=True,
                text=True,
                cwd=workspace_path,
                timeout=300,
            )
            if result.returncode == 0:
                return True, venv_path, "Installed requirements with pip"
            return False, venv_path, f"Failed to install packages: {result.stderr or result.stdout}"
            
    except Exception as e:
        return False, "", f"Error installing requirements: {str(e)}"


def setup_execution_environment(workspace_path: str) -> bool:
    """
    Set up the execution environment for robust code execution.
    """
    try:
        # Create necessary directories
        temp_dir = os.path.join(workspace_path, 'temp')
        output_dir = os.path.join(workspace_path, 'output')
        
        for directory in [temp_dir, output_dir]:
            os.makedirs(directory, exist_ok=True)
            # Test write permissions
            test_file = os.path.join(directory, 'test_write.tmp')
            with open(test_file, 'w') as f:
                f.write('test')
            os.remove(test_file)
        
        # Set up environment variables for the execution
        os.environ.update({
            'TMPDIR': temp_dir,
            'TEMP': temp_dir,
            'TMP': temp_dir,
            # Persistent cache for uv to accelerate repeated installs across sessions
            'UV_CACHE_DIR': os.environ.get('UV_CACHE_DIR', '/home/cdsw/.cache/uv'),
        })
        
        return True
    except Exception as e:
        print(f"Warning: Could not fully set up execution environment: {e}")
        return False


def execute_python_code(workspace_path: str, code_file_path: str, output_file_path: str, venv_path: str = None) -> Tuple[bool, str, str]:
    """
    Execute Python code and capture output.
    
    Args:
        workspace_path: Path to the workspace directory
        code_file_path: Path to the Python code file
        output_file_path: Path where to save the execution output
        venv_path: Optional path to virtual environment (if None, uses system Python)
        
    Returns:
        Tuple of (success: bool, stdout: str, stderr: str)
    """
    try:
        # Set up execution environment
        setup_execution_environment(workspace_path)
        
        # Determine which Python executable to use
        if venv_path and os.path.exists(venv_path):
            python_executable = get_venv_python_executable(venv_path)
            if not os.path.exists(python_executable):
                python_executable = sys.executable  # Fallback to system Python
        else:
            python_executable = sys.executable
        
        # Execute the Python code with enhanced error handling
        env = os.environ.copy()
        env.update({
            'PYTHONPATH': workspace_path,  # Ensure workspace is in Python path
            'PYTHONUNBUFFERED': '1',      # Real-time output
        })
        
        result = subprocess.run([
            python_executable, code_file_path
        ], capture_output=True, text=True, cwd=workspace_path, 
           timeout=300, env=env)  # 5 minute timeout with enhanced environment
        
        # Combine stdout and stderr for complete output
        full_output = ""
        if result.stdout:
            full_output += f"STDOUT:\n{result.stdout}\n"
        if result.stderr:
            full_output += f"STDERR:\n{result.stderr}\n"
        
        full_output += f"\nEXIT CODE: {result.returncode}\n"
        
        # Save output to file
        with open(output_file_path, 'w') as f:
            f.write(full_output)
        
        success = result.returncode == 0
        return success, result.stdout, result.stderr
        
    except subprocess.TimeoutExpired:
        error_msg = "Code execution timed out after 5 minutes"
        with open(output_file_path, 'w') as f:
            f.write(f"ERROR: {error_msg}\n")
        return False, "", error_msg
    except Exception as e:
        error_msg = f"Error executing code: {str(e)}"
        with open(output_file_path, 'w') as f:
            f.write(f"ERROR: {error_msg}\n")
        return False, "", error_msg


def append_to_execution_log(workspace_path: str, step_description: str, step_output: str, 
                           final_status: str, artifacts: List[dict], iterations_attempted: int = 1) -> bool:
    """
    Append execution results to execution.json file in the workspace.
    
    Args:
        workspace_path: Path to the workspace directory
        step_description: Detailed explanation of the task performed
        step_output: Description of the final results
        final_status: "success" or "failed"
        artifacts: List of artifact dictionaries with file_name, absolute_path, description
        iterations_attempted: Number of iterations performed (default 1)
        
    Returns:
        bool: True if successfully logged, False otherwise
    """
    try:
        execution_file_path = os.path.join(workspace_path, "execution.json")
        
        # Create the execution entry
        execution_entry = {
            "step_description": step_description,
            "step_output": step_output,
            "iterations_attempted": str(iterations_attempted),
            "final_status": final_status,
            "artifacts": artifacts
        }
        
        # Read existing execution log or create new list
        execution_log = []
        if os.path.exists(execution_file_path):
            try:
                with open(execution_file_path, 'r') as f:
                    execution_log = json.load(f)
                    if not isinstance(execution_log, list):
                        execution_log = []
            except (json.JSONDecodeError, Exception):
                execution_log = []
        
        # Append new entry
        execution_log.append(execution_entry)
        
        # Write back to file
        with open(execution_file_path, 'w') as f:
            json.dump(execution_log, f, indent=2)
        
        return True
        
    except Exception as e:
        print(f"Warning: Failed to append to execution log: {str(e)}")
        return False


def prepare_container_environment() -> None:
    """
    Prepare the container environment for robust execution.
    Fix common environment variable conflicts and set safe defaults.
    """
    # Remove problematic environment variables
    problematic_vars = [
        'MPLBACKEND', 'JUPYTER_CONFIG_PATH', 'IPYTHON_DIR', 'JUPYTER_RUNTIME_DIR',
        'PYTHONSTARTUP', 'PYTHONPATH'  # Avoid startup script conflicts
    ]
    
    for var in problematic_vars:
        os.environ.pop(var, None)
    
    # Set container-friendly defaults for all environments
    os.environ.update({
        # Display/GUI settings
        'MPLBACKEND': 'Agg',
        'DISPLAY': ':99',
        'QT_QPA_PLATFORM': 'offscreen',
        
        # Python execution settings
        'PYTHONUNBUFFERED': '1',  # Real-time output
        'PYTHONDONTWRITEBYTECODE': '1',  # No .pyc files
        'PYTHONIOENCODING': 'utf-8',  # Consistent encoding
        
        # Networking/SSL settings
        'REQUESTS_CA_BUNDLE': '',  # Use system certs
        'CURL_CA_BUNDLE': '',
        
        # Locale settings
        'LC_ALL': 'C.UTF-8',
        'LANG': 'C.UTF-8'
    })


def inject_robust_patterns(code: str) -> str:
    """
    Inject robust coding patterns for container/production environments.
    """
    # Check what patterns the code needs
    needs_networking = any(keyword in code.lower() for keyword in [
        'requests.', 'urllib.', 'http', 'api', 'download', 'fetch'
    ])
    
    needs_file_ops = any(keyword in code.lower() for keyword in [
        'open(', 'pd.read_', 'json.load', 'csv.reader', 'with open'
    ])
    
    needs_gui_libs = any(keyword in code.lower() for keyword in [
        'matplotlib', 'plotly', 'seaborn', 'tkinter', '.plot(', '.show()'
    ])
    
    # Don't inject if already has robust patterns
    has_robust_patterns = any(pattern in code for pattern in [
        'try:', 'except:', 'timeout=', 'retries', 'fallback'
    ])
    
    if (needs_networking or needs_file_ops or needs_gui_libs) and not has_robust_patterns:
        # Inject comprehensive robust patterns
        robust_setup = '''import os
import sys
import warnings
import tempfile
import time
from pathlib import Path
warnings.filterwarnings('ignore')

# Generic container environment setup
os.environ.update({
    'PYTHONUNBUFFERED': '1',
    'PYTHONIOENCODING': 'utf-8',
    'LC_ALL': 'C.UTF-8'
})

# Robust file operations helper
def safe_file_operation(operation, *args, **kwargs):
    """Wrapper for safe file operations with fallbacks."""
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            return operation(*args, **kwargs)
        except (PermissionError, FileNotFoundError, OSError) as e:
            if attempt == max_attempts - 1:
                print(f"File operation failed after {max_attempts} attempts: {e}")
                # Fallback to temp directory
                temp_dir = tempfile.gettempdir()
                print(f"Trying fallback to temp directory: {temp_dir}")
                if hasattr(operation, '__name__') and 'open' in operation.__name__.lower():
                    temp_file = os.path.join(temp_dir, f"fallback_{int(time.time())}.txt")
                    return open(temp_file, 'w')
                raise e
            time.sleep(0.5 * (attempt + 1))  # Progressive delay

# Robust network operations helper
def safe_network_operation(operation, *args, **kwargs):
    """Wrapper for network operations with retries and timeouts."""
    kwargs.setdefault('timeout', 30)  # Default 30s timeout
    max_attempts = 3
    
    for attempt in range(max_attempts):
        try:
            return operation(*args, **kwargs)
        except Exception as e:
            if attempt == max_attempts - 1:
                print(f"Network operation failed after {max_attempts} attempts: {e}")
                raise e
            wait_time = 2 ** attempt  # Exponential backoff
            print(f"Network attempt {attempt + 1} failed, retrying in {wait_time}s...")
            time.sleep(wait_time)

'''
        return robust_setup + code
    
    return code


def add_resource_management(code: str) -> str:
    """
    Add resource management and monitoring for production environments.
    """
    # Check if code might be resource-intensive
    needs_resource_mgmt = any(keyword in code.lower() for keyword in [
        'pd.read_', 'large', 'big', 'memory', 'loop', 'for i in range',
        'while', 'download', 'process', 'parallel'
    ])
    
    if needs_resource_mgmt and 'gc.collect' not in code:
        resource_mgmt = '''
# Resource management for container environments
import gc
import signal
try:
    import psutil
except ImportError:
    # Fallback if psutil not available
    class psutil:
        class Process:
            def memory_info(self):
                return type('obj', (object,), {'rss': 0})()

def monitor_resources():
    """Monitor system resources and warn if getting high."""
    try:
        if 'psutil' in globals():
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            if memory_mb > 500:  # 500MB threshold
                print(f"High memory usage: {memory_mb:.1f}MB")
                gc.collect()  # Force garbage collection
            return memory_mb
        else:
            # Fallback: just force garbage collection
            gc.collect()
            return 0
    except Exception:
        gc.collect()
        return 0

def timeout_handler(signum, frame):
    """Handle timeouts gracefully."""
    raise TimeoutError("Operation timed out")

# Set up timeout protection (5 minutes max)
signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(300)  # 5 minutes

'''
        # Add resource monitoring calls after imports
        lines = code.split('\n')
        import_end = 0
        for i, line in enumerate(lines):
            if line.strip() and not (line.strip().startswith('#') or 
                                   line.strip().startswith('import') or 
                                   line.strip().startswith('from')):
                import_end = i
                break
        
        lines.insert(import_end, '\n# Monitor resources\nmonitor_resources()\n')
        code = resource_mgmt + '\n'.join(lines)
    
    return code


def preprocess_llm_code(code: str) -> Tuple[bool, str, str]:
    """
    Preprocess code from LLM to handle various formats and edge cases.
    
    This function makes the tool compatible with different LLMs (GPT-4o, Claude, Gemini, etc.)
    by handling common variations in how they generate Python code.
    
    Args:
        code: Raw code string from LLM
        
    Returns:
        Tuple of (success: bool, processed_code: str, message: str)
    """
    try:
        # Step 1: Prepare container environment
        prepare_container_environment()
        
        # Step 2: Basic cleaning - remove common LLM artifacts
        processed_code = code.strip()
        
        # Remove markdown code blocks if present (common in LLM outputs)
        if processed_code.startswith('```python'):
            processed_code = processed_code[9:].strip()
        elif processed_code.startswith('```'):
            processed_code = processed_code[3:].strip()
            
        if processed_code.endswith('```'):
            processed_code = processed_code[:-3].strip()
        
        # Step 2: Handle different LLM-specific patterns
        
        # Some LLMs add extra escaping - try to detect and handle
        # Only process if it looks like over-escaped content
        if '\\\\n' in processed_code or '\\"' in processed_code:
            # This might be double-escaped, try to fix
            test_code = processed_code.replace('\\\\n', '\\n').replace('\\"', '"')
            try:
                ast.parse(test_code)
                processed_code = test_code  # Use the fixed version
            except SyntaxError:
                pass  # Keep original if fixing breaks it
        
        # Step 3: Inject robust coding patterns
        processed_code = inject_robust_patterns(processed_code)
        
        # Step 4: Add resource management for production environments
        processed_code = add_resource_management(processed_code)
        
        # Step 5: Handle potential encoding issues from different LLMs
        # Some LLMs might output with unusual whitespace or line endings
        processed_code = re.sub(r'\r\n', '\n', processed_code)  # Normalize line endings
        processed_code = re.sub(r'\r', '\n', processed_code)    # Handle old Mac format
        
        # Step 6: Validate syntax
        try:
            ast.parse(processed_code)
            return True, processed_code, "Code preprocessing successful with production-ready enhancements"
        except SyntaxError as e:
            # If syntax is invalid, try one more fix for common LLM issues
            
            # Try to fix common indentation issues
            lines = processed_code.split('\n')
            fixed_lines = []
            for line in lines:
                # Convert tabs to spaces for consistency
                fixed_line = line.expandtabs(4)
                fixed_lines.append(fixed_line)
            
            fixed_code = '\n'.join(fixed_lines)
            
            try:
                ast.parse(fixed_code)
                return True, fixed_code, "Code preprocessing successful (fixed indentation)"
            except SyntaxError:
                # If still invalid, return original with error info
                return False, processed_code, f"Syntax validation failed: {str(e)}"
    
    except Exception as e:
        return False, code, f"Code preprocessing error: {str(e)}"


def run_tool(config: UserParameters, args: ToolParameters) -> Any:
    """
    OPTIMIZED Main tool code logic for Python code execution.
    
    This function:
    1. Creates the code file in the workspace directory
    2. Reuses virtual environment when possible
    3. Installs only missing Python packages
    4. Executes the Python code
    5. Tracks execution status and logs to execution.json
    6. Returns execution results with artifact tracking
    """
    
    # Use the session directory as the working directory for all operations
    workspace_path = get_session_directory()
    
    # Construct file paths within the workspace
    code_file_path = os.path.join(workspace_path, args.code_file_name)
    output_file_path = os.path.join(workspace_path, args.output_file_name)
    
    # Initialize tracking variables
    artifacts = []
    final_status = "failed"  # CHANGED: Now uses "success" or "failed"
    step_output_details = ""
    
    try:
        # Preprocess the code to handle different LLM formats and validate syntax
        preprocess_success, processed_code, preprocess_message = preprocess_llm_code(args.code)
        
        if not preprocess_success:
            step_output_details = f"Code preprocessing failed: {preprocess_message}. Could not validate or clean the provided Python code."
            
            # COMMENTED OUT: Log the failure
            # append_to_execution_log(
            #     workspace_path=workspace_path,
            #     step_description=args.step_description,
            #     step_output=step_output_details,
            #     final_status=final_status,
            #     artifacts=artifacts,
            #     iterations_attempted=1
            # )
            
            return {
                "status": "failed",
                "error_message": f"Code preprocessing failed: {preprocess_message}",
                "workspace_path": workspace_path,
                "code_file_path": code_file_path,
                "output_file_path": output_file_path,
                "preprocessing_message": preprocess_message
            }
        
        # Write the preprocessed Python code to the file
        with open(code_file_path, 'w') as f:
            f.write(processed_code)
        
        # Add code file to artifacts
        artifacts.append({
            "file_name": args.code_file_name,
            "absolute_path": os.path.abspath(code_file_path),
            "description": f"Python code file containing the executed script. Code was preprocessed successfully and saved for execution."
        })
        
        result_object = {
            "status": "success",
            "workspace_path": workspace_path,
            "code_file_path": code_file_path,
            "output_file_path": output_file_path,
            "code_file_created": True,
            "requirements_installed": False,
            "code_executed": False,
            "execution_successful": False,
            "stdout": "",
            "stderr": "",
            "error_message": None,
            "virtual_environment_path": None,
            "isolated_execution": False,
            "cleanup_performed": False,
            "cleanup_message": None,
            "preprocessing_successful": preprocess_success,
            "preprocessing_message": preprocess_message
        }
        
        venv_path = None
        
        # Always create a virtual environment for isolation
        venv_success, venv_path, venv_message = create_virtual_environment(workspace_path)
        
        if not venv_success:
            step_output_details = f"Failed to create isolated execution environment: {venv_message}. Could not ensure secure code execution."
            
            # COMMENTED OUT: Log the failure
            # append_to_execution_log(
            #     workspace_path=workspace_path,
            #     step_description=args.step_description,
            #     step_output=step_output_details,
            #     final_status=final_status,
            #     artifacts=artifacts,
            #     iterations_attempted=1
            # )
            
            result_object["status"] = "failed"
            result_object["error_message"] = f"Virtual environment creation failed: {venv_message}"
            return result_object
        
        result_object["virtual_environment_path"] = venv_path
        result_object["isolated_execution"] = True
        
        # Install requirements if provided
        if args.requirements:
            req_success, _, req_message = install_requirements(workspace_path, args.requirements)
            result_object["requirements_installed"] = req_success
            result_object["requirements_message"] = req_message
            
            if not req_success:
                step_output_details = f"Failed to install required Python packages: {req_message}. Dependencies: {', '.join(args.requirements)}"
                
                # COMMENTED OUT: Log the failure
                # append_to_execution_log(
                #     workspace_path=workspace_path,
                #     step_description=args.step_description,
                #     step_output=step_output_details,
                #     final_status=final_status,
                #     artifacts=artifacts,
                #     iterations_attempted=1
                # )
                
                result_object["status"] = "failed"
                result_object["error_message"] = f"Requirements installation failed: {req_message}"
                return result_object
        else:
            result_object["requirements_installed"] = True
            result_object["requirements_message"] = "No requirements specified"
        
        # Execute the Python code
        exec_success, stdout, stderr = execute_python_code(workspace_path, code_file_path, output_file_path, venv_path)
        
        result_object["code_executed"] = True
        result_object["execution_successful"] = exec_success
        result_object["stdout"] = stdout
        result_object["stderr"] = stderr
        
        # Add output file to artifacts (created regardless of success/failure)
        artifacts.append({
            "file_name": args.output_file_name,
            "absolute_path": os.path.abspath(output_file_path),
            "description": f"Execution output file containing stdout, stderr, and exit code from the Python script execution. {'Contains successful execution results.' if exec_success else 'Contains error details and debugging information.'}"
        })
        
        # NEW: Add user-specified artifact files
        if args.artifact_files:
            try:
                artifact_list = json.loads(args.artifact_files)
                for artifact_spec in artifact_list:
                    artifact_file_path = os.path.join(workspace_path, artifact_spec['file_name'])
                    artifacts.append({
                        "file_name": artifact_spec['file_name'],
                        "absolute_path": os.path.abspath(artifact_file_path),
                        "description": artifact_spec['description']
                    })
            except Exception as e:
                print(f"Warning: Failed to process artifact files: {e}")
        
        if exec_success:
            final_status = "success"  # CHANGED: Now uses "success"
            step_output_details = f"Python code executed successfully in isolated environment. {args.step_output} Output captured to {args.output_file_name}. Virtual environment path: {venv_path}"
            result_object["message"] = f"Code executed successfully. Output saved to {args.output_file_name}"
        else:
            step_output_details = f"Python code execution failed. Error: {stderr}. Expected output: {args.step_output}. Error details saved to {args.output_file_name}."
            result_object["status"] = "failed"
            result_object["error_message"] = f"Code execution failed: {stderr}"
            result_object["message"] = f"Code execution failed. Error details saved to {args.output_file_name}"
        
        # Perform cleanup if requested
        if args.cleanup_after_execution:
            cleanup_success, cleanup_message = cleanup_workspace(workspace_path, cleanup_venv=True, cleanup_temp_files=True)
            result_object["cleanup_performed"] = cleanup_success
            result_object["cleanup_message"] = cleanup_message
            
            if cleanup_success:
                result_object["message"] += f" | Cleanup: {cleanup_message}"
                if final_status == "success":  # CHANGED: Updated status check
                    step_output_details += f" Cleanup completed: {cleanup_message}"
            else:
                # Don't fail the entire operation just because cleanup failed
                result_object["message"] += f" | Cleanup warning: {cleanup_message}"
                step_output_details += f" Cleanup warning: {cleanup_message}"
        else:
            result_object["cleanup_performed"] = False
            result_object["cleanup_message"] = "Cleanup skipped (cleanup_after_execution=False)"
        
        # Log the execution results only if successful
        if final_status == "success":
            append_to_execution_log(
                workspace_path=workspace_path,
                step_description=args.step_description,
                step_output=step_output_details,
                final_status=final_status,
                artifacts=artifacts,
                iterations_attempted=1
            )
        
        return result_object
        
    except Exception as e:
        step_output_details = f"Unexpected tool execution failure: {str(e)}. Expected output: {args.step_output}"
        
        # COMMENTED OUT: Log the failure
        # append_to_execution_log(
        #     workspace_path=workspace_path,
        #     step_description=args.step_description,
        #     step_output=step_output_details,
        #     final_status=final_status,
        #     artifacts=artifacts,
        #     iterations_attempted=1
        # )
        
        return {
            "status": "failed",
            "error_message": f"Tool execution failed: {str(e)}",
            "workspace_path": workspace_path,
            "code_file_path": code_file_path if 'code_file_path' in locals() else None,
            "output_file_path": output_file_path if 'output_file_path' in locals() else None
        }


OUTPUT_KEY = "tool_output"
"""
When an agent calls a tool, technically the tool's entire stdout can be passed back to the agent.
However, if an OUTPUT_KEY is present in a tool's main file, only stdout content *after* this key is
passed to the agent. This allows us to return structured output to the agent while still retaining
the entire stdout stream from a tool! By default, this feature is enabled, and anything returned
from the run_tool() method above will be the structured output of the tool.
"""


if __name__ == "__main__":
    """
    Tool entrypoint for Python code execution.
    
    This tool accepts:
    - user-params: Deprecated. Ignored. Provide '{}' or omit. Session directory is taken from SESSION_DIRECTORY env var.
    - tool-params: JSON containing step_description, step_output, code, code_file_name, requirements (optional), output_file_name, artifact_files (optional), cleanup_after_execution (optional)
    """
    
    parser = argparse.ArgumentParser(description="Python Code Execution Tool - OPTIMIZED (SESSION_DIRECTORY scoped)")
    parser.add_argument("--user-params", required=False, default="{}", help="Deprecated. Ignored. Provide '{}' or omit. Session directory is taken from SESSION_DIRECTORY env var.")
    parser.add_argument("--tool-params", required=True, help="Tool arguments (code, filenames, requirements, artifacts)")
    args = parser.parse_args()
    
    try:
        # Parse JSON into dictionaries
        user_dict = json.loads(args.user_params)
        tool_dict = json.loads(args.tool_params)
        
        # Validate dictionaries against Pydantic models
        config = UserParameters(**user_dict)
        params = ToolParameters(**tool_dict)
        
        # Run the tool
        output = run_tool(config, params)
        print(OUTPUT_KEY, output)
        
    except json.JSONDecodeError as e:
        error_output = {
            "status": "failed",
            "error_message": f"Invalid JSON input: {str(e)}"
        }
        print(OUTPUT_KEY, error_output)
    except Exception as e:
        error_output = {
            "status": "failed", 
            "error_message": f"Tool initialization failed: {str(e)}"
        }
        print(OUTPUT_KEY, error_output)