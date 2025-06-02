import pytest
import os
from unittest.mock import patch, MagicMock
from studio.deployments.validation import utils as validation_utils
from studio.deployments.types import DeploymentPayload, WorkflowTargetRequest
from studio.db.model import Workflow
from studio.db import model as db_model
from studio.db.dao import AgentStudioDao
from studio.deployments.validation.utils import (
    validate_no_deployment_job_in_progress
)


@patch.dict(os.environ, {"JOB_ARGUMENTS": "some args"})
@patch("studio.deployments.validation.utils.get_deployment_job_for_workflow")
def test_validate_no_deployment_job_skips_when_job_arguments_set(mock_get_job):
    session = MagicMock()
    cml = MagicMock()

    payload = DeploymentPayload(workflow_target=WorkflowTargetRequest(type="workflow", workflow_id="id"))
    validation_utils.validate_no_deployment_job_in_progress(payload, session, cml)
    mock_get_job.assert_not_called()

@patch.dict(os.environ, {}, clear=True)
@patch("studio.deployments.validation.utils.get_deployment_job_for_workflow")
def test_validate_no_deployment_job_in_progress_no_workflow(mock_get_job):
    session = MagicMock()
    cml = MagicMock()

    # Case 1: workflow_target is None
    payload = DeploymentPayload(workflow_target=None)
    validation_utils.validate_no_deployment_job_in_progress(payload, session, cml)

    # Case 2: workflow_id is set, but no workflow is found
    session.query().filter_by().one.return_value = None  # simulate no workflow found
    payload = DeploymentPayload(workflow_target=WorkflowTargetRequest(type="workflow", workflow_id="some-id"))
    validation_utils.validate_no_deployment_job_in_progress(payload, session, cml)



@patch.dict("os.environ", {"CDSW_PROJECT_ID": "123"})
@patch("studio.deployments.validation.utils.get_deployment_job_for_workflow")
def test_validate_no_deployment_job_detects_running_job(mock_get_job):
    # Setup in-memory DB
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    # Use same session for both setup and execution
    with test_dao.get_session() as session:
        # Insert workflow into the DB
        workflow = db_model.Workflow(
            id="workflow1",
            name="Test Workflow",
            directory="/some/dir",
        )
        session.add(workflow)
        session.commit()

        # Mock job and running job runs
        job = MagicMock(id="job_id")
        job_run = MagicMock()
        mock_get_job.return_value = job

        cml = MagicMock()
        cml.list_job_runs.side_effect = [
            MagicMock(job_runs=[]),              # scheduling
            MagicMock(job_runs=[job_run]),       # running — should trigger error
            MagicMock(job_runs=[]),              # stopping
        ]

        payload = DeploymentPayload(
            workflow_target=WorkflowTargetRequest(type="workflow", workflow_id="workflow1")
        )
        
        # This will now raise properly
        with pytest.raises(ValueError, match="workflow 'Test Workflow'"):
            validate_no_deployment_job_in_progress(payload, session, cml)



@patch.dict("os.environ", {"CDSW_PROJECT_ID": "123"})
@patch("studio.deployments.validation.utils.get_deployment_job_for_workflow")
def test_validate_no_deployment_job_detects_running_job_workflow_name(mock_get_job):
    # Setup in-memory DB
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)

    # Use same session for both setup and execution
    with test_dao.get_session() as session:
        # Insert workflow into the DB
        workflow = db_model.Workflow(
            id="workflow1",
            name="Test Workflow",
            directory="/some/dir",
        )
        session.add(workflow)
        session.commit()

        # Mock job and running job runs
        job = MagicMock(id="job_id")
        mock_get_job.return_value = job

        cml = MagicMock()

        payload = DeploymentPayload(
            workflow_target=WorkflowTargetRequest(
                type="workflow", 
                workflow_name="Test Workflow"
            )
        )
        
        validate_no_deployment_job_in_progress(payload, session, cml)


@patch("studio.deployments.validation.utils.validate_no_deployment_job_in_progress")
def test_validate_workflow_target_delegates(mock_validate):
    payload = DeploymentPayload()
    session = MagicMock()
    cml = MagicMock()
    validation_utils.validate_workflow_target(payload, session, cml)
    mock_validate.assert_called_once_with(payload, session, cml)


def test_validate_deployment_target_does_nothing():
    payload = DeploymentPayload()
    session = MagicMock()
    cml = MagicMock()
    assert validation_utils.validate_deployment_target(payload, session, cml) is None


@patch("studio.deployments.validation.utils.validate_workflow_target")
@patch("studio.deployments.validation.utils.validate_deployment_target")
def test_validate_deployment_payload_calls_both(mock_target, mock_workflow):
    payload = DeploymentPayload()
    session = MagicMock()
    cml = MagicMock()
    validation_utils.validate_deployment_payload(payload, session, cml)
    mock_workflow.assert_called_once()
    mock_target.assert_called_once()
