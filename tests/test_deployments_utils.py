import pytest
from unittest.mock import patch, MagicMock
import os
import json 


__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

from cmlapi import CMLServiceApi

from studio.db.dao import AgentStudioDao
from studio.db.model import DeployedWorkflowInstance, Workflow
from studio.deployments.types import (
    DeploymentPayload,
    DeploymentStatus,
    DeploymentArtifact,
    DeploymentTargetType,
    WorkflowTargetType,
    WorkflowTargetRequest,
    DeploymentTargetRequest
)

from studio.deployments.utils import (
    initialize_deployment,
    get_deployment_job_name,
    get_deployment_job_for_workflow,
    get_or_create_deployment,
    get_or_create_workflow,
    create_new_deployed_workflow_instance,
    create_new_workflow,
    update_deployment_metadata,
    set_deployment_metadata,
    copy_workflow_engine
)


@patch("studio.deployments.utils.get_or_create_deployment")
@patch("studio.deployments.utils.get_or_create_workflow")
def test_initialize_deployment_creates_metadata(mock_get_workflow, mock_get_deployment):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = MagicMock(spec=DeploymentPayload)
    workflow = MagicMock(spec=Workflow)
    mock_get_workflow.return_value = workflow

    deployment = MagicMock(spec=DeployedWorkflowInstance)
    deployment.deployment_metadata = None  # simulate missing metadata
    mock_get_deployment.return_value = deployment

    with test_dao.get_session() as session:
        result = initialize_deployment(payload, session, cml)

        mock_get_workflow.assert_called_once_with(payload, session, cml)
        mock_get_deployment.assert_called_once_with(workflow, payload, session, cml)
        assert result.status == DeploymentStatus.INITIALIZED
        assert result.is_stale is False
        assert result.deployment_metadata == "{}"


@patch("studio.deployments.utils.get_or_create_deployment")
@patch("studio.deployments.utils.get_or_create_workflow")
def test_initialize_deployment_metadata_already_exists(mock_get_workflow, mock_get_deployment):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = MagicMock(spec=DeploymentPayload)
    workflow = MagicMock(spec=Workflow)
    mock_get_workflow.return_value = workflow

    deployment = MagicMock(spec=DeployedWorkflowInstance)
    deployment.deployment_metadata = '{"existing": "true"}'
    mock_get_deployment.return_value = deployment

    with test_dao.get_session() as session:
        result = initialize_deployment(payload, session, cml)

        mock_get_workflow.assert_called_once()
        mock_get_deployment.assert_called_once()
        assert result.deployment_metadata == '{"existing": "true"}'
        assert result.status == DeploymentStatus.INITIALIZED
        assert result.is_stale is False
        
        
def make_payload_with_target(**kwargs) -> DeploymentPayload:
    return DeploymentPayload(
        deployment_target=DeploymentTargetRequest(type=DeploymentTargetType.WORKBENCH_MODEL, **kwargs)
    )


@patch("studio.deployments.utils.create_new_deployed_workflow_instance")
def test_create_new_deployment_if_none_matches(mock_create_new):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = make_payload_with_target()
    workflow = Workflow(id="w1", name="My Workflow")
    workflow.deployed_workflow_instances = []

    # Use a real mapped instance, not a MagicMock
    real_deployment = DeployedWorkflowInstance(
        id="new-deployment",
        name="Generated Deployment",
        type=payload.deployment_target.type,
        workflow_id=workflow.id,
    )
    mock_create_new.return_value = real_deployment

    with test_dao.get_session() as session:
        session.add(workflow)
        session.commit()

        result = get_or_create_deployment(workflow, payload, session, cml)

        mock_create_new.assert_called_once_with(payload, workflow, cml)
        assert result.id == "new-deployment"
        assert result.name == "Generated Deployment"


def test_get_deployment_by_instance_id():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    workflow = Workflow(id="w1", name="Test")
    deployment = DeployedWorkflowInstance(id="d1", name="Instance 1", type="workbench_model", workflow_id="w1")
    workflow.deployed_workflow_instances = [deployment]

    payload = make_payload_with_target(deployment_instance_id="d1")

    with test_dao.get_session() as session:
        session.add(workflow)
        session.add(deployment)
        session.commit()

        result = get_or_create_deployment(workflow, payload, session, cml)
        assert result.id == "d1"


def test_get_deployment_by_instance_name():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    workflow = Workflow(id="w1", name="Test")
    deployment = DeployedWorkflowInstance(id="d2", name="Special Name", type="workbench_model", workflow_id="w1")
    workflow.deployed_workflow_instances = [deployment]

    payload = make_payload_with_target(deployment_instance_name="Special Name")

    with test_dao.get_session() as session:
        session.add(workflow)
        session.add(deployment)
        session.commit()

        result = get_or_create_deployment(workflow, payload, session, cml)
        assert result.name == "Special Name"


def test_get_auto_redeploy_deployment_when_one_exists():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = make_payload_with_target(auto_redeploy_to_type=True)

    deployment = DeployedWorkflowInstance(
        id="d3", name="Auto Redeploy", type="workbench_model", workflow_id="w1"
    )
    workflow = Workflow(id="w1", name="Test")
    workflow.deployed_workflow_instances = [deployment]

    with test_dao.get_session() as session:
        session.add(workflow)
        session.add(deployment)
        session.commit()

        result = get_or_create_deployment(workflow, payload, session, cml)
        assert result.id == "d3"


def test_auto_redeploy_fails_with_multiple_matches():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = make_payload_with_target(auto_redeploy_to_type=True)

    d1 = DeployedWorkflowInstance(id="d1", name="Match1", type="workbench_model", workflow_id="w1")
    d2 = DeployedWorkflowInstance(id="d2", name="Match2", type="workbench_model", workflow_id="w1")
    workflow = Workflow(id="w1", name="Multi")
    workflow.deployed_workflow_instances = [d1, d2]

    with test_dao.get_session() as session:
        session.add_all([workflow, d1, d2])
        session.commit()

        with pytest.raises(AssertionError):
            get_or_create_deployment(workflow, payload, session, cml)
            
            
def make_payload(workflow_id=None, workflow_name=None) -> DeploymentPayload:
    return DeploymentPayload(
        workflow_target=WorkflowTargetRequest(
            type=WorkflowTargetType.WORKFLOW,
            workflow_id=workflow_id,
            workflow_name=workflow_name,
        )
    )


def test_get_or_create_workflow_by_id():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    wf = Workflow(id="w123", name="Test Workflow")
    payload = make_payload(workflow_id="w123")

    with test_dao.get_session() as session:
        session.add(wf)
        session.commit()

        result = get_or_create_workflow(payload, session, cml)

        assert result.id == "w123"
        assert result.name == "Test Workflow"


def test_get_or_create_workflow_by_name_found():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    wf = Workflow(id="wf-abc", name="My Workflow")
    payload = make_payload(workflow_name="My Workflow")

    with test_dao.get_session() as session:
        session.add(wf)
        session.commit()

        result = get_or_create_workflow(payload, session, cml)

        assert result.name == "My Workflow"


@patch("studio.deployments.utils.create_new_workflow")
def test_get_or_create_workflow_by_name_creates(mock_create):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = make_payload(workflow_name="New Workflow")
    new_workflow = Workflow(id="w999", name="New Workflow")
    mock_create.return_value = new_workflow

    with test_dao.get_session() as session:
        result = get_or_create_workflow(payload, session, cml)

        mock_create.assert_called_once_with(payload, cml)
        assert result.name == "New Workflow"


def test_get_or_create_workflow_missing_both_id_and_name_raises():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = DeploymentPayload(workflow_target=WorkflowTargetRequest(type=WorkflowTargetType.WORKFLOW))

    with test_dao.get_session() as session:
        with pytest.raises(ValueError, match="Either workflow_id or workflow_name required"):
            get_or_create_workflow(payload, session, cml)
            
            
def test_set_deployment_metadata():
    deployment = DeployedWorkflowInstance(id="d1", name="test", workflow_id="w1")
    metadata = {"foo": "bar"}

    set_deployment_metadata(deployment, metadata)

    assert json.loads(deployment.deployment_metadata) == {"foo": "bar"}


def test_update_deployment_metadata_merges_into_empty():
    deployment = DeployedWorkflowInstance(id="d1", name="test", workflow_id="w1")
    update_deployment_metadata(deployment, {"a": 1})

    assert json.loads(deployment.deployment_metadata) == {"a": 1}


def test_update_deployment_metadata_merges_into_existing():
    deployment = DeployedWorkflowInstance(id="d1", name="test", workflow_id="w1")
    deployment.deployment_metadata = json.dumps({"a": 1})
    
    update_deployment_metadata(deployment, {"b": 2, "a": 42})

    # existing key should be updated, new one added
    assert json.loads(deployment.deployment_metadata) == {"a": 42, "b": 2}
    
    
def test_create_new_deployed_workflow_instance():
    payload = DeploymentPayload(
        deployment_target=DeploymentTargetRequest(type=DeploymentTargetType.WORKBENCH_MODEL)
    )
    workflow = Workflow(id="w123", name="Example")
    cml = CMLServiceApi()  # mocked CML client if needed

    instance = create_new_deployed_workflow_instance(payload, workflow, cml)

    assert instance.workflow == workflow
    assert instance.type == DeploymentTargetType.WORKBENCH_MODEL
    assert instance.name.startswith("Example_")
    assert instance.id  # should be a non-empty UUID string


def test_create_new_workflow():
    payload = DeploymentPayload(
        workflow_target=WorkflowTargetRequest(type="workflow", workflow_name="NewFlow")
    )
    cml = CMLServiceApi()  # mocked CML client if needed

    result = create_new_workflow(payload, cml)

    assert result.name == "NewFlow"
    assert result.id  # should be a non-empty UUID string
    
    
def test_get_deployment_job_name():
    workflow = Workflow(id="abc123", name="Test Flow")
    result = get_deployment_job_name(workflow)
    assert result == "Agent Studio - Deploy Workflow: abc123"
    

@patch("studio.deployments.utils.get_job_by_name")
def test_get_existing_deployment_job(mock_get_job):
    workflow = Workflow(id="w123", name="My Workflow")
    cml = MagicMock(spec=CMLServiceApi)

    mock_job = MagicMock()
    mock_get_job.return_value = mock_job

    result = get_deployment_job_for_workflow(workflow, cml)
    assert result == mock_job
    mock_get_job.assert_called_once()


@patch("studio.deployments.utils.get_deployed_workflow_runtime_identifier")
@patch("studio.deployments.utils.get_studio_subdirectory")
@patch("studio.deployments.utils.get_job_by_name", return_value=None)
@patch("studio.deployments.utils.os.getenv", return_value="test-project-id")
def test_create_deployment_job_if_missing(mock_getenv, mock_get_job, mock_get_subdir, mock_get_runtime):
    workflow = Workflow(id="w456", name="New Flow")
    cml = MagicMock(spec=CMLServiceApi)

    mock_job = MagicMock()
    cml.create_job.return_value = mock_job
    mock_get_subdir.return_value = "/studio/root"
    mock_get_runtime.return_value = "runtime-123"

    result = get_deployment_job_for_workflow(workflow, cml)

    assert result == mock_job
    cml.create_job.assert_called_once()
    args, kwargs = cml.create_job.call_args
    assert args[0]["name"] == "Agent Studio - Deploy Workflow: w456"
    assert args[0]["script"] == "/studio/root/studio/jobs/deploy.py"
    assert args[0]["runtime_identifier"] == "runtime-123"
    assert args[0]["cpu"] == 2
    assert args[0]["memory"] == 4
    assert kwargs["project_id"] == "test-project-id"
    
    
    
@patch("studio.deployments.utils.shutil.copytree")
def test_copy_workflow_engine(mock_copytree):
    target_dir = "/tmp/my_workflow_engine_copy"
    copy_workflow_engine(target_dir)

    # Ensure copytree is called with the right base directory and ignore function
    mock_copytree.assert_called_once()
    args, kwargs = mock_copytree.call_args

    # Validate arguments
    app_dir = os.getenv("APP_DIR")
    assert app_dir is not None, "APP_DIR environment variable must be set"
    assert args[0] == os.path.join(app_dir, "studio", "workflow_engine")
    assert args[1] == target_dir
    assert kwargs["dirs_exist_ok"] is True

    # Validate the ignore function
    ignore_func = kwargs["ignore"]
    ignored = ignore_func("some/path", ["__pycache__", "main.py", ".venv", ".ruff_cache"])
    assert ignored == {".venv", ".ruff_cache", "__pycache__"}