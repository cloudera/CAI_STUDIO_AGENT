'''

This file acts as a hook for any post-upgrade logic that 
needs to be performed for a given commit. Because this is
ran as its own separate subprocess, you can add upgrade-specific
logic to this file, and the file will run as part of
the upgrade procedure.

'''

import os

def initialize_app_paths():
    app_dir = None
    app_data_dir = None
    is_studio = os.getenv("AGENT_STUDIO_RENDER_MODE", "studio").lower() == "studio"
    is_composable: bool = os.getenv("IS_COMPOSABLE", "false").lower() == "true"
    is_runtime = os.getenv("AGENT_STUDIO_DEPLOY_MODE", "amp").lower() == "runtime"
    
    # Set app data directory based on whether we are running in
    # studio mode or workflow mode.
    app_data_dir = os.getenv("APP_DATA_DIR")
    if is_studio:
        app_data_dir = "/home/cdsw/agent-studio" if is_composable else "/home/cdsw"

    # Set the app directory 
    app_dir = os.getenv("APP_DIR", "/home/cdsw/agent-studio") if is_composable else "/home/cdsw"

    # At this point, both environment variables have been configured
    os.environ["APP_DIR"] = app_dir
    os.environ["APP_DATA_DIR"] = app_data_dir

    print(f"Application directory: {app_dir}")
    print(f"Application data directory: {app_data_dir}")

initialize_app_paths()

import json
import shutil
import cmlapi
from studio.api import *
from studio.db.dao import AgentStudioDao
from studio.db.model import DeployedWorkflowInstance
from studio.cross_cutting.utils import (
    get_deployed_workflows_with_applications, 
    restart_workflow_application, 
    get_application_by_name
)
from studio.cross_cutting.global_thread_pool import initialize_thread_pool, cleanup_thread_pool
from studio.deployments.entry import deploy_from_payload
from studio.deployments.types import *
from studio.consts import AGENT_STUDIO_OPS_APPLICATION_NAME, AGENT_STUDIO_SERVICE_APPLICATION_NAME
from datetime import datetime, timedelta
import time
from studio.api import (
    CmlApiCheckRequest, 
    RotateCmlApiRequest
)
from studio.cross_cutting.apiv2 import (
    cml_api_check,
    rotate_cml_api
)

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

app_dir = os.getenv("APP_DIR")
if not app_dir:
    raise EnvironmentError("APP_DIR environment variable is not set.")
sys.path.append(os.path.join(app_dir, "studio", "workflow_engine", "src"))

import engine.types as input_types

def check_api_key_migration():
    """
    Task 1: Check for user API key migration and rotate if needed
    """
    print("Checking API key migration...")
    try:
        # Initialize CML client and DAO
        cml = cmlapi.default_client()
        dao = AgentStudioDao()
        
        # Check API key status
        check_response = cml_api_check(CmlApiCheckRequest(), cml, dao)
        if check_response.message:  # If there's an error message
            print("API key validation failed, attempting rotation")
            rotate_response = rotate_cml_api(RotateCmlApiRequest(), cml, dao)
            if rotate_response.message:  # If there's an error message
                print(f"API key rotation failed: {rotate_response.message}")
            else:
                print("API key rotation successful")
        else:
            print("API key validation successful - no rotation needed")
            
    except Exception as e:
        print(f"Error during API key migration check: {str(e)}")
    
    print("API key migration check complete")

def restart_deployed_workflow_applications():
    """
    Restart all deployed workflow applications that are running in AMP
    mode. These AMP-mode applications run on a shared Node build instance, and upgrades
    that rebuild the Node build artifacts will break existing Node servers that are serving
    the same artifacts. Note: in runtime mode, these applications are running in their own
    Node artifacts and there's no need to restart these applications.
    """
    print("Starting deployed workflow application restart...")
    
    try:
        # Initialize CML client and DAO
        cml = cmlapi.default_client()
        dao = AgentStudioDao()
        
        # Get all deployed workflows and their applications
        workflow_apps = get_deployed_workflows_with_applications(cml, dao)
        
        if not workflow_apps:
            print("No deployed workflow applications found")
            return
            
        print(f"Found {len(workflow_apps)} deployed workflow applications")
        
        # First restart all applications
        for workflow_data, app in workflow_apps:

            # We don't need to restart applications that are running in Agent Studio runtime
            # mode because they are running in their own Node artifacts.
            if "agent-studio" in app.runtime_identifier.lower():
                print("Application for workflow {workflow_data['name']} is running in Agent Studio runtime mode - no need to restart")
                continue

            print(f"Initiating restart for workflow: {workflow_data['name']}")
            cml.restart_application(os.getenv("CDSW_PROJECT_ID"), app.id)
        
        # Now wait for all applications to be running
        timeout = datetime.now() + timedelta(minutes=5)
        pending_apps = {app.id: workflow_data['name'] for workflow_data, app in workflow_apps}
        
        while pending_apps and datetime.now() < timeout:
            for app_id, workflow_name in list(pending_apps.items()):  # Create copy of items for safe modification
                try:
                    app = cml.get_application(os.getenv("CDSW_PROJECT_ID"), app_id)
                    status = app.status.lower()
                    
                    if "running" in status:
                        print(f"Application for workflow '{workflow_name}' is now running")
                        pending_apps.pop(app_id)
                    elif "failed" in status:
                        print(f"Application for workflow '{workflow_name}' failed to start - skipping")
                        pending_apps.pop(app_id)
                except Exception as e:
                    print(f"Error checking status for workflow '{workflow_name}': {str(e)}")
                    pending_apps.pop(app_id)
            
            if pending_apps:
                time.sleep(10)  # Wait 10 seconds before next check
        
        if pending_apps:
            print(f"Timed out waiting for applications: {', '.join(pending_apps.values())}")
        else:
            print("All applications successfully restarted")
            
    except Exception as e:
        print(f"Error during workflow application restart: {str(e)}")


def perform_legacy_ops_metrics_application_migration():
    """
    Task 3: Perform legacy Ops & Metrics application migration. Previousl versions
    of Agent Studio had a separate Ops & Metrics application that was used to serve
    the Ops & Metrics data. This application is no longer used and has been replaced
    with a dedicated Phoenix instance per each deployed workflow. This task will detect
    whether the Ops & Metrics application is running and if so, delete it from the project
    and rebuild and redeploy existing workflows.
    """
    print("Starting legacy Ops & Metrics application migration...")

    try:
        # Initialize CML client and DAO
        cml = cmlapi.default_client()
        dao = AgentStudioDao()
        session = dao.Session()

        # Detect if the legacy Ops & Metrics application is running
        try:
            ops_metrics_app = get_application_by_name(cml, AGENT_STUDIO_OPS_APPLICATION_NAME, only_running=False)
        except Exception as e:
            print("No running legacy Ops & Metrics application found")
            return

        if ops_metrics_app:
            print("Legacy Ops & Metrics application found! Performing migration...")

            print("Deleting legacy Ops & Metrics application...")
            cml.delete_application(os.getenv("CDSW_PROJECT_ID"), ops_metrics_app.id)

            print("Rerouting existing workflows to use dedicated Phoenix instances...")

            # Get references to all deployed workflows and their associated applications
            deployed_workflows: list[DeployedWorkflowInstance] = session.query(DeployedWorkflowInstance).all()

            # For each deployment:
            # - Extract out the existing environment variables
            # - Update the environment variable for ops & metrics to be the application/api/ops
            # - Rebuild/redeploy the model with the new env var
            # - For each application, add APP_DATA_DIR to be the directory of the deployment itself
            # - Restart the application
            for deployed_workflow in deployed_workflows:

                # Get latest build and its deployment
                builds = cml.list_model_builds(
                    project_id=os.getenv("CDSW_PROJECT_ID"), model_id=deployed_workflow.cml_deployed_model_id
                ).model_builds

                if not builds:
                    print(f"[ERROR] No builds found for model {deployed_workflow.cml_deployed_model_id}")
                    return

                latest_build = sorted(builds, key=lambda x: x.created_at, reverse=True)[0]

                deployments = cml.list_model_deployments(
                    project_id=os.getenv("CDSW_PROJECT_ID"),
                    model_id=deployed_workflow.cml_deployed_model_id,
                    build_id=latest_build.id,
                ).model_deployments

                if not deployments:
                    print(f"[ERROR] No deployments found for model {deployed_workflow.cml_deployed_model_id}")
                    return

                current_deployment = sorted(deployments, key=lambda x: x.created_at, reverse=True)[0]

                # Get environment vars - fail if we can't read them
                try:
                    env_vars = json.loads(current_deployment.environment) if current_deployment.environment else {}
                    if not env_vars:
                        raise ValueError("Current deployment has no environment variables")
                except Exception as e:
                    print(f"[ERROR] Failed to read environment variables from current deployment: {str(e)}")
                    return

                # Now trigger a redeploy of the workflow
                deployment_config_dict = json.loads(env_vars["AGENT_STUDIO_WORKFLOW_DEPLOYMENT_CONFIG"])
                deployment_config: DeploymentConfig = DeploymentConfig(**deployment_config_dict)

                deployment_payload: DeploymentPayload = DeploymentPayload(
                    workflow_target=WorkflowTargetRequest(type=WorkflowTargetType.WORKFLOW, workflow_id=deployed_workflow.workflow_id),
                    deployment_target=DeploymentTargetRequest(
                        type=DeploymentTargetType.WORKBENCH_MODEL, auto_redeploy_to_type=True
                    ),
                    deployment_config=deployment_config,
                )

                print(f"Redeploying workflow {deployed_workflow.workflow.name} ...")
                deploy_from_payload(deployment_payload)


    except Exception as e:
        print(f"Error during legacy Ops & Metrics application migration: {str(e)}")

    print("Legacy Ops & Metrics application migration complete")


def run_post_upgrade_tasks():
    """Run all pre-upgrade tasks"""

    print("Initializing thread pool...")
    initialize_thread_pool()

    print("Starting post-upgrade tasks...")
     # Task 1: Check API key migration
    check_api_key_migration()

    # Task 2: Perform legacy Ops & Metrics application migration 
    perform_legacy_ops_metrics_application_migration()
    
    # Task 3: Restart deployed workflow applications that are running in AMP mode
    restart_deployed_workflow_applications()

    print("Post-upgrade tasks completed")

    print("Cleaning up thread pool...")
    cleanup_thread_pool()

if __name__ == "__main__":
    run_post_upgrade_tasks()