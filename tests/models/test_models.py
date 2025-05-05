__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

import pytest
from unittest.mock import Mock, patch
from studio.models.models import add_model
from studio.api import AddModelRequest

def test_add_model_api_key_failure():
    # Mock dependencies
    mock_dao = Mock()
    mock_cml = Mock()
    
    # Mock the API key storage to fail
    with patch('studio.models.models.update_model_api_key_in_env') as mock_update_key:
        mock_update_key.side_effect = Exception("Failed to store key")
        
        # Attempt to add model with API key
        with pytest.raises(ValueError) as exc_info:
            add_model(
                AddModelRequest(
                    model_name="test_model",
                    provider_model="test_provider",
                    model_type="test_type",
                    api_key="test_key"
                ),
                cml=mock_cml,
                dao=mock_dao
            )
        
        assert "Failed to store API key" in str(exc_info.value)
        # Verify DB session was never created
        mock_dao.get_session.assert_not_called()

def test_add_model_duplicate_name_cleanup():
    # Mock dependencies
    mock_dao = Mock()
    mock_cml = Mock()
    mock_session = Mock()

    # Mock session context manager
    mock_session_ctx = Mock()
    mock_session_ctx.__enter__ = Mock(return_value=mock_session)
    mock_session_ctx.__exit__ = Mock(return_value=None)
    mock_dao.get_session.return_value = mock_session_ctx

    # Mock session to simulate duplicate name
    mock_session.query().filter_by().first.return_value = True
    
    # Mock successful API key storage
    with patch('studio.models.models.update_model_api_key_in_env') as mock_update_key, \
         patch('studio.models.models.remove_model_api_key_from_env') as mock_remove_key:
        
        # Attempt to add model with duplicate name
        with pytest.raises(ValueError) as exc_info:
            add_model(
                AddModelRequest(
                    model_name="test_model",
                    provider_model="test_provider",
                    model_type="test_type",
                    api_key="test_key"
                ),
                cml=mock_cml,
                dao=mock_dao
            )
        
        assert "already exists" in str(exc_info.value)
        # Verify API key was cleaned up
        mock_remove_key.assert_called_once() 