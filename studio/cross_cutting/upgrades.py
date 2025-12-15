from cmlapi import CMLServiceApi
import cmlapi
import json
import re
from studio.consts import (
    AGENT_STUDIO_UPGRADE_JOB_NAME,
    AGENT_STUDIO_SERVICE_APPLICATION_NAME,
    AGENT_STUDIO_RUNTIME_KERNEL,
    AGENT_STUDIO_RUNTIME_EDITION,
)
from studio.cross_cutting.utils import (
    get_job_by_name,
    get_deployed_workflow_runtime_identifier,
    get_studio_subdirectory,
    get_application_by_name,
)
from studio.db.dao import AgentStudioDao
from studio.api import *

import subprocess
import os
from typing import List, Dict


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


def get_current_runtime_version(cml: CMLServiceApi) -> str:
    """
    Get the semantic version of the currently running application's runtime.
    Returns just the version part: '5.0.6-b4'
    """

    if os.getenv("AGENT_STUDIO_RUNTIME_IDENTIFIER"):
        return os.getenv("AGENT_STUDIO_RUNTIME_IDENTIFIER").split(":")[-1]

    # Get the current running application
    application: cmlapi.Application = get_application_by_name(
        cml, AGENT_STUDIO_SERVICE_APPLICATION_NAME, only_running=True
    )

    # Extract version from runtime identifier
    runtime_identifier = application.runtime_identifier
    if not runtime_identifier:
        raise RuntimeError("No runtime identifier found for current application")

    # Simple split on : to get the version tag
    if ":" in runtime_identifier:
        version_str = runtime_identifier.split(":")[-1]
        return version_str
    else:
        raise RuntimeError(f"No version tag found in runtime identifier: {runtime_identifier}")


def get_agent_studio_runtimes(cml: CMLServiceApi) -> List[Dict[str, str]]:
    """
    Get all agent-studio runtimes from the catalog with their versions and full identifiers.
    Uses search filter for efficient filtering and returns sorted list.
    """
    runtime_kernel = AGENT_STUDIO_RUNTIME_KERNEL
    runtime_edition = AGENT_STUDIO_RUNTIME_EDITION

    search_filter = json.dumps({"kernel": runtime_kernel, "edition": runtime_edition})

    try:
        runtimes_response = cml.list_runtimes(page_size=5000, search_filter=search_filter)
        runtimes = runtimes_response.runtimes if hasattr(runtimes_response, "runtimes") else []
        # Filter out runtimes that are disabled
        runtimes = [runtime for runtime in runtimes if runtime.status == "ENABLED"]
        print(f"Found {len(runtimes)} runtimes matching filter: {search_filter}")
    except Exception as e:
        # Fallback to old method if search_filter is not supported
        print(f"Search filter failed ({e}), falling back to client-side filtering")
        try:
            runtimes_response = cml.list_runtimes(page_size=5000)
            runtimes = runtimes_response.runtimes if hasattr(runtimes_response, "runtimes") else []
        except Exception as fallback_e:
            raise RuntimeError(f"Failed to list runtimes: {fallback_e}")

    # Extract versions from filtered runtimes
    agent_studio_versions = []
    for runtime in runtimes:
        # Basic validation
        if not hasattr(runtime, "image_identifier"):
            continue
        if hasattr(runtime, "status") and runtime.status != "ENABLED":
            continue

        if "agent-studio" not in runtime.image_identifier:
            continue

        # Extract semantic version from the image identifier
        if ":" in runtime.image_identifier:
            version_str = runtime.image_identifier.split(":")[-1]

            # Skip invalid version tags that cannot be parsed as semantic versions
            if version_str in ["latest", "main", "dev", "unspecified"] or "unspecified" in version_str:
                continue

            agent_studio_versions.append({"version": version_str, "full_identifier": runtime.image_identifier})

    if not agent_studio_versions:
        raise RuntimeError(
            f"No agent-studio runtimes found with kernel='{runtime_kernel}' and edition='{runtime_edition}'"
        )

    # Sort versions using enhanced semantic version logic that handles pre-release versions
    def parse_semver_str(v):
        # First try the main SEMVER_REGEX
        m = SEMVER_REGEX.match(v)
        if m:
            major, minor, patch = map(int, m.groups()[:3])
            if "-" in v:
                base_part, pre_release = v.split("-", 1)
                pre_release_num = 0
                try:
                    numbers = re.findall(r"\d+", pre_release)
                    if numbers:
                        pre_release_num = int(numbers[-1])
                except:
                    pre_release_num = 0
                return (major, minor, patch, 0, pre_release_num)
            else:
                return (major, minor, patch, 1, 0)
        else:
            # Fallback for non-standard versions
            try:
                base_version = v.split("-")[0]
                parts = base_version.split(".")
                if len(parts) >= 3:
                    major, minor, patch = map(int, parts[:3])
                    if "-" in v:
                        return (major, minor, patch, 0, 0)
                    else:
                        return (major, minor, patch, 1, 0)
            except ValueError:
                pass
            return (0, 0, 0, 0, 0)

    # Sort by semantic version
    agent_studio_versions.sort(key=lambda ver: parse_semver_str(ver["version"]))

    return agent_studio_versions


def get_newest_runtime_version(cml: CMLServiceApi) -> str:
    """
    Get the newest semantic version available in the runtime catalog for agent-studio runtimes.
    Returns the highest semantic version found.
    """
    agent_studio_runtimes = get_agent_studio_runtimes(cml)
    return agent_studio_runtimes[-1]["version"]


def get_newest_runtime_full_identifier(cml: CMLServiceApi) -> str:
    """
    Get the full runtime identifier (including repository and tag) for the newest agent-studio runtime.
    Returns something like 'docker-sandbox.infra.cloudera.com/nagrawal/agent-studio:5.0.6-b4'
    """
    agent_studio_runtimes = get_agent_studio_runtimes(cml)
    return agent_studio_runtimes[-1]["full_identifier"]


def check_studio_upgrade_status(
    request: CheckStudioUpgradeStatusRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> CheckStudioUpgradeStatusResponse:
    """
    Compares either the local semantic version vs. the most recent remote version
    OR the local commit vs. the remote HEAD commit (for main or other branches).
    """
    # If we are running in runtime mode, then this upgrade logic is not needed.
    if os.getenv("AGENT_STUDIO_DEPLOY_MODE") == "runtime":
        try:
            local_version = get_current_runtime_version(cml)
            newest_version = get_newest_runtime_version(cml)

            return CheckStudioUpgradeStatusResponse(
                local_version=local_version,
                newest_version=newest_version,
            )
        except Exception as e:
            # If runtime version detection fails, return empty versions
            print(f"Error getting runtime versions: {e}")
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


def upgrade_studio_runtime_mode(cml: CMLServiceApi) -> UpgradeStudioResponse:
    """
    Upgrade Agent Studio running in runtime mode using a job with script in studio-data/scripts.
    Creates a job that runs the upgrade script from the project filesystem.
    """

    try:
        app_dir = "/studio_app"
        app_data_dir = "/home/cdsw/agent-studio"
        os.environ["APP_DIR"] = app_dir
        os.environ["APP_DATA_DIR"] = app_data_dir
        os.environ["AGENT_STUDIO_DEPLOY_MODE"] = "runtime"
        os.environ["IS_COMPOSABLE"] = "true"

        current_app = get_application_by_name(cml, AGENT_STUDIO_SERVICE_APPLICATION_NAME, only_running=True)
        print(f"Creating runtime upgrade job for application: {current_app.name}")
        runtime_upgrade_job_name = f"{AGENT_STUDIO_UPGRADE_JOB_NAME} - Runtime"

        # Always get fresh runtime info for each upgrade
        newest_runtime_identifier = get_newest_runtime_full_identifier(cml)
        script_path = os.path.join(get_studio_subdirectory(), "studio-data", "scripts", "upgrade_runtime.py")

        # Use comma-separated arguments for better parsing
        job_arguments = f"{newest_runtime_identifier},{os.getenv('CDSW_PROJECT_ID')},{current_app.id},{current_app.runtime_identifier}"

        print(f"Job script path: {script_path}")
        print(f"Job arguments: {job_arguments}")

        # Check if job exists and delete it to ensure fresh arguments
        try:
            existing_job = get_job_by_name(cml, runtime_upgrade_job_name)
            if existing_job:
                print(f"Deleting existing job {existing_job.id} to ensure fresh arguments")
                cml.delete_job(project_id=os.getenv("CDSW_PROJECT_ID"), job_id=existing_job.id)
        except:
            pass

        # Always create a fresh job with current arguments
        print(f"Creating runtime upgrade job: {runtime_upgrade_job_name}")
        job = cml.create_job(
            {
                "name": runtime_upgrade_job_name,
                "project_id": os.getenv("CDSW_PROJECT_ID"),
                "script": script_path,
                "cpu": 2,
                "memory": 8,
                "nvidia_gpu": 0,
                "arguments": job_arguments,
                "runtime_identifier": current_app.runtime_identifier,
            },
            project_id=os.getenv("CDSW_PROJECT_ID"),
        )
        print(f"Runtime upgrade job created: {job.id}")

        print("Starting runtime upgrade job....")
        job_run = cml.create_job_run({}, project_id=os.getenv("CDSW_PROJECT_ID"), job_id=job.id)
        print(f"Runtime upgrade job started. Job run ID: {job_run.id}")
        print("Check the job logs in CML for upgrade progress.")

        return UpgradeStudioResponse()

    except Exception as e:
        raise RuntimeError(f"Failed to create runtime upgrade job: {e}")


def compare_versions(version_a: str, version_b: str) -> int:
    """
    Compare two semantic versions using the same logic as runtime sorting.
    Returns: 1 if version_a > version_b, -1 if version_a < version_b, 0 if equal
    """

    def parse_for_comparison(v):
        m = SEMVER_REGEX.match(v)
        if m:
            major, minor, patch = map(int, m.groups()[:3])

            if "-" in v:
                base_part, pre_release = v.split("-", 1)
                pre_release_num = 0
                try:
                    numbers = re.findall(r"\d+", pre_release)
                    if numbers:
                        pre_release_num = int(numbers[-1])
                except:
                    pre_release_num = 0
                return (major, minor, patch, 0, pre_release_num)
            else:
                return (major, minor, patch, 1, 0)
        return (0, 0, 0, 0, 0)

    parsed_a = parse_for_comparison(version_a)
    parsed_b = parse_for_comparison(version_b)

    if parsed_a > parsed_b:
        return 1
    elif parsed_a < parsed_b:
        return -1
    else:
        return 0


def upgrade_studio(
    request: UpgradeStudioRequest, cml: CMLServiceApi = None, dao: AgentStudioDao = None
) -> UpgradeStudioResponse:
    # Check if we are running in runtime mode
    if os.getenv("AGENT_STUDIO_DEPLOY_MODE") == "runtime":
        try:
            local_version = get_current_runtime_version(cml)
            newest_version = get_newest_runtime_version(cml)

            comparison = compare_versions(newest_version, local_version)
            if comparison <= 0:
                print(f"No upgrade needed. Current: {local_version}, Available: {newest_version}")
                return UpgradeStudioResponse()

            print(f"Upgrading from {local_version} to {newest_version}")
            return upgrade_studio_runtime_mode(cml)
        except Exception as e:
            raise RuntimeError(f"Failed to check versions before upgrade: {e}")

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
    return UpgradeStudioResponse()
