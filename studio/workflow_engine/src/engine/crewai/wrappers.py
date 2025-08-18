from typing import Any, Dict, List, Optional
import hashlib
import json


from crewai import Agent, Task, LLM
from crewai.tools import BaseTool


class AgentStudioCrewAILLM(LLM):
    agent_studio_id: Optional[str] = None
    # Simple in-memory LRU-like cache for summaries keyed by conversation signature
    _summary_cache: Dict[str, str] = {}
    _summary_cache_capacity: int = 256
    # Sliding window size for assistant message summarization
    ASSISTANT_SUMMARY_WINDOW: int = 4

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

    @staticmethod
    def _build_summary_signature(
        messages: List[Dict[str, Any]],
        last_four_assistant_indices: List[int],
        agent_studio_id: Optional[str],
    ) -> str:
        """
        Create a stable signature for the conversation state used for summarization:
        - Includes all messages except the last 4 assistant messages
        - Uses only role and content fields
        - Namespaces by agent_studio_id if provided
        """
        exclude_set = set(last_four_assistant_indices)
        reduced: List[Dict[str, Any]] = []
        for idx, msg in enumerate(messages):
            if msg.get("role") == "assistant" and idx in exclude_set:
                continue
            role = msg.get("role")
            content = msg.get("content")
            # Normalize non-string content
            if not isinstance(content, str):
                try:
                    content = json.dumps(content, ensure_ascii=False, sort_keys=True)
                except Exception:
                    content = str(content)
            reduced.append({"role": role, "content": content})
        # Namespace with agent id to reduce accidental collisions
        payload = {
            "agent": agent_studio_id or "",
            "messages": reduced,
        }
        blob = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    @staticmethod
    def _build_chunk_signature(
        messages: List[Dict[str, Any]],
        assistant_chunk_indices: List[int],
        agent_studio_id: Optional[str],
    ) -> str:
        parts: List[Dict[str, Any]] = []
        for idx in assistant_chunk_indices:
            msg = messages[idx]
            content = msg.get("content")
            if not isinstance(content, str):
                try:
                    content = json.dumps(content, ensure_ascii=False, sort_keys=True)
                except Exception:
                    content = str(content)
            parts.append({"role": "assistant", "content": content})
        payload = {"agent": agent_studio_id or "", "chunk": parts}
        blob = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    @classmethod
    def _summary_cache_get(cls, key: str) -> Optional[str]:
        return cls._summary_cache.get(key)

    @classmethod
    def _summary_cache_put(cls, key: str, value: str) -> None:
        # Simple capacity control: evict arbitrary item when over capacity
        if key in cls._summary_cache:
            cls._summary_cache[key] = value
            return
        if len(cls._summary_cache) >= cls._summary_cache_capacity:
            # pop first inserted item (not strict LRU but good enough)
            try:
                first_key = next(iter(cls._summary_cache))
                cls._summary_cache.pop(first_key, None)
            except Exception:
                cls._summary_cache.clear()
        cls._summary_cache[key] = value

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

        # Sliding-window assistant summarization
        try:
            W = max(1, int(getattr(self, "ASSISTANT_SUMMARY_WINDOW", 4)))
            SUMMARY_MARKER = "[ASSISTANT_SUMMARY]"
            assistant_indices: List[int] = [
                idx for idx, m in enumerate(sanitized_messages) if m.get("role") == "assistant"
            ]
            # If assistants not exceeding window, no summarization
            if len(assistant_indices) <= W:
                return super().call(
                    sanitized_messages,
                    tools=tools,
                    callbacks=callbacks,
                    available_functions=available_functions,
                )

            # Determine last W assistants to keep raw
            last_w_assistant_indices: List[int] = assistant_indices[-W:]
            pre_last_assistant_indices: List[int] = assistant_indices[:-W]

            # Partition pre-last assistants into full chunks of size W
            full_chunk_count = len(pre_last_assistant_indices) // W
            chunks: List[List[int]] = [
                pre_last_assistant_indices[i * W : (i + 1) * W] for i in range(full_chunk_count)
            ]
            leftover_assistant_indices: List[int] = pre_last_assistant_indices[full_chunk_count * W :]

            # For each full chunk, obtain or compute a summary (and cache it)
            chunk_index_to_summary: Dict[int, str] = {}
            for chunk_idx, chunk_assistant_indices in enumerate(chunks):
                sig = self._build_chunk_signature(sanitized_messages, chunk_assistant_indices, self.agent_studio_id)
                cached = self._summary_cache_get(sig)
                if cached is not None:
                    chunk_index_to_summary[chunk_idx] = cached
                    continue

                # Build minimal summarization context: only the assistant messages in the chunk
                summarization_context: List[Dict[str, Any]] = [
                    {"role": "assistant", "content": sanitized_messages[i].get("content")}
                    for i in chunk_assistant_indices
                ]
                summarization_prompt = (
                    "Summarize the assistant messages above into a clear, self-contained record focusing on what was actually done.\n"
                    "Include the following sections with bullet points under each:\n"
                    "- Actions performed: concrete steps taken and their purposes.\n"
                    "- Artifacts produced: files, outputs, paths, or resources created/modified (with names and locations).\n"
                    "- Important commands executed: exact shell/SQL/API commands with key flags/parameters.\n"
                    "If applicable, also note any notable errors and how they were resolved.\n"
                    "Formatting requirements: no preamble or epilogue; do not use the headings 'Thoughts', 'Actions', or 'Observations';\n"
                    "use the exact section headings 'Actions performed', 'Artifacts produced', and 'Important commands executed'."
                )
                summarization_context.append({"role": "user", "content": summarization_prompt})

                summary_result = super().call(
                    summarization_context,
                    tools=None,
                    callbacks=callbacks,
                    available_functions=None,
                )

                def _extract_text(payload: Any) -> str:
                    if isinstance(payload, str):
                        return payload
                    if isinstance(payload, dict):
                        if "content" in payload and isinstance(payload["content"], str):
                            return payload["content"]
                        try:
                            choices = payload.get("choices")
                            if isinstance(choices, list) and choices:
                                msg = choices[0].get("message", {})
                                if isinstance(msg, dict):
                                    content = msg.get("content")
                                    if isinstance(content, str):
                                        return content
                        except Exception:
                            pass
                    return str(payload)

                summary_text: str = _extract_text(summary_result)
                if not isinstance(summary_text, str):
                    summary_text = str(summary_text)
                summary_text = summary_text + "\n\n" + SUMMARY_MARKER
                self._summary_cache_put(sig, summary_text)
                chunk_index_to_summary[chunk_idx] = summary_text

            # Build final message list: replace each full chunk with its summary; keep leftover and last W raw
            final_messages: List[Dict[str, Any]] = []
            i = 0
            chunk_cursor = 0
            while i < len(sanitized_messages):
                # If next position matches the start of the current chunk, inject summary and skip chunk
                if chunk_cursor < len(chunks) and i == chunks[chunk_cursor][0]:
                    final_messages.append({"role": "assistant", "content": chunk_index_to_summary[chunk_cursor]})
                    # Skip all assistant messages in this chunk
                    skip_set = set(chunks[chunk_cursor])
                    while i < len(sanitized_messages) and (
                        i in skip_set or (
                            sanitized_messages[i].get("role") == "assistant" and i in skip_set
                        )
                    ):
                        i += 1
                    chunk_cursor += 1
                    continue

                # Otherwise, include message if it's not an assistant that belongs to a full chunk we already summarized
                if sanitized_messages[i].get("role") == "assistant":
                    # If it's part of leftover or last W, include; otherwise it must be in a chunk start that we handled above
                    if i in leftover_assistant_indices or i in last_w_assistant_indices:
                        final_messages.append(sanitized_messages[i])
                        i += 1
                        continue
                    # If it's in a chunk but not at start, it will be skipped when we hit the chunk start; so just advance
                    in_any_chunk = any(i in c for c in chunks)
                    if in_any_chunk:
                        i += 1
                        continue
                # Non-assistant or any other message: include as-is
                final_messages.append(sanitized_messages[i])
                i += 1

            return super().call(
                final_messages,
                tools=tools,
                callbacks=callbacks,
                available_functions=available_functions,
            )
        except Exception:
            # Fallback to original behavior on any error
            pass

        # Default path: no summarization needed
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