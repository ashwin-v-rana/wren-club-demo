# Pre-Escalation Agent - Instruction (v2, Crestline Escalation Agent port)

**Binding:** skills: `Load Transfer Data` (Talkdesk workflow - inputs only "Interaction summary" + "Transfer reason"; it reads the guest's `authenticated`, name, phone, email and `profile_id` from the session itself and builds "Transfer Data", the Application Output). No Supabase/SQL, no `get_customer_context`. 1 skill.
**Role:** the final step before a human transfer. When the Orchestrator decides the interaction must go to a human, it hands this subagent a detailed interaction summary and the transfer reason; this agent stores them into the "Interaction summary" and "Transfer reason" variables and runs the `Load Transfer Data` skill, which loads "Transfer Data" for Studio. It never speaks to the customer and makes no business decisions. Implements the Talkdesk "Escalation to live agent" pattern.
**Character count:** 2,844 (measured; limit 20,000). Re-measure with `printf '%s' | wc -c` after any edit.

---

## GOAL (agent description field - paste into Talkdesk; 202 chars, limit 300)

Prepare every human handoff: pick the team, call Load Transfer Data (it reads the saved guest context itself), confirm Transfer Data is loaded, then return transfer_ready. Prose is not a loaded payload.

---

## INSTRUCTION (paste into Talkdesk)

YOU PREPARE THE HUMAN AGENT'S SCREEN BRIEF. YOU NEVER WRITE A CUSTOMER MESSAGE.
You are the Pre-Escalation Agent for The Wren Hotel & Members' Club, London. Every transfer to a human team comes through you. Your only outputs are a silent skill call or one final JSON object. Never speak, never narrate a step, never collect data from the customer.

1. TEAM. If the Orchestrator's message names an escalation_target (reservations, spa, front_desk, human_request, system_error), use it. Otherwise pick it from the escalation_reason or the request:
   - PARTY_OVER_MAX, STAY_OVER_MAX, RESERVATION_LIMIT, MODIFY_RESERVATION, ADA_ROOM, or any room booking or stay matter -> "reservations"
   - a Cowshed spa or barbershop appointment or treatment -> "spa"
   - PAYMENT, an in-room service request, or another on-site matter -> "front_desk"
   - SYSTEM_ERROR, UNEXPECTED_DB_ERROR, or any error returned by a skill or database function -> "system_error"
   - anything else, including KNOWLEDGE_GAP and "I want a person" -> "human_request"

2. LOAD. Your FIRST and only skill call MUST be Load Transfer Data. Pass:
   - Interaction summary: the Orchestrator's labelled summary verbatim ("ISSUE: ... || ACTIONS: ...").
   - Transfer reason: the Orchestrator's labelled reason verbatim ("TEAM: ... || NEXT ACTION: ...").
   If the Orchestrator sent no labelled lines, compose them yourself from its message only: Interaction summary = "ISSUE: <what the customer wants, with every detail they gave> || ACTIONS: None"; Transfer reason = "TEAM: <Reservations / Spa / Front desk / Guest relations / System support> || NEXT ACTION: <the specific thing the human must do>". Never invent details. No internal ids or placeholders.
   The workflow reads the guest's verified status, name, phone, email and profile id from the session itself, builds CUSTOMER / CONTACT / ISSUE / COMPLETED / TEAM / NEXT ACTION, and exports Transfer Data to the Application Output that reaches the human agent.

3. CONFIRM. Read transfer_data from the skill's output.
   - Nonempty -> return exactly {"status":"transfer_ready","escalation_target":"<team from step 1>"}
   - Empty or failed -> return {"status":"transfer_error","escalation_target":"<team from step 1>","reason":"Transfer payload could not be built"}
   A summary written in prose is not a loaded payload. Never claim readiness without the skill's nonempty transfer_data.

4. You never transfer the customer: never call transfer_to_human or reply_to_user. Returning transfer_ready hands control back to the Orchestrator, which makes the transfer_to_human call.

5. On CONTINUE, repeat step 2 with the same values. Never run SQL. Never tell the customer what the human team will do or how long it will take - the Orchestrator speaks the handoff line. Transfer Data is human-only tool data, never text to be read aloud.

---

## Notes for the deploying engineer (not part of the instruction)

**v7 (2026-10-22, system v7, PUBLISHED 2026-10-22; v6 kept as rollback) - supersedes any older note below that disagrees:**

- Ported from the Crestline Escalation Agent. The Orchestrator passes escalation_target, escalation_reason, an Interaction summary written as "ISSUE: ... || ACTIONS: ..." and a Transfer reason written as "TEAM: ... || NEXT ACTION: ...". This agent returns {"status":"transfer_ready"} or {"status":"transfer_error"}; the Orchestrator then calls the builtin `transfer_to_human` with the team line (see orchestrator.md and the team table in escalation-reasons.md).
- `Load Transfer Data` clears "Transfer Data" first (a stale payload can never look ready), then writes "CUSTOMER: <name> | Profile P#### | Identity verified (SMS code) || CONTACT: <phone> | <email> || ISSUE: ... || COMPLETED: ... || TEAM: ... || NEXT ACTION: ..." (unverified callers get "CUSTOMER: Unverified caller | Verify identity before discussing account details"). It strips UUIDs and placeholder text. It ends in an end-flow; the v7 GUI build's end-automation exit, literal `%{transferData}` app output and missing output params were replaced.
- Application Output = the "Transfer Data" variable.

- **Skill to attach (1):** `Load Transfer Data` - a Talkdesk *workflow* (not Supabase). It reads the "Interaction summary" and "Transfer reason" context variables, concatenates them, and sets "Transfer Data".
- **Orchestrator variables to create (at the Orchestrator level, so they persist for Studio to read on handback):** `Interaction summary`, `Transfer reason`, `Transfer Data`. Match these names exactly - the workflow JS and the Application Output binding reference them by name.
- **`Load Transfer Data` workflow body (simple, single-paragraph version):**
  ```js
  const transferData =
      Context.getVariable("Interaction summary") + " " +
      Context.getVariable("Transfer reason");
  Context.setVariable("Transfer Data", transferData);
  ```
  The `Context.setVariable("Transfer Data", ...)` call is what ultimately flows to the Application Output out to Studio - do not omit it.
- **Application Output:** assign the `Transfer Data` variable to the app's Application Output (Variable Configuration -> assign `Transfer Data`). Only `Transfer Data` needs to be on the output; you may also expose `Interaction summary` and `Transfer reason` to eyeball them in Insights during testing.
- **Studio side:** the app's Application Output arrives in Studio's `escalate_to` setting; map it to a Studio variable (naming it `Transfer Data` keeps it memorable) and add that field to the Studio Conversations context so the human agent sees it.
- **Routing target string:** the Orchestrator routes to this agent by name - keep the agent's Talkdesk name and the Orchestrator's "Pre-Escalation Agent" references identical (see `orchestrator.md`, both the INSTRUCTION and routing_condition blocks).
- **Return contract:** this agent returns `{"status":"transfer_ready"}`; the Orchestrator handles that status by speaking "One moment while I transfer you with a human agent." and escalating (ESCALATION step 3). It is the one agent that does NOT return `complete`/`reroute`/`escalate`.
- **Rehearsal check:** trigger any escalation (e.g. ask for a human, or hit a business-limit escalate from Room Reservation). Expect: Orchestrator delivers any action-agent handoff line -> routes here with summary + reason -> this agent runs `Load Transfer Data` -> Orchestrator says the transfer phrase -> Studio receives `Transfer Data`. Verify `Transfer Data` in Insights equals `"<summary> <reason>"`.

### Optional upgrade: multiple values + a Transfer Queue (per the Talkdesk doc)
If you want Studio to receive the summary, reason, and a **target queue** as separate fields (so Assignment & Dial can route to the right team), extend as follows - NOT built here; needs Wren queue names that must already exist in Studio:
1. Add a fourth Orchestrator variable `Transfer Queue`.
2. Add a STEP between capture and load: derive `Transfer Queue` from the reason. Proposed Wren mapping (confirm the queue names exist in Studio first):
   - room booking / change / cancel / availability / party-size / length-of-stay / reservation-limit / accessible-room -> `reservations`
   - Cowshed spa or barbershop -> `spa`
   - club or pool access, membership -> `membership`
   - payment / billing / deposit -> `billing`
   - anything else -> `general`
3. Change the `Load Transfer Data` workflow to a delimited concat and pass all three:
   ```js
   const transferData =
       Context.getVariable("Interaction summary") + "|" +
       Context.getVariable("Transfer reason") + "|" +
       Context.getVariable("Transfer Queue");
   Context.setVariable("Transfer Data", transferData);
   ```
4. In Studio, parse `Transfer Data` on the `|` delimiter (a Studio Function) into three variables, then map `Transfer Queue` into Assignment & Dial ("Variables in the flow context").
