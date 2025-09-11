import json
import os
import shutil
import cmlapi
from typing import List, Optional
from sqlalchemy.exc import SQLAlchemyError
import requests
import json
from cmlapi import CMLServiceApi

from studio.cross_cutting.global_thread_pool import get_thread_pool
from studio.db.dao import AgentStudioDao
from studio.api import *
from studio.db import model as db_model
import studio.cross_cutting.utils as cc_utils
import studio.consts as consts
from studio.deployments.types import *
from studio.deployments.applications import (
    get_application_for_deployed_workflow,
    cleanup_deployed_workflow_application,
    get_application_name_for_deployed_workflow,
)
from studio.deployments.entry import resume_workflow_deployment


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
                print(f"Could not delete deployed workflow application: {str(e)}")

            session.delete(deployed_workflow_instance)
            session.commit()
            deployment_target_dir = os.path.join(consts.DEPLOYABLE_WORKFLOWS_LOCATION, deployed_workflow_instance.id)
            if os.path.exists(deployment_target_dir):
                shutil.rmtree(deployment_target_dir)
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

                if deployed_workflow.status in [DeploymentStatus.SUSPENDED]:
                    application_status = "suspended"

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
                            updated_at=deployed_workflow.updated_at.isoformat() if deployed_workflow.updated_at else "",
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


def suspend_deployed_workflow(
    request: SuspendDeployedWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> SuspendDeployedWorkflowResponse:
    """
    Suspend a deployed workflow means freeing up resources in the cluster by:
     - Deleting the related model deployment
     - Suspending the related application
    """
    with dao.get_session() as session:
        _, project_id = cc_utils.get_cml_project_number_and_id()
        deployed_workflow = (
            session.query(db_model.DeployedWorkflowInstance).filter_by(id=request.deployed_workflow_id).one()
        )
        if not deployed_workflow:
            raise ValueError(f"Deployed workflow with ID '{request.deployed_workflow_id}' not found.")

        deployment_metadata: dict = json.loads(deployed_workflow.deployment_metadata)
        workbench_model_id, workbench_model_build_id, workbench_application_id = (
            deployment_metadata.get("cml_model_id", None),
            deployment_metadata.get("cml_model_build_id", None),
            deployment_metadata.get("application_id", None),
        )
        if not workbench_model_id or not workbench_model_build_id or not workbench_application_id:
            raise ValueError(
                f"variables workbench_model_id, workbench_model_build_id and workbench_application_id are required to suspend a deployed workflow"
            )

        # Get the associated model deployment
        model_deployment_id: str = None
        try:
            model_deployment_id = sorted(
                cml.list_model_deployments(project_id, workbench_model_id, workbench_model_build_id).model_deployments,
                key=lambda x: x.created_at,
                reverse=True,
            )[0].id
        except IndexError:
            pass

        # Stopping models and applications is done on a best effort basis.
        try:
            if model_deployment_id:
                cml.stop_model_deployment(project_id, workbench_model_id, workbench_model_build_id, model_deployment_id)
        except Exception as e:
            print(f"Error stopping model deployment: {str(e)}")

        try:
            if workbench_application_id:
                cml.stop_application(project_id, workbench_application_id)
        except Exception as e:
            print(f"Error stopping application: {str(e)}")

        # Update the deployed workflow status to suspended
        deployed_workflow.status = DeploymentStatus.SUSPENDED
        session.commit()
        return SuspendDeployedWorkflowResponse()


def resume_deployed_workflow(
    request: ResumeDeployedWorkflowRequest, cml: CMLServiceApi, dao: AgentStudioDao = None
) -> ResumeDeployedWorkflowResponse:
    """
    Resume a deployed workflow.
     - Creating a new model deployment from the existing build.
     - Starting the previosuly stopped application.
    """
    with dao.get_session() as session:
        _, project_id = cc_utils.get_cml_project_number_and_id()
        deployed_workflow = (
            session.query(db_model.DeployedWorkflowInstance).filter_by(id=request.deployed_workflow_id).one()
        )
        if not deployed_workflow:
            raise ValueError(f"Deployed workflow with ID '{request.deployed_workflow_id}' not found.")

        deployment_metadata: dict = json.loads(deployed_workflow.deployment_metadata)
        workbench_model_id, workbench_model_build_id, workbench_application_id = (
            deployment_metadata.get("cml_model_id", None),
            deployment_metadata.get("cml_model_build_id", None),
            deployment_metadata.get("application_id", None),
        )
        if not workbench_model_id or not workbench_model_build_id or not workbench_application_id:
            raise ValueError(
                f"variables workbench_model_id, workbench_model_build_id and workbench_application_id are required to suspend a deployed workflow"
            )

        current_status = deployed_workflow.status
        if current_status not in [DeploymentStatus.SUSPENDED.value, DeploymentStatus.FAILED.value]:
            raise ValueError("Only suspended or failed workflows can be resumed")

        # Before allowing a resume, do the following checks:
        #  - Check if the model build exists
        #  - Check that the model build has atleast one deployment
        #  - Check if the application exists
        try:
            cml.get_model_build(project_id, workbench_model_id, workbench_model_build_id)
            old_model_deployment_id = sorted(
                cml.list_model_deployments(project_id, workbench_model_id, workbench_model_build_id).model_deployments,
                key=lambda x: x.created_at,
                reverse=True,
            )[0].id
            print(f"Old model deployment ID: {old_model_deployment_id} for workflow {request.deployed_workflow_id}")
            cml.get_application(project_id, workbench_application_id)
        except Exception as e:
            msg = f"Error in retreiving prerequisites: {str(e)}"
            print(msg)
            raise ValueError(msg)

        get_thread_pool().submit(resume_workflow_deployment, request.deployed_workflow_id)

        return ResumeDeployedWorkflowResponse()
