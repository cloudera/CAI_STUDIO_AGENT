import pytest
from studio.tools.utils import extract_user_params_from_code

def test_extract_user_params_basic():
    """Test basic parameter extraction"""
    code = """
class UserParameters(BaseModel):
    param1: str
    param2: int
    """
    params = extract_user_params_from_code(code)
    expected = {
        "param1": {"required": True},
        "param2": {"required": True}
    }
    assert params == expected

def test_extract_user_params_with_optional():
    """Test extraction with Optional parameters"""
    code = """
from typing import Optional

class UserParameters(BaseModel):
    param1: str
    param2: Optional[str]
    param3: Optional[int]
    """
    params = extract_user_params_from_code(code)
    expected = {
        "param1": {"required": True},
        "param2": {"required": False},
        "param3": {"required": False}
    }
    assert params == expected

def test_extract_user_params_with_defaults():
    """Test extraction with default values"""
    code = """
class UserParameters(BaseModel):
    param1: str = "default"
    param2: int = 42
    param3: str
    """
    params = extract_user_params_from_code(code)
    expected = {
        "param1": {"required": False},
        "param2": {"required": False},
        "param3": {"required": True}
    }
    assert params == expected

def test_extract_user_params_empty_class():
    """Test extraction with empty UserParameters class"""
    code = """
class UserParameters(BaseModel):
    pass
    """
    params = extract_user_params_from_code(code)
    assert params == {}

def test_extract_user_params_no_class():
    """Test extraction when UserParameters class is not present"""
    code = """
def some_function():
    pass
    """
    params = extract_user_params_from_code(code)
    assert params == {}

def test_extract_user_params_syntax_error():
    """Test handling of syntax errors in code"""
    code = """
class UserParameters(BaseModel:  # Missing parenthesis
    param1: str
    """
    with pytest.raises(ValueError) as exc_info:
        extract_user_params_from_code(code)
    assert "Error parsing Python code" in str(exc_info.value)

def test_extract_user_params_complex_types():
    """Test extraction with complex parameter types"""
    code = """
from typing import List, Dict, Optional

class UserParameters(BaseModel):
    param1: List[str]
    param2: Dict[str, int]
    param3: Optional[List[str]] = []
    """
    params = extract_user_params_from_code(code)
    expected = {
        "param1": {"required": True},
        "param2": {"required": True},
        "param3": {"required": False}
    }
    assert params == expected

def test_extract_user_params_mixed_types():
    """Test extraction with a mix of required, optional and default values"""
    code = """
from typing import Optional

class UserParameters(BaseModel):
    required_param: str
    optional_param: Optional[int]
    default_param: str = "default"
    optional_with_default: Optional[str] = None
    """
    params = extract_user_params_from_code(code)
    expected = {
        "required_param": {"required": True},
        "optional_param": {"required": False},
        "default_param": {"required": False},
        "optional_with_default": {"required": False}
    }
    assert params == expected 