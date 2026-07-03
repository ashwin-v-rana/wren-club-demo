# CLAUDE.md — The Wren London Demo (Supabase backend + Front-Desk Console)

## What this project is

Demo backend and staff-facing console for a Talkdesk Multi-Agent AI reference demo for **The Wren Hotel & Members' Club** — a fictional London hotel + private members' club used for partner enablement. Supabase (PostgreSQL) mimics **Oracle OPERA Cloud** as the system of record. Talkdesk AI agents call the SQL functions here as skills; the console is a second client of the exact same functions.

**`DESIGN.md` is the authoritative spec. When this file and DESIGN.md disagree, DESIGN.md wins. When DESIGN.md is silent, ask — do not invent.**

## Hard rules (violating any of these breaks the demo or its thesis)

1. **Schema fidelity.** Implement tables and functions exactly as DESIGN.md §8 defines them — no invented columns, no renamed fields, no "improved" types. Field vocabulary deliberately mirrors OPERA Cloud (OHIP); the naming IS the product story.
2. **No literal dates anywhere.** All seed data derives from `(now() at time zone 'Europe/London')::date` with interval offsets. If you find yourself typing a date literal in seed code, stop.
3. **Timezone is Europe/London, fetched not assumed.** Any date/time logic runs inside Postgres in Europe/London. Never use client-side `new Date()` for business logic; the console may format for display only.
4. **All writes via SQL functions.** The backend never INSERTs/UPDATEs tables directly — it calls the same functions the AI agents use (`post_reservation`, `post_service_request`, `accept_upgrade_offer`, `advance_demo`, …). Reads may select from tables/views directly (server-side).
4b. **The browser never talks to Supabase.** All data access is browser → Next.js backend → Supabase (service-role key, server-only). No Supabase keys or URLs in client code, no `NEXT_PUBLIC_SUPABASE_*` env vars, no client-side Realtime subscriptions.
5. **Determinism lives in SQL.** Availability checks, entitlement decisions, ETA promises, and status transitions are computed inside functions (single guarded statements / CTEs), never in application code and never left to a model.
6. **Computed, not stored.** `membership_years` and `stays_this_year` are computed from `enrollment_date` and `CheckedOut` reservations at query time. Do not add columns for them.
7. **Idempotency.** `accept_upgrade_offer` and `cancel_reservation` must be safe to call twice (guarded transitions returning distinct statuses). `accept_upgrade_offer` → `ACCEPTED / ALREADY_ACCEPTED / DECLINED / EXPIRED / NO_AVAILABILITY / NOT_FOUND` (claim-new-inventory-first; on NO_AVAILABILITY the offer stays `Offered` and the guest is never stranded — see DESIGN.md §8). `cancel_reservation` → `CANCELLED / ALREADY_CANCELLED / NOT_CANCELLABLE / NOT_FOUND` (only `Reserved` cancels; only a non-Cancelled→Cancelled transition releases inventory).
8. **Atomicity.** `post_reservation` and `put_reservation` use claim-inventory-first CTEs: increment `booked` only where `booked < capacity` for **every** night of the stay, in one statement; insert/update only if the claim succeeded; on failure return `{"error":"NO_AVAILABILITY"}` and leave everything untouched. `put_reservation` uses **set-difference** claim/release over `(room_type_code, inventory_date)` keys — claim `S_new \ S_old` all-or-nothing, then release `S_old \ S_new` — so it never strands the guest and never double-claims an overlapping night against the guest's own booking.
9. **Confirmation numbers** use the phonetic-safe alphabet from DESIGN.md §8.5 (`A C D E F G H J K M N P Q R T U V W X Y` + digits 3 4 6 7 9), format `WRENLON-XXXXX`. `put_reservation` preserves the existing confirmation_number.
10. **hotel_id everywhere.** Every table carries `hotel_id` defaulting to `'WRENLON'`; v1 logic may assume WRENLON but must not drop the column.

## Repo layout

```
/supabase
  /migrations        -- numbered SQL migrations: 01_schema, 02_functions, 03_seed_static, 04_demo_functions, 05_harden
  seed-notes.md      -- offsets table for persona data (mirrors DESIGN.md §9)
/console             -- Next.js (App Router) + TypeScript + Tailwind front-desk app
  /app
    /(views)         -- Reservations, ServiceRequestsBoard, SpaBookings, UpgradeOffers, MessagesLog, Guest360
    /api
      /opera/...     -- OHIP-shaped route handlers (see "API surface" below)
      /demo/...      -- reset, advance, fire-pre-arrival, fire-milestone
      /events        -- SSE stream bridging Supabase Realtime to the browser
  /components
  /lib               -- server-only supabase client, sql-function wrappers, formatters
DESIGN.md
CLAUDE.md
```

## Stack & commands

- **Backend:** Supabase (hosted). SQL functions are `SECURITY DEFINER`, return `json`. **Status: built, deployed, and tested** — migrations `01`–`05` are applied to the provisioned `hospitality_hotel_club` project and pass the full test checklist below. Apply migrations with the Supabase CLI (`supabase db push`) or the Supabase MCP `apply_migration`. The project ref + service-role key live in `console/.env.local` (gitignored) and project memory — never commit them.
- **Console:** Next.js (App Router) + TypeScript + Tailwind. `@supabase/supabase-js` is used **server-side only**.
- **Backend-mediated access (hard rule):** the browser NEVER talks to Supabase. All data flows browser → Next.js route handlers / server actions → Supabase with the service-role key. No Supabase URL or key may appear in client-delivered code — therefore no `NEXT_PUBLIC_SUPABASE_*` variables at all.
- Dev: `cd console && npm install && npm run dev`
- Env (console/.env.local, server-only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Because access is service-role via the backend, enable RLS on all tables with no anon policies (belt-and-braces: even a leaked anon key reads nothing). Do not build user auth for the console in v1.

## API surface (route handlers)

Mirror OHIP endpoint shapes for the operations the console uses — this is part of the demo pitch (the network tab shows OPERA-shaped calls). Each route is a thin wrapper over one SQL function; no logic in the route beyond param mapping and error passthrough.

- `GET  /api/opera/rsv/hotels/WRENLON/reservations` → list (query params: status)
- `PUT  /api/opera/rsv/hotels/WRENLON/reservations/{reservationId}` → `put_reservation`
- `POST /api/opera/rsv/hotels/WRENLON/reservations/{reservationId}/cancellations` → `cancel_reservation`
- `GET  /api/opera/fof/hotels/WRENLON/serviceRequests` → `get_service_requests` / list
- `POST /api/opera/fof/hotels/WRENLON/serviceRequests` → `post_service_request`
- `GET  /api/opera/lms/hotels/WRENLON/activityBookings` → list
- `GET  /api/opera/crm/guests/{profileId}` → `get_guest_profile`
- Demo-specific (NOT under /opera/): `POST /api/demo/reset`, `POST /api/demo/advance` (body: step), `POST /api/demo/fire-pre-arrival`, `POST /api/demo/fire-milestone`, `GET /api/demo/entitlement/{profileId}` → `get_entitlement_context`
- `GET /api/events` — SSE stream (see below)

## Live updates

The browser cannot subscribe to Supabase Realtime (that would violate the backend-mediation rule). Bridge it: a route handler (`/api/events`) subscribes server-side to Postgres changes on `service_requests`, `reservations`, `upgrade_offers`, `activity_bookings`, `outbound_messages` and streams change events to the browser over SSE; views refetch their data through the normal API on receiving a relevant event. If the SSE bridge proves flaky in the deployment environment, fall back to 2–3 second polling of the list endpoints — but the demo must show boards updating with no manual refresh.

## Supabase build order

1. `01_schema.sql` — all 13 tables from DESIGN.md §8, in dependency order, with CHECK constraints exactly as specified.
2. `02_functions.sql` — all functions from DESIGN.md §8 function table (plus proactive-send functions `fire_pre_arrival_upgrade`/`fire_milestone`). Match signatures exactly; the Talkdesk skill layer will bind to these names. **No `request_otp`/`verify_otp` SQL functions** — OTP send + verification are Talkdesk *workflow* skills reused from the restaurant build (the secret lives in session storage, never Postgres); `otp_codes` is only a demo-read affordance.
3. `03_seed_static.sql` — room_types, request_codes, activity_types (values in DESIGN.md §9 "Background seed").
4. `04_demo_functions.sql` — `reset_demo()` and `advance_demo(p_step text)`. `reset_demo()` truncates transactional tables (reservations, upgrade_offers, service_requests, activity_bookings, activity_slots, room_inventory, otp_codes, outbound_messages), then reseeds personas + inventory + slots with date offsets per DESIGN.md §9. `advance_demo` supports at minimum: `'complete_blanket_request'`, `'check_in_thompson'`, `'expire_offers'`. Unknown step → `{"error":"UNKNOWN_STEP"}`.
5. `05_harden.sql` — pins `search_path` and revokes EXECUTE from `public`/`anon`/`authenticated` on every function (grants only `service_role`), so a leaked anon key can't call a SECURITY DEFINER function and bypass RLS. Run after functions exist.
6. After migrating, run the test checklist below and fix before touching the console.

## Test checklist (run via SQL; all must pass after `select reset_demo();`)

- `get_entitlement_context('P1001')` → is_member true, membership_years 12, stays_this_year 3, upcoming_stay present
- `check_club_access('P1001', current_date)` → MEMBER_ACCESS
- `check_club_access('P1002', current_date)` → IN_HOUSE_ACCESS
- `check_club_access('P1003', current_date + 11)` → UPCOMING_STAY
- `check_club_access('P1003', current_date)` → FUTURE_STAY_ONLY with next_stay dates populated
- `check_club_access` for a profile with no membership/stays → NO_ACCESS
- `post_reservation` for a sold-out type/date (set one up) → NO_AVAILABILITY, inventory unchanged
- `put_reservation` to an unavailable target → NO_AVAILABILITY, original reservation intact
- `put_reservation` extending a stay when the overlapping night is at capacity (incl. the guest's own booking) → succeeds, claims only the new night (set-difference overlap correctness)
- `accept_upgrade_offer('U4001')` → ACCEPTED and Thompson's reservation now COSY_PLUS (confirmation_number preserved); second call → ALREADY_ACCEPTED
- Sell out COSY_PLUS for Thompson's dates, then `accept_upgrade_offer('U4001')` → NO_AVAILABILITY; offer still `Offered`, reservation still COSY, inventory unchanged
- `advance_demo('expire_offers')` then `accept_upgrade_offer('U4001')` → EXPIRED
- `cancel_reservation('R3003')` → CANCELLED + inventory released; second call → ALREADY_CANCELLED (no double release); `cancel_reservation('R3002')` (CheckedIn) → NOT_CANCELLABLE
- `post_service_request('P1002','EXTRA_BLANKET',1,null)` → row with room '412', department 'Housekeeping', eta_text 'within 30 minutes'
- `post_service_request('P1003', …)` → NOT_IN_HOUSE (Okafor is not checked in)
- `post_service_request('P1002','GENERAL_REQUEST',1,'a pony please')` → Front Desk fallback row, comment preserved
- `get_activity_history('P1002')` → one Completed DEEP_TISSUE_60 dated last March
- `post_activity_booking` on Patel's `today+1` 15:00 slot → Booked, slot.booked incremented; booking a full slot → error, unchanged
- `advance_demo('complete_blanket_request')` → request Completed with completion_date set
- Run `reset_demo()` twice in a row — must be clean both times (idempotent)

## Console requirements (DESIGN.md §11)

Views: **Reservations** (status filter; room-type change visibly flips when Thompson's upgrade is accepted), **Service Requests board** (Open / InProgress / Completed columns, department badge, guest + room, opened/completed times), **Spa bookings** (day view), **Upgrade offers**, **Outbound messages log**, **Guest 360** (per persona: profile, computed entitlement context via `get_entitlement_context`, stays, treatments, requests).

**Demo Control Panel** (always visible): Reset Demo, each advance_demo step as a button, "Fire pre-arrival job" and "Fire milestone job" buttons (these call the corresponding functions and insert into `outbound_messages`; actual WhatsApp/SMS delivery is wired in Talkdesk, not here — log-only is correct for this app).

**Live updates are mandatory** via the SSE bridge (or polling fallback) described above. The core demo beat is a service request appearing on the board live during a voice call — no refresh button.

Styling: The Wren-adjacent, Art Deco restraint — dark green (#1a3a32-ish), brass/gold accents, cream background, elegant serif for headings. Tasteful, not cosplay. Label the app "Front Desk Console — Demo". Read the frontend-design skill/guidance if available in your environment before building UI.

## Things NOT to do

- Do not add tables, columns, enums, or functions beyond DESIGN.md without asking.
- Do not implement OPERA's actual REST payload schemas — naming + field vocabulary fidelity only.
- Do not build restaurant reservation features (explicitly out of scope; separate system).
- Do not add authentication/roles to the console, schedulers/cron for proactive jobs (manually triggered by design), or per-channel template variants.
- Do not "fix" the phonetic-safe alphabet or shorten confirmation numbers.
- Do not compute entitlement, availability, or ETAs in TypeScript.

## Context that explains the weird-looking choices

- **Why state-in-tables (e.g., `upgrade_offers`)?** Talkdesk WhatsApp sessions close after 15 minutes of inactivity; conversational context may not survive. Offers, requests, and bookings must be resumable from data alone.
- **Why is OTP stored in a table readable by the demo?** Demo-scoped decision so flows can be tested when a test phone can't receive SMS. Production design moves the secret into session-global workflow storage. Leave a comment saying exactly that.
- **Why does the console call the same functions as the agents?** The symmetry is part of the pitch: one deterministic contract, two clients (AI agents + staff console), zero drift.
- **Why offsets instead of dates?** Demos are re-run weeks apart; `reset_demo()` the morning-of makes the data fresh forever.
- **Where are the Talkdesk agents built?** Outside this repo. Author each agent's *instruction text* in a chat model (grounding it in this repo's frozen §8 function contract keeps skill bindings and templates from drifting — this Claude Code session, which holds the contract + the restaurant-build reference, is a good authoring surface); then *assemble and deploy* the runnable agent system (Orchestrator + Action Agents, skill→tool/MCP bindings pointed at this project's ref, export/import JSON) in Talkdesk. Measure every prompt with `printf '%s' "$TEXT" | wc -c` against the ~12–14k ceiling. Agents reach the DB only through the same SQL functions the console uses — one contract, two clients.
