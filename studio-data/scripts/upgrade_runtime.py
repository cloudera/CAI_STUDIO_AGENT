#!/usr/bin/env python3
"""
Runtime Upgrade Job Script

This script performs Agent Studio runtime upgrades using arguments passed via JOB_ARGUMENTS.
It only executes the upgrade - all logic and data is provided by the caller.

Usage : "target_runtime project_id application_id current_runtime"
"""

import sys
import os
import shlex
import time
import cmlapi

# Load job arguments into sys.argv with proper handling
job_args_raw = os.environ.get("JOB_ARGUMENTS", "")
if "," in job_args_raw:
    # Handle comma-separated arguments
    job_args = [arg.strip() for arg in job_args_raw.split(",")]
else:
    # Handle space-separated arguments (fallback)
    job_args = shlex.split(job_args_raw)

sys.argv = ["script"] + job_args


def main():
    """Main function that performs upgrade using provided arguments"""
    
    print("Agent Studio Runtime Upgrade Job Starting")
    
    # Parse arguments from JOB_ARGUMENTS
    if len(sys.argv) < 4:
        print("ERROR: Usage: JOB_ARGUMENTS='target_runtime project_id application_id [current_runtime]'")
        print(f"Received: {sys.argv[1:] if len(sys.argv) > 1 else 'None'}")
        sys.exit(1)
    
    # Extract all provided arguments
    target_runtime = sys.argv[1]
    project_id = sys.argv[2] 
    application_id = sys.argv[3]
    current_runtime = sys.argv[4] if len(sys.argv) > 4 else "unknown"
    
    print(f"Job arguments:")
    print(f"  Target Runtime: {target_runtime}")
    print(f"  Project ID: {project_id}")
    print(f"  Application ID: {application_id}")
    print(f"  Current Runtime: {current_runtime}")
    
    # Basic validation    
    if not project_id:
        print(f"ERROR: Invalid project ID: {project_id}")
        sys.exit(1)
    
    try:
        
        # Initialize CML client
        cml = cmlapi.default_client()
        print("CML client initialized successfully")
        
        # Use provided arguments instead of querying again
        print(f"Application ID: {application_id}")
        print(f"Current Runtime (provided): {current_runtime}")
        print(f"Target Runtime: {target_runtime}")
        
        # Check if upgrade is needed using provided data
        if current_runtime == target_runtime:
            print("Already on target runtime - no upgrade needed")
            return
        
        print("Runtime upgrade required:")
        print(f"From: {current_runtime}")
        print(f"To: {target_runtime}")
        
        print(f"Getting current application status...")
        app = cml.get_application(project_id=project_id, application_id=application_id)
        print(f"Application: {app.name}, Status: {app.status}")
        
        print("\nStep 1: Stopping application...")
        if 'stopped' not in app.status.lower():
            cml.stop_application(project_id=project_id, application_id=application_id)
            print("Stop request sent")
            
            print("Waiting for application to stop...")
            for i in range(30):
                time.sleep(3)
                app = cml.get_application(project_id=project_id, application_id=application_id)
                print(f"Status check {i+1}: {app.status}")
                if 'stopped' in app.status.lower():
                    print("Application stopped successfully")
                    break
            else:
                print("ERROR: Application did not stop within 90 seconds")
                sys.exit(1)
        else:
            print("Application already stopped")
        
        #Update runtime
        print(f"\nStep 2: Updating runtime to {target_runtime}...")
        app_update = cmlapi.Application(runtime_identifier=target_runtime)
        
        result = cml.update_application(
            body=app_update,
            project_id=project_id,
            application_id=application_id
        )
        print(f"Runtime updated successfully to: {result.runtime_identifier}")
        
        #Restart
        print(f"\nStep 3: Restarting application...")
        cml.restart_application(project_id=project_id, application_id=application_id)
        print("Restart request sent successfully")
        
        #Monitor startup
        print(f"\nStep 4: Monitoring application startup...")
        for i in range(120):  # 10 minutes max
            time.sleep(5)
            try:
                app = cml.get_application(project_id=project_id, application_id=application_id)
                print(f"Status check {i+1}: {app.status}")
                
                if app.status == "APPLICATION_RUNNING":
                    print("Application is running with new runtime")
                    print(f"Final runtime: {app.runtime_identifier}")
                    print("Runtime upgrade completed successfully")
                    return
                elif 'failed' in app.status.lower():
                    print(f"ERROR: Application failed to start: {app.status}")
                    break
                    
            except Exception as e:
                print(f"Error checking status: {e}")
        
        print("WARNING: Application startup monitoring completed without confirmation")
        
    except cmlapi.rest.ApiException as e:
        print(f"ERROR: CML API call failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Runtime upgrade failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()