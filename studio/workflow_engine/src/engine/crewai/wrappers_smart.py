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
from .prompts.loader import load_prompt
from .manager.planning_decision import build_decision_messages, parse_decision_result
from .manager.planning_generate import build_planning_messages, extract_json_obj as extract_plan_json, valid_plan_schema
from .manager.planning_evaluation import build_eval_messages, parse_eval_result, valid_eval_schema
from .manager.plan_injection import build_plan_block
from .manager.state_context import read_state_entries, build_assistant_messages_from_entries, insert_before_first_user, insert_after_first_user, split_conversation_entries, build_any_entries_up_to_last_conversation
from .manager.notes import build_status_note
from .utils.messages import (
    sanitize_messages as _sanitize_messages_util,
    append_artifacts_instruction as _append_artifacts_instruction_util,
)
from .utils.summarization import (
    build_summary_signature as _build_summary_signature_util,
    build_chunk_signature as _build_chunk_signature_util,
)
from .utils.summary_cache import (
    summary_cache_get as _summary_cache_get_util,
    summary_cache_put as _summary_cache_put_util,
)


class AgentStudioCrewAILLM(LLM):
    agent_studio_id: Optional[str] = None
    session_directory: Optional[str] = None
    _summary_cache: Dict[str, str] = {}
    _summary_cache_capacity: int = 256
    ASSISTANT_SUMMARY_WINDOW: int = 4
    ARTIFACTS_SUFFIX: str = load_prompt("artifacts_suffix_assistant")
    HUMAN_INPUT_SUFFIX: str = load_prompt("human_input_required_suffix")
    HARD_CONSTRAINT: str = load_prompt("hard_constraint")

    def __init__(self, agent_studio_id: str, *args, session_directory: Optional[str] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
        self.session_directory = session_directory

    @staticmethod
    def _trim_assistant_content(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return _sanitize_messages_util(messages)

    @staticmethod
    def _truncate_non_marker_assistant_messages(
        messages: List[Dict[str, Any]], max_words: int = 200
    ) -> List[Dict[str, Any]]:
        # Delegate to util then return
        return _sanitize_messages_util(messages)

    @staticmethod
    def _build_summary_signature(
        messages: List[Dict[str, Any]],
        last_four_assistant_indices: List[int],
        agent_studio_id: Optional[str],
    ) -> str:
        return _build_summary_signature_util(messages, last_four_assistant_indices, agent_studio_id)

    @staticmethod
    def _build_chunk_signature(
        messages: List[Dict[str, Any]],
        assistant_chunk_indices: List[int],
        agent_studio_id: Optional[str],
    ) -> str:
        return _build_chunk_signature_util(messages, assistant_chunk_indices, agent_studio_id)

    @classmethod
    def _summary_cache_get(cls, key: str) -> Optional[str]:
        return _summary_cache_get_util(cls._summary_cache, key)

    @classmethod
    def _summary_cache_put(cls, key: str, value: str) -> None:
        _summary_cache_put_util(cls._summary_cache, cls._summary_cache_capacity, key, value)

    @classmethod
    def _sanitize_messages(cls, messages_in: Any) -> List[Dict[str, Any]]:
        return _sanitize_messages_util(messages_in)

    @classmethod
    def _append_artifacts_instruction(
        cls, messages: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        return _append_artifacts_instruction_util(messages, cls.ARTIFACTS_SUFFIX, cls.HUMAN_INPUT_SUFFIX, getattr(cls, "HARD_CONSTRAINT", ""))

    def call(
        self,
        messages: Any,
        tools: Optional[List[dict]] = None,
        callbacks: Optional[List[Any]] = None,
        available_functions: Optional[Dict[str, Any]] = None,
    ) -> Any:
        sanitized_messages = self._sanitize_messages(messages)
        try:
            # Mirror manager wrapper: include ONLY past context up to last conversation, inserted before first user
            entries = read_state_entries(self.session_directory) if self.session_directory else []
            past_msgs = build_any_entries_up_to_last_conversation(entries)
            if past_msgs:
                sanitized_messages = insert_before_first_user(sanitized_messages, past_msgs)
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
                summarization_prompt = load_prompt("assistant_summarization_instruction")
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
    ARTIFACTS_SUFFIX: str = load_prompt("artifacts_suffix_manager")
    HUMAN_INPUT_SUFFIX: str = load_prompt("human_input_required_suffix")
    HARD_CONSTRAINT: str = load_prompt("hard_constraint")
    manager_agents_info: Optional[List[Dict[str, str]]] = None
    planning_enabled: bool = False
    planning_permanently_disabled: bool = False

    def __init__(self, agent_studio_id: str, *args, session_directory: Optional[str] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.agent_studio_id = agent_studio_id
        self.session_directory = session_directory    

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
            entries = read_state_entries(self.session_directory)
            # For normal LLM calls (non-decision/planning/evaluation), include ONLY past context (all entries up to last conversation)
            past_msgs = build_any_entries_up_to_last_conversation(entries)
            base_messages = insert_before_first_user(base_messages, past_msgs)
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
                            tools_ctx = agent_info.get("tools") or []
                            if tools_ctx:
                                lines.append("  tools:")
                                for tinfo in tools_ctx:
                                    try:
                                        tname = str((tinfo or {}).get("name", "")).strip()
                                    except Exception:
                                        tname = ""
                                    try:
                                        tdesc = str((tinfo or {}).get("description", "")).strip()
                                    except Exception:
                                        tdesc = ""
                                    try:
                                        tpayload = str((tinfo or {}).get("payload", "")).strip()
                                    except Exception:
                                        tpayload = ""
                                    if tname:
                                        line = f"    - tool: {tname}"
                                        if tpayload:
                                            line += f" | payload: {tpayload}"
                                        lines.append(line)
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
                        # Build decision messages via helper
                        try:
                            entries_decision = read_state_entries(self.session_directory)
                        except Exception:
                            entries_decision = []
                        decision_messages = build_decision_messages(messages, getattr(self, "manager_agents_info", None), entries_decision)
                        decision_result = super().call(
                            decision_messages, tools=None, callbacks=callbacks, available_functions=available_functions
                        )
                        decision_obj = parse_decision_result(decision_result)
                        if isinstance(decision_obj, dict) and isinstance(decision_obj.get("result"), str):
                            skip_planning_and_injection = True
                            # Inject the planning decision directly into the last user message content
                            try:
                                result_desc = str(decision_obj.get("result", "")).strip()
                                decision_tpl = load_prompt("planning_decision_block")
                                decision_block = decision_tpl.replace("{{RESULT_DESCRIPTION}}", result_desc)
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
                        # Build planning messages via helper
                        state_last_entry = None
                        try:
                            entries2 = read_state_entries(self.session_directory)
                            if isinstance(entries2, list) and entries2:
                                state_last_entry = entries2[-1]
                        except Exception:
                            state_last_entry = None
                        plan_messages: List[Dict[str, Any]] = build_planning_messages(messages, getattr(self, "manager_agents_info", None), state_last_entry)

                        def _extract_json_obj(text: str) -> Optional[Dict[str, Any]]:
                            return extract_plan_json(text)

                        def _valid_plan_schema(obj: Dict[str, Any]) -> bool:
                            return valid_plan_schema(obj)

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
                            obj = extract_plan_json(plan_text_out)
                            if obj is None:
                                pass
                            elif not valid_plan_schema(obj):
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
                                    "content": load_prompt("planning_disable_note"),
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
                        # Build eval messages from helper

                        # Load state entries
                        entries_eval = []
                        try:
                            entries_eval = read_state_entries(self.session_directory)
                        except Exception:
                            entries_eval = []
                        eval_messages: List[Dict[str, Any]] = build_eval_messages(base_messages, getattr(self, "manager_agents_info", None), entries_eval, current_plan_obj)

                        def _extract_json_obj_eval(text: str) -> Optional[Dict[str, Any]]:
                            return parse_eval_result(text)

                        def _valid_eval_schema(obj: Dict[str, Any]) -> bool:
                            return valid_eval_schema(obj)

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
                        obj_eval = parse_eval_result(eval_text)
                        if obj_eval is not None and valid_eval_schema(obj_eval):
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

                                    plan_block_text = build_plan_block(plan_obj_injection)
                                    # Inject plan into a NEW user message we add (do NOT modify existing user messages)
                                    try:
                                        has_plan_already = any(
                                            isinstance(m, dict)
                                            and m.get("role") == "user"
                                            and isinstance(m.get("content"), str)
                                            and "This is the Plan to work with" in m.get("content", "")
                                            for m in base_messages
                                        )
                                    except Exception:
                                        has_plan_already = False

                                    # Build status note using helper
                                    try:
                                        first_system = next((m for m in base_messages if m.get("role") == "system"), None)
                                        st = first_system.get("content") if isinstance(first_system, dict) else ""
                                        if not isinstance(st, str):
                                            st = ""
                                    except Exception:
                                        st = ""
                                    final_note_payload = build_status_note(plan_obj_injection, st)

                                    # Append a new user message containing the plan (on top) and the note
                                    if not has_plan_already:
                                        base_messages.append({
                                            "role": "user",
                                            "content": (plan_block_text + "\n" + final_note_payload).strip(),
                                        })
                                    else:
                                        # Plan already present; append only the note if similar note not already present
                                        caution_phrase = "IMPORTANT NOTE: You have NOT yet achieved the Final Answer"
                                        final_phrase = "All plan steps are COMPLETED. You should now provide the Final Answer"
                                        if final_phrase in final_note_payload:
                                            # Remove any existing caution notes to avoid conflict, then append final note if not present
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
                                            has_final_already = any(
                                                isinstance(m, dict)
                                                and m.get("role") == "user"
                                                and isinstance(m.get("content"), str)
                                                and final_phrase in m.get("content", "")
                                                for m in base_messages
                                            )
                                            if not has_final_already:
                                                base_messages.append({"role": "user", "content": final_note_payload})
                                        else:
                                            # Caution/HIR/Failure notes: avoid duplicates
                                            has_caution_already = any(
                                                isinstance(m, dict)
                                                and m.get("role") == "user"
                                                and isinstance(m.get("content"), str)
                                                and caution_phrase in m.get("content", "")
                                                for m in base_messages
                                            )
                                            if not has_caution_already:
                                                base_messages.append({"role": "user", "content": final_note_payload})
            except Exception:
                pass

        # Insert artifacts/human-input/hard-constraint as separate system messages
        messages_with_suffix = _append_artifacts_instruction_util(
            base_messages,
            getattr(self, "ARTIFACTS_SUFFIX", ""),
            "",
            getattr(self, "HARD_CONSTRAINT", ""),
        )

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
                        "agent_role": getattr(self, "role", None),
                        "task_description": getattr(task, "description", None)
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

