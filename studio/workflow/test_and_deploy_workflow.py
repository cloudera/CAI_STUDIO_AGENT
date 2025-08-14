import json
import os
import shutil
from uuid import uuid4
from datetime import datetime, timezone
import cmlapi
from typing import List, Optional
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
import studio.cross_cutting.utils as cc_utils
import studio.consts as consts
from studio.workflow.utils import (
    get_llm_config_for_workflow,
    is_workflow_ready,
)
from studio.workflow.runners import get_workflow_runners
from studio.deployments.entry import deploy_from_payload
from studio.deployments.types import *
from studio.deployments.package.collated_input import create_collated_input
from studio.deployments.applications import (
    get_application_for_deployed_workflow,
    cleanup_deployed_workflow_application,
    get_application_name_for_deployed_workflow,
)
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
    """Deploy a workflow."""

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


def undeploy_workflow(
    request: UndeployWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> UndeployWorkflowResponse:
    """
    Undeploy a workflow from the CML model and studio application.
    """
    try:
        if not request.deployed_workflow_id:
            raise ValueError("Deployed Workflow ID is required.")
        with dao.get_session() as session:
            deployed_workflow_instance = (
                session.query(db_model.DeployedWorkflowInstance)
                .filter_by(id=request.deployed_workflow_id)
                .one_or_none()
            )
            if not deployed_workflow_instance:
                raise ValueError(f"Deployed Workflow with ID '{request.deployed_workflow_id}' not found.")
            deployed_workflow_instance_name = deployed_workflow_instance.name
            deployment_metadata = json.loads(deployed_workflow_instance.deployment_metadata or "{}")
            cml_model_id = (
                deployed_workflow_instance.cml_deployed_model_id or deployment_metadata.get("cml_model_id") or None
            )
            if cml_model_id:
                cc_utils.stop_all_cml_model_deployments(cml, cml_model_id)
                cc_utils.delete_cml_model(cml, cml_model_id)

            # There may be cases where the deployed workflow application has already been
            # tampered with. We don't want to fail undeploying the workflow at this point,
            # even if the application went missing.
            try:
                application: Optional[cmlapi.Application] = get_application_for_deployed_workflow(
                    deployed_workflow_instance, cml
                )
                if application:  # Only try to cleanup if application exists
                    cleanup_deployed_workflow_application(cml, application)
            except Exception as e:
                print(f"Could not delete deployed workflow application: {e}")

            session.delete(deployed_workflow_instance)
            session.commit()
            deployable_workflow_dir = os.path.join(consts.DEPLOYABLE_WORKFLOWS_LOCATION, deployed_workflow_instance.id)
            if os.path.exists(deployable_workflow_dir):
                shutil.rmtree(deployable_workflow_dir)
        return UndeployWorkflowResponse()
    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error occured while undeploying workflow: {str(e)}")
    except ValueError as e:
        raise RuntimeError(f"Validation error: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error occurred while undeploying workflow: {str(e)}")


def list_deployed_workflows(
    request: ListDeployedWorkflowsRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> ListDeployedWorkflowsResponse:
    try:
        # Get all models first for deep links
        project_num, project_id = cc_utils.get_cml_project_number_and_id()
        cdsw_ds_api_url = os.environ.get("CDSW_DS_API_URL").replace("/ds", "")
        cdsw_api_key = os.environ.get("CDSW_API_KEY")

        # Get list of all models
        list_url = f"{cdsw_ds_api_url}/models/list-models"
        headers = {"Content-Type": "application/json"}
        list_resp = requests.post(
            list_url,
            headers=headers,
            json={"latestModelBuild": True, "projectId": int(project_num), "latestModelDeployment": True},
            auth=(cdsw_api_key, ""),
        )
        if list_resp.status_code != 200:
            raise RuntimeError(f"Failed to list models: {list_resp.text}")

        model_list = list_resp.json()
        model_urls = {m["crn"].split("/")[-1]: m["htmlUrl"] for m in model_list if "crn" in m and "htmlUrl" in m}

        # Get list of all applications using CDSW_PROJECT_URL
        project_url = os.getenv("CDSW_PROJECT_URL")
        if not project_url:
            raise RuntimeError("CDSW_PROJECT_URL environment variable not found")

        apps_url = f"{project_url}/applications?page_size=1000"
        apps_resp = requests.get(
            apps_url,
            headers=headers,
            auth=(cdsw_api_key, ""),
        )
        if apps_resp.status_code != 200:
            raise RuntimeError(f"Failed to list applications: {apps_resp.text}")

        applications = apps_resp.json()

        with dao.get_session() as session:
            deployed_workflows: List[db_model.DeployedWorkflowInstance] = session.query(
                db_model.DeployedWorkflowInstance
            ).all()
            deployed_workflow_instances = []

            for deployed_workflow in deployed_workflows:
                workflow: db_model.Workflow = deployed_workflow.workflow

                # Initialize variables with default values
                application_url = ""
                application_status = "stopped"
                application_deep_link = ""

                # First check CML model status
                model_status = "stopped"
                try:
                    if not deployed_workflow.cml_deployed_model_id:
                        model_status = "stopped"
                    else:
                        # Fetch model builds
                        model_builds = cml.list_model_builds(
                            project_id=os.getenv("CDSW_PROJECT_ID"), model_id=deployed_workflow.cml_deployed_model_id
                        ).model_builds

                        for build in model_builds:
                            # Fetch model deployments for each build
                            model_deployments = cml.list_model_deployments(
                                project_id=os.getenv("CDSW_PROJECT_ID"),
                                model_id=deployed_workflow.cml_deployed_model_id,
                                build_id=build.id,
                            ).model_deployments

                            # Check each deployment's status
                            for deployment in model_deployments:
                                deployment_status = deployment.status.lower()
                                if deployment_status not in ["stopped", "failed"]:
                                    model_status = deployment_status
                                    break
                            if model_status != "stopped":
                                break

                except Exception as e:
                    print(f"Failed to get model status for workflow {deployed_workflow.id}: {str(e)}")
                    model_status = "error"

                # Only check application status if model is running
                if model_status == "deployed":
                    try:
                        workflow_app_name = get_application_name_for_deployed_workflow(deployed_workflow)
                        matching_app = next((app for app in applications if app["name"] == workflow_app_name), None)

                        if matching_app:
                            application_url = matching_app.get("url", "")
                            application_status = matching_app.get("status", "stopped")
                    except Exception as e:
                        print(f"Failed to get application details for workflow {deployed_workflow.id}: {str(e)}")
                        application_status = "error"
                else:
                    application_status = model_status

                # Get deep links separately - regardless of status
                # Initialize deep links with empty strings
                application_deep_link = ""
                model_deep_link = ""

                try:
                    # Get application deep link
                    workflow_app_name = get_application_name_for_deployed_workflow(deployed_workflow)
                    matching_app = next((app for app in applications if app["name"] == workflow_app_name), None)
                    if matching_app and "projectHtmlUrl" in matching_app and "id" in matching_app:
                        application_deep_link = f"{matching_app['projectHtmlUrl']}/applications/{matching_app['id']}"
                except Exception as e:
                    print(f"Failed to get application deep link for workflow {deployed_workflow.id}: {str(e)}")
                    application_deep_link = ""

                try:
                    # Get model deep link
                    model_deep_link = model_urls.get(deployed_workflow.cml_deployed_model_id, "")
                except Exception as e:
                    print(f"Failed to get model deep link for workflow {deployed_workflow.id}: {str(e)}")
                    model_deep_link = ""

                # TODO: migrate all statuses and application URLs to use deployment_metadata
                if deployed_workflow.status in [
                    DeploymentStatus.INITIALIZED,
                    DeploymentStatus.PACKAGING,
                    DeploymentStatus.PACKAGED,
                    DeploymentStatus.DEPLOYING,
                ]:
                    application_status = "start"

                try:
                    deployed_workflow_instances.append(
                        DeployedWorkflow(
                            deployed_workflow_id=deployed_workflow.id,
                            workflow_id=workflow.id,
                            deployed_workflow_name=deployed_workflow.name,
                            workflow_name=workflow.name,
                            cml_deployed_model_id=deployed_workflow.cml_deployed_model_id,
                            application_url=application_url,
                            application_status=application_status,
                            application_deep_link=application_deep_link,
                            model_deep_link=model_deep_link,
                            deployment_metadata=deployed_workflow.deployment_metadata or "{}",
                            created_at=deployed_workflow.created_at.isoformat() if deployed_workflow.created_at else "",
                        )
                    )
                except Exception as e:
                    print(f"Error creating DeployedWorkflow object for workflow {deployed_workflow.id}: {str(e)}")
                    continue

            return ListDeployedWorkflowsResponse(deployed_workflows=deployed_workflow_instances)
    except SQLAlchemyError as e:
        raise RuntimeError(f"Database error occurred while listing deployed workflows: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"Unexpected error occurred while listing deployed workflows: {str(e)}")
