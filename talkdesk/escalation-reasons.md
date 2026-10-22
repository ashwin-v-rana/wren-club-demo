# Escalation Reasons Registry — The Wren Hotel & Members' Club

Single source of truth for **when any agent hands the customer to a human**. As we build agents, each detects its limits and returns:

```json
{"status":"escalate","escalation_target":"human","escalation_reason":"<CODE>","customer_message":"<handoff line>"}
```

The Orchestrator handles `escalate` (and a direct "I want a human" request) via the Crestline Escalation Agent pattern (system v7, 2026-10-22):

1. It routes SILENTLY to the **Pre-Escalation Agent**, passing `escalation_target`, `escalation_reason`, an Interaction summary written as `ISSUE: ... || ACTIONS: ...` and a Transfer reason written as `TEAM: ... || NEXT ACTION: ...`.
2. The Pre-Escalation Agent runs **"Load Transfer Data"**, which reads the guest's verified name, profile id, phone and email from the session itself and writes **"Transfer Data"** (the Application Output Studio receives). It returns `{"status":"transfer_ready"}` or `{"status":"transfer_error"}` (one CONTINUE retry, then the `system_error` line so the customer is never stranded).
3. The Orchestrator calls the builtin **`transfer_to_human`** with the message set to the team line below. That call is the transfer - `reply_to_user` does not escalate.

Agent instruction: `talkdesk/agents/pre-escalation-agent.md`; Orchestrator wiring: `talkdesk/orchestrator.md`.

### Human teams (`escalation_target`) and the line `transfer_to_human` speaks

The Pre-Escalation Agent uses the target the Orchestrator names, otherwise picks it from the reason code as below.

| Target | Use for | Line |
|---|---|---|
| `reservations` | `PARTY_OVER_MAX`, `STAY_OVER_MAX`, `RESERVATION_LIMIT`, `MODIFY_RESERVATION`, `ADA_ROOM`, any room booking or stay matter | "Let me connect you with our reservations team, who can take care of that for you." |
| `spa` | a Cowshed spa or barbershop appointment or treatment | "Let me connect you with our Cowshed spa team, who can take care of that for you." |
| `front_desk` | `PAYMENT`, an in-room service request, any other on-site matter | "Let me connect you with our front desk team, who can take care of that for you." |
| `human_request` | `KNOWLEDGE_GAP`, "I want a person", anything else; also the default when no target is named | "Of course - let me connect you with a colleague who can help right away." |
| `system_error` | `SYSTEM_ERROR`, `UNEXPECTED_DB_ERROR`, any skill/DB error; also used when Pre-Escalation fails twice | "I'm having a little trouble on my end. Let me get you to a colleague who can help right away." |

## Business-policy limits (escalate to human)

| Code | Trigger | Detected by | Customer handoff line | Status |
|---|---|---|---|---|
| `PARTY_OVER_MAX` | Party larger than **4** guests (single room holds ≤4; groups need multiple rooms) | Room Reservation (Room Update-modify later) | "Our rooms hold up to four guests, so a party of that size is a group booking our reservations team arranges personally. Let me connect you." | proposed for Room Reservation |
| `STAY_OVER_MAX` | Continuous stay longer than **7 nights** | Room Reservation (Room Update-modify later) | "For stays longer than seven nights, our reservations team will look after you directly. Let me connect you." | proposed for Room Reservation |
| `RESERVATION_LIMIT` | Customer already holds **5** active reservations (`Reserved`/`CheckedIn`) | Room Reservation | "You've reached the maximum of five active bookings with us, so I'll pass you to our reservations team to help further. Let me connect you." | proposed for Room Reservation |

## Not-yet-implemented capabilities (escalate as out-of-scope-here)

| Code | Trigger | Detected by | Customer handoff line | Status |
|---|---|---|---|---|
| `MODIFY_RESERVATION` | Change dates / room / party of an existing booking (deferred — hardest: party↑→different room, ADA, new dates, or all) | Room Update (STEP 1 → MODIFY A BOOKING block) | "Let me connect you with our reservations team, who can adjust your booking." | wired (Room Update escalates; `put_reservation` exists if we later build it in-agent) |
| `ADA_ROOM` | Accessible-room request (no accessibility attribute in the data model) | Room Reservation / Room Update | "Our reservations team handles accessible-room requests personally. Let me connect you." | planned |
| `PAYMENT` | Anything requiring payment / deposit (out of scope) | any | "Let me connect you with our team to take care of that for you." | planned |

## Operational escalations (already emitted)

| Code | Trigger | Detected by | Handoff | Status |
|---|---|---|---|---|
| `SYSTEM_ERROR` | Action agent invoked without valid authenticated context / empty `profile_id` | all agents (STEP 0 guard) | Orchestrator default warm handoff | wired |
| `UNEXPECTED_DB_ERROR` | A SQL function returns an unexpected error after pre-checks (e.g. `post_reservation` ROOM_TYPE_NOT_FOUND, `cancel_reservation` NOT_FOUND for a just-read booking) | Room Update, Room Reservation | Orchestrator default warm handoff | wired |
| `KNOWLEDGE_GAP` | A public FAQ question the Knowledge base cannot answer, **and** the customer has said yes to a human (consent-gated) | Concierge / FAQ | "Of course - let me connect you with a colleague who can help." → Pre-Escalation | wired |

## Not escalation — fixed deflection (for completeness)

| Code | Trigger | Detected by | Handoff | Status |
|---|---|---|---|---|
| `RESTAURANT` | Restaurant / dining reservation | Orchestrator | fixed handoff line (separate system) | wired |

## Notes

- Add a row here whenever a new limit or unimplemented capability surfaces — this table is the checklist the future Escalation Agent implements against.
- The three business-policy limits are **new business rules** (max party 4, max stay 7 nights, max 5 active reservations). If we want them authoritative, mirror them into `DESIGN.md`.
- Enforcement note: the policy limits are simple guards; for hard determinism they could later move into SQL (`post_reservation` guard clauses). For v1 they're agent-side.
