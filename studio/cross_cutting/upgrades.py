from cmlapi import CMLServiceApi
import cmlapi
import os

from studio.consts import AGENT_STUDIO_SERVICE_APPLICATION_NAME
from studio.cross_cutting.utils import get_appliction_by_name
from studio.db.dao import AgentStudioDao
from studio.api import *
import time

import subprocess


def check_studio_upgrade_status(
    request: CheckStudioUpgradeStatusRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> CheckStudioUpgradeStatusResponse:
    """
    Checks if the current Git branch is up-to-date with its remote branch.
    """
    try:
        # Fetch latest changes from remote
        subprocess.run(["git", "fetch"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        # Get local branch and upstream tracking branch
        branch = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout.strip()

        upstream_branch = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", f"{branch}@{{u}}"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout.strip()

        # Get local and remote commit hashes
        local_commit = subprocess.run(
            ["git", "rev-parse", branch], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        ).stdout.strip()

        remote_commit = subprocess.run(
            ["git", "rev-parse", upstream_branch], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        ).stdout.strip()

    except subprocess.CalledProcessError as e:
        print(f"Error checking Git branch status: {e}")
        return False

    return CheckStudioUpgradeStatusResponse(
        local_commit=local_commit, remote_commit=remote_commit, out_of_date=not (local_commit == remote_commit)
    )


def upgrade_studio(
    request: UpgradeStudioRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> UpgradeStudioResponse:
    """
    Runs a `git stash`, `git pull`, `git stash pop`, and Alembic upgrade to head.
    """

    # Stash any local changes
    try:
        subprocess.run(["git", "stash"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error stashing changes: {e}")

    # Pull latest changes
    try:
        subprocess.run(["git", "pull"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error pulling changes: {e}")
        return UpgradeStudioResponse()

    # Restore stashed changes
    try:
        subprocess.run(["git", "stash", "pop"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error popping stashed changes: {e}")

    # Run sync
    try:
        subprocess.run(["uv", "sync", "--all-extras"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error upgrading DB: {e}")

    # Also run any and all DB default upgrades. Our upgrades need to be compatible with our
    # style of project defaults here - which means that if project defaults gets updated with
    # new schemas, then alembic still needs to go through the entire ugrade lineage even though
    # the new schemas alredy exist. This is to support both old users and new users of agent studio.
    # This means that, for example, if there was an alembic version upgrade to add a column, we need
    # to first check if that column already exists. If the column already exists, someone new must have
    # pulled down agent studio and ran a fresh project-defaults. If the column does not exist, that
    # means we are performing an upgrade.
    try:
        subprocess.run(["uv", "run", "alembic", "upgrade", "head"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error upgrading DB: {e}")

    # Also perform any project default upgrades necessary. Note this will explicitly
    # check to see if an existing project default has already been added to make sure
    # that we are not duplicating project defaults.
    try:
        subprocess.run(["uv", "run", "bin/initialize-project-defaults.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error initializing project defaults: {e}")

    # Install new dependencies
    try:
        subprocess.run(["npm", "install"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running npm install: {e}")

    # Rebuild frontend app
    try:
        subprocess.run(["npm", "run", "build"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running npm run build: {e}")

    # Run post upgrade hook
    try:
        subprocess.run(["uv", "run", "bin/post-upgrade-hook.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running post upgrade: {e}")

    # Small sleep to ensure output from post-upgrade-hook makes it
    # to application logs. Not necessary functionally, but will help
    # with diagnostics.
    time.sleep(10)

    # Restart the application
    restart_studio_application(RestartStudioApplicationRequest(), cml=cml, dao=dao)

    # Restart the application.
    return UpgradeStudioResponse()


def restart_studio_application(
    request: RestartStudioApplicationRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> RestartStudioApplicationResponse:
    # Grab a reference to the current application
    application: cmlapi.Application = get_appliction_by_name(cml=cml, name=AGENT_STUDIO_SERVICE_APPLICATION_NAME)

    # Restart the application
    cml.restart_application(os.getenv("CDSW_PROJECT_ID"), application.id)

    # NOTE: this will technically never be returned to the
    # frontend because we are sending a command to restart
    # the application, which means the pod that is running
    # this command will be killed.
    return RestartStudioApplicationResponse()
