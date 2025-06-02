import os
import sys
import json
import subprocess
import importlib.util
from pathlib import Path
from dotenv import load_dotenv
from typing import Dict, Callable

from engine.langgraph.tracing import instrument_langgraph_artifact


def is_langgraph_workflow(workflow_dir: str) -> bool:
    """
    Determines if a directory contains a valid langgraph.json config with defined graphs.
    """
    try:
        with open(os.path.join(workflow_dir, "langgraph.json"), "r") as f:
            config = json.load(f)
        return isinstance(config.get("graphs"), dict)
    except Exception:
        return False


def import_graph_callable(path: str) -> Callable:
    """
    Imports a graph object or callable from a path of the form '/abs/path/to/file.py:graph'.
    """
    file_path, attr = path.split(":")
    file_path = os.path.abspath(file_path)

    spec = importlib.util.spec_from_file_location("langgraph_module", file_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {file_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if not hasattr(module, attr):
        raise AttributeError(f"'{file_path}' does not contain attribute '{attr}'")

    return getattr(module, attr)


def load_langgraph_workflow(directory: str) -> Dict[str, Callable]:
    """
    Loads langgraph.json from the given workflow directory, installs dependencies,
    sets environment variables, and returns a dictionary of LangGraph graph objects.

    Args:
        directory (str): Path to unpacked workflow artifact directory.
        env_overrides (dict): Optional environment variable overrides.

    Returns:
        Dict[str, Callable]: Map of graph names to LangGraph graph objects.
    """
    directory = Path(directory)

    # 1. Load environment variables from .env
    dotenv_path = directory / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path, override=True)

    # 2. Install dependencies from pyproject.toml if present
    pyproject_path = directory / "pyproject.toml"
    if pyproject_path.exists():
        try:
            subprocess.run(
                ["pip", "install", "."], cwd=directory, stdout=sys.__stdout__, stderr=sys.__stderr__, text=True
            )
        except subprocess.CalledProcessError as e:
            print(f"[ERROR] Failed to install LangGraph artifact from {directory}: {e}")
            raise e

    # 3. Parse langgraph.json
    config_path = directory / "langgraph.json"
    if not config_path.exists():
        raise FileNotFoundError(f"No langgraph.json found at {config_path}")

    with open(config_path, "r") as f:
        config = json.load(f)

    graphs = config.get("graphs", {})
    if not isinstance(graphs, dict) or not graphs:
        raise ValueError(f"'graphs' section in {config_path} is missing or malformed.")

    # 4. Resolve and import each graph object
    resolved_graphs: Dict[str, Callable] = {}
    for graph_name, rel_path in graphs.items():
        try:
            file_part, attr = rel_path.split(":")
        except ValueError:
            raise ValueError(f"Graph path '{rel_path}' is invalid — must be of form 'path.py:symbol'")

        abs_file = (directory / file_part).resolve()
        full_path = f"{abs_file}:{attr}"
        resolved_graphs[graph_name] = import_graph_callable(full_path)

    # 5. instrument
    workflow_name = get_langgraph_workflow_name(directory)
    instrument_langgraph_artifact(workflow_name, resolved_graphs[workflow_name])

    return resolved_graphs


def get_langgraph_workflow_name(workflow_dir):
    langgraph_json_path = os.path.join(workflow_dir, "langgraph.json")
    with open(langgraph_json_path, "r") as f:
        config = json.load(f)

    graph_entries = config.get("graphs", {})
    if not isinstance(graph_entries, dict) or not graph_entries:
        raise ValueError(f"'graphs' section missing or malformed in {langgraph_json_path}")

    if len(graph_entries) == 1:
        return next(iter(graph_entries))  # return the only graph name
    else:
        raise ValueError(
            f"Multiple graphs found in {langgraph_json_path}. "
            f"Currently only one graph supported per langgraph.json file."
        )
