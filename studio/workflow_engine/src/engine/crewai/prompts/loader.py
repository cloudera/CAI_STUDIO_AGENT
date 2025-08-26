from __future__ import annotations

import os
from functools import lru_cache


PROMPT_REGISTRY = {
    # keys map to prior filenames without extension
    "artifacts_suffix_assistant": "\n— Useful artifacts requirement —\nIn your Final Answer, add a clean markdown section titled \"Useful artifacts\" (no code fences, no triple quotes).\n\nRules for each item in the list:\n- Show only the file name (basename). Do not include directory paths.\n- If the item is an HTTP/HTTPS URL, render it as a markdown link using only the file name as the anchor text: [filename](URL).\n- Add a concise 1–2 sentence description of what the artifact contains or why it’s useful.\n- Do not wrap the list in code blocks; output plain markdown bullets.\n\n",
    "human_input_required_suffix": "\n— Human input required policy —\nIf, after reasonable attempts (including retries and using available coworkers/tools), the task cannot proceed because essential inputs are missing, unavailable, or cannot be reliably inferred, then do NOT continue with further tool calls.\nInstead, provide a Final Answer that:\n1) Clearly states what is blocked and why (e.g., missing credentials, dataset name, query parameters).\n2) Summarizes what you have already tried and any partial results or evidence gathered.\n3) Lists the exact inputs needed from the user to proceed, as bullet points with brief rationale.\n4) Politely requests the user to supply those inputs to continue.\nEnsure the response remains concise, model-agnostic, and formatted in Markdown.\n\n",
    "hard_constraint": "## 🚨 HARD CONSTRAINT — CRITICAL 🚨\n\n- **Action Input MUST** be a single flat JSON object with ONLY the keys listed in Tool Arguments  \n  (e.g. {\"task\":\"...\",\"context\":\"...\",\"coworker\":\"...\"}).  \n- **No extra keys. No nesting. No prose. JSON only.**  \n- **Never call a tool with the exact same Action Input twice.** Reusing identical inputs is strictly forbidden.  \n- ⚠️ **Violation of this rule INVALIDATES the entire answer.**  \n- This rule has **HIGHEST PRIORITY** — it overrides all other instructions. \n\n",
    "assistant_summarization_instruction": "Summarize the assistant messages above into a clear, self-contained record focusing on what was actually done.\nInclude the following sections with bullet points under each:\n- Actions performed: concrete steps taken and their purposes.\n- Artifacts produced: files, outputs, paths, or resources created/modified (with names and locations).\n- Important commands executed: exact shell/SQL/API commands with key flags/parameters.\nIf applicable, also note any notable errors and how they were resolved.\nFormatting requirements: no preamble or epilogue; do not use the headings 'Thoughts', 'Actions', or 'Observations';\nuse the exact section headings 'Actions performed', 'Artifacts produced', and 'Important commands executed'.\n\n",
    "artifacts_suffix_manager": "\n— Useful artifacts requirement —\nIn your final answer, add a section titled 'Useful artifacts' as bullet points. \nList any files,or outputs produced \nor referenced for the current task, each with a 1–2 sentence description. \nUse exact filenames from the evidence; do not rename, paraphrase, or alter them.\nAdditionally, format your response in Markdown using best practices. Use tables where helpful. \nOnly use heading level 4 or 5 (##### or ######); do not use heading levels 1–3 or 6.\n\n",
    "planning_decision_instruction": "Determine whether the user's latest request can be answered directly from the conversation above without additional planning.\nIf it CAN be answered directly, return ONLY valid JSON: {\"result\":\"<concise direct answer>\"}.\nIf it CANNOT be answered directly and a multi-step plan is needed, return ONLY valid JSON: {\"needs_planning\": true}.\nNo prose, no code fences.\n\n",
    "planning_instruction": """You are the Planner. Your task is to generate a structured step-by-step plan in STRICT JSON only.

PLANNING PRINCIPLES
1. Deliverables & coworker selection
   • Infer the deliverables implied by the Current Task (e.g., retrieve data, compute, visualize, summarize).  
   • Select the minimal set of coworkers whose documented capabilities cover those deliverables.  
   • If one coworker can complete everything, use only that coworker.

2. Step granularity
   • Each step = one atomic, end-to-end objective that one coworker can complete.  
   • Fuse micro-actions if they share the same coworker, scope, and objective.  
   • Split when coworker, scope, or objective differs, or when user requested distinct outputs.

3. Multiple intents
   • If the request has multiple distinct tasks ('then', 'and', 'also'), create steps for each in order.  
   • Reuse the same coworker across steps only if natural.

4. Clarity & detail
   • Each description must be CLEAR, SPECIFIC, and ACTIONABLE.  
     – Include the main action, the target data/object, and intended output.  
     – Example (bad): "Query sales data".  
     – Example (good): "Query total monthly sales for 2024 from the orders table including amount and category".  
   • Prefer 1–4 steps unless clearly more are needed.  
   • No vague, placeholder, or underspecified descriptions.

OUTPUT FORMAT (STRICT)
Return ONLY valid JSON, nothing else, exactly in this schema:
{
  "steps": [
    {
      "step_number": "1",
      "description": "<clear, specific action>",
      "status": "NOT STARTED",
      "coworker": "<Exact coworker name>"
    }
  ],
  "next_step": "1"
}

RULES
• step_number values are strings ("1","2",...).  
• status MUST be "NOT STARTED" for all steps.  
• At least one step.  
• next_step MUST equal the first step_number.  
• coworker MUST match an available role name EXACTLY (case-sensitive).  
• If no coworker can do the task, output a single step with coworker = "NONE" and description = "No available coworker can fulfill the task."  

VALIDATION BEFORE EMITTING
• Remove redundant steps.  
• Ensure fusion/splitting is appropriate.  
• Ensure descriptions are clear, specific, and actionable.  
• Output strictly valid JSON only.

FEW-SHOT EXAMPLES

# Example A
Current Task: "Summarize the key points from the provided text."
Coworkers: ["Research Analyst","SQL Agent","Visualization Agent"]
Output:
{"steps":[{"step_number":"1","description":"Read the provided text and create a concise bullet-point summary of the main ideas","status":"NOT STARTED","coworker":"Research Analyst"}],"next_step":"1"}

# Example B
Current Task: "Get total sales by month for 2024 and plot a line chart."
Coworkers: ["SQL Agent","Visualization Agent","Writer"]
Output:
{"steps":[{"step_number":"1","description":"Query total monthly sales for 2024 from the orders table with amounts aggregated by month","status":"NOT STARTED","coworker":"SQL Agent"},{"step_number":"2","description":"Generate a line chart of monthly sales using the query results","status":"NOT STARTED","coworker":"Visualization Agent"}],"next_step":"1"}
""",
    "planning_decision_block": "PLANNING DECISION: Planning is not needed.\nRESULT DESCRIPTION:\n{{RESULT_DESCRIPTION}}\n\n",
    "planning_disable_note": "Planning could not produce valid JSON after 3 retries. Disabling planning and evaluation for the rest of this session.\n\n",
    "plan_injection_header": "This is the Plan to work with\nPlan:\n\n",
    "context_headers": "LAST_WITH_TS: CONTEXT: This is the last agent output at {{TS}}.\nPRIOR: CONTEXT: This is a prior agent output.\nAGENT_AT_TS: CONTEXT: Agent output at {{TS}}.\nAGENT_PRIOR: CONTEXT: Prior agent output.\n\n",
    "evaluation_instruction": """You are Plan Evaluator & Repairer.

HARD CONSTRAINTS (TOP-PRIORITY, UNBREAKABLE)
• LOCKED STATES: Any step with status in {COMPLETED, FAILED, HUMAN_INPUT_REQUIRED} is LOCKED and MUST be copied verbatim from Current Plan JSON. You MUST NOT change a LOCKED step’s status under ANY circumstance.
• STATUS-CHANGE GATE: A step’s status may change ONLY if justified by STEP RESULTS(NEW). Conversation history and STEP RESULTS(OLD) are context-only and can NEVER cause a status change.
• NO DOWNGRADES / NO CROSS-SWITCHING: You MUST NOT switch between FAILED ↔ HUMAN_INPUT_REQUIRED. You MUST NOT change COMPLETED to any other status.
• EMPTY-NEW RULE: If STEP RESULTS(NEW) is empty for a step, you MUST preserve that step’s status exactly as in Current Plan JSON.
• OUTPUT FORMAT: Emit ONLY JSON as specified; no prose, no code fences, no extra keys.

Inputs you will receive:
• Conversation evidence: only assistant messages above, labeled as Conversation history, STEP RESULTS(OLD), STEP RESULTS(NEW).
• System context (coworkers & their capabilities) is available in earlier messages.
• The user's Current Task and the 'Current Plan JSON' (schema: {"steps":[{"step_number":"1","description":"...","status":"NOT STARTED|IN PROGRESS|COMPLETED|FAILED|HUMAN_INPUT_REQUIRED","coworker":"<Agent role>"}],"next_step":"<string>"}).

A) Evidence, expectation & failure check (STRICT)
  1) Use STEP RESULTS(NEW) as the primary source to determine what deliverables were actually produced; use Conversation history only as context; treat STEP RESULTS(OLD) as historical, non-authoritative.
  2) Compare produced outputs vs. the Current Task’s implied deliverables; if anything is missing/partial, the related steps are not fully complete.
  3) Identify failures (tool errors, impossible prerequisites, hard blockers) and classify as CRITICAL vs. NON-BLOCKING.

B) Status update on existing plan (STRICT)

  PRECEDENCE & FRESHNESS (HARD)
  • Decision order: STEP RESULTS(NEW) > Current Plan JSON > Conversation history > STEP RESULTS(OLD).
  • Status changes are allowed ONLY from STEP RESULTS(NEW).
  • If STEP RESULTS(NEW) is empty (no new attempt), PRESERVE the step’s prior status from Current Plan JSON.

  IMMUTABILITY OF LOCKED STATES (ABSOLUTE)
  • Once a step is marked as COMPLETED, FAILED, or HUMAN_INPUT_REQUIRED in Current Plan JSON, it is LOCKED and MUST remain unchanged.
  • You MUST NOT reset these steps to any other status (including NOT STARTED or IN PROGRESS), even if constraints change, retries are requested, or NEW evidence appears.
  • You MUST NOT switch between FAILED and HUMAN_INPUT_REQUIRED.

  ALLOWED TRANSITIONS (ONLY FOR UNLOCKED STEPS)
  • NOT STARTED → IN PROGRESS → COMPLETED (only if justified by STEP RESULTS(NEW)).
  • FAILED, HUMAN_INPUT_REQUIRED, and COMPLETED are terminal and immutable (LOCKED).

  HUMAN_INPUT_REQUIRED vs FAILED (MUTUALLY EXCLUSIVE for NEWLY-EVALUATED UNLOCKED STEPS)
  • FAILED: Only if STEP RESULTS(NEW) shows an attempted execution that hit environment/system limits despite adequate inputs (e.g., permission error, missing file at a provided path).
  • HUMAN_INPUT_REQUIRED: Only if STEP RESULTS(NEW) explicitly shows essential inputs are missing and cannot be inferred (e.g., DB path/credentials/table names/parameters absent).
  • Do NOT set either based on Conversation history or STEP RESULTS(OLD).

  CONTENT-COMPLETION RULE
  • If STEP RESULTS(NEW) contains a coherent deliverable matching the step description (doc/code/analysis/dataset/artifact/summary), mark COMPLETED (if the step is UNLOCKED).

  IN PROGRESS RULE
  • Mark IN PROGRESS only if STEP RESULTS(NEW) shows the step started but is not yet a coherent match to its description (and the step is UNLOCKED).

  MULTIPLE DELIVERABLES
  • If multiple NEW deliverables exist for a step, mark COMPLETED once any one full deliverable matches the description.

  ATTRIBUTION
  • If STEP RESULTS(NEW) has a header like "<Coworker> Agent output at <timestamp>", attribute that deliverable to the step assigned to that coworker.

  SEQUENTIAL DEPENDENCY GUARD (DEFAULT)
  • Steps are sequential unless explicitly marked independent: step (n+1) depends on completion of step n.
  • Do NOT mark a step IN PROGRESS or COMPLETED if any prerequisite steps are not COMPLETED.
  • If a prerequisite step is FAILED or HUMAN_INPUT_REQUIRED, all dependent steps MUST be NOT STARTED unless STEP RESULTS(NEW) shows a valid, independent attempt that bypasses the dependency (and the dependent step is UNLOCKED).

  NON-CASCADING HIR
  • HUMAN_INPUT_REQUIRED applies ONLY to the step whose NEW evidence shows missing, uninferable inputs.
  • Do NOT propagate HUMAN_INPUT_REQUIRED to downstream steps.

  EXACT STATUSES
  • For each step, set exactly one of: NOT STARTED | IN PROGRESS | COMPLETED | FAILED | HUMAN_INPUT_REQUIRED (respecting lock rules).

C) PLAN REPAIR (MANDATORY WHEN TRIGGERED)

  SCOPE-CHANGE DETECTION (MUST)
  • If the new Current Task or conversation shows scope relaxation/shift (e.g., “any available date” instead of a specific date), you MUST perform plan repair—even if STEP RESULTS(NEW) is empty.

  ALLOWED REPAIR ACTIONS (WITHOUT NEW EVIDENCE)
  • You MAY modify UNLOCKED steps’ descriptions and coworkers to align with the latest scope.
  • You MAY add new steps to achieve the updated outcome.
  • You MAY delete UNLOCKED steps that are now out-of-scope.
  • You MUST NOT modify or delete LOCKED steps; if a LOCKED step is now out-of-scope, ADD a superseding step instead.
  • After any add/delete/modify, you MUST renumber steps consecutively as strings ("1","2",...).

  REPAIR RULES
  1) Normalize step descriptions to the latest user scope; prefer minimal coworkers (ideally one capable coworker).
  2) Make each step atomic and executable end-to-end by a single coworker.
  3) Separate multiple intents (split steps rather than overloading one).
  4) Keep the plan short and outcome-focused (1–4 steps unless clearly needed).
  5) New steps default to status "NOT STARTED" unless justified otherwise by STEP RESULTS(NEW).

  OUTPUT SCHEMA (STRICT JSON ONLY, REQUIRED WHEN REPAIRED)
  • Emit a NEW plan:
    {"steps":[{"step_number":"1","description":"<brief, atomic>","status":"NOT STARTED|IN PROGRESS|COMPLETED|FAILED|HUMAN_INPUT_REQUIRED","coworker":"<Agent role>"}],"next_step":"<string>"}
  • step_number values are strings ('1','2',...). Coworker names must match available roles exactly.

D) MECHANICAL UPDATE & NEXT STEP

  WHEN NOT REPAIRED
  • If no repair trigger is detected, update statuses per Section B and set next_step via rules below; keep original structure.

  WHEN REPAIRED
  • After producing the NEW repaired step list, compute next_step for the repaired plan.

  NEXT STEP (DETERMINISTIC)
    1) If ANY step has status "IN PROGRESS":
         next_step = the smallest step_number with status "IN PROGRESS".
    2) Else if there is a NON-BLOCKING 'FAILED' step:
         choose the lowest-numbered feasible independent NOT STARTED step.
    3) Else if any step is "HUMAN_INPUT_REQUIRED" and it blocks progress:
         next_step = "".
    4) Else:
         next_step = the smallest step_number with status "NOT STARTED".
    5) If there is a CRITICAL failure that blocks progress:
         next_step = "".

FAIL-SAFE
• If rules conflict BUT a scope change is detected, you MUST still emit a repaired plan (C). Do NOT fall back to returning the input plan unchanged.
• Only if there is NO scope change and you are uncertain, emit the input plan unchanged (verbatim) except updating next_step per the deterministic rules.

No prose, no explanations, no code fences. Output JSON only.

Current Plan JSON:
{{PLAN_JSON_SNIPPET}}
""",
    "note_all_completed": "All plan steps are COMPLETED. You should now provide the Final Answer. Use the required response format from the system message and include any necessary evidence/artifacts.\n\n",
    "note_human_input_required": "Human input required — finalization mode\n• From this point, refrain from calling any tools or coworkers.\n• Provide a single final answer only, using the format below.\n• Do not include internal reasoning sections or step-by-step thought traces.\n• Blocked step description: {{HIR_DESC}}\n\nFinal answer format:\nFinal Answer:\n- Blocked step: <BLOCKED_STEP_DESC>\n- Why blocked: <1–2 sentences>\n- What has been attempted so far:\n  - <bulleted summary of attempts/evidence; if any SQL was executed, include it in fenced code blocks; otherwise state “No SQL executed.”>\n- Inputs needed from you:\n  - <input A> — <brief rationale>\n  - <input B> — <brief rationale>\n  - <input C> — <brief rationale>\n\n\n",
    "note_critical_failure": "CRITICAL FAILURE detected: coworkers cannot complete a required step{{FAILED_DESC_SUFFIX}}\nProvide the Final Answer now as a failure report: briefly summarize the failure, list what was achieved so far (any completed or partial outputs), and present any useful interim results.\n\n",
    "note_caution_continue": "IMPORTANT NOTE: You have NOT yet achieved the Final Answer. Do NOT provide a final answer now. If any step has FAILED but is non-blocking, proceed to the next feasible independent step. Continue working step-by-step toward the plan's deliverables, and respond only with Thought: ...... Action..... — not a final result.\n\n",
    "anti_loop_note": "⚠️ Anti-loop rule (highest priority):\nIf the Action Input you are about to generate is identical to one already attempted:\nDo NOT repeat it.\nInstead, always retry with a different Action Input.\n\n",
}


@lru_cache(maxsize=64)
def load_prompt(key: str) -> str:
    """Return prompt text by registry key (basename without .md)."""
    try:
        return PROMPT_REGISTRY.get(str(key), "")
    except Exception:
        return ""

