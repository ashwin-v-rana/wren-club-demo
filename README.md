# The Wren Hotel & Members' Club — Multi-Agent AI Demo

A reference implementation of a **Talkdesk Multi-Agent AI system** for luxury hospitality, built around a fictional London property: **The Wren Hotel & Members' Club** — part Grand Hotel, part public dining destination, part private members' club, housed in a restored 1920s bank headquarters near St Paul's.

> **Note:** The Wren, its guests, and all data in this repository are fictional, created for demonstration and partner enablement. The architecture is a reusable pattern for any hospitality brand with a hybrid hotel/club model.

## Why this property model is interesting

The Wren has a layered entitlement model that most hotel demos never touch:

- **Anyone** can book a bedroom, dine in the ground-floor restaurants, or visit the barbershop.
- **Members only** may use the rooftop pool, The Vault bar, member lounges, and club gym.
- **The golden rule:** staying overnight as a hotel guest grants *temporary member privileges* for the duration of the stay — and access rules can vary by property.

That makes "Can I use the rooftop pool tonight?" a genuinely hard question. The signature moment of this demo is the AI answering it correctly in one breath — *"Not tonight, but you'll have full access during your stay from the 12th to the 14th"* — with the distinction coming from a SQL tool call, never from model improvisation.

## What the demo shows

- Room reservations: availability, booking, modification, cancellation — with atomic inventory writes
- Proactive, hyper-personalised pre-arrival upgrade offers (outbound WhatsApp/SMS) and conversational acceptance
- Date-aware club access entitlement (member / in-house guest / upcoming stay / no access)
- Cowshed spa booking, including personalised re-booking from real treatment history
- In-stay service requests ("extra blanket to room 412") created on one channel, status-checked on another
- Milestone recognition computed live from stay history
- Voice, Chat, and WhatsApp channels with risk-tiered authentication

## Architecture at a glance

```
Guest (Voice / Chat / WhatsApp)
        │
  Talkdesk Orchestrator  ──── routes only; zero business logic
        │
  7 Action Agents  ──── Auth · Room Reservation · Room Update · Club Access
        │                Spa & Wellness · Guest Services · Concierge
        │  (skills = SQL functions)
        ▼
  Supabase (PostgreSQL)  ──── mimics Oracle OPERA Cloud: schema, function names,
        │                     and statuses mirror real OHIP endpoints
        ▼
  Front-Desk Console (Next.js)  ──── staff view; live boards; same SQL
                                     function contract as the agents
```

Design principles that run through everything:

1. **Determinism over model reasoning.** Entitlements, availability, time comparisons, and status transitions are decided by SQL tool calls, never in-model.
2. **Fixed templates over composed content.** Every customer-facing claim about data is a verbatim template with placeholder substitution.
3. **State in tables, not conversations.** Offers and requests are resumable from data alone — sessions can lapse; rows don't.
4. **OPERA-shaped by design.** Skill names, field vocabulary, and reservation statuses mirror Oracle OPERA Cloud (OHIP), so production is a connector swap, not a redesign.

## Repository contents

| File | Purpose |
|---|---|
| `DESIGN.md` | The authoritative spec: agents, entitlement design, full schema, personas, demo script |
| `CLAUDE.md` | Build instructions for Claude Code (Supabase migrations + console app) |
| `supabase/` | Schema, functions, and date-relative seed migrations — implemented and tested *(`migrations/01`–`05`, plus `seed-notes.md`)* |
| `console/` | Next.js front-desk console — reservations, service-request board, demo controls |

## Getting started

1. Read `DESIGN.md` — it explains every deliberate choice, including the ones that look odd until you know why.
2. Provision a Supabase project and apply the migrations in `supabase/migrations/`.
3. Run `select reset_demo();` — all seed data is date-relative, so the demo world is always fresh.
4. `cd console && npm install && npm run dev` (env vars documented in `CLAUDE.md`).
5. Wire the SQL functions as skills in your Talkdesk AI Agent environment per `DESIGN.md` §4–§7. Author each agent's instructions in a chat model (grounded in the function contract so skill bindings don't drift), then assemble and deploy the agent system in Talkdesk itself.

## Status

Active build. The design (schema, functions, personas, demo script) is complete. **The Supabase backend is implemented, deployed, and passes its full test checklist** — availability/booking, date-aware entitlement, upgrade acceptance, service requests, spa, proactive sends, and every failure path. Next: the Next.js Front-Desk Console, then the Talkdesk agent system.

---

*Built by Ashwin Rana, VP of Partner Solutions Engineering, Talkdesk — for partner enablement.*
