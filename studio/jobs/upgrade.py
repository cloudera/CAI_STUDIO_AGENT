from cmlapi import CMLServiceApi
import cmlapi
import os

from studio.consts import (
    AGENT_STUDIO_SERVICE_APPLICATION_NAME,
    AGENT_STUDIO_OPS_APPLICATION_NAME,
    AGENT_STUDIO_UPGRADE_JOB_NAME,
)
from studio.cross_cutting.utils import get_application_by_name
from studio.db.dao import AgentStudioDao
from studio.api import *
from studio.cross_cutting.upgrades import (
    is_on_a_semantic_version_tag,
    stash_pop_safely,
    get_remote_most_recent_semantic_version,
    git_fetch
)
import time

import subprocess

import subprocess
import re

import time





def upgrade_studio(cml: CMLServiceApi = None) -> UpgradeStudioResponse:
    """
    If currently on a semantic version tag, fetch remote tags and checkout the newest semantic version tag.
    Otherwise, do a normal stash/pull/stash pop flow.
    In both cases, stash/pop is used to preserve local changes.
    """

    # Make sure this job appropriately exists
    resp: cmlapi.ListJobsResponse = cml.list_jobs(os.getenv("CDSW_PROJECT_ID"))
    jobs: list[cmlapi.Job] = resp.jobs
    jobs = list(filter(lambda x: x.name == AGENT_STUDIO_UPGRADE_JOB_NAME, jobs))
    
    if len(jobs) != 1:
        raise RuntimeError(f"ERROR: job '{AGENT_STUDIO_UPGRADE_JOB_NAME}' not found!")
    job = jobs[0]
    
    # Get active running jobs and disallow for upgrades if a job is already running
    resp: cmlapi.ListJobRunsResponse = cml.list_job_runs(os.getenv("CDSW_PROJECT_ID"), job.id)
    job_runs: list[cmlapi.JobRun] = resp.job_runs
    job_runs = list(filter(lambda x: x.status.lower() == "scheduling" or x.status.lower == "running", job_runs))
    if len(job_runs) > 0:
        raise RuntimeError(f"ERROR: Agent Studio is already actively running an upgrade script. Cannot schedule another upgrade.")

    # Stop running applications if they are running
    print("Stop all running applications in the Agent Studio ecosystem...")
    studio_application: cmlapi.Application = get_application_by_name(cml, AGENT_STUDIO_SERVICE_APPLICATION_NAME, only_running=False)
    ops_application: cmlapi.Application = get_application_by_name(cml, AGENT_STUDIO_OPS_APPLICATION_NAME, only_running=False)
    for application in [studio_application, ops_application]:
        print(f"Stopping the '{application.name}' application...")
        if application.status.lower() == "stopped":
            print(f"Application '{application.name}' is already stopped!")
        else:
            cml.stop_application(project_id=os.getenv("CDSW_PROJECT_ID"), application_id=application.id)
            print(f"Application '{application.name}' stopped.")


    # Always stash before doing any git operation, so we can safely switch versions/branches
    print(f"Attempting to pull new Agent Studio version...")
    print(f"Current commit: ")
    try:
        print("Stashing any existing changes made to Agent Studio files...")
        subprocess.run(["git", "stash"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error stashing changes: {e}")

    if is_on_a_semantic_version_tag():
        print("This Agent Studio is on a semantic version tag.")
        try:
            # 1) Fetch remote so we get the latest tags
            print("Fetching latest tags....")
            git_fetch()

            # 2) Get the newest remote semantic version tag
            newest_tag = get_remote_most_recent_semantic_version()
            if not newest_tag:
                print("No valid semantic tags exist on remote.")
                # Attempt to pop stash so you’re not left with stashed changes
                stash_pop_safely()
                return UpgradeStudioResponse()

            # 3) Checkout that tag
            print(f"Newest tag is: '{newest_tag}'")
            subprocess.run(["git", "checkout", newest_tag], check=True)
            print(f"Checked out newest semantic version tag: {newest_tag}")
        except subprocess.CalledProcessError as e:
            print(f"Error upgrading to latest semantic version tag: {e}")
            stash_pop_safely()
            return UpgradeStudioResponse()
    else:
        # If not on semantic version, do a normal 'git pull'
        print("Not on a semantic version tag. Can do a standard git pull.")
        try:
            subprocess.run(["git", "pull"], check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error pulling changes: {e}")
            stash_pop_safely()
            return UpgradeStudioResponse()

    # Pop the stash to restore local changes
    print("Trying a `git stash apply` to pull back down any changes to Studio that users may have made")
    try:
        subprocess.run(["git", "stash", "apply"], check=True)
    except subprocess.CalledProcessError as e:
        # In case there's no stash or conflicts occur
        print(f"Error popping stashed changes: {e}")
        
        # In this case, we actually want to KILL the upgrade job - customers have made some breaking,
        # incompatible changes to Studio code that didn't jive well
        print("ERROR: tried to run 'git stash apply' and ran into conflicts. This means that " \
            "a user modified Agent Studio source code which conflicts with this update. Please " \
            "either remove Agent Studio entirely, or manually address your merge conflicts. Your source " \
            "code changes should be saved and can be accessed with 'git stash apply' or 'git stash pop'.")


    # # Also run any and all DB default upgrades. Our upgrades need to be compatible with our
    # # style of project defaults here - which means that if project defaults gets updated with
    # # new schemas, then alembic still needs to go through the entire ugrade lineage even though
    # # the new schemas alredy exist. This is to support both old users and new users of agent studio.
    # # This means that, for example, if there was an alembic version upgrade to add a column, we need
    # # to first check if that column already exists. If the column already exists, someone new must have
    # # pulled down agent studio and ran a fresh project-defaults. If the column does not exist, that
    # # means we are performing an upgrade.
    # try:
    #     subprocess.run(["uv", "run", "alembic", "upgrade", "head"], check=True)
    # except subprocess.CalledProcessError as e:
    #     print(f"Error upgrading DB: {e}")

    # # Also perform any project default upgrades necessary. Note this will explicitly
    # # check to see if an existing project default has already been added to make sure
    # # that we are not duplicating project defaults.
    # try:
    #     subprocess.run(["uv", "run", "bin/initialize-project-defaults.py"], check=True)
    # except subprocess.CalledProcessError as e:
    #     print(f"Error initializing project defaults: {e}")

    # # Install new dependencies
    # try:
    #     subprocess.run(["npm", "install"], check=True)
    # except subprocess.CalledProcessError as e:
    #     print(f"Error running npm install: {e}")

    # # Rebuild frontend app
    # try:
    #     subprocess.run(["npm", "run", "build"], check=True)
    # except subprocess.CalledProcessError as e:
    #     print(f"Error running npm run build: {e}")

    # # Run post upgrade hook
    # try:
    #     subprocess.run(["uv", "run", "bin/post-upgrade-hook.py"], check=True)
    # except subprocess.CalledProcessError as e:
    #     print(f"Error running post upgrade: {e}")

    # # Small sleep to ensure output from post-upgrade-hook makes it
    # # to application logs. Not necessary functionally, but will help
    # # with diagnostics.
    # time.sleep(10)

    # # Restart the application
    # restart_studio_application(cml)

    # Restart the application.
    return UpgradeStudioResponse()


def restart_studio_application(cml: CMLServiceApi = None) -> RestartStudioApplicationResponse:
    # Grab a reference to the current application
    application: cmlapi.Application = get_application_by_name(cml=cml, name=AGENT_STUDIO_SERVICE_APPLICATION_NAME)

    # Restart the application
    cml.restart_application(os.getenv("CDSW_PROJECT_ID"), application.id)

    # NOTE: this will technically never be returned to the
    # frontend because we are sending a command to restart
    # the application, which means the pod that is running
    # this command will be killed.
    return RestartStudioApplicationResponse()



if __name__ == "__main__":
    print("Upgrading Agent Studio...")
    
    cml = cmlapi.default_client()
    
    upgrade_studio(cml)
    
    raise ValueError("NICE TRY FOOL!")