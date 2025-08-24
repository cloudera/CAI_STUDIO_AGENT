from __future__ import annotations

from typing import Any, Dict, List, Optional
import json

from ..prompts.loader import load_prompt


def build_decision_messages(
    original_messages: Any,
    agents_info: Optional[List[Dict[str, Any]]],
    state_json_entries: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    original_list = original_messages if isinstance(original_messages, list) else [{"role": "user", "content": str(original_messages)}]
    decision_systems = [m for m in original_list if m.get("role") == "system"]
    decision_users = [m for m in original_list if m.get("role") == "user"]
    decision_messages: List[Dict[str, Any]] = []
    decision_messages.extend(decision_systems)

    # coworker context after systems
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
            content_lines_dec = [
                f"AGENT CONTEXT ({aid})",
                f"role: {role}",
                f"backstory: {backstory}",
                f"goal: {goal}",
            ]
            if tools_lines:
                content_lines_dec.append("tools:\n" + "\n".join(tools_lines))
            decision_messages.append({"role": "assistant", "content": "\n".join(content_lines_dec).strip()})
    except Exception:
        pass

    # last state assistant before final user
    state_assistant_for_decision: List[Dict[str, Any]] = []
    try:
        entries = state_json_entries or []
        if isinstance(entries, list) and entries:
            last_entry = entries[-1]
            ts = str(last_entry.get("timestamp", "")).strip()
            content = str(last_entry.get("response", "")).strip()
            if content:
                header = (f"CONTEXT: This is the last agent output at {ts}." if ts else "CONTEXT: This is a prior agent output.")
                state_assistant_for_decision = [{"role": "assistant", "content": header + "\n" + content}]
    except Exception:
        state_assistant_for_decision = []

    if decision_users:
        decision_messages.extend(decision_users[:-1])
        decision_messages.extend(state_assistant_for_decision)
        decision_messages.append(decision_users[-1])
    else:
        decision_messages.extend(state_assistant_for_decision)

    decision_instruction = load_prompt("planning_decision_instruction.md")
    decision_messages.append({"role": "user", "content": decision_instruction})
    return decision_messages


def parse_decision_result(decision_result: Any) -> Optional[Dict[str, Any]]:
    text = None
    if isinstance(decision_result, str):
        text = decision_result
    elif isinstance(decision_result, dict):
        try:
            if "content" in decision_result and isinstance(decision_result["content"], str):
                text = decision_result["content"]
            elif isinstance(decision_result.get("choices"), list) and decision_result["choices"]:
                msg = decision_result["choices"][0].get("message", {})
                if isinstance(msg, dict) and isinstance(msg.get("content"), str):
                    text = msg.get("content")
        except Exception:
            pass
    if text is None:
        text = str(decision_result)

    try:
        return json.loads(text)
    except Exception:
        pass
    try:
        import re as _re
        m = _re.search(r"```json\s*(.+?)\s*```", text, flags=_re.DOTALL | _re.IGNORECASE)
        if m:
            return json.loads(m.group(1))
    except Exception:
        pass
    try:
        start = text.find("{"); end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
    except Exception:
        pass
    return None

