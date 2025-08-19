from cmlapi import CMLServiceApi
import cmlapi

from studio.consts import AGENT_STUDIO_UPGRADE_JOB_NAME
from studio.cross_cutting.utils import (
    get_job_by_name,
    get_deployed_workflow_runtime_identifier,
    get_studio_subdirectory,
)
from studio.db.dao import AgentStudioDao
from studio.api import *

import subprocess
import re
import os


SEMVER_REGEX = re.compile(
    r"^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
    # Explanation:
    #  v?        -> optional leading 'v' (e.g. v1.2.3)
    # (\d+)\.(\d+)\.(\d+) -> major.minor.patch, each numeric
    # (?:-...)   -> optional pre-release component
)


def git_fetch():
    """
    Fetches changes from the remote (including tags).
    """
    subprocess.run(["git", "fetch", "--tags"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def stash_pop_safely():
    """
    Helper function to pop the stash without blowing up the entire process if there's no stash.
    """
    try:
        subprocess.run(["git", "stash", "pop"], check=True)
    except subprocess.CalledProcessError as e:
        # In case there's no stash or conflicts occur
        print(f"Error popping stashed changes: {e}")


def is_on_a_semantic_version():
    """
    Returns True if the LOCAL HEAD commit matches the commit of
    any REMOTE tag that looks like a semantic version (v1.2.3, etc.).
    """
    try:
        sem_ver = get_current_semantic_version()
        return bool(sem_ver)
    except Exception as e:
        # e.g., if 'ls-remote' or 'rev-parse' fails
        return False


def get_current_semantic_version():
    """
    Returns the tag name (e.g. 'v1.2.3') if we are indeed on a semantic version tag.
    If HEAD is not exactly on a tag, this method may raise an exception or return None.
    """
    # 1) Get the local HEAD commit SHA
    head_commit = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ).stdout.strip()

    versions: list[dict] = get_semantic_versions()
    matching_semantic_versions = list(filter(lambda x: x["commit"] == head_commit, versions))

    if len(matching_semantic_versions) > 1:
        raise RuntimeError("Multiple semantic versions corresponding to this commit!")

    if matching_semantic_versions:
        return matching_semantic_versions[0]["tag"]

    raise RuntimeError(f"HEAD commit ({head_commit}) does not correspond to a semantic version.")


def get_semantic_versions():
    tags_output = subprocess.run(
        ["git", "ls-remote", "--tags", "origin"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ).stdout.strip()

    valid_versions = []
    for line in tags_output.splitlines():
        commit_hash, ref = line.split()
        tagname = ref.replace("refs/tags/", "")

        # Skip "tag^{}" lines
        if "^{}" in tagname:
            continue

        # Check if the tag is a valid semver
        if SEMVER_REGEX.match(tagname):
            valid_versions.append({"commit": commit_hash, "tag": tagname})

    return valid_versions


def get_most_recent_semantic_version():
    """
    Fetches the tag references from 'origin', parses them as semantic versions,
    and returns the highest tag (e.g. 'v1.2.3') by semantic version order.
    If no valid semantic tags exist, returns None.
    """

    valid_versions = get_semantic_versions()

    if not valid_versions:
        raise RuntimeError("There are no semantic versions available.")

    # Sort versions by major/minor/patch so we can pick the highest
    # We can do a naive approach here by splitting on '.' and comparing, or use the same regex captures
    # For a robust approach, parse into (major, minor, patch) and compare as tuples.
    def parse_semver_str(v):
        m = SEMVER_REGEX.match(v)
        # group(1)=major, group(2)=minor, group(3)=patch
        return tuple(map(int, m.groups()[:3]))  # ignore pre-release for a straightforward approach

    valid_versions.sort(key=lambda ver: parse_semver_str(ver["tag"]))
    most_recent = valid_versions[-1]["tag"]

    return most_recent


def is_on_main_branch():
    """
    Returns True if the current (local) branch is 'main'.
    """
    branch = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ).stdout.strip()
    return branch == "main"


def get_local_commit():
    """
    Returns the commit hash currently checked out locally (HEAD).
    """
    return subprocess.run(
        ["git", "rev-parse", "HEAD"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    ).stdout.strip()


def get_remote_head_commit():
    """
    Returns the commit hash of the HEAD of the tracked remote branch.
    For simplicity, assume the current local branch is tracking origin/<branch>.
    If you're specifically targeting 'main', you can hardcode 'origin/main' instead.
    """
    branch = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ).stdout.strip()

    remote_branch = f"origin/{branch}"
    return subprocess.run(
        ["git", "rev-parse", remote_branch], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    ).stdout.strip()


def check_studio_upgrade_status(
    request: CheckStudioUpgradeStatusRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> CheckStudioUpgradeStatusResponse:
    """
    Compares either the local semantic version vs. the most recent remote version
    OR the local commit vs. the remote HEAD commit (for main or other branches).
    """
    # If we are running in runtime mode, then this upgrade logic is not needed.
    if os.getenv("AGENT_STUDIO_DEPLOY_MODE") == "runtime":
        return CheckStudioUpgradeStatusResponse(
            local_version="",
            newest_version="",
        )

    # 1) Fetch from remote
    git_fetch()

    # 2) Decide which type of versioning to compare
    if is_on_a_semantic_version():
        # If we are on a semantic version, only upgrade on official releases
        local_version = get_current_semantic_version()
        newest_version = get_most_recent_semantic_version() or local_version
    elif is_on_main_branch():
        # If on main, we just track commits
        local_version = get_local_commit()
        newest_version = get_remote_head_commit()
    else:
        # For any development branch that is not main, also track commits
        local_version = get_local_commit()
        newest_version = get_remote_head_commit()

    return CheckStudioUpgradeStatusResponse(
        local_version=local_version,
        newest_version=newest_version,
    )


def upgrade_studio(
    request: UpgradeStudioRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> UpgradeStudioResponse:
    # Determine if the job exists
    job: cmlapi.Job = get_job_by_name(cml, AGENT_STUDIO_UPGRADE_JOB_NAME)

    # If this job doesn't exist, then create it!
    if job == None:
        job: cmlapi.Job = cml.create_job(
            {
                "name": AGENT_STUDIO_UPGRADE_JOB_NAME,
                "project_id": os.getenv("CDSW_PROJECT_ID"),
                "script": os.path.join(get_studio_subdirectory(), "bin", "upgrade-studio.py"),
                "cpu": 2,
                "memory": 8,
                "nvidia_gpu": 0,
                "runtime_identifier": get_deployed_workflow_runtime_identifier(cml),
            },
            project_id=os.getenv("CDSW_PROJECT_ID"),
        )

    # Now run the job
    cml.create_job_run({}, project_id=os.getenv("CDSW_PROJECT_ID"), job_id=job.id)
