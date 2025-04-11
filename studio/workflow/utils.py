# No top level studio.db imports allowed to support wokrflow model deployment

from typing import List
import sys
import os
import requests
from crewai import Crew
from crewai.utilities.events import crewai_event_bus

from studio.cross_cutting import utils as cc_utils
from studio import consts

# Import engine code manually. Eventually when this code becomes
# a separate git repo, or a custom runtime image, this path call
# will go away and workflow engine features will be available already.
import sys

sys.path.append("studio/workflow_engine/src/")

from engine.crewai.events import OpsServerMessageQueueEventListener


#  Compare two different versions of Cloudera AI Workbench. Workbench
#  gitShas follow semantic versioning, and this verion checker
#  only checks out to the patch version (i.e., '2.0.47' and '2.0.47-b450'
#  will evalute to being equal).
#
#  if verion a is greater than version b, returns 1.
#  if version a is less than b, returns 0.
#  returns 0 if both versions evaluate to the same patch version.
def compare_workbench_versions(a: str, b: str) -> int:
    # Split on the dash and take the first part
    sanitized_a = a.split("-")[0]
    sanitized_b = b.split("-")[0]

    # Extract numeric parts
    a_major, a_minor, a_patch = map(int, sanitized_a.split("."))
    b_major, b_minor, b_patch = map(int, sanitized_b.split("."))

    # Compare major
    if a_major > b_major:
        return 1
    if a_major < b_major:
        return -1

    # Compare minor
    if a_minor > b_minor:
        return 1
    if a_minor < b_minor:
        return -1

    # Compare patch
    if a_patch > b_patch:
        return 1
    if a_patch < b_patch:
        return -1

    # Versions are the same
    return 0


def is_custom_model_root_dir_feature_enabled() -> bool:
    """
    Currently custom model root dirs for Workbench models are hidden behind
    the ML_ENABLE_COMPOSABLE_AMPS entitlement, which can be checked with
    unauthenticated access at our /sense-bootstrap.json endpoint.
    """

    # Grab the bootstrap data
    bootstrap_data: dict = requests.get(f"https://{os.getenv('CDSW_DOMAIN')}/sense-bootstrap.json").json()

    # Return the result of the entitlement we are looking for
    # and default this to false (for older workbenches). "enable_ai_studios"
    # is translated upstream from ML_ENABLE_COMPOSABLE_AMPS, which is the
    # entitlement that blocks the model root dir feature.
    composable_amp_entitlement_enabled = bootstrap_data.get("enable_ai_studios", False)
    workbench_gteq_2_0_47 = compare_workbench_versions(bootstrap_data.get("gitSha", "0.0.0"), "2.0.47") >= 0

    return composable_amp_entitlement_enabled and workbench_gteq_2_0_47


def get_fresh_workflow_directory(workflow_name: str) -> str:
    return f"{consts.WORKFLOWS_LOCATION}/{cc_utils.create_slug_from_name(workflow_name)}_{cc_utils.get_random_compact_string()}"


def invalidate_workflow(preexisting_db_session, condition) -> None:
    """
    Move dependent workflows to draft mode and mark any dependent deployed workflows as stale.
    """
    from studio.db import model as db_model, DbSession

    session: DbSession = preexisting_db_session

    dependent_workflows = session.query(db_model.Workflow).filter(condition).all()
    for workflow in dependent_workflows:
        workflow.is_draft = True
        deployed_workflows: List[db_model.DeployedWorkflowInstance] = (
            session.query(db_model.DeployedWorkflowInstance).filter_by(workflow_id=workflow.id).all()
        )
        for deployed_workflow in deployed_workflows:
            deployed_workflow.is_stale = True
    return


def run_workflow_with_context(crew: Crew, inputs, trace_id):
    with crewai_event_bus.scoped_handlers():
        # Create our message broker
        print("Creating event listener....")
        listener = OpsServerMessageQueueEventListener(trace_id)

        print(f"Running workflow {crew.name} with context")
        return crew.kickoff(inputs=inputs)
