from typing import Dict

# No top level studio.db imports allowed to support wokrflow model deployment
from crewai import LLM as CrewAILLM
from engine.types import Input__LanguageModel, Input__LanguageModelConfig
from engine.crewai.wrappers import AgentStudioCrewAILLM


def get_crewai_llm(language_model: Input__LanguageModel, llm_config_dict: Dict[str, str]) -> CrewAILLM:
    # Either pull model config right from the collated input, or from the input model config dict
    llm_config: Input__LanguageModelConfig = Input__LanguageModelConfig(**llm_config_dict)
    if llm_config.model_type == "OPENAI":
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="openai/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    elif llm_config.model_type == "OPENAI_COMPATIBLE":
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="openai/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            base_url=llm_config.api_base,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    elif llm_config.model_type == "AZURE_OPENAI":
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="azure/" + llm_config.provider_model,
            api_key=llm_config.api_key,
            base_url=llm_config.api_base,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    else:
        raise ValueError(f"Model type {llm_config.model_type} is not supported.")
