from __future__ import annotations

from typing import Any, Dict, List, Optional
import json

from ..prompts.loader import load_prompt


def build_planning_messages(
    original_messages: Any,
    agents_info: Optional[List[Dict[str, Any]]],
    state_last_entry: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    original_list = original_messages if isinstance(original_messages, list) else [{"role": "user", "content": str(original_messages)}]
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
        plan_instruction = load_prompt("planning_instruction")
        return (text + ("\n\n" if not text.endswith("\n") else "\n") + plan_instruction).strip()

    trimmed_user_content = _trim_user_for_plan(last_user_content)
    plan_user_msg = {"role": "user", "content": trimmed_user_content}

    assistant_msgs: List[Dict[str, Any]] = []
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
            header = f"AGENT CONTEXT ({aid})"
            content_parts = [header, f"role: {role}", f"backstory: {backstory}", f"goal: {goal}"]
            if tools_lines:
                content_parts.append("tools:\n" + "\n".join(tools_lines))
            assistant_msgs.append({"role": "assistant", "content": "\n".join(content_parts).strip()})
    except Exception:
        pass

    # State context BEFORE planning user message
    state_assistant_msg: List[Dict[str, Any]] = []
    try:
        if isinstance(state_last_entry, dict) and state_last_entry:
            ts = str(state_last_entry.get("timestamp", "")).strip()
            content = str(state_last_entry.get("response", "")).strip()
            if content:
                header = (f"CONTEXT: This is the last agent output at {ts}." if ts else "CONTEXT: This is a prior agent output.")
                state_assistant_msg = [{"role": "assistant", "content": header + "\n" + content}]
    except Exception:
        pass

    return system_msgs + assistant_msgs + state_assistant_msg + [plan_user_msg]


def extract_json_obj(text: str) -> Optional[Dict[str, Any]]:
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


def valid_plan_schema(obj: Dict[str, Any]) -> bool:
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

