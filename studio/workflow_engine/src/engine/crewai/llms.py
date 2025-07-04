from typing import Dict

# No top level studio.db imports allowed to support wokrflow model deployment
from crewai import LLM as CrewAILLM
from engine.consts import SupportedModelTypes
from engine.types import Input__LanguageModel, Input__LanguageModelConfig
from engine.crewai.wrappers import AgentStudioCrewAILLM


def get_crewai_llm(language_model: Input__LanguageModel, llm_config_dict: Dict[str, str]) -> CrewAILLM:
    # Either pull model config right from the collated input, or from the input model config dict
    llm_config: Input__LanguageModelConfig = Input__LanguageModelConfig(**llm_config_dict)
    if llm_config.model_type == SupportedModelTypes.OPENAI.value:
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="openai/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    elif llm_config.model_type == SupportedModelTypes.OPENAI_COMPATIBLE.value:
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="openai/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            base_url=llm_config.api_base,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    elif llm_config.model_type == SupportedModelTypes.AZURE_OPENAI.value:
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="azure/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            base_url=llm_config.api_base,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    elif llm_config.model_type == SupportedModelTypes.GEMINI.value:
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="gemini/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
        )
    elif llm_config.model_type == SupportedModelTypes.ANTHROPIC.value:
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="anthropic/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
        )
    elif llm_config.model_type == "CAII":
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="openai/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            base_url=llm_config.api_base,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    else:
        raise ValueError(f"Model type {llm_config.model_type} is not supported.")
