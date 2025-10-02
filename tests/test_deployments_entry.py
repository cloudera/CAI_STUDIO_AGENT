import pytest
from unittest.mock import patch, MagicMock
import os
import base64

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

from cmlapi import CMLServiceApi

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

from studio.deployments.entry import (
    deploy,
    package_workflow_target,
    deploy_artifact,
    main
)



@patch('studio.deployments.entry.get_thread_pool')
@patch('studio.deployments.entry.deploy_artifact')
@patch('studio.deployments.entry.package_workflow_target')
@patch('studio.deployments.entry.initialize_deployment')
def test_deploy_success(mock_initialize, mock_package, mock_deploy_artifact, mock_get_thread_pool):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    payload = MagicMock(spec=DeploymentPayload)
    cml = MagicMock(spec=CMLServiceApi)

    # Setup deployment instance and artifact mock
    deployment = MagicMock(spec=DeployedWorkflowInstance)
    deployment.status = None
    deployment.workflow_id = "test-workflow-id"
    mock_initialize.return_value = deployment
    artifact = MagicMock()
    mock_package.return_value = artifact    
    mock_thread_pool = MagicMock()
    mock_get_thread_pool.return_value = mock_thread_pool

    with test_dao.get_session() as session:
        deploy(payload, session, cml)

        # Assertions for the success path
        mock_initialize.assert_called_once_with(payload, session, cml)
        mock_package.assert_called_once_with(payload, deployment, session, cml)
        mock_deploy_artifact.assert_called_once_with(artifact, payload, deployment, session, cml)
        assert deployment.status == DeploymentStatus.DEPLOYED
        
        mock_get_thread_pool.assert_called_once()
        mock_thread_pool.submit.assert_called_once()
        
        
@patch('studio.deployments.entry.get_thread_pool')
@patch('studio.deployments.entry.update_deployment_metadata')
@patch('studio.deployments.entry.deploy_artifact', side_effect=Exception("boom"))
@patch('studio.deployments.entry.package_workflow_target')
@patch('studio.deployments.entry.initialize_deployment')
def test_deploy_failure(mock_initialize, mock_package, mock_deploy, mock_update_metadata, mock_get_thread_pool):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    payload = MagicMock(spec=DeploymentPayload)
    cml = MagicMock(spec=CMLServiceApi)

    # Setup deployment instance and artifact mock
    deployment = MagicMock(spec=DeployedWorkflowInstance)
    deployment.status = None
    deployment.workflow_id = "test-workflow-id"
    mock_initialize.return_value = deployment
    artifact = MagicMock()
    mock_package.return_value = artifact    
    mock_thread_pool = MagicMock()
    mock_get_thread_pool.return_value = mock_thread_pool

    with test_dao.get_session() as session:
        with pytest.raises(RuntimeError, match="Deployment Failed"):
            deploy(payload, session, cml)

        # Assertions for the failure path
        mock_initialize.assert_called_once_with(payload, session, cml)
        mock_package.assert_called_once_with(payload, deployment, session, cml)
        mock_deploy.assert_called_once()
        assert deployment.status == DeploymentStatus.FAILED
        mock_update_metadata.assert_called_once_with(deployment, {'error': 'boom'})
        
        mock_get_thread_pool.assert_called_once()
        mock_thread_pool.submit.assert_called_once()


@patch('studio.deployments.entry.package_workflow_for_deployment')
def test_package_workflow_target_type_workflow(mock_package):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = DeploymentPayload(
        workflow_target=WorkflowTargetRequest(
            type=WorkflowTargetType.WORKFLOW
        )
    )

    deployment = MagicMock(spec=DeployedWorkflowInstance)
    mock_artifact = MagicMock(spec=DeploymentArtifact)
    mock_package.return_value = mock_artifact

    with test_dao.get_session() as session:
        result = package_workflow_target(payload, deployment, session, cml)

        mock_package.assert_called_once_with(payload, deployment, session, cml)
        assert result == mock_artifact
        assert deployment.status == DeploymentStatus.PACKAGED


def test_package_workflow_target_type_artifact():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = DeploymentPayload(
        workflow_target=WorkflowTargetRequest(
            type=WorkflowTargetType.WORKFLOW_ARTIFACT,
            workflow_artifact_location="/my/project/location"
        )
    )

    deployment = MagicMock(spec=DeployedWorkflowInstance)

    with test_dao.get_session() as session:
        artifact = package_workflow_target(payload, deployment, session, cml)

        assert isinstance(artifact, DeploymentArtifact)
        assert artifact.artifact_path == "/my/project/location"
        assert deployment.status == DeploymentStatus.PACKAGED


def test_package_workflow_target_unsupported_workflow_template():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = DeploymentPayload(
        workflow_target=WorkflowTargetRequest(
            type=WorkflowTargetType.WORKFLOW_TEMPLATE
        )
    )

    deployment = MagicMock(spec=DeployedWorkflowInstance)

    with test_dao.get_session() as session:
        with pytest.raises(ValueError, match='Deployment artifact of type "workflow_template" is not supported'):
            package_workflow_target(payload, deployment, session, cml)

        assert deployment.status == DeploymentStatus.PACKAGING
        
        
@patch("studio.deployments.entry.deploy_artifact_to_workbench")
def test_deploy_artifact_workbench_model(mock_deploy_func):
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = DeploymentPayload(
        deployment_target=DeploymentTargetRequest(
            type=DeploymentTargetType.WORKBENCH_MODEL
        )
    )

    artifact = MagicMock(spec=DeploymentArtifact)
    deployment = MagicMock(spec=DeployedWorkflowInstance)

    with test_dao.get_session() as session:
        deploy_artifact(artifact, payload, deployment, session, cml)

        mock_deploy_func.assert_called_once_with(artifact, payload, deployment, session, cml)
        assert deployment.status == DeploymentStatus.DEPLOYED


def test_deploy_artifact_unsupported_ai_inference():
    test_dao = AgentStudioDao(engine_url="sqlite:///:memory:", echo=False)
    cml = MagicMock(spec=CMLServiceApi)

    payload = DeploymentPayload(
        deployment_target=DeploymentTargetRequest(
            type=DeploymentTargetType.AI_INFERENCE
        )
    )

    artifact = MagicMock(spec=DeploymentArtifact)
    deployment = MagicMock(spec=DeployedWorkflowInstance)

    with test_dao.get_session() as session:
        with pytest.raises(ValueError, match='Deploying to a deployment target type of "ai_inference" is not supported.'):
            deploy_artifact(artifact, payload, deployment, session, cml)

        assert deployment.status == DeploymentStatus.DEPLOYING
        
        
@patch("studio.deployments.entry.deploy")
@patch("studio.deployments.entry.AgentStudioDao")
@patch("studio.deployments.entry.cmlapi.default_client")
@patch("studio.deployments.entry.DeploymentPayload.model_validate")
@patch("studio.deployments.entry.json.loads")
@patch("studio.deployments.entry.base64.b64decode")
def test_main_success(
    mock_b64decode,
    mock_json_loads,
    mock_model_validate,
    mock_cml_client,
    mock_dao_class,
    mock_deploy,
):
    # Setup
    encoded_payload = base64.b64encode(b'{"some": "data"}').decode("utf-8")
    os.environ["AGENT_STUDIO_DEPLOYMENT_PAYLOAD"] = encoded_payload

    dummy_decoded_json = {"some": "data"}
    dummy_payload_obj = MagicMock(spec=DeploymentPayload)

    mock_b64decode.return_value = b'{"some": "data"}'
    mock_json_loads.return_value = dummy_decoded_json
    mock_model_validate.return_value = dummy_payload_obj

    mock_session = MagicMock()
    mock_dao = MagicMock()
    mock_dao.get_session.return_value.__enter__.return_value = mock_session
    mock_dao_class.return_value = mock_dao

    mock_cml = MagicMock()
    mock_cml_client.return_value = mock_cml

    # Execute
    main()

    # Verify
    mock_b64decode.assert_called_once_with(encoded_payload)
    mock_json_loads.assert_called_once_with(b'{"some": "data"}'.decode("utf-8"))
    mock_model_validate.assert_called_once_with(dummy_decoded_json)
    mock_deploy.assert_called_once_with(dummy_payload_obj, mock_session, mock_cml)