from __future__ import annotations

from typing import Any, Dict, List, Optional
import json
import os

from ..prompts.loader import load_prompt


def read_state_entries(session_directory: Optional[str]) -> List[Dict[str, Any]]:
    if not session_directory:
        return []
    path = os.path.join(session_directory, "state.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as sf:
            data = json.load(sf) or []
            return data if isinstance(data, list) else []
    except Exception:
        return []


def build_assistant_messages_from_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    msg_list: List[Dict[str, str]] = []
    headers_tpl = load_prompt("context_headers")
    headers_lines = {}
    if headers_tpl:
        try:
            headers_lines = {
                k.strip(): v.strip()
                for k, v in (ln.split(": ", 1) for ln in headers_tpl.splitlines() if ": " in ln)
            }
        except Exception:
            headers_lines = {}

    for e in entries:
        try:
            ts = str(e.get("timestamp", "")).strip()
            content = str(e.get("response", "")).strip()
            role = str(e.get("role", "")).strip()
            if not content:
                continue
            # Only include conversation entries after first user; Agent Studio will be inserted separately in wrappers
            if role and role.lower() != "conversation":
                continue
            if ts:
                header = headers_lines.get("LAST_WITH_TS", "CONTEXT: This is the last agent output at {{TS}}.").replace("{{TS}}", ts)
            else:
                header = headers_lines.get("PRIOR", "CONTEXT: This is a prior agent output.")
            msg_list.append({"role": "assistant", "content": header + "\n" + content})
        except Exception:
            continue
    return msg_list


def insert_before_first_user(messages: List[Dict[str, Any]], assistant_msgs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not assistant_msgs:
        return messages
    first_user_index = next((idx for idx, m in enumerate(messages) if m.get("role") == "user"), None)
    insertion_index = first_user_index if first_user_index is not None else 0
    return messages[:insertion_index] + assistant_msgs + messages[insertion_index:]


def insert_after_first_user(messages: List[Dict[str, Any]], assistant_msgs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not assistant_msgs:
        return messages
    try:
        first_user_index = next((idx for idx, m in enumerate(messages) if m.get("role") == "user"), None)
    except Exception:
        first_user_index = None
    if first_user_index is None:
        return messages + assistant_msgs
    insertion_index = first_user_index + 1
    return messages[:insertion_index] + assistant_msgs + messages[insertion_index:]


def split_conversation_entries(entries: List[Dict[str, Any]]) -> (List[Dict[str, Any]], List[Dict[str, Any]]):
    """Return (past_msgs, new_msgs) as assistant messages built from entries with role == 'conversation'.

    - Past context includes all 'conversation' entries up to and including the last one.
    - New context includes any 'conversation' entries that appear AFTER the last one (usually none unless multiple runs appended later).
    - Roles other than 'conversation' are ignored.
    """
    headers_tpl = load_prompt("context_headers")
    headers_lines = {}
    if headers_tpl:
        try:
            headers_lines = {
                k.strip(): v.strip()
                for k, v in (ln.split(": ", 1) for ln in headers_tpl.splitlines() if ": " in ln)
            }
        except Exception:
            headers_lines = {}

    conversation_entries = [e for e in entries if str(e.get("role", "")).strip().lower() == "conversation"]
    if not conversation_entries:
        return [], []
    last_idx = len(conversation_entries) - 1
    past, new = conversation_entries[: last_idx + 1], conversation_entries[last_idx + 1 :]

    def _to_assistant(entry: Dict[str, Any], is_past: bool) -> Optional[Dict[str, Any]]:
        try:
            ts = str(entry.get("timestamp", "")).strip()
            content = str(entry.get("response", "")).strip()
            role = str(entry.get("role", "")).strip().lower()
            if not content:
                return None
            if role == "conversation":
                header = (f"Conversation history till {ts}." if ts else "Conversation history.")
            else:
                if is_past:
                    header = (f"STEP RESULTS(OLD): Agent output at {ts}." if ts else "STEP RESULTS(OLD): Prior agent output.")
                else:
                    header = (f"STEP RESULTS(NEW): Agent output at {ts}." if ts else "STEP RESULTS(NEW): Prior agent output.")
            return {"role": "assistant", "content": header + "\n" + content}
        except Exception:
            return None

    past_msgs = [m for m in (_to_assistant(e, True) for e in past) if m is not None]
    new_msgs = [m for m in (_to_assistant(e, False) for e in new) if m is not None]
    return past_msgs, new_msgs


def build_any_entries_after_last_conversation(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return assistant messages for ALL entries that occur AFTER the last 'conversation' entry.

    - Entries with role 'Agent Studio' are ignored.
    - Entries without a 'role' (e.g., tool/agent outputs with 'agent_role') are included.
    - Messages are rendered as assistant with appropriate CONTEXT header using timestamps.
    """
    headers_tpl = load_prompt("context_headers")
    headers_lines = {}
    if headers_tpl:
        try:
            headers_lines = {
                k.strip(): v.strip()
                for k, v in (ln.split(": ", 1) for ln in headers_tpl.splitlines() if ": " in ln)
            }
        except Exception:
            headers_lines = {}

    # Find absolute index (in full list) of last 'conversation' role
    last_conv_abs_idx = -1
    for idx, e in enumerate(entries or []):
        try:
            if str(e.get("role", "")).strip().lower() == "conversation":
                last_conv_abs_idx = idx
        except Exception:
            continue

    # Collect entries strictly after that index
    result: List[Dict[str, Any]] = []
    for idx, e in enumerate(entries or []):
        if idx <= last_conv_abs_idx:
            continue
        try:
            role = str(e.get("role", "")).strip()
            if role.lower() == "agent studio":
                continue
            # If this is a conversation entry and there are multiple, we already used the last one; any later conv entries are treated as new context and kept
            content = str(e.get("response", "")).strip()
            if not content:
                continue
            ts = str(e.get("timestamp", "")).strip()
            role_l = role.lower()
            if role_l == "conversation":
                header = (f"Conversation history till {ts}." if ts else "Conversation history.")
                body = header + "\n" + content
            else:
                agent_role = str(e.get("agent_role", "")).strip()
                task_desc = str(e.get("task_description", "")).strip()
                if ts:
                    header = (
                        f"STEP RESULTS(NEW): {agent_role} Agent output at {ts}."
                        if agent_role else f"STEP RESULTS(NEW): Agent output at {ts}."
                    )
                else:
                    header = (
                        f"STEP RESULTS(NEW): {agent_role} Prior agent output."
                        if agent_role else "STEP RESULTS(NEW): Prior agent output."
                    )
                desc_line = (f"STEP DESCRIPTION: {task_desc}\n" if task_desc else "")
                body = desc_line + header + "\n" + content
            result.append({"role": "assistant", "content": body})
        except Exception:
            continue
    return result


def build_any_entries_up_to_last_conversation(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return assistant messages for ALL entries up to and including the last 'conversation' entry.

    - Excludes entries with role 'Agent Studio'.
    - Includes entries without role (e.g., tool/agent outputs).
    - If no 'conversation' entries exist, include all entries (still excluding Agent Studio).
    """
    headers_tpl = load_prompt("context_headers")
    headers_lines = {}
    if headers_tpl:
        try:
            headers_lines = {
                k.strip(): v.strip()
                for k, v in (ln.split(": ", 1) for ln in headers_tpl.splitlines() if ": " in ln)
            }
        except Exception:
            headers_lines = {}

    # Find absolute index (in full list) of last 'conversation' role
    last_conv_abs_idx = -1
    for idx, e in enumerate(entries or []):
        try:
            if str(e.get("role", "")).strip().lower() == "conversation":
                last_conv_abs_idx = idx
        except Exception:
            continue
    if last_conv_abs_idx == -1:
        last_conv_abs_idx = len(entries or []) - 1

    result: List[Dict[str, Any]] = []
    for idx, e in enumerate(entries or []):
        if idx > last_conv_abs_idx:
            break
        try:
            role = str(e.get("role", "")).strip()
            if role.lower() == "agent studio":
                continue
            # If this is a conversation entry and not the last one, skip it
            if role.lower() == "conversation" and idx != last_conv_abs_idx:
                continue
            content = str(e.get("response", "")).strip()
            if not content:
                continue
            ts = str(e.get("timestamp", "")).strip()
            role_l = role.lower()
            if role_l == "conversation":
                header = (f"Conversation history till {ts}." if ts else "Conversation history.")
                body = header + "\n" + content
            else:
                agent_role = str(e.get("agent_role", "")).strip()
                task_desc = str(e.get("task_description", "")).strip()
                if ts:
                    header = (
                        f"STEP RESULTS(OLD): {agent_role} Agent output at {ts}."
                        if agent_role else f"STEP RESULTS(OLD): Agent output at {ts}."
                    )
                else:
                    header = (
                        f"STEP RESULTS(OLD): {agent_role} Prior agent output."
                        if agent_role else "STEP RESULTS(OLD): Prior agent output."
                    )
                desc_line = (f"STEP DESCRIPTION: {task_desc}\n" if task_desc else "")
                body = desc_line + header + "\n" + content
            result.append({"role": "assistant", "content": body})
        except Exception:
            continue
    return result


def build_all_entries_only_last_conversation(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return assistant messages for ALL entries, excluding 'Agent Studio', but include ONLY the last 'conversation' entry.

    - Keeps chronological order.
    - Conversation entries: only the last one is included and labeled as Conversation history.
    - Non-conversation entries before last conversation are labeled STEP RESULTS(OLD); after are STEP RESULTS(NEW).
    """
    headers_tpl = load_prompt("context_headers")
    # Find absolute index (in full list) of last 'conversation' role
    last_conv_abs_idx = -1
    for idx, e in enumerate(entries or []):
        try:
            if str(e.get("role", "")).strip().lower() == "conversation":
                last_conv_abs_idx = idx
        except Exception:
            continue

    result: List[Dict[str, Any]] = []
    for idx, e in enumerate(entries or []):
        try:
            role = str(e.get("role", "")).strip()
            role_l = role.lower()
            if role_l == "agent studio":
                continue
            if role_l == "conversation" and idx != last_conv_abs_idx:
                continue
            content = str(e.get("response", "")).strip()
            if not content:
                continue
            ts = str(e.get("timestamp", "")).strip()
            if role_l == "conversation":
                header = (f"Conversation history till {ts}." if ts else "Conversation history.")
            else:
                agent_role = str(e.get("agent_role", "")).strip()
                task_desc = str(e.get("task_description", "")).strip()
                if last_conv_abs_idx != -1 and idx > last_conv_abs_idx:
                    if ts:
                        header = (
                            f"STEP RESULTS(NEW): {agent_role} Agent output at {ts}."
                            if agent_role else f"STEP RESULTS(NEW): Agent output at {ts}."
                        )
                    else:
                        header = (
                            f"STEP RESULTS(NEW): {agent_role} Prior agent output."
                            if agent_role else "STEP RESULTS(NEW): Prior agent output."
                        )
                else:
                    header = (f"STEP RESULTS(OLD): Agent output at {ts}." if ts else "STEP RESULTS(OLD): Prior agent output.")
                desc_line = (f"STEP DESCRIPTION: {task_desc}\n" if task_desc else "")
                body = desc_line + header + "\n" + content
            result.append({"role": "assistant", "content": body})
        except Exception:
            continue
    return result

