import tarfile
from typing import Any

from engine.artifact import get_artifact_yaml_member


def get_artifact_agents(location: str) -> Any:
    with tarfile.open(location, "r:gz") as tar:
        get_artifact_yaml_member(tar, "agents.yaml")


def get_artifact_tools(location: str) -> Any:
    with tarfile.open(location, "r:gz") as tar:
        get_artifact_yaml_member(tar, "tools.yaml")


def get_artifact_models(location: str) -> Any:
    with tarfile.open(location, "r:gz") as tar:
        get_artifact_yaml_member(tar, "models.yaml")
