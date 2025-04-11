from studio.client import AgentStudioClient
from studio.api import *
from studio.sdk.utils import get_deployed_workflow_endpoint
from studio.sdk.ops import get_crew_events


from cmlapi import CMLServiceApi, default_client

import requests
import os
import json
import base64


def run_workflow(workflow_name: str = None, workflow_id: str = None, inputs: dict = None) -> str:
    """
    Run a workflow based on the workflow name, and return the ID of the workflow
    run which can then be used to query the status of that specific workflow run.

    Params:
    - workflow_name: the name of the workflow to run. It is currently assumed that every
    workflow has just one deployed workflow instance, so for now we extract the deployed
    workflow information from just the workflow name.
    - workflow_id: if you know the Agent Studio id of the workflow, you can call the
    workflow directly from the id
    - inputs: a dictionary of inputs to the workflow. For standard (sequential) workflows,
    this will be a key-value pair of all input fields created during task creation steps.
    If this is a conversational workflow, then there are exactly two input keys expected:
    "user_input" and "context". "user_input" is the most recent chat message and "context"
    is the entire context of the previous conversation, formatted however you want.

    Returns:
    - a workflow run ID that can be used with get_workflow_events() to track workflow run.
    """

    if not workflow_name and not workflow_id:
        raise ValueError("Either a 'workflow_name' or 'workflow_id' must be provided.")
    if workflow_name and workflow_id:
        raise ValueError("Only 'workflow_name' or 'workflow_id' can be used.")

    CDSW_APIV2_KEY = os.environ.get("CDSW_APIV2_KEY")

    # We assume this SDK is ran in the same project as Agent Studio, which means
    # our client can be automatically configured with env variables that represent
    # studio's gRPC IP/port.
    studio: AgentStudioClient = AgentStudioClient()

    # Create our default cml client
    cml: CMLServiceApi = default_client()

    resp: ListWorkflowsResponse = studio.stub.ListWorkflows(ListWorkflowsRequest())
    workflows: list[Workflow] = resp.workflows

    if workflow_name:
        workflows = list(filter(lambda x: x.name == workflow_name, workflows))
    else:
        workflows = list(filter(lambda x: x.workflow_id == workflow_id, workflows))

    if len(workflows) == 0:
        raise ValueError("Workflow not found.")
    if len(workflows) > 1:
        raise ValueError("Multiple workflows match this criterion.")

    workflow = workflows[0]

    # As an early fail-safe, make sure that all inputs necessary for this workflow
    # exist within the inputs dict field.
    task_ids: list[CrewAITaskMetadata] = workflow.crew_ai_workflow_metadata.task_id
    workflow_input_fields = []
    for task_id in task_ids:
        task: CrewAITaskMetadata = studio.stub.GetTask(GetTaskRequest(task_id=task_id)).task
        workflow_input_fields.extend(task.inputs)
    for input in inputs.keys():
        if input not in workflow_input_fields:
            raise ValueError(f"Input '{input}' is not one of the workflow's inputs: {workflow_input_fields}")
    for workflow_input_field in workflow_input_fields:
        if workflow_input_field not in inputs.keys():
            raise ValueError(f"Input field '{workflow_input_field}' is required but not provided in workflow inputs.")

    # Now that we've confirmed the workflow exists, we can see if there is a deployed workflow
    # that matches this workflow.
    resp: ListDeployedWorkflowsResponse = studio.stub.ListDeployedWorkflows(ListDeployedWorkflowsRequest())
    deployed_workflows: list[DeployedWorkflow] = resp.deployed_workflows
    try:
        deployed_workflow = next(dw for dw in deployed_workflows if dw.workflow_id == workflow.workflow_id)
    except:
        raise ValueError(f"Workflow '{workflow_name}' has not been deployed yet!")

    # Let's get the deployed workflow endpoint to send requests
    deployed_workflow_endpoint = get_deployed_workflow_endpoint(deployed_workflow)

    # Now we can send requests to this endpoint.
    out = requests.post(
        deployed_workflow_endpoint,
        json={
            "request": {
                "action_type": "kickoff",
                "kickoff_inputs": base64.b64encode(json.dumps(inputs).encode("utf-8")).decode("utf-8"),
            },
        },
        headers={"authorization": f"Bearer {CDSW_APIV2_KEY}", "Content-Type": "application/json"},
    )

    # Return the run ID.
    response = out.json()
    if not response["success"]:
        raise ValueError("Workflow was unable to kick off successfully.", response)

    return response["response"]["trace_id"]


def get_workflow_status(run_id: str) -> dict:
    """
    Get the events and status of the
    """

    try:
        crew_events = get_crew_events(run_id)
    except Exception as e:
        raise ValueError(f"There was an issue with trying to get events from workflow id '{run_id}'", str(e))

    # Determine if the crew has completed running.
    out_dict = {
        "complete": False,
        "output": None,
        "error": None,
    }
    if len(crew_events) > 0 and crew_events[-1]["type"] == "crew_kickoff_completed":
        out_dict["complete"] = True
        out_dict["output"] = crew_events[-1]["output"]
    if len(crew_events) > 0 and crew_events[-1]["type"] == "crew_kickoff_failed":
        out_dict["complete"] = True
        out_dict["error"] = crew_events[-1]["error"]

    return out_dict


def get_workflow_configuration(workflow_name: str) -> dict:
    """
    Get the workflow configuration of a given deployed workflow. This will
    request a deployed workflow to return all information about itself, including
    agents, tasks, tools, etc.
    """

    CDSW_APIV2_KEY = os.environ.get("CDSW_APIV2_KEY")

    # We assume this SDK is ran in the same project as Agent Studio, which means
    # our client can be automatically configured with env variables that represent
    # studio's gRPC IP/port.
    studio: AgentStudioClient = AgentStudioClient()

    # Create our default cml client
    cml: CMLServiceApi = default_client()

    resp: ListWorkflowsResponse = studio.stub.ListWorkflows(ListWorkflowsRequest())
    workflows: list[Workflow] = resp.workflows

    # Filter workflow by name
    try:
        workflow = next(w for w in workflows if w.name == workflow_name)
    except:
        raise ValueError(f"Workflow '{workflow_name}' not found.")

    # Now that we've confirmed the workflow exists, we can see if there is a deployed workflow
    # that matches this workflow.
    resp: ListDeployedWorkflowsResponse = studio.stub.ListDeployedWorkflows(ListDeployedWorkflowsRequest())
    deployed_workflows: list[DeployedWorkflow] = resp.deployed_workflows
    try:
        deployed_workflow = next(dw for dw in deployed_workflows if dw.workflow_id == workflow.workflow_id)
    except:
        raise ValueError(f"Workflow '{workflow_name}' has not been deployed yet!")

    # Let's get the deployed workflow endpoint to send requests
    deployed_workflow_endpoint = get_deployed_workflow_endpoint(deployed_workflow)

    # Now we can send requests to this endpoint.
    out = requests.post(
        deployed_workflow_endpoint,
        json={
            "request": {"action_type": "get-configuration"},
        },
        headers={"authorization": f"Bearer {CDSW_APIV2_KEY}", "Content-Type": "application/json"},
    )

    # Return the run ID.
    response = out.json()
    if not response["success"]:
        raise ValueError("Workflow was unable to kick off successfully.", response)

    return response["response"]["configuration"]
