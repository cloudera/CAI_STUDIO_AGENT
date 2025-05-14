'''

This file acts as a hook for any post-upgrade logic that 
needs to be performed for a given commit. Because this is
ran as its own separate subprocess, you can add upgrade-specific
logic to this file, and the file will run as part of
the upgrade procedure.

'''

import os
import cmlapi
from studio.db.dao import AgentStudioDao
from studio.cross_cutting.utils import get_deployed_workflows_with_applications, restart_workflow_application
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
    Task 2: Restart all deployed workflow applications
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


def run_post_upgrade_tasks():
    """Run all pre-upgrade tasks"""
    print("Starting post-upgrade tasks...")
     # Task 1: Check API key migration
    check_api_key_migration()
    
    # Task 2: Restart deployed workflow applications
    restart_deployed_workflow_applications()
    print("Post-upgrade tasks completed")

if __name__ == "__main__":
    run_post_upgrade_tasks()