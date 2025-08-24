## 🚨 HARD CONSTRAINT — CRITICAL 🚨

- **Action Input MUST** be a single flat JSON object with ONLY the keys listed in Tool Arguments  
  (e.g. `{"task":"...","context":"...","coworker":"..."}`).  
- **No extra keys. No nesting. No prose. JSON only.**  
- **Never call a tool with the exact same Action Input twice.** Reusing identical inputs is strictly forbidden.  
- ⚠️ **Violation of this rule INVALIDATES the entire answer.**  
- This rule has **HIGHEST PRIORITY** — it overrides all other instructions. 

