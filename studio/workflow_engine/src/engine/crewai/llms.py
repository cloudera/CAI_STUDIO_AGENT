# No top level studio.db imports allowed to support wokrflow model deployment
from crewai import LLM as CrewAILLM
from engine.types import Input__LanguageModel
from engine.crewai.wrappers import AgentStudioCrewAILLM


def get_crewai_llm_object_direct(language_model: Input__LanguageModel) -> CrewAILLM:
    model_config = language_model.config
    if not model_config:
        raise ValueError("Model config is required for direct LLM creation.")
    if model_config.model_type == "OPENAI":
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="openai/" + model_config.provider_model,
            api_key=model_config.api_key,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    elif model_config.model_type == "OPENAI_COMPATIBLE":
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="openai/" + model_config.provider_model,
            api_key=model_config.api_key,
            base_url=model_config.api_base,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    elif model_config.model_type == "AZURE_OPENAI":
        return AgentStudioCrewAILLM(
            agent_studio_id=language_model.model_id,
            model="azure/" + model_config.provider_model,
            api_key=model_config.api_key,
            base_url=model_config.api_base,
            temperature=language_model.generation_config.get("temperature"),
            max_completion_tokens=language_model.generation_config.get("max_new_tokens"),
            seed=0,
        )
    else:
        raise ValueError(f"Model type {model_config.model_type} is not supported.")
