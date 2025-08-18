from typing import Any, Dict, List, Optional


from crewai import Agent, Task, LLM
from crewai.tools import BaseTool


class AgentStudioCrewAILLM(LLM):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id

    # ---------------- Internal sanitization helpers ---------------- #
    @staticmethod
    def _trim_assistant_content(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """(Disabled) Previously trimmed assistant content after a cutoff phrase."""
        # NOTE: Trimming after the cutoff phrase ("You ONLY have access to the following tools")
        # has been temporarily disabled per request. Returning messages unchanged.
        return messages
        # --- Previous implementation kept for reference ---
        # cutoff_phrase = "You ONLY have access to the following tools"
        # assistant_indices: List[int] = [
        #     idx for idx, m in enumerate(messages) if m.get("role") == "assistant"
        # ]
        # last_one_assistant: set[int] = set(assistant_indices[-1:])
        # trimmed: List[Dict[str, Any]] = []
        # for idx, msg in enumerate(messages):
        #     if msg.get("role") != "assistant" or idx in last_one_assistant:
        #         trimmed.append(msg)
        #         continue
        #     content = msg.get("content")
        #     if isinstance(content, str):
        #         cut_idx = content.find(cutoff_phrase)
        #         if cut_idx != -1:
        #             new_msg = dict(msg)
        #             new_msg["content"] = content[:cut_idx].rstrip()
        #             trimmed.append(new_msg)
        #             continue
        #     trimmed.append(msg)
        # return trimmed

    @staticmethod
    def _truncate_non_marker_assistant_messages(
        messages: List[Dict[str, Any]], max_words: int = 200
    ) -> List[Dict[str, Any]]:
        """
        For assistant messages that do NOT contain any of the markers (Thought:, Action:,
        Observation:, Final Answer:), keep them but truncate to the first `max_words`
        words and append an ellipsis plus a note about hidden content for cost savings.
        Assistant messages that DO contain markers are left unchanged. Non-assistant
        messages are left unchanged.
        """
        markers = ("Thought:", "Action:", "Observation:", "Final Answer:")

        def _truncate_text(text: str) -> str:
            words = text.split()
            if len(words) <= max_words:
                return text
            visible = " ".join(words[:max_words]).rstrip()
            suffix = (
                " … [trimmed: additional content hidden to save LLM cost; "
                "refer to tool Observations for full details]"
            )
            return visible + suffix

        result: List[Dict[str, Any]] = []
        for msg in messages:
            if msg.get("role") != "assistant":
                result.append(msg)
                continue
            content = msg.get("content")
            if not isinstance(content, str):
                result.append(msg)
                continue
            has_marker = any(marker in content for marker in markers)
            if has_marker:
                result.append(msg)
            else:
                new_msg = dict(msg)
                new_msg["content"] = _truncate_text(content)
                result.append(new_msg)
        return result

    @classmethod
    def _sanitize_messages(cls, messages_in: Any) -> List[Dict[str, Any]]:
        """Apply trimming and pruning rules to the messages payload before LLM call."""
        if isinstance(messages_in, list):
            messages: List[Dict[str, Any]] = [dict(m) for m in messages_in]
        else:
            messages = [{"role": "user", "content": str(messages_in)}]

        messages = cls._trim_assistant_content(messages)
        messages = cls._truncate_non_marker_assistant_messages(messages, max_words=200)
        return messages

    # ---------------- LLM override ---------------- #
    def call(
        self,
        messages: Any,
        tools: Optional[List[dict]] = None,
        callbacks: Optional[List[Any]] = None,
        available_functions: Optional[Dict[str, Any]] = None,
    ) -> Any:
        sanitized_messages = self._sanitize_messages(messages)
        return super().call(
            sanitized_messages,
            tools=tools,
            callbacks=callbacks,
            available_functions=available_functions,
        )


class AgentStudioCrewAIAgent(Agent):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id


class AgentStudioCrewAITask(Task):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id


class AgentStudioCrewAITool(BaseTool):
    agent_studio_id: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
