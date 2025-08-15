import os
from unittest.mock import patch, MagicMock


@patch("studio.service.get_dao")
@patch("studio.service.cml_api_check")
@patch("studio.service.rotate_cml_api")
@patch("studio.service.cmlapi.default_client")
def test_agent_studio_app_init_rotates_on_failure(mock_default_client, mock_rotate, mock_check, mock_get_dao):
    # Arrange: simulate API key validation failure then successful rotation
    mock_check.return_value = MagicMock(message="validation failed")
    mock_rotate.return_value = MagicMock(message="")
    mock_get_dao.return_value = MagicMock()
    mock_default_client.return_value = MagicMock()

    # Set required env vars referenced during init
    os.environ["CDSW_PROJECT_ID"] = "proj"
    os.environ["CDSW_ENGINE_ID"] = "eng"
    os.environ["CDSW_MASTER_ID"] = "mst"
    os.environ["CDSW_MASTER_IP"] = "1.2.3.4"
    os.environ["CDSW_DOMAIN"] = "domain"

    from studio.service import AgentStudioApp

    # Act
    app = AgentStudioApp()

    # Assert: default client and dao created, check called, rotate attempted
    assert app.cml is mock_default_client.return_value
    assert app.dao is mock_get_dao.return_value
    mock_check.assert_called_once()
    mock_rotate.assert_called_once()


@patch("studio.service.get_dao")
@patch("studio.service.cml_api_check")
@patch("studio.service.rotate_cml_api")
@patch("studio.service.cmlapi.default_client")
def test_agent_studio_app_init_no_rotation_on_success(mock_default_client, mock_rotate, mock_check, mock_get_dao):
    # Arrange: simulate API key validation success
    mock_check.return_value = MagicMock(message="")
    mock_get_dao.return_value = MagicMock()
    mock_default_client.return_value = MagicMock()

    os.environ["CDSW_PROJECT_ID"] = "proj"
    os.environ["CDSW_ENGINE_ID"] = "eng"
    os.environ["CDSW_MASTER_ID"] = "mst"
    os.environ["CDSW_MASTER_IP"] = "1.2.3.4"
    os.environ["CDSW_DOMAIN"] = "domain"

    from studio.service import AgentStudioApp

    # Act
    app = AgentStudioApp()

    # Assert: rotate not called if check passed
    mock_check.assert_called_once()
    mock_rotate.assert_not_called()
    assert app.project_id == "proj"
