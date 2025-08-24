from __future__ import annotations

from typing import Any, Dict, List, Optional
import hashlib
import json


def build_summary_signature(
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


def build_chunk_signature(
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

