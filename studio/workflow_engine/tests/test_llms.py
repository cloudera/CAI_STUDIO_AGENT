import pytest
from unittest.mock import patch

from engine.crewai.llms import get_crewai_llm
from engine.types import Input__LanguageModel
from engine.consts import SupportedModelTypes


def _make_language_model():
    return Input__LanguageModel(
        model_id="lm-1",
        model_name="Test Model",
        generation_config={"temperature": 0.1, "max_new_tokens": 128},
    )


@patch("engine.crewai.llms.AgentStudioCrewAILLM")
def test_bedrock_does_not_pass_inference_profile_id_kwarg(mock_llm_cls):
    language_model = _make_language_model()
    llm_config_dict = {
        "provider_model": "us.amazon.nova-pro-v1:0",
        "model_type": SupportedModelTypes.BEDROCK.value,
        "aws_region_name": "us-east-1",
        "aws_access_key_id": "test",
        "aws_secret_access_key": "test",
        "aws_session_token": None,
        # Include a deprecated/invalid kwarg-like field in headers to ensure it isn't
        # forwarded as a top-level kwarg accidentally.
        "extra_headers": {
            "inference_profile_id": "arn:aws:bedrock:us-east-1:123:inference-profile/abc",
            "x-amzn-bedrock-inference-profile-arn": "arn:aws:bedrock:us-east-1:123:inference-profile/abc",
        },
    }

    get_crewai_llm(language_model, llm_config_dict)

    assert mock_llm_cls.call_count == 1
    _, kwargs = mock_llm_cls.call_args
    assert "inference_profile_id" not in kwargs


@pytest.mark.xfail(reason="Header sanitization not implemented yet in get_crewai_llm")
@patch("engine.crewai.llms.AgentStudioCrewAILLM")
def test_bedrock_extra_headers_are_sanitized(mock_llm_cls):
    language_model = _make_language_model()
    llm_config_dict = {
        "provider_model": "us.amazon.nova-pro-v1:0",
        "model_type": SupportedModelTypes.BEDROCK.value,
        "aws_region_name": "us-east-1",
        "aws_access_key_id": "test",
        "aws_secret_access_key": "test",
        "aws_session_token": None,
        "extra_headers": {
            # Should be dropped entirely
            "": "bad",
            # Should be dropped (deprecated custom param)
            "inference_profile_id": "arn:aws:bedrock:us-east-1:123:inference-profile/def",
            # Should be trimmed and preserved when non-empty
            "x-amzn-bedrock-inference-profile-arn": " arn:aws:bedrock:us-east-1:123:inference-profile/abc ",
            # Blank value should be removed
            "empty": "   ",
            # Unrelated header should be trimmed + preserved
            "X-Other": " value ",
        },
    }

    get_crewai_llm(language_model, llm_config_dict)

    assert mock_llm_cls.call_count == 1
    _, kwargs = mock_llm_cls.call_args
    # Define expected sanitized headers
    expected_headers = {
        "x-amzn-bedrock-inference-profile-arn": "arn:aws:bedrock:us-east-1:123:inference-profile/abc",
        "X-Other": "value",
    }
    assert kwargs.get("extra_headers") == expected_headers
