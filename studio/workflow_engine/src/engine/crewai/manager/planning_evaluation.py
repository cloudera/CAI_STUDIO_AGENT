from __future__ import annotations

from typing import Any, Dict, List, Optional
import json

from ..prompts.loader import load_prompt
from .state_context import split_conversation_entries, build_any_entries_after_last_conversation, build_any_entries_up_to_last_conversation


def build_eval_messages(
    base_messages: Any,
    agents_info: Optional[List[Dict[str, Any]]],
    state_entries: Optional[List[Dict[str, Any]]],
    plan_obj: Dict[str, Any],
) -> List[Dict[str, Any]]:
    original_list_for_eval = base_messages if isinstance(base_messages, list) else [{"role": "user", "content": str(base_messages)}]
    try:
        plan_json_snippet = json.dumps(plan_obj, ensure_ascii=False, indent=2)
    except Exception:
        plan_json_snippet = str(plan_obj)
    eval_instruction_template = load_prompt("evaluation_instruction.md")
    eval_instruction = eval_instruction_template.replace("{{PLAN_JSON_SNIPPET}}", plan_json_snippet)

    assistant_msgs_eval: List[Dict[str, Any]] = []
    try:
        agents = agents_info or []
        for agent_info in agents:
            role = str(agent_info.get("role", "")).strip()
            backstory = str(agent_info.get("backstory", "")).strip()
            goal = str(agent_info.get("goal", "")).strip()
            aid = str(agent_info.get("id", "")).strip()
            tools_ctx = agent_info.get("tools") or []
            tools_lines: List[str] = []
            try:
                for tinfo in tools_ctx:
                    tname = str((tinfo or {}).get("name", "")).strip()
                    tpayload = str((tinfo or {}).get("payload", "")).strip()
                    if tname:
                        line = f"- tool: {tname}"
                        if tpayload:
                            line += f" | payload: {tpayload}"
                        tools_lines.append(line)
            except Exception:
                tools_lines = []
            content_lines_eval = [
                f"AGENT CONTEXT ({aid})",
                f"role: {role}",
                f"backstory: {backstory}",
                f"goal: {goal}",
            ]
            if tools_lines:
                content_lines_eval.append("tools:\n" + "\n".join(tools_lines))
            assistant_msgs_eval.append({"role": "assistant", "content": "\n".join(content_lines_eval).strip()})
    except Exception:
        pass

    systems_eval = [m for m in original_list_for_eval if m.get("role") == "system"]
    users_eval = [m for m in original_list_for_eval if m.get("role") == "user"]

    # For evaluation, include agent context after systems, then PAST context, then user messages, then NEW context, then eval instruction user
    past_msgs: List[Dict[str, Any]] = []
    new_msgs: List[Dict[str, Any]] = []
    try:
        entries_eval = state_entries or []
        # Past = ALL entries up to last conversation (excluding Agent Studio)
        past_msgs = build_any_entries_up_to_last_conversation(entries_eval)
        # New = ALL entries after last conversation (excluding Agent Studio)
        new_msgs = build_any_entries_after_last_conversation(entries_eval)
    except Exception:
        past_msgs, new_msgs = [], []

    eval_messages: List[Dict[str, Any]] = []
    eval_messages.extend(systems_eval)
    eval_messages.extend(assistant_msgs_eval)
    eval_messages.extend(past_msgs)
    eval_messages.extend(users_eval)
    eval_messages.extend(new_msgs)
    eval_messages.append({"role": "user", "content": eval_instruction})
    return eval_messages


def parse_eval_result(text_or_obj: Any) -> Optional[Dict[str, Any]]:
    text = None
    if isinstance(text_or_obj, str):
        text = text_or_obj
    elif isinstance(text_or_obj, dict):
        try:
            if "content" in text_or_obj and isinstance(text_or_obj["content"], str):
                text = text_or_obj["content"]
            elif isinstance(text_or_obj.get("choices"), list) and text_or_obj["choices"]:
                msg = text_or_obj["choices"][0].get("message", {})
                if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                    text = msg.get("content")
        except Exception:
            pass
    if text is None:
        text = str(text_or_obj)

    # parse JSON
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
        m = _re.search(r"```json\s*(.+?)\s*```", text, flags=_re.DOTALL | _re.IGNORECASE)
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
            snippet = text[start:end + 1]
            obj = json.loads(snippet)
            if isinstance(obj, list):
                obj = {"steps": obj}
            if isinstance(obj, dict):
                return obj
    except Exception:
        pass
    return None


def valid_eval_schema(obj: Dict[str, Any]) -> bool:
    if not isinstance(obj, dict):
        return False
    steps = obj.get("steps")
    if not isinstance(steps, list) or len(steps) == 0:
        return False
    allowed_status = {"NOT STARTED", "IN PROGRESS", "COMPLETED", "FAILED", "HUMAN_INPUT_REQUIRED"}
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

