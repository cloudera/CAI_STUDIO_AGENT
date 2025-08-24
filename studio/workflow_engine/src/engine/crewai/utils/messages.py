from __future__ import annotations

from typing import Any, Dict, List
import json
import re


def trim_assistant_content(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return messages


def truncate_non_marker_assistant_messages(
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


def sanitize_messages(messages_in: Any) -> List[Dict[str, Any]]:
    if isinstance(messages_in, list):
        messages: List[Dict[str, Any]] = [dict(m) for m in messages_in]
    else:
        messages = [{"role": "user", "content": str(messages_in)}]
    messages = trim_assistant_content(messages)
    messages = truncate_non_marker_assistant_messages(messages, max_words=200)
    return messages


def append_artifacts_instruction(
    messages: List[Dict[str, Any]],
    artifacts_suffix: str,
    human_input_suffix: str,
    hard_constraint_text: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if not messages:
        return messages

    def _strip_artifacts_from_user(text: str) -> str:
        try:
            pattern = r"(?ms)\n{0,3}— Useful artifacts requirement —\n.*?(?=\n\s*Thought:|\Z)"
            cleaned = re.sub(pattern, "\n\n", text)
            if artifacts_suffix in cleaned:
                cleaned = cleaned.replace(artifacts_suffix, "\n\n")
            return cleaned
        except Exception:
            return text

    # Build the additional system messages (without modifying original)
    extra_system_msgs: List[Dict[str, Any]] = []
    if artifacts_suffix:
        extra_system_msgs.append({"role": "system", "content": artifacts_suffix})
    if human_input_suffix:
        extra_system_msgs.append({"role": "system", "content": human_input_suffix})
    if hard_constraint_text:
        extra_system_msgs.append({"role": "system", "content": hard_constraint_text})

    # Insert extra system messages directly below the first/top system message
    result: List[Dict[str, Any]] = []
    inserted = False
    first_system_seen = False
    for m in messages:
        if not inserted and m.get("role") == "system" and not first_system_seen:
            first_system_seen = True
            result.append(m)
            # insert our extra system messages immediately after top system message
            result.extend(extra_system_msgs)
            inserted = True
            continue
        if m.get("role") == "user":
            content = m.get("content")
            if isinstance(content, str):
                new_content = _strip_artifacts_from_user(content)
                if new_content is not content:
                    m = dict(m)
                    m["content"] = new_content
        result.append(m)

    if not inserted:
        # No system message existed; prepend our extra messages at the top
        result = extra_system_msgs + messages
    return result

