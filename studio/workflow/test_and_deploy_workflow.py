import json
import os
from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy.exc import SQLAlchemyError
import requests
from google.protobuf.json_format import MessageToDict
import json
from cmlapi import CMLServiceApi

from studio.cross_cutting.global_thread_pool import get_thread_pool
from studio.proto.utils import is_field_set
from studio.db.dao import AgentStudioDao
from studio.api import *
from studio.db import model as db_model
from studio.workflow.utils import (
    get_llm_config_for_workflow,
    is_workflow_ready,
)
from studio.workflow.runners import get_workflow_runners
from studio.deployments.entry import deploy_from_payload
from studio.deployments.types import *
from studio.deployments.package.collated_input import create_collated_input
from studio.deployments.validation import validate_deployment_payload

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

app_dir = os.getenv("APP_DIR")
if not app_dir:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))

import engine.types as input_types


def test_workflow(
    request: TestWorkflowRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> TestWorkflowResponse:
    """
    Test a workflow by creating agent instances, tasks, and a Crew AI execution.
    """
    try:
        # Currently generation configs are set per-workflow and as part of
        # the test/deploy request itself. TODO: pull out this generation config to be
        # per agent, and in workflow engine create a new CrewAILLM object for
        # each of the agents rather than sharing them.
        request_dict = MessageToDict(request, preserving_proto_field_name=True)
        generation_config = json.loads(request_dict["generation_config"])

        collated_input = None
        llm_config = {}
        with dao.get_session() as session:
            workflow: db_model.Workflow = session.query(db_model.Workflow).filter_by(id=request.workflow_id).one()

            if not is_workflow_ready(workflow.id, session):
                raise RuntimeError(f"Workflow '{workflow.name}' is not ready for testing!")

            collated_input: input_types.CollatedInput = create_collated_input(
                workflow, session, datetime.now(timezone.utc)
            )

            # Model config is already created as part of creating collated input.
            llm_config = get_llm_config_for_workflow(workflow, session, cml)

        # For now, force generation config for each of our LLM completions
        # based on the generation config in the request
        for lm in collated_input.language_models:
            lm.generation_config.update(generation_config)

        tool_user_params_kv = {
            tool_id: {k: v for k, v in user_param_kv.parameters.items()}
            for tool_id, user_param_kv in request.tool_user_parameters.items()
        }
        mcp_instance_env_vars_kv = {
            mcp_instance_id: {k: v for k, v in env_vars.env_vars.items()}
            for mcp_instance_id, env_vars in request.mcp_instance_env_vars.items()
        }
        events_trace_id = str(uuid4())

        workflow_runners = get_workflow_runners()
        available_workflow_runners = list(filter(lambda x: not x["busy"], workflow_runners))
        if not available_workflow_runners:
            raise RuntimeError("No workflow runners currently available to test workflow!")

        # Use the first available runner
        workflow_runner = available_workflow_runners[0]

        json_body = json.dumps(
            {
                "workflow_directory": os.path.abspath(os.curdir),  # for testing, everything is in studio-data/
                "workflow_name": f"Test Workflow - {collated_input.workflow.name}",
                "collated_input": collated_input.model_dump(),
                "tool_config": tool_user_params_kv,
                "mcp_config": mcp_instance_env_vars_kv,
                "llm_config": llm_config,
                "inputs": dict(request.inputs),
                "events_trace_id": events_trace_id,
            },
            default=str,
        )

        resp = requests.post(
            url=f"{workflow_runner['endpoint']}/kickoff",
            data=json_body,
            headers={"Content-Type": "application/json"},
        )

        return TestWorkflowResponse(
            message="",  # Return empty message since execution is async
            trace_id=events_trace_id,
        )

    except ValueError as e:
        raise RuntimeError(f"Validation error: {e}")
    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error while testing workflow: {e}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error while testing workflow: {e}")

    return


def deploy_workflow(request: DeployWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao) -> DeployWorkflowResponse:
    """
    Deploy a workflow.
    Creates a deployment of a existing workflow.
    If a deployment already exists, it will be redeployed with fresh changes in the workflow, maintaining the same endpoints & application URL.
    """

    # Deploy via a direct deployment payload if set.
    if is_field_set(request, "deployment_payload"):
        payload_dict = json.loads(request.deployment_payload)
        deployment_payload: DeploymentPayload = DeploymentPayload(**payload_dict)
        with dao.get_session() as session:
            validate_deployment_payload(deployment_payload, session, cml)
        get_thread_pool().submit(deploy_from_payload, deployment_payload)
        return DeployWorkflowResponse()

    try:
        request_dict = MessageToDict(request, preserving_proto_field_name=True)
        generation_config = json.loads(request_dict["generation_config"])

        llm_config = {}
        with dao.get_session() as session:
            workflow: db_model.Workflow = session.query(db_model.Workflow).filter_by(id=request.workflow_id).one()
            llm_config = get_llm_config_for_workflow(workflow, session, cml)

        tool_config = {
            tool_id: {k: v for k, v in user_param_kv.parameters.items()}
            for tool_id, user_param_kv in request.tool_user_parameters.items()
        }
        mcp_config = {
            mcp_instance_id: {k: v for k, v in env_vars.env_vars.items()}
            for mcp_instance_id, env_vars in request.mcp_instance_env_vars.items()
        }
        environment_overrides = dict(request.env_variable_overrides) if request.env_variable_overrides else {}

        deployment_config: DeploymentConfig = DeploymentConfig(
            generation_config=generation_config,
            tool_config=tool_config,
            mcp_config=mcp_config,
            llm_config=llm_config,
            environment=environment_overrides,
        )

        deployment_payload: DeploymentPayload = DeploymentPayload(
            workflow_target=WorkflowTargetRequest(type=WorkflowTargetType.WORKFLOW, workflow_id=request.workflow_id),
            deployment_target=DeploymentTargetRequest(
                type=DeploymentTargetType.WORKBENCH_MODEL, auto_redeploy_to_type=True
            ),
            deployment_config=deployment_config,
        )
        with dao.get_session() as session:
            validate_deployment_payload(deployment_payload, session, cml)
        get_thread_pool().submit(deploy_from_payload, deployment_payload)
        return DeployWorkflowResponse()

    except Exception as e:
        raise RuntimeError(f"Failed to deploy workflow: {str(e)}")
