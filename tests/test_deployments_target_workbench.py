import pytest
from unittest.mock import patch, MagicMock
import os
import json

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

from sqlalchemy.orm.session import Session

import cmlapi

from studio.db.model import (
    Workflow,
    DeployedWorkflowInstance
)
from studio.deployments.types import (
    DeploymentArtifact,    
    DeploymentPayload,
    DeploymentTargetRequest,
    DeploymentConfig,
    WorkbenchDeploymentResourceProfile
)

from studio.deployments.targets.workbench import (
    get_workbench_model_config,
    prepare_env_vars_for_workbench,
    create_new_cml_model,
    deploy_artifact_to_workbench,
    monitor_workbench_deployment_for_completion,
    get_workbench_model_deep_link
)


@patch("studio.deployments.targets.workbench.get_studio_subdirectory", return_value="studio_subdir")
@patch("studio.deployments.targets.workbench.is_custom_model_root_dir_feature_enabled", return_value=True)
def test_get_workbench_model_config_custom_enabled(mock_custom_enabled, mock_get_subdir):
    artifact = DeploymentArtifact(project_location="/tmp/deployment_artifacts/fake-artifact.tar.gz")
    result = get_workbench_model_config("my_workflow", artifact)
    assert result == {
        "model_root_dir": os.path.join("studio_subdir", "my_workflow"),
        "model_file_path": "src/engine/entry/workbench.py",
        "workflow_artifact_location": "/home/cdsw/fake-artifact.tar.gz",
        "model_execution_dir": "/home/cdsw",
    }

@patch("studio.deployments.targets.workbench.get_studio_subdirectory", return_value="studio_subdir")
@patch("studio.deployments.targets.workbench.is_custom_model_root_dir_feature_enabled", return_value=False)
def test_get_workbench_model_config_custom_disabled(mock_custom_enabled, mock_get_subdir):
    artifact = DeploymentArtifact(project_location="/tmp/deployment_artifacts/fake-artifact.tar.gz")
    result = get_workbench_model_config("my_workflow", artifact)
    assert result == {
        "model_root_dir": None,
        "model_file_path": os.path.join("studio_subdir", "my_workflow", "src/engine/entry/workbench.py"),
        "workflow_artifact_location": os.path.join("/home/cdsw", "studio_subdir", "my_workflow", "fake-artifact.tar.gz"),
        "model_execution_dir": os.path.join("/home/cdsw", "studio_subdir", "my_workflow"),
    }
    
    
class DummyDeploymentConfig:
    def __init__(self):
        self.environment = {"CUSTOM_ENV_VAR": "value"}
    def model_dump(self):
        return {"example_config": True}

class DummyPayload:
    def __init__(self):
        self.deployment_config = DummyDeploymentConfig()

artifact = DeploymentArtifact(project_location="/tmp/deployment_artifacts/fake-artifact.tar.gz")
payload = DummyPayload()
deployment = MagicMock(spec=DeployedWorkflowInstance)
session = MagicMock(spec=Session)

@patch("studio.deployments.targets.workbench.os.getenv", return_value="fake-project-id")
@patch("studio.deployments.targets.workbench.get_ops_endpoint", return_value="https://ops.endpoint")
@patch("studio.deployments.targets.workbench.get_workbench_model_config")
@patch("studio.deployments.targets.workbench.validate_api_key", return_value=True)
@patch("studio.deployments.targets.workbench.get_api_key_from_env", return_value=("key_id", "key_value"))
def test_prepare_env_vars_for_workbench_success(mock_get_api_key, mock_validate, mock_get_config, mock_get_ops, mock_getenv):
    mock_get_config.return_value = {
        "workflow_artifact_location": "/home/cdsw/fake-artifact.tar.gz",
        "model_execution_dir": "/home/cdsw/exec",
    }

    result = prepare_env_vars_for_workbench(
        cml=MagicMock(),
        deployable_workflow_dir="workflow_dir",
        artifact=artifact,
        payload=payload,
        deployment=deployment,
        session=session,
    )

    expected = {
        "AGENT_STUDIO_OPS_ENDPOINT": "https://ops.endpoint",
        "AGENT_STUDIO_WORKFLOW_ARTIFACT": "/home/cdsw/fake-artifact.tar.gz",
        "AGENT_STUDIO_WORKFLOW_DEPLOYMENT_CONFIG": '{"example_config": true}',
        "AGENT_STUDIO_MODEL_EXECUTION_DIR": "/home/cdsw/exec",
        "CDSW_APIV2_KEY": "key_value",
        "CDSW_PROJECT_ID": "fake-project-id",
        "CUSTOM_ENV_VAR": "value",
    }

    assert result == expected
    
    
@patch("studio.deployments.targets.workbench.get_api_key_from_env", return_value=(None, None))
def test_prepare_env_vars_missing_api_key(mock_get_api_key):
    cml = MagicMock()
    artifact = DeploymentArtifact(project_location="/tmp/fake.tar.gz")
    payload = DummyPayload()
    deployment = MagicMock()
    session = MagicMock()

    with pytest.raises(RuntimeError, match="CML API v2 key not found"):
        prepare_env_vars_for_workbench(cml, "workflow_dir", artifact, payload, deployment, session)


@patch("studio.deployments.targets.workbench.get_api_key_from_env", return_value=("key_id", "key_value"))
@patch("studio.deployments.targets.workbench.validate_api_key", return_value=False)
def test_prepare_env_vars_invalid_api_key(mock_validate, mock_get_api_key):
    cml = MagicMock()
    artifact = DeploymentArtifact(project_location="/tmp/fake.tar.gz")
    payload = DummyPayload()
    deployment = MagicMock()
    session = MagicMock()

    with pytest.raises(RuntimeError, match="CML API v2 key validation has failed"):
        prepare_env_vars_for_workbench(cml, "workflow_dir", artifact, payload, deployment, session)
        
        
@patch("studio.deployments.targets.workbench.get_cml_project_number_and_id", return_value=("1234", "project-id"))
def test_create_new_cml_model_success(mock_get_project_id):
    deployment = DeployedWorkflowInstance(name="SuperCoolWorkflowNameWithUID12345678")
    cml = MagicMock()

    mock_create_response = MagicMock()
    mock_create_response.id = "mock-model-id"
    cml.create_model.return_value = mock_create_response

    model_id = create_new_cml_model(deployment, cml)

    expected_name = "SuperCoolWorkflowNameW_12345678"  # first 22 and last 8 of name
    cml.create_model.assert_called_once()
    assert model_id == "mock-model-id"
    body = cml.create_model.call_args[0][0]
    assert isinstance(body, cmlapi.CreateModelRequest)
    assert body.name == expected_name
    assert body.disable_authentication is True

@patch("studio.deployments.targets.workbench.get_cml_project_number_and_id", return_value=("1234", "project-id"))
def test_create_new_cml_model_api_exception(mock_get_project_id):
    deployment = DeployedWorkflowInstance(name="MyWorkflow_ABCDEFGH")
    cml = MagicMock()
    
    api_exception = cmlapi.rest.ApiException()
    api_exception.body = "API error occurred"
    cml.create_model.side_effect = api_exception

    with pytest.raises(RuntimeError, match="Failed to create model: API error occurred"):
        create_new_cml_model(deployment, cml)

@patch("studio.deployments.targets.workbench.get_cml_project_number_and_id", return_value=("1234", "project-id"))
def test_create_new_cml_model_generic_exception(mock_get_project_id):
    deployment = DeployedWorkflowInstance(name="MyWorkflow_ABCDEFGH")
    cml = MagicMock()
    cml.create_model.side_effect = ValueError("some unexpected error")

    with pytest.raises(RuntimeError, match="Unexpected error during model creation: some unexpected error"):
        create_new_cml_model(deployment, cml)
        
        
        
@patch.dict(os.environ, {"CDSW_DS_API_URL": "https://cdsw.fake.domain/ds", "CDSW_API_KEY": "test-api-key"})
@patch("studio.deployments.targets.workbench.cc_utils.get_cml_project_number_and_id", return_value=("1234", "proj-id"))
@patch("studio.deployments.targets.workbench.requests.post")
def test_get_workbench_model_deep_link_success(mock_post, mock_get_ids):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [
        {"crn": "crn:models:some/thing/else/model-id-123", "htmlUrl": "https://some-url/model-id-123"},
        {"crn": "crn:models:some/thing/else/model-id-456", "htmlUrl": "https://some-url/model-id-456"},
    ]
    mock_post.return_value = mock_response

    result = get_workbench_model_deep_link("model-id-123")
    assert result == "https://some-url/model-id-123"


@patch.dict(os.environ, {"CDSW_DS_API_URL": "https://cdsw.fake.domain/ds", "CDSW_API_KEY": "test-api-key"})
@patch("studio.deployments.targets.workbench.cc_utils.get_cml_project_number_and_id", return_value=("1234", "proj-id"))
@patch("studio.deployments.targets.workbench.requests.post")
def test_get_workbench_model_deep_link_http_error(mock_post, mock_get_ids):
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"
    mock_post.return_value = mock_response

    with pytest.raises(RuntimeError, match="Failed to list models: Internal Server Error"):
        get_workbench_model_deep_link("any-id")

@patch.dict(os.environ, {"CDSW_DS_API_URL": "https://cdsw.fake.domain/ds", "CDSW_API_KEY": "test-api-key"})
@patch("studio.deployments.targets.workbench.cc_utils.get_cml_project_number_and_id", return_value=("1234", "proj-id"))
@patch("studio.deployments.targets.workbench.requests.post")
def test_get_workbench_model_deep_link_not_found(mock_post, mock_get_ids):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [
        {"crn": "crn:models:some:stuff:model-id-000", "htmlUrl": "https://some-url/model-id-000"},
    ]
    mock_post.return_value = mock_response

    result = get_workbench_model_deep_link("model-id-999")
    assert result == ""
    

@patch("studio.deployments.targets.workbench.monitor_workbench_deployment_for_completion")
@patch("studio.deployments.targets.workbench.get_application_deep_link", return_value="http://deep.link")
@patch("studio.deployments.targets.workbench.create_application_for_deployed_workflow")
@patch("studio.deployments.targets.workbench.update_deployment_metadata")
@patch("studio.deployments.targets.workbench.get_workbench_model_deep_link", return_value="http://model.link")
@patch("studio.deployments.targets.workbench.deploy_cml_model", return_value=("model123", "build123"))
@patch("studio.deployments.targets.workbench.get_workbench_model_config", return_value={
    "model_root_dir": "root",
    "model_file_path": "file.py",
    "workflow_artifact_location": "artifact/path",
    "model_execution_dir": "exec/dir",
})
@patch("studio.deployments.targets.workbench.prepare_env_vars_for_workbench", return_value={"KEY": "VALUE"})
@patch("studio.deployments.targets.workbench.create_new_cml_model", return_value="model123")
@patch("studio.deployments.targets.workbench.copy_workflow_engine")
@patch("studio.deployments.targets.workbench.shutil.copy")
@patch("studio.deployments.targets.workbench.os.makedirs")
@patch("studio.deployments.targets.workbench.shutil.rmtree")
@patch("studio.deployments.targets.workbench.os.path.isdir", return_value=True)
@patch("studio.deployments.targets.workbench.cmlapi.default_client")
@patch("studio.deployments.targets.workbench.cc_utils.get_deployed_workflow_runtime_identifier", return_value="runtime123")
def test_deploy_artifact_to_workbench_success(
    mock_runtime_id,
    mock_default_client,
    mock_isdir,
    mock_rmtree,
    mock_makedirs,
    mock_copy,
    mock_copy_engine,
    mock_create_model,
    mock_prepare_env,
    mock_get_config,
    mock_deploy_model,
    mock_get_link,
    mock_update_meta,
    mock_create_app,
    mock_get_app_link,
    mock_monitor
):
    artifact = DeploymentArtifact(project_location="artifact.tar.gz")
    deployment_target = DeploymentTargetRequest(
        type="workbench_model",
        workbench_resource_profile=WorkbenchDeploymentResourceProfile(cpu=1, mem=1, num_replicas=1),
        deploy_application=True
    )
    payload = DeploymentPayload(
        deployment_target=deployment_target,
        deployment_config=DeploymentConfig()
    )
    deployment = DeployedWorkflowInstance(id="123", name="workflow_name_LONGSTRING", deployment_metadata=json.dumps({}))
    deployment.workflow = MagicMock(name="workflow")
    session = MagicMock(spec=Session)

    deploy_artifact_to_workbench(artifact, payload, deployment, session, MagicMock())

    mock_create_model.assert_called_once()
    mock_prepare_env.assert_called_once()
    mock_deploy_model.assert_called_once()
    mock_monitor.assert_called_once()
    mock_create_app.assert_called_once()
    mock_update_meta.assert_called()


@patch("studio.deployments.targets.workbench.monitor_workbench_deployment_for_completion")
@patch("studio.deployments.targets.workbench.get_application_deep_link", return_value="https://app-link")
@patch("studio.deployments.targets.workbench.create_application_for_deployed_workflow")
@patch("studio.deployments.targets.workbench.update_deployment_metadata")
@patch("studio.deployments.targets.workbench.get_workbench_model_deep_link", return_value="https://some-url/model-id")
@patch("studio.deployments.targets.workbench.deploy_cml_model", return_value=("model-id-123", "build-id-456"))
@patch("studio.deployments.targets.workbench.get_studio_subdirectory", return_value="studio-subdir")
@patch("studio.deployments.targets.workbench.prepare_env_vars_for_workbench", return_value={"key": "value"})
@patch("studio.deployments.targets.workbench.get_workbench_model_config", return_value={
    "model_root_dir": "/root/dir",
    "model_file_path": "src/workbench.py",
    "workflow_artifact_location": "/location/artifact.tar.gz",
    "model_execution_dir": "/exec"
})
@patch("studio.deployments.targets.workbench.shutil.copy", return_value=None)
@patch("studio.deployments.targets.workbench.copy_workflow_engine", return_value=None)
@patch("studio.deployments.targets.workbench.os.makedirs", return_value=None)
@patch("studio.deployments.targets.workbench.shutil.rmtree", return_value=None)
@patch("studio.deployments.targets.workbench.os.path.isdir", return_value=True)
@patch("studio.deployments.targets.workbench.cmlapi.default_client")
@patch("studio.deployments.targets.workbench.cc_utils.get_deployed_workflow_runtime_identifier", return_value="runtime123")
def test_deploy_artifact_to_workbench_success_auto_redeploy(
    mock_runtime_id,
    mock_default_client,
    mock_isdir,
    mock_rmtree,
    mock_makedirs,
    mock_copy_engine,
    mock_copy_artifact,
    mock_model_config,
    mock_env_vars,
    mock_subdir,
    mock_deploy_model,
    mock_deep_link,
    mock_update_metadata,
    mock_create_app,
    mock_get_app_link,
    mock_monitor,
):
    artifact = DeploymentArtifact(project_location="artifact.tar.gz")
    
    mock_create_app.return_value = MagicMock(id="app-123", name="Agent Studio")

    deployment_target = DeploymentTargetRequest(
        type="workbench_model",
        workbench_resource_profile=WorkbenchDeploymentResourceProfile(cpu=1, mem=1, num_replicas=1),
        deploy_application=False,
        auto_redeploy_to_type=True  # trigger the path!
    )

    payload = DeploymentPayload(
        deployment_target=deployment_target,
        deployment_config=DeploymentConfig()
    )

    deployment_metadata = json.dumps({"cml_model_id": "existing-model-id"})
    deployment = DeployedWorkflowInstance(id="deploy-123", name="workflow_abcdefgh", deployment_metadata=deployment_metadata)
    deployment.workflow = MagicMock(name="workflow")
    session = MagicMock()

    deploy_artifact_to_workbench(artifact, payload, deployment, session, MagicMock())

    # Assert that auto-redeploy skipped model creation
    mock_deploy_model.assert_called_once()
    mock_update_metadata.assert_called()
    mock_copy_engine.assert_called_once()
    mock_copy_artifact.assert_called_once()
    mock_monitor.assert_called_once()
    

@patch("studio.deployments.targets.workbench.shutil.copy", return_value=None)
@patch("studio.deployments.targets.workbench.os.makedirs")
@patch("studio.deployments.targets.workbench.shutil.rmtree")
@patch("studio.deployments.targets.workbench.os.path.isdir", return_value=False)
@patch("studio.deployments.targets.workbench.cmlapi.default_client")
def test_deploy_artifact_to_workbench_error_handling(
    mock_default_client,
    mock_isdir,
    mock_rmtree,
    mock_makedirs,
    mock_copy
):
    artifact = DeploymentArtifact(project_location="artifact.tar.gz")
    deployment_target = DeploymentTargetRequest(
        type="workbench_model",
        workbench_resource_profile=WorkbenchDeploymentResourceProfile(cpu=1, mem=1, num_replicas=1),
        deploy_application=False
    )
    payload = DeploymentPayload(
        deployment_target=deployment_target,
        deployment_config=DeploymentConfig()
    )
    deployment = DeployedWorkflowInstance(id="123", name="workflow_name", deployment_metadata=json.dumps({}))
    deployment.workflow = MagicMock(name="workflow")
    session = MagicMock(spec=Session)

    with patch("studio.deployments.targets.workbench.copy_workflow_engine", side_effect=Exception("BOOM")):
        with pytest.raises(RuntimeError, match="Unexpected error occurred while deploying workflow: BOOM"):
            deploy_artifact_to_workbench(artifact, payload, deployment, session, MagicMock())


# TODO: fill in when monitoring is done
def test_monitor_workbench_deployment_for_completion():
    monitor_workbench_deployment_for_completion(None, None, None, None)