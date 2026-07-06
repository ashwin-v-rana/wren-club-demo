# Escalation Reasons Registry — The Wren Hotel & Members' Club

Single source of truth for **when any agent hands the customer to a human**. As we build agents, each detects its limits and returns:

```json
{"status":"escalate","escalation_target":"human","escalation_reason":"<CODE>","customer_message":"<handoff line>"}
```

The Orchestrator delivers the handoff (its `escalate` handling: deliver `customer_message` verbatim if present, else a default warm line). A dedicated **Escalation Agent** — owning the real human transfer / callback capture — is **planned, not built**; when built it consumes `escalation_reason` from this table. "For now, just track the reasons"; enforcement is wired incrementally.

## Business-policy limits (escalate to human)

| Code | Trigger | Detected by | Customer handoff line | Status |
|---|---|---|---|---|
| `PARTY_OVER_MAX` | Party larger than **4** guests (single room holds ≤4; groups need multiple rooms) | Room Reservation (Room Update-modify later) | "Our rooms hold up to four guests, so a party of that size is a group booking our reservations team arranges personally. Let me connect you." | proposed for Room Reservation |
| `STAY_OVER_MAX` | Continuous stay longer than **7 nights** | Room Reservation (Room Update-modify later) | "For stays longer than seven nights, our reservations team will look after you directly. Let me connect you." | proposed for Room Reservation |
| `RESERVATION_LIMIT` | Customer already holds **5** active reservations (`Reserved`/`CheckedIn`) | Room Reservation | "You've reached the maximum of five active bookings with us, so I'll pass you to our reservations team to help further. Let me connect you." | proposed for Room Reservation |

## Not-yet-implemented capabilities (escalate as out-of-scope-here)

| Code | Trigger | Detected by | Customer handoff line | Status |
|---|---|---|---|---|
| `MODIFY_RESERVATION` | Change dates / room / party of an existing booking (deferred — hardest: party↑→different room, ADA, new dates, or all) | Room Update (future) | "Let me connect you with our reservations team, who can adjust your booking." | planned |
| `ADA_ROOM` | Accessible-room request (no accessibility attribute in the data model) | Room Reservation / Room Update | "Our reservations team handles accessible-room requests personally. Let me connect you." | planned |
| `PAYMENT` | Anything requiring payment / deposit (out of scope) | any | "Let me connect you with our team to take care of that for you." | planned |

## Operational escalations (already emitted)

| Code | Trigger | Detected by | Handoff | Status |
|---|---|---|---|---|
| `SYSTEM_ERROR` | Action agent invoked without valid authenticated context / empty `profile_id` | all agents (STEP 0 guard) | Orchestrator default warm handoff | wired |
| `UNEXPECTED_DB_ERROR` | A SQL function returns an unexpected error after pre-checks (e.g. `post_reservation` ROOM_TYPE_NOT_FOUND, `cancel_reservation` NOT_FOUND for a just-read booking) | Room Update, Room Reservation | Orchestrator default warm handoff | wired |

## Not escalation — fixed deflection (for completeness)

| Code | Trigger | Detected by | Handoff | Status |
|---|---|---|---|---|
| `RESTAURANT` | Restaurant / dining reservation | Orchestrator | fixed handoff line (separate system) | wired |

## Notes

- Add a row here whenever a new limit or unimplemented capability surfaces — this table is the checklist the future Escalation Agent implements against.
- The three business-policy limits are **new business rules** (max party 4, max stay 7 nights, max 5 active reservations). If we want them authoritative, mirror them into `DESIGN.md`.
- Enforcement note: the policy limits are simple guards; for hard determinism they could later move into SQL (`post_reservation` guard clauses). For v1 they're agent-side.
