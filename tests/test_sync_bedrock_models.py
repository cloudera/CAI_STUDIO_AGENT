__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')

from unittest.mock import patch, MagicMock
import pytest
import os
import importlib.util
import sys
import types


def _load_sync_module():
    repo_root = os.environ.get("APP_DIR", os.getcwd())
    module_path = os.path.join(repo_root, "bin", "sync-bedrock-models.py")
    spec = importlib.util.spec_from_file_location("sync_bedrock_models", module_path)
    mod = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    # Register in sys.modules so patch(f"{mod.__name__}....") can resolve it
    sys.modules[spec.name] = mod  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[attr-defined]
    return mod


def _install_bs4_stub():
    # Install a minimal stub so top-level import in the script succeeds
    try:
        # If real bs4 is installed, do nothing
        spec = importlib.util.find_spec('bs4')
        if spec is not None and spec.origin:
            return
    except Exception:
        pass
    if 'bs4' not in sys.modules:
        stub = types.ModuleType('bs4')
        # Provide a placeholder symbol; it won't be used in region test
        setattr(stub, 'BeautifulSoup', object)
        sys.modules['bs4'] = stub


def _has_real_bs4() -> bool:
    try:
        spec = importlib.util.find_spec('bs4')
        if spec is None or not spec.origin:
            return False
        from bs4 import BeautifulSoup as _BS  # type: ignore
        # Try constructing a simple soup to validate API shape
        _BS('<html></html>', 'html.parser')
        return True
    except Exception:
        return False


def _ensure_real_bs4_importable():
    if _has_real_bs4() and 'bs4' in sys.modules and getattr(sys.modules['bs4'], '__file__', None) is None:
        # Remove our stub to allow importing the real package
        del sys.modules['bs4']


def test_extract_region_codes_parses_and_deduplicates():
    _install_bs4_stub()
    mod = _load_sync_module()
    text = "us-east-1, us-west-2 us-west-2  eu-central-1  us-gov-west-1*"
    out = mod.extract_region_codes(text)
    assert out == ["us-east-1", "us-west-2", "eu-central-1", "us-gov-west-1"]


def test_scrape_catalog_success():
    if not _has_real_bs4():
        pytest.skip('beautifulsoup4 not installed')
    _ensure_real_bs4_importable()
    mod = _load_sync_module()
    # Craft minimal HTML table with one model row
    html = """
    <html><body>
      <table>
        <tr><th>Provider</th><th>Model</th><th>Identifier</th><th>Regions</th></tr>
        <tr>
          <td>Anthropic</td>
          <td>Claude 3.5 Sonnet</td>
          <td>us.anthropic.claude-3-5-sonnet-20240620-v1:0</td>
          <td>us-east-1, us-west-2</td>
        </tr>
      </table>
    </body></html>
    """
    resp = MagicMock()
    resp.text = html
    resp.raise_for_status = MagicMock()
    with patch(f"{mod.__name__}.requests.get", return_value=resp) as _mock_get:
        catalog = mod.scrape_catalog()
    assert catalog["source_url"] == mod.AWS_DOCS_URL
    assert isinstance(catalog["last_updated_utc"], str)
    assert len(catalog["models"]) == 1
    m = catalog["models"][0]
    assert m["provider"] == "Anthropic"
    assert m["model_name"] == "Claude 3.5 Sonnet"
    assert m["model_id"].startswith("us.anthropic.claude-3-5-sonnet")
    assert m["regions"] == ["us-east-1", "us-west-2"]
    # Regions union should include both
    assert set(catalog["regions"]) >= {"us-east-1", "us-west-2"}


def test_scrape_catalog_raises_when_table_missing():
    if not _has_real_bs4():
        pytest.skip('beautifulsoup4 not installed')
    _ensure_real_bs4_importable()
    mod = _load_sync_module()
    html = "<html><body><div>No table here</div></body></html>"
    resp = MagicMock()
    resp.text = html
    resp.raise_for_status = MagicMock()
    with patch(f"{mod.__name__}.requests.get", return_value=resp):
        with pytest.raises(RuntimeError):
            mod.scrape_catalog()

