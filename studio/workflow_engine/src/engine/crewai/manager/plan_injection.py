from __future__ import annotations

from typing import Any, Dict, List

from ..prompts.loader import load_prompt


def build_plan_block(plan_obj: Dict[str, Any]) -> str:
    steps_raw = None
    if isinstance(plan_obj, dict):
        steps_raw = plan_obj.get("steps")
    elif isinstance(plan_obj, list):
        steps_raw = plan_obj
    if not isinstance(steps_raw, list) or not steps_raw:
        return ""

    def _to_num(s: Any) -> int:
        try:
            return int(str(s))
        except Exception:
            return 10 ** 9

    try:
        steps_sorted = sorted(
            steps_raw,
            key=lambda s: _to_num((s or {}).get("step_number")) if isinstance(s, dict) else 10 ** 9,
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

    if not numbered_lines:
        return ""

    # Determine focus line from next_step
    focus_line = ""
    try:
        next_step_val = plan_obj.get("next_step") if isinstance(plan_obj, dict) else None
        if next_step_val is not None:
            next_str = str(next_step_val)
            step_map = {}
            try:
                for s2 in steps_sorted:
                    if isinstance(s2, dict):
                        step_map[str(s2.get("step_number"))] = s2
            except Exception:
                pass
            focused = step_map.get(next_str)
            if isinstance(focused, dict):
                desc_focus = str(focused.get("description", "")).strip()
                if desc_focus:
                    focus_line = ("\nFor now you should focus on the step: " + desc_focus + "\n")
                # Append required_evidence list for the focused step (advisory only)
                try:
                    req = focused.get("required_evidence") or []
                    if isinstance(req, list) and req:
                        bullets = "\n".join(f"- {str(x).strip()}" for x in req if str(x).strip())
                        if bullets:
                            focus_line += ("Required evidence for this step:\n" + bullets + "\n")
                except Exception:
                    pass
    except Exception:
        focus_line = ""

    header = load_prompt("plan_injection_header").rstrip("\n")
    return header + "\n" + "\n".join(numbered_lines) + focus_line + "\n"

