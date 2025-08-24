from __future__ import annotations

from typing import Any, Dict, List

from ..prompts.loader import load_prompt


def build_status_note(plan_obj: Dict[str, Any], system_text: str) -> str:
    steps_for_status = plan_obj.get("steps") or []
    all_completed = bool(steps_for_status) and all(
        isinstance(s, dict) and str(s.get("status", "")).strip().upper() == "COMPLETED"
        for s in steps_for_status
    )
    any_failed = bool(steps_for_status) and any(
        isinstance(s, dict) and str(s.get("status", "")).strip().upper() == "FAILED"
        for s in steps_for_status
    )
    any_hir = bool(steps_for_status) and any(
        isinstance(s, dict) and str(s.get("status", "")).strip().upper() == "HUMAN_INPUT_REQUIRED"
        for s in steps_for_status
    )
    ns_val = plan_obj.get("next_step") if isinstance(plan_obj, dict) else None
    ns_clean = str(ns_val).strip() if ns_val is not None else ""
    critical_failure = any_failed and (ns_clean == "")

    if all_completed:
        note_text = load_prompt("note_all_completed.md")
    elif any_hir:
        hir_desc = ""
        try:
            for s in steps_for_status:
                if isinstance(s, dict) and str(s.get("status", "")).strip().upper() == "HUMAN_INPUT_REQUIRED":
                    hir_desc = str(s.get("description", "")).strip()
                    if hir_desc:
                        break
        except Exception:
            hir_desc = ""
        hir_tpl = load_prompt("note_human_input_required.md")
        hir_suffix = (f"The blocked step is: '{hir_desc}'. " if hir_desc else "")
        note_text = hir_tpl.replace("{{HIR_DESC}}", hir_suffix)
    elif critical_failure:
        failed_desc = ""
        try:
            for s in steps_for_status:
                if isinstance(s, dict) and str(s.get("status", "")).strip().upper() == "FAILED":
                    failed_desc = str(s.get("description", "")).strip()
                    if failed_desc:
                        break
        except Exception:
            failed_desc = ""
        cf_tpl = load_prompt("note_critical_failure.md")
        failed_suffix = (f" — '{failed_desc}'. " if failed_desc else ". ")
        note_text = cf_tpl.replace("{{FAILED_DESC_SUFFIX}}", failed_suffix)
    else:
        note_text = load_prompt("note_caution_continue.md")

    # Prepend anti-loop rule before copying system message
    anti_loop = load_prompt("anti_loop_note.md")
    if anti_loop.strip():
        note_text = anti_loop.strip() + "\n\n" + note_text
    if system_text.strip():
        note_text = note_text + "\n\nSYSTEM MESSAGE (for reference):\n" + system_text
    return note_text

