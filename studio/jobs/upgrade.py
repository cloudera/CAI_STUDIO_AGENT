from cmlapi import CMLServiceApi
import cmlapi
import os

from studio.consts import (
    AGENT_STUDIO_SERVICE_APPLICATION_NAME,
    AGENT_STUDIO_OPS_APPLICATION_NAME,
    AGENT_STUDIO_UPGRADE_JOB_NAME,
)
from studio.cross_cutting.utils import get_application_by_name, get_job_by_name
from studio.api import *
from studio.cross_cutting.upgrades import (
    is_on_a_semantic_version,
    get_most_recent_semantic_version,
    git_fetch,
    get_local_commit,
)
import time
import subprocess
import json


def upgrade_studio(cml: CMLServiceApi = None) -> UpgradeStudioResponse:
    """
    If currently on a semantic version tag, fetch remote tags and checkout the newest semantic version tag.
    Otherwise, do a normal stash/pull/stash pop flow.
    In both cases, stash/pop is used to preserve local changes.
    """

    # Make sure this job appropriately exists
    job: cmlapi.Job = get_job_by_name(cml, AGENT_STUDIO_UPGRADE_JOB_NAME)
    if not job:
        raise RuntimeError(f"ERROR: job '{AGENT_STUDIO_UPGRADE_JOB_NAME}' not found!")

    # Get active running jobs and disallow for upgrades if a job is already running
    resp: cmlapi.ListJobRunsResponse = cml.list_job_runs(os.getenv("CDSW_PROJECT_ID"), job.id)
    job_runs: list[cmlapi.JobRun] = resp.job_runs
    job_runs = list(filter(lambda x: x.status.lower() == "scheduling" or x.status.lower == "running", job_runs))
    if len(job_runs) > 0:
        raise RuntimeError(
            f"ERROR: Agent Studio is already actively running an upgrade script. Cannot schedule another upgrade."
        )

    # Stop running applications if they are running
    print("Stop all running applications in the Agent Studio ecosystem...")
    studio_application: cmlapi.Application = get_application_by_name(
        cml, AGENT_STUDIO_SERVICE_APPLICATION_NAME, only_running=False
    )
    ops_application: cmlapi.Application = get_application_by_name(
        cml, AGENT_STUDIO_OPS_APPLICATION_NAME, only_running=False
    )
    for application in [studio_application, ops_application]:
        print(f"Stopping the '{application.name}' application...")
        if application.status.lower() == "stopped":
            print(f"Application '{application.name}' is already stopped!")
        else:
            cml.stop_application(project_id=os.getenv("CDSW_PROJECT_ID"), application_id=application.id)
            print(f"Application '{application.name}' stopped.")

    # Always stash before doing any git operation, so we can safely switch versions/branches
    print(f"Attempting to pull new Agent Studio version...")
    print(f"Current commit: {get_local_commit()}")

    if is_on_a_semantic_version():
        print("This Agent Studio is on a semantic version tag.")
        try:
            # 1) Fetch remote so we get the latest tags
            print("Fetching latest tags....")
            git_fetch()

            # 2) Get the newest remote semantic version tag
            newest_tag = get_most_recent_semantic_version()
            if not newest_tag:
                print("No valid semantic tags exist on remote.")
            else:
                # 3) Checkout that tag
                print(f"Newest tag is: '{newest_tag}'")
                subprocess.run(["git", "checkout", newest_tag], check=True)
                print(f"Checked out newest semantic version tag: {newest_tag}")
        except subprocess.CalledProcessError as e:
            print(f"Error upgrading to latest semantic version tag: {e}")
            raise RuntimeError("ERROR: could not check out latest semantic version tag.")
    else:
        # If not on semantic version, do a normal 'git pull'
        print("Not on a semantic version tag. Can do a standard git pull.")
        try:
            subprocess.run(["git", "pull"], check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error pulling changes: {e}")
            raise RuntimeError("ERROR: could not check out latest semantic version tag.")

    # Install new dependencies
    print("Installing new dependencies and building new frontend...")
    try:
        subprocess.run(["uv", "run", "python", "-u", "startup_scripts/install-dependencies.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running 'uv run startup_scripts/install-dependencies.py': {e}")

    # Run any and all DB default upgrades. Our upgrades need to be compatible with our
    # style of project defaults here - which means that if project defaults gets updated with
    # new schemas, then alembic still needs to go through the entire upgrade lineage even though
    # the new schemas alredy exist. This is to support both old users and new users of agent studio.
    # This means that, for example, if there was an alembic version upgrade to add a column, we need
    # to first check if that column already exists. If the column already exists, someone new must have
    # pulled down agent studio and ran a fresh project-defaults. If the column does not exist, that
    # means we are performing an upgrade.
    print("Running a databse upgrade...")
    try:
        subprocess.run(["uv", "run", "alembic", "upgrade", "head"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running 'uv run alembic upgrade head': {e}")


    # Also perform any project default upgrades necessary. Note this will explicitly
    # check to see if an existing project default has already been added to make sure
    # that we are not duplicating project defaults.
    print("Re-initializing project defaults (workflow templates) in place...")
    try:
        subprocess.run(["uv", "run", "bin/initialize-project-defaults.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running 'uv run bin/initialize-project-defaults.py': {e}")

    # Run post upgrade hook
    print("Running the pre-upgrade hoook...")
    try:
        subprocess.run(["uv", "run", "bin/pre-upgrade-hook.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running p upgrade: {e}")

    print("Restarting all running applications in the Agent Studio ecosystem...")
    for application in [studio_application, ops_application]:
        print(f"Starting the '{application.name}' application...")
        cml.restart_application(os.getenv("CDSW_PROJECT_ID"), application.id)
        print(f"Application '{application.name}' restart request sent.")

    print("Waiting for applications to spin up...")
    while True:
        time.sleep(5)
        studio_application: cmlapi.Application = get_application_by_name(
            cml, AGENT_STUDIO_SERVICE_APPLICATION_NAME, only_running=False
        )
        ops_application: cmlapi.Application = get_application_by_name(
            cml, AGENT_STUDIO_OPS_APPLICATION_NAME, only_running=False
        )
        print("Application statuses:")
        print(
            json.dumps(
                {
                    f"{AGENT_STUDIO_SERVICE_APPLICATION_NAME}": studio_application.status,
                    f"{AGENT_STUDIO_OPS_APPLICATION_NAME}": ops_application.status,
                },
                indent=2,
            )
        )
        if studio_application.status == "APPLICATION_RUNNING" and ops_application.status == "APPLICATION_RUNNING":
            print("Agent Studio back up and running!")
            break

    # Run post upgrade hook
    print("Running the post-upgrade hoook...")
    try:
        subprocess.run(["uv", "run", "bin/post-upgrade-hook.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running post upgrade: {e}")

    print("Agent Studio upgrade complete. Let's get back to building!")
    return 0


if __name__ == "__main__":
    print("Upgrading Agent Studio...")
    cml = cmlapi.default_client()
    upgrade_studio(cml)
