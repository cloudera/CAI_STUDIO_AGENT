from typing import Any, Dict, List, Optional
from datetime import datetime
import hashlib
import json
import os
import re

from crewai import Agent, Task, LLM
from crewai.tools import BaseTool
from pydantic import Field

# Import CrewAI delegation tools to extend with custom behavior
from crewai.tools.agent_tools.delegate_work_tool import DelegateWorkTool
from crewai.tools.agent_tools.ask_question_tool import AskQuestionTool


class AgentStudioCrewAILLM(LLM):
    agent_studio_id: Optional[str] = None
    session_directory: Optional[str] = None
    _summary_cache: Dict[str, str] = {}
    _summary_cache_capacity: int = 256
    ASSISTANT_SUMMARY_WINDOW: int = 4
    ARTIFACTS_SUFFIX: str = (
        "\n\n— Useful artifacts requirement —\n"
        "In your final answer, add a section titled 'Useful artifacts' as bullet points. "
        "List any files,or outputs produced "
        "or referenced for the current task, each with a 1–2 sentence description. "
        "Use exact filenames the evidence; do not rename, paraphrase, or alter them.\n"
        "Additionally, format your response in Markdown using best practices. Use tables where helpful. "
        "Only use heading level 5 or 6 (##### or ######); do not use heading levels 1–4."
    )

    def __init__(self, agent_studio_id: str, *args, session_directory: Optional[str] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
        self.session_directory = session_directory

    @staticmethod
    def _trim_assistant_content(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return messages

    @staticmethod
    def _truncate_non_marker_assistant_messages(
        messages: List[Dict[str, Any]], max_words: int = 200
    ) -> List[Dict[str, Any]]:
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
        exclude_set = set(last_four_assistant_indices)
        reduced: List[Dict[str, Any]] = []
        for idx, msg in enumerate(messages):
            if msg.get("role") == "assistant" and idx in exclude_set:
                continue
            role = msg.get("role")
            content = msg.get("content")
            if not isinstance(content, str):
                try:
                    content = json.dumps(content, ensure_ascii=False, sort_keys=True)
                except Exception:
                    content = str(content)
            reduced.append({"role": role, "content": content})
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
        if key in cls._summary_cache:
            cls._summary_cache[key] = value
            return
        if len(cls._summary_cache) >= cls._summary_cache_capacity:
            try:
                first_key = next(iter(cls._summary_cache))
                cls._summary_cache.pop(first_key, None)
            except Exception:
                cls._summary_cache.clear()
        cls._summary_cache[key] = value

    @classmethod
    def _sanitize_messages(cls, messages_in: Any) -> List[Dict[str, Any]]:
        if isinstance(messages_in, list):
            messages: List[Dict[str, Any]] = [dict(m) for m in messages_in]
        else:
            messages = [{"role": "user", "content": str(messages_in)}]
        messages = cls._trim_assistant_content(messages)
        messages = cls._truncate_non_marker_assistant_messages(messages, max_words=200)
        return messages

    @classmethod
    def _append_artifacts_instruction(
        cls, messages: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        if not messages:
            return messages
        def _strip_artifacts_from_user(text: str) -> str:
            try:
                pattern = r"(?ms)\n{0,3}— Useful artifacts requirement —\n.*?(?=\n\s*Thought:|\Z)"
                cleaned = re.sub(pattern, "\n\n", text)
                if cls.ARTIFACTS_SUFFIX in cleaned:
                    cleaned = cleaned.replace(cls.ARTIFACTS_SUFFIX, "\n\n")
                return cleaned
            except Exception:
                return text
        def _append_to_system(msg: Dict[str, Any]) -> Dict[str, Any]:
            content = msg.get("content")
            if isinstance(content, str):
                lower = content.casefold()
                if "useful artifacts" in lower or "artifacts requirement" in lower:
                    return msg
                marker = "IMPORTANT: Use the following format in your response:"
                idx = content.lower().find(marker.lower())
                msg = dict(msg)
                if idx != -1:
                    before = content[:idx]
                    after = content[idx:]
                    msg["content"] = before + cls.ARTIFACTS_SUFFIX + after
                else:
                    sep = "\n" if content.endswith("\n") else "\n\n"
                    msg["content"] = content + sep + cls.ARTIFACTS_SUFFIX
            return msg
        result: List[Dict[str, Any]] = []
        for i, m in enumerate(messages):
            role = m.get("role")
            if role == "system":
                result.append(_append_to_system(m))
            elif role == "user":
                content = m.get("content")
                if isinstance(content, str):
                    new_content = _strip_artifacts_from_user(content)
                    if new_content is not content:
                        m = dict(m)
                        m["content"] = new_content
                result.append(m)
            else:
                result.append(m)
        return result

    def call(
        self,
        messages: Any,
        tools: Optional[List[dict]] = None,
        callbacks: Optional[List[Any]] = None,
        available_functions: Optional[Dict[str, Any]] = None,
    ) -> Any:
        sanitized_messages = self._sanitize_messages(messages)
        try:
            if self.session_directory:
                state_json_path = os.path.join(self.session_directory, "state.json")
                if os.path.exists(state_json_path):
                    entries: List[Dict[str, Any]] = []
                    try:
                        with open(state_json_path, "r", encoding="utf-8") as sf:
                            entries = json.load(sf) or []
                            if not isinstance(entries, list):
                                entries = []
                    except Exception:
                        entries = []
                    # Build assistant messages for each entry
                    assistant_msgs: List[Dict[str, str]] = []
                    for e in entries:
                        try:
                            ts = str(e.get("timestamp", "")).strip()
                            content = str(e.get("response", "")).strip()
                            if content:
                                header = f"CONTEXT: This is the last agent output at {ts}." if ts else "CONTEXT: This is a prior agent output."
                                assistant_msgs.append({"role": "assistant", "content": header + "\n" + content})
                        except Exception:
                            continue
                    if assistant_msgs:
                        # Insert between system and first user
                        first_user_index = next((idx for idx, m in enumerate(sanitized_messages) if m.get("role") == "user"), None)
                        insertion_index = 0
                        if first_user_index is not None:
                            insertion_index = first_user_index
                        else:
                            last_system_index = None
                            for idx, m in enumerate(sanitized_messages):
                                if m.get("role") == "system":
                                    last_system_index = idx
                            insertion_index = (last_system_index + 1) if last_system_index is not None else 0
                        sanitized_messages = sanitized_messages[:insertion_index] + assistant_msgs + sanitized_messages[insertion_index:]
        except Exception:
            pass

        try:
            W = max(1, int(getattr(self, "ASSISTANT_SUMMARY_WINDOW", 4)))
            SUMMARY_MARKER = "[ASSISTANT_SUMMARY]"
            def _is_state_assistant_message(msg: Dict[str, Any]) -> bool:
                if msg.get("role") != "assistant":
                    return False
                content = msg.get("content")
                return isinstance(content, str) and content.lstrip().startswith("CONTEXT:")
            assistant_indices: List[int] = [
                idx
                for idx, m in enumerate(sanitized_messages)
                if m.get("role") == "assistant" and not _is_state_assistant_message(m)
            ]
            if len(assistant_indices) <= W:
                messages_with_suffix = self._append_artifacts_instruction(sanitized_messages)
                return super().call(
                    messages_with_suffix,
                    tools=tools,
                    callbacks=callbacks,
                    available_functions=available_functions,
                )
            last_w_assistant_indices: List[int] = assistant_indices[-W:]
            pre_last_assistant_indices: List[int] = assistant_indices[:-W]
            full_chunk_count = len(pre_last_assistant_indices) // W
            chunks: List[List[int]] = [
                pre_last_assistant_indices[i * W : (i + 1) * W] for i in range(full_chunk_count)
            ]
            leftover_assistant_indices: List[int] = pre_last_assistant_indices[full_chunk_count * W :]
            chunk_index_to_summary: Dict[int, str] = {}
            for chunk_idx, chunk_assistant_indices in enumerate(chunks):
                sig = self._build_chunk_signature(sanitized_messages, chunk_assistant_indices, self.agent_studio_id)
                cached = self._summary_cache_get(sig)
                if cached is not None:
                    chunk_index_to_summary[chunk_idx] = cached
                    continue
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
            final_messages: List[Dict[str, Any]] = []
            i = 0
            chunk_cursor = 0
            while i < len(sanitized_messages):
                if chunk_cursor < len(chunks) and i == chunks[chunk_cursor][0]:
                    final_messages.append({"role": "assistant", "content": chunk_index_to_summary[chunk_cursor]})
                    skip_set = set(chunks[chunk_cursor])
                    while i < len(sanitized_messages) and (
                        i in skip_set or (
                            sanitized_messages[i].get("role") == "assistant" and i in skip_set
                        )
                    ):
                        i += 1
                    chunk_cursor += 1
                    continue
                if sanitized_messages[i].get("role") == "assistant":
                    if i in leftover_assistant_indices or i in last_w_assistant_indices:
                        final_messages.append(sanitized_messages[i])
                        i += 1
                        continue
                    in_any_chunk = any(i in c for c in chunks)
                    if in_any_chunk:
                        i += 1
                        continue
                final_messages.append(sanitized_messages[i])
                i += 1
            final_messages = self._append_artifacts_instruction(final_messages)
            return super().call(
                final_messages,
                tools=tools,
                callbacks=callbacks,
                available_functions=available_functions,
            )
        except Exception:
            pass
        messages_with_suffix = self._append_artifacts_instruction(sanitized_messages)
        return super().call(
            messages_with_suffix,
            tools=tools,
            callbacks=callbacks,
            available_functions=available_functions,
        )


class AgentStudioManagerCrewAILLM(LLM):
    agent_studio_id: Optional[str] = None
    session_directory: Optional[str] = None
    _summary_cache: Dict[str, str] = {}
    _summary_cache_capacity: int = 256
    ASSISTANT_SUMMARY_WINDOW: int = 4
    ARTIFACTS_SUFFIX: str = (
        "\n\n— Useful artifacts requirement —\n"
        "In your final answer, add a section titled 'Useful artifacts' as bullet points. "
        "List any files,or outputs produced "
        "or referenced for the current task, each with a 1–2 sentence description. "
        "Use exact filenames from the evidence; do not rename, paraphrase, or alter them.\n"
        "Additionally, format your response in Markdown using best practices. Use tables where helpful. "
        "Only use heading level 5 or 6 (##### or ######); do not use heading levels 1–4."
    )
    manager_agents_info: Optional[List[Dict[str, str]]] = None
    planning_enabled: bool = False
    planning_permanently_disabled: bool = False

    def __init__(self, agent_studio_id: str, *args, session_directory: Optional[str] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
        self.session_directory = session_directory

    @staticmethod
    def _trim_assistant_content(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return messages

    @staticmethod
    def _truncate_non_marker_assistant_messages(
        messages: List[Dict[str, Any]], max_words: int = 200
    ) -> List[Dict[str, Any]]:
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
        exclude_set = set(last_four_assistant_indices)
        reduced: List[Dict[str, Any]] = []
        for idx, msg in enumerate(messages):
            if msg.get("role") == "assistant" and idx in exclude_set:
                continue
            role = msg.get("role")
            content = msg.get("content")
            if not isinstance(content, str):
                try:
                    content = json.dumps(content, ensure_ascii=False, sort_keys=True)
                except Exception:
                    content = str(content)
            reduced.append({"role": role, "content": content})
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
        if key in cls._summary_cache:
            cls._summary_cache[key] = value
            return
        if len(cls._summary_cache) >= cls._summary_cache_capacity:
            try:
                first_key = next(iter(cls._summary_cache))
                cls._summary_cache.pop(first_key, None)
            except Exception:
                cls._summary_cache.clear()
        cls._summary_cache[key] = value

    @classmethod
    def _sanitize_messages(cls, messages_in: Any) -> List[Dict[str, Any]]:
        if isinstance(messages_in, list):
            messages: List[Dict[str, Any]] = [dict(m) for m in messages_in]
        else:
            messages = [{"role": "user", "content": str(messages_in)}]
        messages = cls._trim_assistant_content(messages)
        messages = cls._truncate_non_marker_assistant_messages(messages, max_words=200)
        return messages

    @classmethod
    def _append_artifacts_instruction(
        cls, messages: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        if not messages:
            return messages
        def _strip_artifacts_from_user(text: str) -> str:
            try:
                pattern = r"(?ms)\n{0,3}— Useful artifacts requirement —\n.*?(?=\n\s*Thought:|\Z)"
                cleaned = re.sub(pattern, "\n\n", text)
                if cls.ARTIFACTS_SUFFIX in cleaned:
                    cleaned = cleaned.replace(cls.ARTIFACTS_SUFFIX, "\n\n")
                return cleaned
            except Exception:
                return text
        def _append_to_system(msg: Dict[str, Any]) -> Dict[str, Any]:
            content = msg.get("content")
            if isinstance(content, str):
                lower = content.casefold()
                if "useful artifacts" in lower or "artifacts requirement" in lower:
                    return msg
                marker = "IMPORTANT: Use the following format in your response:"
                idx = content.lower().find(marker.lower())
                msg = dict(msg)
                if idx != -1:
                    before = content[:idx]
                    after = content[idx:]
                    msg["content"] = before + cls.ARTIFACTS_SUFFIX + after
                else:
                    sep = "\n" if content.endswith("\n") else "\n\n"
                    msg["content"] = content + sep + cls.ARTIFACTS_SUFFIX
            return msg
        result: List[Dict[str, Any]] = []
        for i, m in enumerate(messages):
            role = m.get("role")
            if role == "system":
                result.append(_append_to_system(m))
            elif role == "user":
                content = m.get("content")
                if isinstance(content, str):
                    new_content = _strip_artifacts_from_user(content)
                    if new_content is not content:
                        m = dict(m)
                        m["content"] = new_content
                result.append(m)
            else:
                result.append(m)
        return result

    def call(
        self,
        messages: Any,
        tools: Optional[List[dict]] = None,
        callbacks: Optional[List[Any]] = None,
        available_functions: Optional[Dict[str, Any]] = None,
    ) -> Any:
        # Sanitize and inject state.json entries as assistant context if available
        base_messages = AgentStudioCrewAILLM._sanitize_messages(messages)
        try:
            if self.session_directory:
                state_json_path = os.path.join(self.session_directory, "state.json")
                if os.path.exists(state_json_path):
                    entries: List[Dict[str, Any]] = []
                    try:
                        with open(state_json_path, "r", encoding="utf-8") as sf:
                            entries = json.load(sf) or []
                            if not isinstance(entries, list):
                                entries = []
                    except Exception:
                        entries = []
                    assistant_msgs_ctx: List[Dict[str, str]] = []
                    for e in entries:
                        try:
                            ts = str(e.get("timestamp", "")).strip()
                            content = str(e.get("response", "")).strip()
                            if content:
                                header = f"CONTEXT: This is the last agent output at {ts}." if ts else "CONTEXT: This is a prior agent output."
                                assistant_msgs_ctx.append({"role": "assistant", "content": header + "\n" + content})
                        except Exception:
                            continue
                    if assistant_msgs_ctx:
                        first_user_index = next((idx for idx, m in enumerate(base_messages) if m.get("role") == "user"), None)
                        insertion_index = first_user_index if first_user_index is not None else 0
                        base_messages = base_messages[:insertion_index] + assistant_msgs_ctx + base_messages[insertion_index:]
        except Exception:
            pass
        
        # Comprehensive planning flow: decision → planning → evaluation → injection
        if bool(getattr(self, "planning_enabled", False)):
            try:
                coworkers_overview_text: Optional[str] = None
                try:
                    info = getattr(self, "manager_agents_info", None)
                    if info:
                        lines: List[str] = ["COWORKERS OVERVIEW:"]
                        for idx, agent_info in enumerate(info, start=1):
                            role = str(agent_info.get("role", "")).strip()
                            backstory = str(agent_info.get("backstory", "")).strip()
                            goal = str(agent_info.get("goal", "")).strip()
                            aid = str(agent_info.get("id", "")).strip()
                            lines.append(f"- [{idx}] id={aid} | role={role}")
                            if backstory:
                                lines.append(f"  backstory: {backstory}")
                            if goal:
                                lines.append(f"  goal: {goal}")
                        coworkers_overview_text = "\n".join(lines)
                except Exception:
                    coworkers_overview_text = None

                plan_created_this_call: bool = False
                skip_planning_and_injection: bool = False

                plan_path = os.path.join(self.session_directory or "", "plan.json") if self.session_directory else None
                plan_exists = False
                try:
                    plan_exists = bool(plan_path and os.path.exists(plan_path) and os.path.getsize(plan_path) > 0)
                except Exception:
                    plan_exists = False

                # Decision pre-check (only if no plan)
                if not plan_exists:
                    try:
                        original_list_for_decision = (
                            messages if isinstance(messages, list) else [{"role": "user", "content": str(messages)}]
                        )
                        decision_systems = [m for m in original_list_for_decision if m.get("role") == "system"]
                        decision_users = [m for m in original_list_for_decision if m.get("role") == "user"]
                        decision_messages: List[Dict[str, Any]] = []
                        decision_messages.extend(decision_systems)

                        # Insert coworker context as assistant messages (one per coworker) right after system prompts
                        try:
                            agents_info_decision: List[Dict[str, str]] = getattr(self, "manager_agents_info", None) or []
                            for agent_info in agents_info_decision:
                                role = str(agent_info.get("role", "")).strip()
                                backstory = str(agent_info.get("backstory", "")).strip()
                                goal = str(agent_info.get("goal", "")).strip()
                                aid = str(agent_info.get("id", "")).strip()
                                content_lines_dec = [
                                    f"AGENT CONTEXT ({aid})",
                                    f"role: {role}",
                                    f"backstory: {backstory}",
                                    f"goal: {goal}",
                                ]
                                decision_messages.append({"role": "assistant", "content": "\n".join(content_lines_dec).strip()})
                        except Exception:
                            pass

                        # Inject state.json conversation assistant message(s) just before the last user
                        state_assistant_for_decision: List[Dict[str, Any]] = []
                        try:
                            if self.session_directory:
                                _state_json_path_decision = os.path.join(self.session_directory, "state.json")
                                if os.path.exists(_state_json_path_decision):
                                    with open(_state_json_path_decision, "r", encoding="utf-8") as _sf:
                                        try:
                                            _entries_dec = json.load(_sf) or []
                                        except Exception:
                                            _entries_dec = []
                                    if isinstance(_entries_dec, list) and _entries_dec:
                                        last_entry_dec = _entries_dec[-1]
                                        tsd = str(last_entry_dec.get("timestamp", "")).strip()
                                        contentd = str(last_entry_dec.get("response", "")).strip()
                                        if contentd:
                                            headerd = (
                                                f"CONTEXT: This is the last agent output at {tsd}."
                                                if tsd
                                                else "CONTEXT: This is a prior agent output."
                                            )
                                            state_assistant_for_decision = [{"role": "assistant", "content": headerd + "\n" + contentd}]
                        except Exception:
                            state_assistant_for_decision = []

                        if decision_users:
                            decision_messages.extend(decision_users[:-1])
                            decision_messages.extend(state_assistant_for_decision)
                            decision_messages.append(decision_users[-1])
                        else:
                            decision_messages.extend(state_assistant_for_decision)
                        decision_instruction = (
                            "Determine whether the user's latest request can be answered directly from the conversation above without additional planning.\n"
                            "If it CAN be answered directly, return ONLY valid JSON: {\"result\":\"<concise direct answer>\"}.\n"
                            "If it CANNOT be answered directly and a multi-step plan is needed, return ONLY valid JSON: {\"needs_planning\": true}.\n"
                            "No prose, no code fences."
                        )
                        decision_messages.append({"role": "user", "content": decision_instruction})
                        decision_result = super().call(
                            decision_messages, tools=None, callbacks=callbacks, available_functions=available_functions
                        )

                        def _extract_json_obj_decision(text: str) -> Optional[Dict[str, Any]]:
                            try:
                                return json.loads(text)
                            except Exception:
                                pass
                            try:
                                import re as _re
                                m = _re.search(r"```json\s*(.+?)\s*```", text, flags=_re.DOTALL|_re.IGNORECASE)
                                if m:
                                    return json.loads(m.group(1))
                            except Exception:
                                pass
                            try:
                                start = text.find("{"); end = text.rfind("}")
                                if start != -1 and end != -1 and end > start:
                                    return json.loads(text[start:end+1])
                            except Exception:
                                pass
                            return None

                        decision_text = None
                        if isinstance(decision_result, str):
                            decision_text = decision_result
                        elif isinstance(decision_result, dict):
                            try:
                                if "content" in decision_result and isinstance(decision_result["content"], str):
                                    decision_text = decision_result["content"]
                                elif isinstance(decision_result.get("choices"), list) and decision_result["choices"]:
                                    msg = decision_result["choices"][0].get("message", {})
                                    if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                                        decision_text = msg.get("content")
                            except Exception:
                                pass
                        if decision_text is None:
                            decision_text = str(decision_result)
                        decision_obj = _extract_json_obj_decision(decision_text)
                        if isinstance(decision_obj, dict) and isinstance(decision_obj.get("result"), str):
                            skip_planning_and_injection = True
                            # Inject the planning decision directly into the last user message content
                            try:
                                result_desc = str(decision_obj.get("result", "")).strip()
                                decision_block = (
                                    "PLANNING DECISION: Planning is not needed.\n"
                                    "RESULT DESCRIPTION:\n" + result_desc + "\n"
                                )
                                if isinstance(base_messages, list) and base_messages:
                                    last_user_idx = None
                                    for i in range(len(base_messages) - 1, -1, -1):
                                        if base_messages[i].get("role") == "user":
                                            last_user_idx = i
                                            break
                                    if last_user_idx is not None:
                                        try:
                                            user_content = base_messages[last_user_idx].get("content")
                                            if isinstance(user_content, str):
                                                marker = "This is the expected criteria for your final answer"
                                                lower_content = user_content.lower()
                                                pos = lower_content.find(marker.lower())
                                                if pos != -1:
                                                    before = user_content[:pos].rstrip()
                                                    after = user_content[pos:].lstrip()
                                                    new_content = (before + "\n\n" + decision_block + "\n" + after).strip()
                                                else:
                                                    sep = "\n\n" if not user_content.endswith("\n") else "\n"
                                                    new_content = (user_content + sep + decision_block).strip()
                                                base_messages[last_user_idx] = dict(base_messages[last_user_idx])
                                                base_messages[last_user_idx]["content"] = new_content
                                        except Exception:
                                            pass
                            except Exception:
                                pass
                    except Exception:
                        pass

                # Planning call (if needed)
                needs_plan = False
                if plan_path is None or skip_planning_and_injection:
                    needs_plan = False
                else:
                    needs_plan = not plan_exists
                if needs_plan:
                    try:
                        original_list = messages if isinstance(messages, list) else [{"role": "user", "content": str(messages)}]
                        # Consolidate system messages (exclude coworker overview)
                        system_contents_seen: set[str] = set()
                        consolidated_system_lines: List[str] = []
                        for m in original_list:
                            if m.get("role") == "system":
                                c = m.get("content")
                                if isinstance(c, str) and ("COWORKERS OVERVIEW:" not in c) and c not in system_contents_seen:
                                    system_contents_seen.add(c)
                                    consolidated_system_lines.append(c)
                        consolidated_system_text = "\n\n".join(consolidated_system_lines) if consolidated_system_lines else ""
                        system_msgs: List[Dict[str, Any]] = ([{"role": "system", "content": consolidated_system_text}] if consolidated_system_text else [])
                        user_msgs: List[Dict[str, Any]] = [m for m in original_list if m.get("role") == "user"]

                        last_user = user_msgs[-1] if user_msgs else {"role": "user", "content": ""}
                        last_user_content = last_user.get("content") if isinstance(last_user.get("content"), str) else ""

                        def _trim_user_for_plan(text: str) -> str:
                            if not isinstance(text, str):
                                return ""
                            marker = "This is the expected criteria for your final answer"
                            idx = text.lower().find(marker.lower())
                            if idx != -1:
                                text = text[:idx].rstrip()
                            plan_instruction = (
                                "You are the Planner. Your task is to generate a structured step-by-step plan in STRICT JSON only.\n\n"
                                "PLANNING PRINCIPLES\n"
                                "1. Deliverables & coworker selection\n"
                                "   • Infer the deliverables implied by the Current Task (e.g., retrieve data, compute, visualize, summarize).  \n"
                                "   • Select the minimal set of coworkers whose documented capabilities cover those deliverables.  \n"
                                "   • If one coworker can complete everything, use only that coworker.\n\n"
                                "2. Step granularity\n"
                                "   • Each step = one atomic, end-to-end objective that one coworker can complete.  \n"
                                "   • Fuse micro-actions if they share the same coworker, scope, and objective.  \n"
                                "   • Split when coworker, scope, or objective differs, or when user requested distinct outputs.\n\n"
                                "3. Multiple intents\n"
                                "   • If the request has multiple distinct tasks (‘then’, ‘and’, ‘also’), create steps for each in order.  \n"
                                "   • Reuse the same coworker across steps only if natural.\n\n"
                                "4. Clarity & detail\n"
                                "   • Each description must be CLEAR, SPECIFIC, and ACTIONABLE.  \n"
                                "     – Include the main action, the target data/object, and intended output.  \n"
                                "     – Example (bad): \"Query sales data\".  \n"
                                "     – Example (good): \"Query total monthly sales for 2024 from the orders table including amount and category\".  \n"
                                "   • Prefer 1–4 steps unless clearly more are needed.  \n"
                                "   • No vague, placeholder, or underspecified descriptions.\n\n"
                                "OUTPUT FORMAT (STRICT)\n"
                                "Return ONLY valid JSON, nothing else, exactly in this schema:\n"
                                "{\n"
                                "  \"steps\": [\n"
                                "    {\n"
                                "      \"step_number\": \"1\",\n"
                                "      \"description\": \"<clear, specific action>\",\n"
                                "      \"status\": \"NOT STARTED\",\n"
                                "      \"coworker\": \"<Exact coworker name>\"\n"
                                "    }\n"
                                "  ],\n"
                                "  \"next_step\": \"1\"\n"
                                "}\n\n"
                                "RULES\n"
                                "• step_number values are strings (\"1\",\"2\",...).  \n"
                                "• status MUST be \"NOT STARTED\" for all steps.  \n"
                                "• At least one step.  \n"
                                "• next_step MUST equal the first step_number.  \n"
                                "• coworker MUST match an available role name EXACTLY (case-sensitive).  \n"
                                "• If no coworker can do the task, output a single step with coworker = \"NONE\" and description = \"No available coworker can fulfill the task.\"  \n\n"
                                "VALIDATION BEFORE EMITTING\n"
                                "• Remove redundant steps.  \n"
                                "• Ensure fusion/splitting is appropriate.  \n"
                                "• Ensure descriptions are clear, specific, and actionable.  \n"
                                "• Output strictly valid JSON only.\n\n"
                                "FEW-SHOT EXAMPLES\n\n"
                                "# Example A\n"
                                "Current Task: \"Summarize the key points from the provided text.\"\n"
                                "Coworkers: [\"Research Analyst\",\"SQL Agent\",\"Visualization Agent\"]\n"
                                "Output:\n"
                                "{\"steps\":[{\"step_number\":\"1\",\"description\":\"Read the provided text and create a concise bullet-point summary of the main ideas\",\"status\":\"NOT STARTED\",\"coworker\":\"Research Analyst\"}],\"next_step\":\"1\"}\n\n"
                                "# Example B\n"
                                "Current Task: \"Get total sales by month for 2024 and plot a line chart.\"\n"
                                "Coworkers: [\"SQL Agent\",\"Visualization Agent\",\"Writer\"]\n"
                                "Output:\n"
                                "{\"steps\":[{\"step_number\":\"1\",\"description\":\"Query total monthly sales for 2024 from the orders table with amounts aggregated by month\",\"status\":\"NOT STARTED\",\"coworker\":\"SQL Agent\"},{\"step_number\":\"2\",\"description\":\"Generate a line chart of monthly sales using the query results\",\"status\":\"NOT STARTED\",\"coworker\":\"Visualization Agent\"}],\"next_step\":\"1\"}"
                            )
                            return (text + ("\n\n" if not text.endswith("\n") else "\n") + plan_instruction).strip()

                        trimmed_user_content = _trim_user_for_plan(last_user_content)
                        plan_user_msg = {"role": "user", "content": trimmed_user_content}

                        assistant_msgs: List[Dict[str, Any]] = []
                        try:
                            agents_info: List[Dict[str, str]] = getattr(self, "manager_agents_info", None) or []
                            for agent_info in agents_info:
                                role = str(agent_info.get("role", "")).strip()
                                backstory = str(agent_info.get("backstory", "")).strip()
                                goal = str(agent_info.get("goal", "")).strip()
                                aid = str(agent_info.get("id", "")).strip()
                                content_lines = [f"AGENT CONTEXT ({aid})", f"role: {role}", f"backstory: {backstory}", f"goal: {goal}"]
                                assistant_msgs.append({"role": "assistant", "content": "\n".join(content_lines).strip()})
                        except Exception:
                            pass

                        # State context BEFORE planning user message
                        state_assistant_msg: List[Dict[str, Any]] = []
                        try:
                            if self.session_directory:
                                state_json2 = os.path.join(self.session_directory, "state.json")
                                if os.path.exists(state_json2):
                                    with open(state_json2, "r", encoding="utf-8") as sf:
                                        try:
                                            entries2 = json.load(sf) or []
                                        except Exception:
                                            entries2 = []
                                    if isinstance(entries2, list) and entries2:
                                        last_entry = entries2[-1]
                                        ts2 = str(last_entry.get("timestamp", "")).strip()
                                        content2 = str(last_entry.get("response", "")).strip()
                                        if content2:
                                            header2 = f"CONTEXT: This is the last agent output at {ts2}." if ts2 else "CONTEXT: This is a prior agent output."
                                            state_assistant_msg = [{"role": "assistant", "content": header2 + "\n" + content2}]
                        except Exception:
                            pass

                        plan_messages: List[Dict[str, Any]] = system_msgs + assistant_msgs + state_assistant_msg + [plan_user_msg]

                        def _extract_json_obj(text: str) -> Optional[Dict[str, Any]]:
                            try:
                                obj = json.loads(text)
                                if isinstance(obj, list):
                                    obj = {"steps": obj}
                                if isinstance(obj, dict):
                                    return obj
                            except Exception:
                                pass
                            try:
                                import re as _re
                                m = _re.search(r"```json\s*(.+?)\s*```", text, flags=_re.DOTALL|_re.IGNORECASE)
                                if m:
                                    obj = json.loads(m.group(1))
                                    if isinstance(obj, list):
                                        obj = {"steps": obj}
                                    if isinstance(obj, dict):
                                        return obj
                            except Exception:
                                pass
                            try:
                                start = text.find("{"); end = text.rfind("}")
                                if start != -1 and end != -1 and end > start:
                                    snippet = text[start:end+1]
                                    obj = json.loads(snippet)
                                    if isinstance(obj, list):
                                        obj = {"steps": obj}
                                    if isinstance(obj, dict):
                                        return obj
                            except Exception:
                                pass
                            return None

                        def _valid_plan_schema(obj: Dict[str, Any]) -> bool:
                            if not isinstance(obj, dict):
                                return False
                            steps = obj.get("steps")
                            if not isinstance(steps, list) or len(steps) == 0:
                                return False
                            for s in steps:
                                if not isinstance(s, dict):
                                    return False
                                if not all(k in s for k in ("step_number", "description", "status", "coworker")):
                                    return False
                                if not isinstance(s.get("step_number"), (str, int)):
                                    return False
                                if not isinstance(s.get("description"), str):
                                    return False
                                if not isinstance(s.get("coworker"), str):
                                    return False
                                if str(s.get("status")).upper() not in {"NOT STARTED", "IN PROGRESS", "COMPLETED", "FAILED"}:
                                    return False
                            if "next_step" in obj and not isinstance(obj.get("next_step"), (str, int, type(None))):
                                return False
                            return True

                        attempts = 0
                        plan_obj: Optional[Dict[str, Any]] = None
                        while attempts < 3 and plan_obj is None:
                            attempts += 1
                            plan_call_messages = plan_messages
                            if attempts > 1:
                                fix_hint = {
                                    "role": "user",
                                    "content": "Previous output was not valid JSON matching the required schema. Return ONLY valid JSON per schema {\"steps\":[{\"step_number\":\"1\",\"description\":\"...\",\"status\":\"NOT STARTED|IN PROGRESS|COMPLETED|FAILED\",\"coworker\":\"<Agent role>\"}],\"next_step\":\"<string or empty>\"}. No prose.",
                                }
                                # Append the validation instruction as a user message at the bottom
                                plan_call_messages = plan_messages + [fix_hint]
                            plan_result = super().call(
                                plan_call_messages, tools=None, callbacks=callbacks, available_functions=available_functions
                            )
                            plan_text_out = None
                            if isinstance(plan_result, str):
                                plan_text_out = plan_result
                            elif isinstance(plan_result, dict):
                                try:
                                    if "content" in plan_result and isinstance(plan_result["content"], str):
                                        plan_text_out = plan_result["content"]
                                    elif isinstance(plan_result.get("choices"), list) and plan_result["choices"]:
                                        msg = plan_result["choices"][0].get("message", {})
                                        if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                                            plan_text_out = msg.get("content")
                                except Exception:
                                    pass
                            if plan_text_out is None:
                                plan_text_out = str(plan_result)
                            obj = _extract_json_obj(plan_text_out)
                            if obj is None:
                                pass
                            elif not _valid_plan_schema(obj):
                                pass
                            else:
                                plan_obj = obj
                        if plan_obj is not None and plan_path:
                            try:
                                with open(plan_path, "w", encoding="utf-8") as pf:
                                    json.dump(plan_obj, pf, ensure_ascii=False, indent=2)
                                plan_created_this_call = True
                            except Exception:
                                pass
                        elif attempts >= 3 and plan_obj is None:
                            # After 3 failed attempts, permanently disable planning and evaluation for this session
                            try:
                                self.planning_permanently_disabled = True
                                self.planning_enabled = False
                            except Exception:
                                pass
                            # Append a bottom user message indicating planning has been disabled
                            try:
                                disable_note = {
                                    "role": "user",
                                    "content": (
                                        "Planning could not produce valid JSON after 3 retries. "
                                        "Disabling planning and evaluation for the rest of this session."
                                    ),
                                }
                                if isinstance(base_messages, list):
                                    base_messages.append(disable_note)
                            except Exception:
                                pass
                    except Exception:
                        pass

                    # Evaluation and injection moved outside the needs_plan block
            except Exception:
                pass

        # Evaluation (if plan exists and not just created)
        if bool(getattr(self, "planning_enabled", False)) and not bool(getattr(self, "planning_permanently_disabled", False)):
            try:
                if plan_path and os.path.exists(plan_path) and os.path.getsize(plan_path) > 0 and not skip_planning_and_injection and not plan_created_this_call:
                    print("[SmartManagerPlanEval] Triggering evaluation call")
                    current_plan_obj: Optional[Dict[str, Any]] = None
                    try:
                        with open(plan_path, "r", encoding="utf-8") as pf_eval:
                            current_plan_obj = json.load(pf_eval)
                    except Exception:
                        current_plan_obj = None
                    if current_plan_obj is not None:
                        original_list_for_eval = (
                            base_messages if isinstance(base_messages, list) else [{"role": "user", "content": str(base_messages)}]
                        )
                        try:
                            plan_json_snippet = json.dumps(current_plan_obj, ensure_ascii=False, indent=2)
                        except Exception:
                            plan_json_snippet = str(current_plan_obj)
                        eval_instruction = (
                            "You are Plan Evaluator & Repairer.\n\n"
                            "Inputs you will receive:\n"
                            "• Conversation evidence: only assistant messages above.\n"
                            "• System context (coworkers & their capabilities) is available in earlier messages.\n"
                            "• The user's Current Task and the 'Current Plan JSON' (schema: {\"steps\":[{\"step_number\":\"1\",\"description\":\"...\",\"status\":\"NOT STARTED|IN PROGRESS|COMPLETED|FAILED\",\"coworker\":\"<Agent role>\"}],\"next_step\":\"<string>\"}).\n\n"
                            "Your job, in order:\n"
                            "A) Evidence, expectation & failure check:\n"
                            "   1) From the conversation evidence, determine what outputs or deliverables were actually produced.\n"
                            "   2) Compare against the Current Task’s implied deliverables. If any deliverable is missing or partial, mark related steps as not fully complete.\n"
                            "   3) Identify any step that has failed (e.g., repeated tool errors, impossible prerequisites, hard blockers).\n"
                            "      • Decide whether the failure is CRITICAL (blocks remaining steps) or NON-BLOCKING (independent steps can proceed).\n"
                            "   4) If any coworker/step appears overloaded, treat this as a planning defect requiring repair.\n\n"
                            "B) Status update on existing plan:\n"
                            "   • For each step in 'Current Plan JSON', update only the 'status' using exactly one of: 'NOT STARTED', 'IN PROGRESS', 'COMPLETED', 'FAILED'.\n"
                            "   • Use 'FAILED' when the step cannot be completed by the assigned coworker given current constraints.\n"
                            "   • Mark 'COMPLETED' only if the objective is fully achieved.\n"
                            "   • Mark 'IN PROGRESS' if started but unfinished; else keep 'NOT STARTED'.\n"
                            "   • For 'next_step' (string):\n"
                            "       - If there is a NON-BLOCKING 'FAILED' step, choose the lowest-numbered feasible independent next step.\n"
                            "       - If any step is 'IN PROGRESS', prefer the lowest-numbered 'IN PROGRESS' step.\n"
                            "       - Else set to the lowest-numbered 'NOT STARTED' step.\n"
                            "       - If there is a CRITICAL failure that blocks progress, set next_step to an empty string ("") to signal no next step.\n\n"
                            "C) Plan repair (only if needed):\n"
                            "   If expectations are unmet OR any step/coworker is overloaded OR coworker selection is suboptimal, REWRITE the plan to be concise and non-overloaded.\n"
                            "   Rules for repair:\n"
                            "   1) Deliverables & coworker selection: identify deliverables and choose minimal coworkers that cover them; prefer a single capable coworker if possible.\n"
                            "   2) Step granularity: each step must be atomic and executable end-to-end by a single coworker; fuse micro-actions and split overloaded steps.\n"
                            "   3) Multiple intents: plan distinct parts separately.\n"
                            "   4) Keep plans short and outcome-focused (1–4 steps unless more are clearly needed).\n"
                            "   5) Output schema:\n"
                            "      • Return STRICTLY valid JSON only (no prose, no code fences) as:\n"
                            "        {\"steps\":[{\"step_number\":\"1\",\"description\":\"<brief, atomic>\",\"status\":\"NOT STARTED|IN PROGRESS|COMPLETED|FAILED\",\"coworker\":\"<Agent role>\"}],\"next_step\":\"<string>\"}\n"
                            "      • step_number values are strings ('1','2',...). Descriptions concise and actionable. Coworker must match an available role name exactly (case-sensitive).\n\n"
                            "D) Emission rule:\n"
                            "   • If no repair is needed, output the updated original plan (statuses + next_step only).\n"
                            "   • If repair is needed, output the NEW repaired plan as STRICT JSON.\n\n"
                            "No prose, no explanations, no code fences. Output JSON only.\n\n"
                            "Current Plan JSON:\n" + plan_json_snippet
                        )

                        # Include agent context as assistant messages (same as planning) before evaluation instruction
                        assistant_msgs_eval: List[Dict[str, Any]] = []
                        try:
                            agents_info_eval: List[Dict[str, str]] = getattr(self, "manager_agents_info", None) or []
                            for agent_info in agents_info_eval:
                                role = str(agent_info.get("role", "")).strip()
                                backstory = str(agent_info.get("backstory", "")).strip()
                                goal = str(agent_info.get("goal", "")).strip()
                                aid = str(agent_info.get("id", "")).strip()
                                content_lines_eval = [f"AGENT CONTEXT ({aid})", f"role: {role}", f"backstory: {backstory}", f"goal: {goal}"]
                                assistant_msgs_eval.append({"role": "assistant", "content": "\n".join(content_lines_eval).strip()})
                        except Exception:
                            pass

                        # Insert assistant context right after system messages, before any user messages
                        systems_eval = [m for m in original_list_for_eval if m.get("role") == "system"]
                        users_eval = [m for m in original_list_for_eval if m.get("role") == "user"]
                        others_eval = [m for m in original_list_for_eval if m.get("role") not in ("system", "user")]
                        eval_messages: List[Dict[str, Any]] = []
                        eval_messages.extend(systems_eval)
                        eval_messages.extend(assistant_msgs_eval)
                        eval_messages.extend(users_eval)
                        eval_messages.extend(others_eval)
                        eval_messages.append({"role": "user", "content": eval_instruction})

                        def _extract_json_obj_eval(text: str) -> Optional[Dict[str, Any]]:
                            try:
                                obj = json.loads(text)
                                if isinstance(obj, list):
                                    obj = {"steps": obj}
                                if isinstance(obj, dict):
                                    return obj
                            except Exception:
                                pass
                            try:
                                import re as _re
                                m = _re.search(r"```json\s*(.+?)\s*```", text, flags=_re.DOTALL|_re.IGNORECASE)
                                if m:
                                    obj = json.loads(m.group(1))
                                    if isinstance(obj, list):
                                        obj = {"steps": obj}
                                    if isinstance(obj, dict):
                                        return obj
                            except Exception:
                                pass
                            try:
                                start = text.find("{"); end = text.rfind("}")
                                if start != -1 and end != -1 and end > start:
                                    snippet = text[start:end+1]
                                    obj = json.loads(snippet)
                                    if isinstance(obj, list):
                                        obj = {"steps": obj}
                                    if isinstance(obj, dict):
                                        return obj
                            except Exception:
                                pass
                            return None

                        def _valid_eval_schema(obj: Dict[str, Any]) -> bool:
                            if not isinstance(obj, dict):
                                return False
                            steps = obj.get("steps")
                            if not isinstance(steps, list) or len(steps) == 0:
                                return False
                            allowed_status = {"NOT STARTED", "IN PROGRESS", "COMPLETED", "FAILED"}
                            for s in steps:
                                if not isinstance(s, dict):
                                    return False
                                if not all(k in s for k in ("step_number", "description", "status", "coworker")):
                                    return False
                                if not isinstance(s.get("step_number"), (str, int)):
                                    return False
                                if not isinstance(s.get("description"), str):
                                    return False
                                if not isinstance(s.get("coworker"), str):
                                    return False
                                if str(s.get("status")).upper() not in allowed_status:
                                    return False
                            if "next_step" in obj and not isinstance(obj.get("next_step"), (str, int, type(None))):
                                return False
                            return True

                        eval_result = super().call(
                            eval_messages, tools=None, callbacks=callbacks, available_functions=available_functions
                        )
                        eval_text = None
                        if isinstance(eval_result, str):
                            eval_text = eval_result
                        elif isinstance(eval_result, dict):
                            try:
                                if "content" in eval_result and isinstance(eval_result["content"], str):
                                    eval_text = eval_result["content"]
                                elif isinstance(eval_result.get("choices"), list) and eval_result["choices"]:
                                    msg = eval_result["choices"][0].get("message", {})
                                    if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                                        eval_text = msg.get("content")
                            except Exception:
                                pass
                        if eval_text is None:
                            eval_text = str(eval_result)
                        obj_eval = _extract_json_obj_eval(eval_text)
                        if obj_eval is not None and _valid_eval_schema(obj_eval):
                            try:
                                with open(plan_path, "w", encoding="utf-8") as pfw:
                                    json.dump(obj_eval, pfw, ensure_ascii=False, indent=2)
                            except Exception:
                                pass
            except Exception:
                pass

        # Inject plan into the last user message (always when not skipped)
        if bool(getattr(self, "planning_enabled", False)):
            try:
                if not skip_planning_and_injection and self.session_directory:
                    plan_path_for_injection = os.path.join(self.session_directory, "plan.json")
                    if os.path.exists(plan_path_for_injection):
                        plan_obj_injection: Optional[Dict[str, Any]] = None
                        try:
                            with open(plan_path_for_injection, "r", encoding="utf-8") as pf_inj:
                                plan_obj_injection = json.load(pf_inj)
                        except Exception:
                            plan_obj_injection = None
                        if plan_obj_injection is not None:
                            steps_raw = None
                            if isinstance(plan_obj_injection, dict):
                                steps_raw = plan_obj_injection.get("steps")
                            elif isinstance(plan_obj_injection, list):
                                steps_raw = plan_obj_injection
                            if isinstance(steps_raw, list) and len(steps_raw) > 0:
                                def _to_num(s: Any) -> int:
                                    try:
                                        return int(str(s))
                                    except Exception:
                                        return 10**9
                                try:
                                    steps_sorted = sorted(
                                        steps_raw,
                                        key=lambda s: _to_num((s or {}).get("step_number")) if isinstance(s, dict) else 10**9,
                                    )
                                except Exception:
                                    steps_sorted = steps_raw
                                numbered_lines: List[str] = []
                                for s in steps_sorted:
                                    if isinstance(s, dict):
                                        desc = str(s.get("description", "")).strip()
                                        status = str(s.get("status", "")).strip()
                                        coworker = str(s.get("coworker", "")).strip()
                                    else:
                                        desc = str(s).strip()
                                        status = ""
                                        coworker = ""
                                    if desc:
                                        parts = [desc]
                                        if coworker:
                                            parts.append(f"coworker: {coworker}")
                                        if status:
                                            parts.append(f"status: {status}")
                                        numbered_lines.append(f"{len(numbered_lines)+1}. " + " | ".join(parts))
                                if numbered_lines:
                                    # Derive focus line using next_step in plan if present
                                    focus_line = ""
                                    try:
                                        next_step_val = plan_obj_injection.get("next_step") if isinstance(plan_obj_injection, dict) else None
                                        if next_step_val is not None:
                                            next_str = str(next_step_val)
                                            # Find corresponding description
                                            step_map = {}
                                            try:
                                                for s2 in steps_sorted:
                                                    if isinstance(s2, dict):
                                                        step_map[str(s2.get("step_number"))] = str(s2.get("description", "")).strip()
                                            except Exception:
                                                pass
                                            desc_focus = step_map.get(next_str)
                                            if desc_focus:
                                                focus_line = ("\nFor now you should focus on the step: " + desc_focus + "\n")
                                    except Exception:
                                        focus_line = ""

                                    plan_block_header = "This is the Plan to work with\nPlan:"
                                    plan_block_text = plan_block_header + "\n" + "\n".join(numbered_lines) + focus_line + "\n"
                                    last_user_index = None
                                    for idx in range(len(base_messages) - 1, -1, -1):
                                        try:
                                            if base_messages[idx].get("role") == "user":
                                                last_user_index = idx
                                                break
                                        except Exception:
                                            continue
                                    if last_user_index is not None:
                                        try:
                                            content_u = base_messages[last_user_index].get("content")
                                            if isinstance(content_u, str) and "This is the Plan to work with" not in content_u:
                                                marker = "This is the expected criteria for your final answer"
                                                lower_content = content_u.lower()
                                                pos = lower_content.find(marker.lower())
                                                if pos != -1:
                                                    before = content_u[:pos].rstrip()
                                                    after = content_u[pos:].lstrip()
                                                    new_content_u = (before + "\n\n" + plan_block_text + "\n" + after).strip()
                                                else:
                                                    sep = "\n\n" if not content_u.endswith("\n") else "\n"
                                                    new_content_u = (content_u + sep + plan_block_text).strip()
                                                base_messages[last_user_index] = dict(base_messages[last_user_index])
                                                base_messages[last_user_index]["content"] = new_content_u

                                                # Append a final user note: if all steps completed → request Final Answer; else → caution note.
                                                # Also append the current system message content below the note for reference.
                                                try:
                                                    steps_for_status = []
                                                    if isinstance(plan_obj_injection, dict):
                                                        steps_for_status = plan_obj_injection.get("steps") or []
                                                    all_completed = bool(steps_for_status) and all(
                                                        isinstance(s, dict)
                                                        and str(s.get("status", "")).strip().upper() == "COMPLETED"
                                                        for s in steps_for_status
                                                    )
                                                except Exception:
                                                    all_completed = False

                                                # Detect failures and criticality
                                                try:
                                                    any_failed = bool(steps_for_status) and any(
                                                        isinstance(s, dict)
                                                        and str(s.get("status", "")).strip().upper() == "FAILED"
                                                        for s in steps_for_status
                                                    )
                                                except Exception:
                                                    any_failed = False
                                                # Heuristic for critical failure: FAILED present and no next_step
                                                try:
                                                    ns_val = plan_obj_injection.get("next_step") if isinstance(plan_obj_injection, dict) else None
                                                    ns_clean = str(ns_val).strip() if ns_val is not None else ""
                                                    critical_failure = any_failed and (ns_clean == "")
                                                except Exception:
                                                    critical_failure = False

                                                if all_completed:
                                                    note_text = (
                                                        "All plan steps are COMPLETED. You should now provide the Final Answer. "
                                                        "Use the required response format from the system message and include any necessary evidence/artifacts."
                                                    )
                                                elif critical_failure:
                                                    # Find failed step description for clarity
                                                    failed_desc = ""
                                                    try:
                                                        for s in steps_for_status:
                                                            if isinstance(s, dict) and str(s.get("status", "")).strip().upper() == "FAILED":
                                                                failed_desc = str(s.get("description", "")).strip()
                                                                if failed_desc:
                                                                    break
                                                    except Exception:
                                                        failed_desc = ""
                                                    note_text = (
                                                        "CRITICAL FAILURE detected: coworkers cannot complete a required step"
                                                        + (f" — '{failed_desc}'. " if failed_desc else ". ")
                                                        + "Provide the Final Answer now as a failure report: briefly summarize the failure,"
                                                        " list what was achieved so far (any completed or partial outputs), and present any useful interim results."
                                                    )
                                                else:
                                                    note_text = (
                                                        "IMPORTANT NOTE: You have NOT yet achieved the Final Answer. Do NOT provide a final answer now. "
                                                        "If any step has FAILED but is non-blocking, proceed to the next feasible independent step. "
                                                        "Continue working step-by-step toward the plan's deliverables, and respond only with Thought: ...... Action..... — not a final result."
                                                    )

                                                # Append system message content under the note
                                                system_text_ref = ""
                                                try:
                                                    first_system = next((m for m in base_messages if m.get("role") == "system"), None)
                                                    st = first_system.get("content") if isinstance(first_system, dict) else None
                                                    if isinstance(st, str) and st.strip():
                                                        system_text_ref = "\n\nSYSTEM MESSAGE (for reference):\n" + st
                                                except Exception:
                                                    system_text_ref = ""

                                                final_note_payload = note_text + system_text_ref

                                                caution_phrase = "IMPORTANT NOTE: You have NOT yet achieved the Final Answer"
                                                final_phrase = "All plan steps are COMPLETED. You should now provide the Final Answer"

                                                if all_completed:
                                                    # Remove any previous caution notes, then append final note if not already present
                                                    try:
                                                        base_messages = [
                                                            m for m in base_messages
                                                            if not (
                                                                isinstance(m, dict)
                                                                and m.get("role") == "user"
                                                                and isinstance(m.get("content"), str)
                                                                and caution_phrase in m.get("content", "")
                                                            )
                                                        ]
                                                    except Exception:
                                                        pass
                                                    try:
                                                        has_final_already = any(
                                                            isinstance(m, dict)
                                                            and m.get("role") == "user"
                                                            and isinstance(m.get("content"), str)
                                                            and final_phrase in m["content"]
                                                            for m in base_messages
                                                        )
                                                    except Exception:
                                                        has_final_already = False
                                                    if not has_final_already:
                                                        base_messages.append({"role": "user", "content": final_note_payload})
                                                else:
                                                    # Append caution note only if not already present
                                                    try:
                                                        has_caution_already = any(
                                                            isinstance(m, dict)
                                                            and m.get("role") == "user"
                                                            and isinstance(m.get("content"), str)
                                                            and caution_phrase in m["content"]
                                                            for m in base_messages
                                                        )
                                                    except Exception:
                                                        has_caution_already = False
                                                    if not has_caution_already:
                                                        base_messages.append({"role": "user", "content": final_note_payload})
                                        except Exception:
                                            pass
            except Exception:
                pass

        messages_with_suffix = AgentStudioCrewAILLM._append_artifacts_instruction(base_messages)

        # If planning is disabled or permanently disabled, skip planning/eval logic but keep sanitization, state injection and artifacts suffix
        if not bool(getattr(self, "planning_enabled", False)) or bool(getattr(self, "planning_permanently_disabled", False)):
            return super().call(
                messages_with_suffix,
                tools=tools,
                callbacks=callbacks,
                available_functions=available_functions,
            )

        # If planning is enabled, perform planning/evaluation logic (handled elsewhere in this class),
        # but still use the sanitized + state-injected messages as the base.
        return super().call(
            messages_with_suffix,
            tools=tools,
            callbacks=callbacks,
            available_functions=available_functions,
        )


class AgentStudioCrewAIAgent(Agent):
    agent_studio_id: Optional[str] = None
    session_directory: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id

    def get_delegation_tools(self, agents: List[Agent]) -> List[BaseTool]:
        coworkers = ", ".join([f"{agent.role}" for agent in agents])
        delegate_tool = AgentStudioDelegateWorkTool(
            agents=agents,
            i18n=self.i18n,
            description=self.i18n.tools("delegate_work").format(coworkers=coworkers),  # type: ignore
            session_directory=self.session_directory,
        )
        ask_tool = AgentStudioAskQuestionTool(
            agents=agents,
            i18n=self.i18n,
            description=self.i18n.tools("ask_question").format(coworkers=coworkers),  # type: ignore
            session_directory=self.session_directory,
        )
        return [delegate_tool, ask_tool]

    def execute_task(
        self,
        task: Task,
        context: Optional[str] = None,
        tools: Optional[List[BaseTool]] = None,
    ) -> str:
        result: str = super().execute_task(task, context=context, tools=tools)
        try:
            if self.session_directory:
                os.makedirs(self.session_directory, exist_ok=True)
                state_json = os.path.join(self.session_directory, "state.json")
                entries: List[Dict[str, Any]] = []
                try:
                    if os.path.exists(state_json):
                        with open(state_json, "r", encoding="utf-8") as sf:
                            entries = json.load(sf) or []
                            if not isinstance(entries, list):
                                entries = []
                except Exception:
                    entries = []
                try:
                    entries.append({
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "response": str(result).strip(),
                        "agent_role": getattr(self, "role", None)
                    })
                    with open(state_json, "w", encoding="utf-8") as wf:
                        json.dump(entries, wf, ensure_ascii=False, indent=2)
                except Exception:
                    pass
        except Exception:
            pass
        return result


class AgentStudioCrewAITask(Task):
    agent_studio_id: Optional[str] = None
    session_directory: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
        self.session_directory = kwargs.get("session_directory")


class AgentStudioCrewAITool(BaseTool):
    agent_studio_id: Optional[str] = None
    session_directory: Optional[str] = None

    def __init__(self, agent_studio_id: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
        self.session_directory = kwargs.get("session_directory")


class AgentStudioDelegateWorkTool(DelegateWorkTool):
    session_directory: Optional[str] = Field(default=None, description="Session directory containing state.txt")

    def _run(
        self,
        task: str,
        context: str,
        coworker: Optional[str] = None,
        **kwargs,
    ) -> str:
        coworker = self._get_coworker(coworker, **kwargs)
        return self._execute(coworker, task, context)


class AgentStudioAskQuestionTool(AskQuestionTool):
    session_directory: Optional[str] = Field(default=None, description="Session directory containing state.txt")

    def _run(
        self,
        question: str,
        context: str,
        coworker: Optional[str] = None,
        **kwargs,
    ) -> str:
        coworker = self._get_coworker(coworker, **kwargs)
        return self._execute(coworker, question, context)

