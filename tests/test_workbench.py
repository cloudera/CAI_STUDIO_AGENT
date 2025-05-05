import pytest
from unittest.mock import patch, MagicMock
import os

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

from studio.workflow.utils import (
    compare_workbench_versions,
    is_custom_model_root_dir_feature_enabled    
)


class TestCompareWorkbenchVersions:
    def test_compare_workbench_versions(self):
        assert compare_workbench_versions("1.2.3", "1.2.3") == 0
        assert compare_workbench_versions("2.0.0", "1.9.9") == 1
        assert compare_workbench_versions("0.9.9", "1.0.0") == -1
        assert compare_workbench_versions("1.3.0", "1.2.9") == 1
        assert compare_workbench_versions("1.2.0", "1.3.0") == -1
        assert compare_workbench_versions("1.2.5", "1.2.3") == 1
        assert compare_workbench_versions("1.2.2", "1.2.4") == -1
        assert compare_workbench_versions("1.2.3-beta", "1.2.3-alpha") == 0
        assert compare_workbench_versions("1.2.4-beta", "1.2.3-alpha") == 1



@pytest.mark.parametrize("enable_ai_studios, git_sha, expected", [
    # enable_ai_studios = True, version >= 2.0.47 => feature enabled
    (True,  "2.0.47",  True),
    (True,  "2.0.48",  True),
    (True,  "3.1.0",   True),

    # enable_ai_studios = True, version < 2.0.47 => feature disabled
    (True,  "2.0.46",  False),
    (True,  "1.9.9",   False),

    # enable_ai_studios = False => feature disabled regardless of version
    (False, "2.0.47",  False),
    (False, "5.0.0",   False),
])
def test_is_custom_model_root_dir_feature_enabled(enable_ai_studios, git_sha, expected):
    # Patch environment so the code can form the correct URL
    with patch.dict(os.environ, {"CDSW_DOMAIN": "mock-domain.example.com"}, clear=True):
        # Create a mock response for requests.get(...)
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "enable_ai_studios": enable_ai_studios,
            "gitSha": git_sha
        }

        # Patch requests.get so it returns our mock
        with patch("requests.get", return_value=mock_response) as mock_get:
            result = is_custom_model_root_dir_feature_enabled()
            assert result == expected

            # Optionally confirm requests.get was called with the expected URL
            mock_get.assert_called_once_with(
                "https://mock-domain.example.com/sense-bootstrap.json"
            )