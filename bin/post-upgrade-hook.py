'''

This file acts as a hook for any post-upgrade logic that 
needs to be performed for a given commit. Because this is
ran as its own separate subprocess, you can add upgrade-specific
logic to this file, and the file will run as part of
the upgrade procedure.

'''

from cmlapi import CMLServiceApi
import cmlapi
from studio.db.dao import AgentStudioDao
from studio.migrations.migrate_api_keys import migrate_api_keys_to_env

def run_post_upgrade_tasks():
    print("Application post-upgrade hook triggered!")
    
    # Migrate API keys to project environment variables
    print("Migrating API keys to project environment variables...")
    try:
        cml = cmlapi.default_client()
        dao = AgentStudioDao()
        migrate_api_keys_to_env(cml, dao)
    except Exception as e:
        print(f"Warning: Failed to migrate API keys: {str(e)}")

if __name__ == "__main__":
    run_post_upgrade_tasks()