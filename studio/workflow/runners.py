import requests
import os

from studio.consts import DEFAULT_AS_WORKFLOW_RUNNER_STARTING_PORT


def get_num_workfow_runners() -> int:
    return int(os.getenv("AGENT_STUDIO_NUM_WORKFLOW_RUNNERS", 0))


def get_workflow_runner_endpoints() -> list[str]:
    num_runners = get_num_workfow_runners()
    starting_port = DEFAULT_AS_WORKFLOW_RUNNER_STARTING_PORT
    runner_endpoints = []
    for i in range(num_runners):
        runner_endpoints.append(f"http://localhost:{int(starting_port) + i}")
    return runner_endpoints


def get_workflow_runners() -> list[dict]:
    endpoints = get_workflow_runner_endpoints()
    workflow_runners = []
    for endpoint in endpoints:
        try:
            busy = requests.get(url=f"{endpoint}/status").json().get("busy", True)
        except Exception as e:
            busy = True
        workflow_runners.append({"endpoint": endpoint, "busy": busy})
    return workflow_runners
