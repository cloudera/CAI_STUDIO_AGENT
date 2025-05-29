import pytest
from unittest.mock import patch, MagicMock
import os

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

from cmlapi import (
    CMLServiceApi,
    Application,
    ListApplicationsResponse,
    CreateApplicationRequest
)

from studio.db.dao import AgentStudioDao
from studio.db.model import DeployedWorkflowInstance
from studio.deployments.types import (
    DeploymentPayload,
    DeploymentStatus,
    DeploymentArtifact,
    DeploymentTargetType,
    WorkflowTargetType,
    WorkflowTargetRequest,
    DeploymentTargetRequest
)

from studio.deployments.applications import (
    cleanup_deployed_workflow_application,
    get_application_name_for_deployed_workflow,
    get_application_for_deployed_workflow,
    create_application_for_deployed_workflow,
    get_application_deep_link
)


@patch("studio.deployments.applications.os.getenv", return_value="test-project-id")
def test_cleanup_deployed_workflow_application_success(mock_getenv):
    cml = MagicMock()
    application = MagicMock()
    application.id = "app-123"

    cleanup_deployed_workflow_application(cml, application)

    cml.delete_application.assert_called_once_with("test-project-id", "app-123")


@patch("studio.deployments.applications.os.getenv", return_value="test-project-id")
def test_cleanup_deployed_workflow_application_exception(mock_getenv, capsys):
    cml = MagicMock()
    application = MagicMock()
    application.id = "app-123"

    cml.delete_application.side_effect = Exception("Network error")

    cleanup_deployed_workflow_application(cml, application)

    captured = capsys.readouterr()
    assert "Failed to clean up workflow application with ID app-123" in captured.out
    
    
def test_get_application_name_for_deployed_workflow():
    deployment = DeployedWorkflowInstance(name="my-deployment")
    result = get_application_name_for_deployed_workflow(deployment)
    assert result == "Workflow: my-deployment"
    
    
@patch("studio.deployments.applications.get_application_name_for_deployed_workflow")
@patch("studio.deployments.applications.os.getenv", return_value="test-project-id")
def test_get_application_for_deployed_workflow(mock_getenv, mock_get_app_name):
    cml = MagicMock()
    deployment = DeployedWorkflowInstance(name="MyDeployment")

    # Match by name
    app = MagicMock(spec=Application)
    app.name = "Workflow: MyDeployment"
    mock_get_app_name.return_value = "Workflow: MyDeployment"
    cml.list_applications.return_value = ListApplicationsResponse(applications=[app])

    result = get_application_for_deployed_workflow(deployment, cml)

    cml.list_applications.assert_called_once_with("test-project-id", page_size=5000)
    assert result == app


@patch("studio.deployments.applications.get_application_name_for_deployed_workflow")
@patch("studio.deployments.applications.os.getenv", return_value="test-project-id")
def test_get_application_for_deployed_workflow_raises_if_not_exactly_one(mock_getenv, mock_get_app_name):
    cml = MagicMock()
    deployment = DeployedWorkflowInstance(name="MyDeployment")

    mock_get_app_name.return_value = "Workflow: MyDeployment"
    app1 = MagicMock(spec=Application)
    app2 = MagicMock(spec=Application)
    cml.list_applications.return_value = ListApplicationsResponse(applications=[app1, app2])  # multiple apps

    with pytest.raises(AssertionError):
        get_application_for_deployed_workflow(deployment, cml)
        

@patch("studio.deployments.applications.cc_utils.get_deployed_workflow_runtime_identifier")
@patch("studio.deployments.applications.cc_utils.get_studio_subdirectory")
@patch("studio.deployments.applications.get_application_name_for_deployed_workflow")
@patch("studio.deployments.applications.os.environ.get", return_value="test-project-id")
def test_create_application_for_deployed_workflow(
    mock_env_get,
    mock_get_app_name,
    mock_get_subdir,
    mock_get_runtime,
):
    # Setup
    cml = MagicMock()
    deployment = DeployedWorkflowInstance(
        id="wf-123",
        name="My Workflow",
        cml_deployed_model_id=None,
        workflow_id="w1",
        deployment_metadata='{"cml_model_id": "model-456"}',
    )

    mock_app = MagicMock(spec=Application)
    cml.create_application.return_value = mock_app
    mock_get_app_name.return_value = "Workflow: My Workflow"
    mock_get_subdir.return_value = "/studio/root"
    mock_get_runtime.return_value = "runtime-abc"

    # Run
    result = create_application_for_deployed_workflow(deployment, bypass_authentication=True, cml=cml)

    # Validate
    assert result == mock_app
    cml.create_application.assert_called_once()
    req: CreateApplicationRequest = cml.create_application.call_args[0][0]
    assert req.name == "Workflow: My Workflow"
    assert req.subdomain == "workflow-wf-123"
    assert req.description == "Workflow UI for workflow My Workflow"
    assert req.script == "/studio/root/startup_scripts/run-app.py"
    assert req.environment["AGENT_STUDIO_RENDER_MODE"] == "workflow"
    assert req.environment["AGENT_STUDIO_DEPLOYED_WORKFLOW_ID"] == "wf-123"
    assert req.environment["AGENT_STUDIO_DEPLOYED_MODEL_ID"] == "model-456"
    assert req.bypass_authentication is True
    assert req.runtime_identifier == "runtime-abc"
    assert cml.create_application.call_args[1]["project_id"] == "test-project-id"
    
    
@patch("studio.deployments.applications.cc_utils.get_deployed_workflow_runtime_identifier")
@patch("studio.deployments.applications.cc_utils.get_studio_subdirectory")
@patch("studio.deployments.applications.get_application_name_for_deployed_workflow")
@patch("studio.deployments.applications.os.environ.get", return_value="test-project-id")
def test_create_application_prefers_deployed_model_id_over_metadata(
    mock_env_get,
    mock_get_app_name,
    mock_get_subdir,
    mock_get_runtime,
):
    cml = MagicMock()
    deployment = DeployedWorkflowInstance(
        id="wf-999",
        name="Workflow With Model ID",
        cml_deployed_model_id="model-direct",
        workflow_id="w2",
        deployment_metadata='{"cml_model_id": "model-from-metadata"}',
    )

    mock_app = MagicMock(spec=Application)
    cml.create_application.return_value = mock_app
    mock_get_app_name.return_value = "Workflow: Workflow With Model ID"
    mock_get_subdir.return_value = "/studio/root"
    mock_get_runtime.return_value = "runtime-xyz"

    result = create_application_for_deployed_workflow(deployment, bypass_authentication=False, cml=cml)

    assert result == mock_app
    req: CreateApplicationRequest = cml.create_application.call_args[0][0]
    assert req.environment["AGENT_STUDIO_DEPLOYED_MODEL_ID"] == "model-direct"
    assert req.bypass_authentication is False
    
    
@patch("studio.deployments.applications.requests.get")
@patch("studio.deployments.applications.os.environ.get")
@patch("studio.deployments.applications.os.getenv")
def test_get_application_deep_link_success(mock_getenv, mock_environ_get, mock_requests_get):
    mock_environ_get.return_value = "fake-api-key"
    mock_getenv.return_value = "https://cml.fake.project"

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [
        {
            "name": "Workflow: MyApp",
            "projectHtmlUrl": "https://cml.fake.project",
            "id": "app-123"
        }
    ]
    mock_requests_get.return_value = mock_response

    link = get_application_deep_link("Workflow: MyApp")
    assert link == "https://cml.fake.project/applications/app-123"
    mock_requests_get.assert_called_once()


@patch("studio.deployments.applications.requests.get")
@patch("studio.deployments.applications.os.environ.get")
@patch("studio.deployments.applications.os.getenv")
def test_get_application_deep_link_http_error(mock_getenv, mock_environ_get, mock_requests_get):
    mock_environ_get.return_value = "fake-api-key"
    mock_getenv.return_value = "https://cml.fake.project"

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"
    mock_requests_get.return_value = mock_response

    with pytest.raises(RuntimeError, match="Failed to list applications: Internal Server Error"):
        get_application_deep_link("Workflow: MyApp")


@patch("studio.deployments.applications.requests.get")
@patch("studio.deployments.applications.os.environ.get")
@patch("studio.deployments.applications.os.getenv")
def test_get_application_deep_link_no_match(mock_getenv, mock_environ_get, mock_requests_get):
    mock_environ_get.return_value = "fake-api-key"
    mock_getenv.return_value = "https://cml.fake.project"

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [
        {"name": "OtherApp", "projectHtmlUrl": "https://cml.fake.project", "id": "app-456"}
    ]
    mock_requests_get.return_value = mock_response

    with pytest.raises(ValueError, match="Could not get application deep link for application named 'Workflow: MyApp'"):
        get_application_deep_link("Workflow: MyApp")


@patch("studio.deployments.applications.requests.get")
@patch("studio.deployments.applications.os.environ.get")
@patch("studio.deployments.applications.os.getenv")
def test_get_application_deep_link_missing_fields(mock_getenv, mock_environ_get, mock_requests_get):
    mock_environ_get.return_value = "fake-api-key"
    mock_getenv.return_value = "https://cml.fake.project"

    # Missing 'id' and 'projectHtmlUrl'
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [{"name": "Workflow: MyApp"}]
    mock_requests_get.return_value = mock_response

    with pytest.raises(ValueError, match="Could not get application deep link for application named 'Workflow: MyApp'"):
        get_application_deep_link("Workflow: MyApp")
        
