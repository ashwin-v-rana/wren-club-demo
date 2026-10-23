# Wren AI Agent System - Design

**What is deployed lives in `wren-ai-agent-system.json`** (the full Talkdesk export: every agent's instruction, goal and routing condition, the workflows, variables, tool bindings, the Auth Gate and the application output). This document explains how it fits together and why it is built this way. It does not repeat instruction text - read it from the export.

- Talkdesk account `partner-team1`, system `Wren_Hotel_Members_Club_Demo` (`c66f7a06-2b57-4cd4-b84f-bec684881ce9`).
- The export is **published v8** (2026-10-22). Re-export it after every publish so the file always matches what is live.
- Model: GPT-4.1-mini. It follows short, concrete, positive instructions and skips anything it is not forced to do - most of the design below follows from that.
- Agents reach the database only through the Supabase MCP `execute_sql` tool calling the SQL functions in `/supabase/migrations` - the same functions the console uses.

## Agents

| Agent | Type | Gated | Skills | Instruction chars |
|---|---|---|---|---|
| Wren Orchestrator | SUPERVISING_AGENT | - | none (routes only) | 14,621 + routing_condition 1,911 |
| Authentication Agent | ACTION | no | `execute_sql`, `send_one_time_pin`, `verify_otp` | 9,361 |
| Room Reservation Agent | ACTION | yes | `get_customer_context`, `execute_sql`, `send_email`, `send_confirmation_sms` | 10,573 |
| Room Update Agent | ACTION | yes | `get_customer_context`, `execute_sql`, `send_email`, `send_confirmation_sms` | 13,123 |
| Spa and Wellness Agent | ACTION | yes | `get_customer_context`, `execute_sql`, `send_email`, `send_confirmation_sms` | 17,577 |
| Guest Services Agent | ACTION | yes | `get_customer_context`, `execute_sql`, `send_confirmation_sms` | 10,642 |
| Club Access Agent | ACTION | yes | `get_customer_context`, `execute_sql` | 6,446 |
| Concierge Agent | ACTION | no | `search_knowledge_internal` (Knowledge) | 7,443 |
| Pre-Escalation Agent | ACTION | no | `Load Transfer Data` | 2,844 |

Limits: 10 Action Agents per system (8 used), 5 skills per agent, 20,000 characters per instruction (hard), about 12-14k in practice before instruction-following degrades, routing_condition about 2,000. Measure with `printf '%s' "$TEXT" | wc -c`; never estimate.

### What each agent does

- **Wren Orchestrator** - the only voice the customer hears. Greets, routes each request **by topic** to exactly one agent, relays agent messages verbatim, asks only the greeting, the room-or-spa disambiguation question and "anything else?". Never answers FAQ facts itself (routes to Concierge), never asks for identity details, never runs a confirmation itself. Restaurant bookings get a fixed handoff line (separate system).
- **Authentication Agent** - asks for the mobile number on the profile (never trusts caller ID / WhatsApp sender), looks up the profile and its details, sends the code, verifies it. Existing profiles only; an unknown number gets a polite can't-proceed reply.
- **Room Reservation Agent** - live availability and rates for new dates, creates a NEW booking after an explicit yes, then emails and texts the receipt. Escalates `PARTY_OVER_MAX` (>4 guests), `STAY_OVER_MAX` (>7 nights), `RESERVATION_LIMIT` (5 active bookings).
- **Room Update Agent** - shows an existing room booking, applies an accepted complimentary upgrade (`accept_upgrade_offer`), cancels after an explicit yes (`cancel_reservation`), then confirms by email and SMS. Changes of dates / room / party escalate as `MODIFY_RESERVATION`.
- **Spa and Wellness Agent** - Cowshed Spa: catalog with prices, personalised re-book from history, live slots, book after an explicit yes, view, cancel after an explicit yes. Caps: 6 upcoming and 4 per day per account. Same-day slots inside now + 2h are dropped by SQL (migration 14).
- **Guest Services Agent** - logs an item/service request for an in-house OR pre-arrival guest (pre-arrival requests are held "On arrival", migration 16), texts a confirmation, reports request status.
- **Club Access Agent** - whether the guest may use the members' club spaces on a date; decided only by `check_club_access` and delivered through fixed templates.
- **Concierge Agent** - public/FAQ answers only from the Knowledge base (indexed from the Ned London FAQ pages); offers a human (`KNOWLEDGE_GAP`) only after the customer says yes. Never touches account data.
- **Pre-Escalation Agent** - prepares the human agent's brief and returns `transfer_ready`; never speaks to the customer.

## Authentication - the platform Auth Gate (Crestline pattern)

The `authenticated` variable is the Auth Gate condition (`is_auth_condition: true`). The five gated agents are listed in `security_settings.gated_agents`; `gated_tools` is empty.

Flow for any account request:

1. The Orchestrator routes the request by topic (e.g. "book a massage" -> Spa and Wellness).
2. If the customer is not verified, the platform answers for the gated agent: `STATUS: NEEDS_AUTHENTICATION`.
3. The Orchestrator routes silently to the Authentication Agent; its question for the mobile number is the Orchestrator's whole reply.
4. Phone turn: `execute_sql` profile lookup -> `execute_sql get_entitlement_context` -> `send_one_time_pin` with the phone number, `pending_profile_id` and the guest details.
5. Code turn: `verify_otp` -> MATCH -> `log_auth_event(... 'auth_success')` -> `{"status":"authenticated"}`.
6. The Orchestrator re-dispatches the original request; the gated agent now runs, calls `get_customer_context` first and proceeds.

Rules that make this reliable:

- **Only three things touch `authenticated`:** the Authentication Agent's `verify_otp` workflow (writes it on MATCH), the Auth Gate (reads it), and `Load Transfer Data` (reads it to label the brief). Gated agents never read or re-map it - their `get_customer_context` does not return it and their STEP 0 only checks that `profile_id` is present. The Orchestrator never decides on it; it reacts to `NEEDS_AUTHENTICATION`. While gated agents and the Orchestrator did read it, the Authentication Agent skipped `verify_otp` twice and the conversation looped.
- **`verify_otp` is deterministic.** It reads `sent_pin` and `pending_profile_id` from the session; MATCH only when `sent_pin` is 6 digits, the entered code equals it and `pending_profile_id` is non-empty. On MATCH it alone sets `authenticated` = "true" and `profile_id`. The model never sets either.
- **The model never sees the code.** `send_one_time_pin` saves the code to `sent_pin` through its End step but does not return it as an output, so the model cannot "verify" by comparing codes itself.
- After 3 NO_MATCH the agent logs `lockout` and hands off politely. Asking for a new code does not reset the count.

## Session variables - who writes, who reads

| Variable | Written by | Read by |
|---|---|---|
| `sent_pin` | `send_one_time_pin` (End step) | `verify_otp` |
| `pending_profile_id` | `send_one_time_pin` (required input) | `verify_otp` (promoted to `profile_id` on MATCH) |
| `name_given`, `name_surname`, `email`, `phone_number`, `is_member`, `in_house`, `in_house_room`, `upcoming_arrival_date` | `send_one_time_pin` (inputs saved through `wf_*` End-step mappings) | `get_customer_context` in gated agents; `send_confirmation_sms` (phone); `Load Transfer Data` |
| `authenticated`, `profile_id` | `verify_otp` on MATCH | Auth Gate; `get_customer_context` (`profile_id` only); `Load Transfer Data` |
| `sql_query` | the model before each `execute_sql` | `execute_sql` |
| `sms_message` | the model before `send_confirmation_sms` | `send_confirmation_sms` |
| `interaction_summary`, `transfer_reason`, `transfer_data` | `Load Transfer Data` | Application Output (`transfer_data`) -> Studio |

`upcoming_departure_date` and `upcoming_confirmation_number` still exist as variables but nothing writes them since v8.

Workflow limits: String/Number only (booleans are the strings "true"/"false"), at most 15 workflow variables per workflow (`send_one_time_pin` uses 13).

## Confirmations - email and SMS

- **SMS** - one `send_confirmation_sms` workflow per agent: a function sets `SMS_Number` / `SMS_Message` and `wf_sms_from_us_number`; a split sends through the US sender for +1 numbers, otherwise the UK sender. It sends to `phone_number` from the session. The agent sets `sms_message` and calls it exactly once. `send_one_time_pin` uses the same split.
- **Email** - Talkdesk demo MCP `send_email` (`to`, `from_display_name`, `from_username`, `subject`, `body_html`, `body_text`); sender `reservations@talkdesk-demos.com` (`from_username` "reservations", display name "The Wren Hotel & Members' Club"). The agent passes `to = working_email` from `get_customer_context`. If the email fails, the agent still sends the SMS and gives the normal completion.
- Dates in every message, email and SMS: day and month only ("23 October"). Prices are spoken as "pounds", never the pound sign.

## Escalation to a human (Crestline Escalation Agent pattern)

1. Trigger: the customer asks for a person, or an agent returns `"status":"escalate"`.
2. The Orchestrator routes silently to the **Pre-Escalation Agent** with `escalation_target`, `escalation_reason`, an Interaction summary written `ISSUE: ... || ACTIONS: ...` and a Transfer reason written `TEAM: ... || NEXT ACTION: ...`.
3. The Pre-Escalation Agent runs **Load Transfer Data** (inputs: summary + reason only). The workflow reads the guest's verified status, name, profile id, phone and email from the session itself, clears any stale payload, and writes `transfer_data`: `CUSTOMER ... || CONTACT ... || ISSUE ... || COMPLETED ... || TEAM ... || NEXT ACTION ...`. Unverified callers are labelled "Unverified caller". It returns `transfer_ready` or `transfer_error`.
4. The Orchestrator calls the builtin **`transfer_to_human`** with the team line as its message. That call is the transfer; `reply_to_user` does not escalate. On `transfer_error` it retries once (CONTINUE), then uses the `system_error` line.

### Human teams

| Target | Used for | Line `transfer_to_human` speaks |
|---|---|---|
| `reservations` | `PARTY_OVER_MAX`, `STAY_OVER_MAX`, `RESERVATION_LIMIT`, `MODIFY_RESERVATION`, `ADA_ROOM`, any room booking or stay matter | "Let me connect you with our reservations team, who can take care of that for you." |
| `spa` | a Cowshed spa or barbershop appointment or treatment | "Let me connect you with our Cowshed spa team, who can take care of that for you." |
| `front_desk` | `PAYMENT`, an in-room service request, any other on-site matter | "Let me connect you with our front desk team, who can take care of that for you." |
| `human_request` | `KNOWLEDGE_GAP`, "I want a person", anything else; default when no target is named | "Of course - let me connect you with a colleague who can help right away." |
| `system_error` | `SYSTEM_ERROR`, `UNEXPECTED_DB_ERROR`, any skill/DB error; Pre-Escalation failing twice | "I'm having a little trouble on my end. Let me get you to a colleague who can help right away." |

### Escalation reason codes

| Code | Trigger | Raised by | Status |
|---|---|---|---|
| `PARTY_OVER_MAX` | party larger than 4 | Room Reservation | wired |
| `STAY_OVER_MAX` | stay longer than 7 nights | Room Reservation | wired |
| `RESERVATION_LIMIT` | 5 active reservations already | Room Reservation | wired |
| `MODIFY_RESERVATION` | change dates / room / party of an existing booking | Room Update | wired (`put_reservation` exists if built in-agent later) |
| `ADA_ROOM` | accessible-room request (no accessibility attribute in the data model) | Room Reservation / Room Update | planned |
| `PAYMENT` | anything needing payment or a deposit | any | planned |
| `SYSTEM_ERROR` | agent invoked without a `profile_id` | all gated agents (STEP 0) | wired |
| `UNEXPECTED_DB_ERROR` | a SQL function returns an unexpected error after pre-checks | Room Update, Room Reservation | wired |
| `KNOWLEDGE_GAP` | FAQ the Knowledge base can't answer, and the customer said yes to a human | Concierge | wired |

The three business limits are agent-side guards; for hard determinism they could move into `post_reservation`. Restaurant bookings are a fixed deflection, not an escalation.

## Instruction authoring rules

- ASCII only. Measure every instruction; keep the Orchestrator's two blocks in step.
- **Fix structure, not wording.** When the model skips or improvises, change the tools so the wrong path cannot happen, rather than adding "never do X" rules - those are ignored and bloat the prompt. Phrase remaining rules as the positive action to take.
- "Act, don't narrate" guards before chained calls: "Do NOT output any message yet. Your next action is ...", and "your ENTIRE reply is ..." after a send.
- Each committing write (book, cancel, accept upgrade) needs the customer's own explicit yes to the agent's exact question; the Orchestrator's "the customer confirmed" is not consent.
- **CUSTOMER ID RULE** in every gated agent: SQL names the guest only by `working_profile_id` from `get_customer_context`, as a quoted literal - never a subquery, a profiles search, LIMIT, a name or a remembered value.
- Every time-dependent agent fetches the London date with `execute_sql` first (Step 1); the platform's date engine injects UTC.
- Positive examples only; a sample id or code in the prompt gets copied.

## Lessons learned (each cost a debugging round)

1. **The Orchestrator has two blocks - instruction and routing_condition ("AI Agent Routing Conditions").** A rule added to only one has no effect. Change both in the same write; keep routing_condition under 2,000 characters.
2. **Anything a later step depends on must be a required input of a call the model always makes.** `set_customer_context` was skipped both before the code and after MATCH, leaving every name/email/phone null in v7 ("Dear null null", no email, no SMS). The details now ride on `send_one_time_pin`'s inputs.
3. **A tool input bound to a variable does not override the value the model passes.** A placeholder `to` sent the email to the placeholder. The model must pass the real value.
4. **`gated_tools` matches tool names across every agent**, and a gated tool was not called even after verification. Renaming one agent's tool silently gated `get_customer_context` in five agents. Leave it empty; gate agents instead.
5. **Pass-through End-step mappings are not proven to persist;** values written through `wf_*` workflow variables with a full mapping are.
6. **Stale demo data looks like an agent bug.** Spa slots last 15 days and room inventory 61 days after `reset_demo()`; check `max(slot_date)` against London today first. Top up without wiping data with the console's "Extend inventory" button (`extend_demo_inventory()`, migration 19).
7. **Platform behaviour of the config API:** a PUT replaces the whole agents array (re-read right before writing; never write while someone has the Agent Editor open); PUT needs `account_id` in the body; agents and tools can be updated and renamed but not created; a PUT is rejected if `gated_tools` names a tool that no longer exists.
