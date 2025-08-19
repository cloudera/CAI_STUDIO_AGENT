import os
import json
import tarfile
import tempfile
from unittest.mock import patch, MagicMock, mock_open

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

from engine.types import CollatedInput
from studio.deployments.package import workflows
from studio.db.model import Workflow, DeployedWorkflowInstance
from studio.deployments.types import (
    DeploymentPayload,
    DeploymentConfig,
    DeploymentArtifact,
    DeploymentTargetRequest,
    WorkflowTargetRequest,
    DeploymentTargetType,
    WorkflowTargetType,
)


@patch("studio.deployments.package.workflows.create_collated_input")
@patch("studio.deployments.package.workflows.shutil.copytree")
@patch("studio.deployments.package.workflows.os.makedirs")
@patch("studio.deployments.package.workflows.yaml.dump")
@patch("studio.deployments.package.workflows.json.dump")
@patch("studio.deployments.package.workflows.tarfile.open")
@patch("studio.deployments.package.workflows.os.walk")
@patch("studio.deployments.package.workflows.open", new_callable=mock_open)
def test_package_workflow_for_deployment(
    mock_file_open,
    mock_os_walk,
    mock_tar_open,
    mock_json_dump,
    mock_yaml_dump,
    mock_os_makedirs,
    mock_copytree,
    mock_create_collated_input,
):
    # Setup fake tar context
    mock_tar = MagicMock()
    mock_tar_open.return_value.__enter__.return_value = mock_tar

    # Simulate a directory structure
    mock_os_walk.return_value = [
        ("/tmp/deployment_artifacts/fake-dir", [], ["workflow.yaml", "collated_input.json"]),
    ]


    # Mock return for create_collated_input
    mock_collated_input = MagicMock()
    mock_collated_input.language_models = [MagicMock()]
    mock_collated_input.model_dump.return_value = {"mock": "data"}
    mock_create_collated_input.return_value = mock_collated_input

    # Setup inputs
    workflow = Workflow(id="wf1", name="Test Workflow", directory="my_dir")
    deployment = DeployedWorkflowInstance(id="d1", workflow=workflow)
    payload = DeploymentPayload(
        deployment_target=DeploymentTargetRequest(type=DeploymentTargetType.WORKBENCH_MODEL),
        workflow_target=WorkflowTargetRequest(type=WorkflowTargetType.WORKFLOW),
        deployment_config=DeploymentConfig(generation_config={"temperature": 0.5}),
    )
    session = MagicMock()
    cml = MagicMock()

    artifact = workflows.package_workflow_for_deployment(payload, deployment, session, cml)

    assert isinstance(artifact, DeploymentArtifact)
    assert artifact.artifact_path.endswith("artifact.tar.gz")

    mock_os_makedirs.assert_called()
    mock_copytree.assert_called()
    mock_yaml_dump.assert_called()
    mock_json_dump.assert_called()
    mock_create_collated_input.assert_called_once_with(workflow, session, deployment.created_at)

    added_files = [call[0][0] for call in mock_tar.add.call_args_list]
    assert any("workflow.yaml" in f for f in added_files)
    assert any("collated_input.json" in f for f in added_files)
    assert all("artifact.tar.gz" not in f for f in added_files)
    
    
def test_ignore_studio_data():
    ignore_fn = workflows.studio_data_workflow_ignore_factory("my-workflow-dir")
    ignored = ignore_fn("/some/path/studio-data", {"deployable_workflows", "tool_templates", "temp_files", "other"})
    assert "deployable_workflows" in ignored
    assert "tool_templates" in ignored
    assert "temp_files" in ignored
    assert "other" not in ignored

def test_ignore_workflows():
    ignore_fn = workflows.studio_data_workflow_ignore_factory("my-workflow-dir")
    ignored = ignore_fn("/some/path/workflows", {"my-workflow-dir", "other-workflow"})
    assert "other-workflow" in ignored
    assert "my-workflow-dir" not in ignored

def test_ignore_other_directory():
    ignore_fn = workflows.studio_data_workflow_ignore_factory("my-workflow-dir")
    ignored = ignore_fn("/some/other/dir", {".venv", ".next", "node_modules", "README.md"})
    assert ".venv" in ignored
    assert ".next" in ignored
    assert "node_modules" in ignored
    assert "README.md" not in ignored
    
    
@patch("studio.deployments.package.workflows.create_collated_input")
@patch("studio.deployments.package.workflows.studio_data_workflow_ignore_factory")
@patch("studio.deployments.package.workflows.shutil.copytree")
@patch("studio.deployments.package.workflows.os.walk")
@patch("studio.deployments.package.workflows.tarfile.open")
@patch("studio.deployments.package.workflows.yaml.dump")
@patch("studio.deployments.package.workflows.open", create=True)
@patch("studio.deployments.package.workflows.uuid4")
def test_package_workflow_skips_self_archive(
    mock_uuid4,
    mock_open,
    mock_yaml_dump,
    mock_tarfile_open,
    mock_os_walk,
    mock_copytree,
    mock_ignore_factory,
    mock_create_collated_input,
):
    # Patch uuid4 to return a predictable value
    mock_uuid4.return_value = "some-uuid"

    packaging_dir = "/tmp/deployment_artifacts/some-uuid"
    archive_path = os.path.join(packaging_dir, "artifact.tar.gz")

    # Simulate os.walk returning the archive file itself
    mock_os_walk.return_value = [
        (packaging_dir, [], ["artifact.tar.gz", "some_other_file.txt"])
    ]

    # Patch tarfile object
    mock_tar = MagicMock()
    mock_tarfile_open.return_value.__enter__.return_value = mock_tar

    # Collated input
    mock_collated_input = MagicMock(spec=CollatedInput)
    mock_collated_input.language_models = []
    mock_collated_input.model_dump.return_value = {}
    mock_create_collated_input.return_value = mock_collated_input

    # Payload and deployment
    payload = DeploymentPayload(deployment_config=DeploymentConfig())
    deployment = MagicMock(spec=DeployedWorkflowInstance)
    deployment.workflow = MagicMock(spec=Workflow)
    deployment.workflow.directory = "my_workflow"

    mock_ignore_factory.return_value = lambda *_: set()

    # Call function under test
    artifact = workflows.package_workflow_for_deployment(payload, deployment, MagicMock(), MagicMock())

    # Confirm the archive itself was skipped
    added_files = [call.args[0] for call in mock_tar.add.call_args_list]
    assert archive_path not in added_files
    assert os.path.join(packaging_dir, "some_other_file.txt") in added_files