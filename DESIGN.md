# The Wren London — Multi-Agent AI Demo: Design Document

**Version:** 1.1 (2026-07-02)
**Owner:** Ashwin Rana, VP of Partner Solutions Engineering, Talkdesk
**Status:** Approved for build — function contract frozen
**v1.1 changes:** `accept_upgrade_offer` full transaction contract (adds `DECLINED`/`NO_AVAILABILITY`); OTP confirmed as Talkdesk-workflow only (no SQL function); added proactive-send functions `fire_pre_arrival_upgrade`/`fire_milestone` with SQL-owned templates; `outbound_messages` v1 = proactive-only; `put_reservation` set-difference claim/release; `cancel_reservation` guard + only-`Reserved`-cancellable; `check_club_access` tie-breaks; confirmation-number retry loop.
**Companion file:** `CLAUDE.md` (Claude Code build instructions — this document is the authoritative spec; CLAUDE.md defers to it)

---

## 1. Purpose & Demo Thesis

A Talkdesk Multi-Agent AI reference demo for **The Wren Hotel & Members' Club, City of London** — a fictional hybrid property: Grand Hotel + public dining destination + private members' club (The Wren Club), housed in a restored 1920s former bank headquarters near St Paul's and named in homage to Sir Christopher Wren. The Wren's flagship is in London, with sister properties planned in other cities. The brand, personas, and data in this repository are fictional; the architecture is a reusable pattern for hospitality prospects with hybrid hotel/club models.

**The club model:** anyone can book a bedroom, dine in the ground-floor restaurants, or use the public grooming venues — but the rooftop pool, The Vault bar, member lounges, and club gym require a Wren Club membership. The golden rule: **staying overnight as a hotel guest grants temporary member privileges for the duration of the stay.** Access rules can vary by property and are therefore data, not code.

**The demo thesis:** this entitlement model (public vs. member vs. hotel-guest-with-temporary-privileges) is genuinely complex. This demo shows an AI agent system that resolves entitlements **deterministically from data** — never from model reasoning — while delivering hyper-personalised service grounded in real guest history (mimicking Oracle OPERA Cloud as the system of record).

The signature demo moment: a non-member with an upcoming stay asks *"Can I use the rooftop pool tonight?"* and the agent answers correctly in one breath: *no for tonight, yes during your stay from the 12th to the 14th* — with the distinction visibly coming from a SQL tool call, not model improvisation.

### Scope

**In scope (v1):**
- Room reservation: availability, booking, modification, cancellation
- Proactive pre-arrival room upgrade offer (outbound WhatsApp/SMS) + conversational acceptance
- Club access questions (rooftop pool, The Wren Club Upstairs, Vault) with date-aware entitlement
- Cowshed spa & wellness booking, incl. personalised re-book from treatment history
- Hotel service requests (extra blanket, fridge, water bottles, etc.): creation + status inquiry
- Milestone recognition (3rd stay this year) — outbound template message
- Channels: Voice, Chat, WhatsApp

**Out of scope (v1):**
- Restaurant reservations (Cecconi's et al.) — remains its own existing deployment; this Orchestrator deflects dinner-reservation intents with a fixed handoff line. Narrative: hotel system (OPERA) and restaurant system (OpenTable) are separate in production too.
- Membership tiers, member's-guest sign-in, events/private hire, multi-property behavior (schema carries `hotel_id` everywhere; all v1 logic hardcodes `WRENLON`)
- Real Oracle OPERA / OpenTable connectivity — Supabase mimics OPERA (see §5)
- Payment processing

### Real-world nuances the design anticipates (typical for this hotel category; confirm per prospect in discovery)
1. **Room-category-tiered rooftop access.** Hotels in this category sometimes restrict rooftop/club facilities to higher room categories (e.g., Large and above) even for in-house guests. v1 is binary (any in-house guest = access). `check_club_access` is structured so a room-category condition is one added join later; Persona 3 (Crash Pad booking) is the ready-made test case.
2. **Internal vs. published room categories.** Upgrade paths often use internal categories that don't appear on the public website (here: Cosy → Cosy Plus). Confirm the real upgrade ladder with the prospect.
3. **Per-property access variance.** Sister properties commonly grant hotel guests pool/spa access but not top-tier member lounges — proving entitlements must be data, not code. Not demoed in v1; the schema supports it via `hotel_id`.

---

## 2. Platform Constraints (Talkdesk AI Agent Harness)

| Constraint | Value | Design consequence |
|---|---|---|
| Hierarchy | Flat: 1 Orchestrator + Action Agents | No agent-to-agent calls; all routing through Orchestrator |
| Max Action Agents | 10 | v1 uses 7; 3 slots reserved |
| Max skills per Action Agent | 5 | See skill budget per agent in §4 |
| Orchestrator | Routes only; zero business logic; only party that talks to customer | Disambiguation questions allowed (routing); entitlement/date logic forbidden |
| Agent prompt length | ~12,000–14,000 chars practical ceiling (observed) | Measure with `printf '%s' "$TEXT" \| wc -c`; never estimate |
| WhatsApp session | Closes 15 min after last message; reconnection = new session, re-auth required | No multi-step flow parks state in conversation; all in-progress state lives in tables (see `upgrade_offers`) |
| Timezone | Platform Date Resolution Engine injects UTC despite `Europe/London` Application Input (bug filed) | Step 1.0 `execute_sql` clock fetch in every time-guarded agent; `ai_agent_settings.timezone` set per touchpoint (voice, chat, WhatsApp = 3 separate Application Inputs), JSON uses `:` not `=` |

### Inherited guardrails (ship in v1, do not retrofit)
- **Assent-tightening:** Orchestrator never dispatches a destructive action (cancel, date change) without an explicit customer confirmation present in the transcript of the current conversation. No manufactured confirmations.
- **No post-completion re-dispatch:** After an Action Agent returns a valid completion, Orchestrator responds to the customer and stops; it does not re-route the completed request.
- **No entitlement from memory:** An agent may claim club access only if `check_club_access` returned an allowing status **in the current turn** — never from conversation history.
- **Fixed templates over composed content:** All customer-facing claims about data (access, statuses, offers, history) are verbatim templates with placeholder substitution.

---

## 3. Channels & Authentication

Channels: **Voice, Chat, WhatsApp.** Templates are channel-neutral: short plain sentences, no markdown, no lists — one template set serves TTS and text. Confirmation codes use a phonetic-friendly alphabet (no `0/O`, `1/I/L`, `5/S`, `8/B` mixes).

### Authentication (binary — approved; supersedes the earlier risk-tiered / Option-A design)
One rule, no tiers, channel-independent. **Public / FAQ questions** (hours, policies, venue info, what is open to members vs the public) are answered WITHOUT authentication by the Concierge/FAQ agent. **Everything account-specific** (book / change / cancel a room, club or pool access, service requests, spa, accepting an upgrade, anything about the customer's own stay) requires a **one-time code (OTP)** via the `verify_otp` workflow (deterministic MATCH/NO_MATCH). The channel never drives authentication; it affects only phrasing (say vs enter the code).

**Always ask for the registered mobile number.** The number the customer arrives on (voice caller ID / WhatsApp sender) is never trusted as identity — customers carry several SIMs or travel, and caller ID is spoofable. Flow: ask for the number, normalize to E.164 (accept it with or without a leading "+"), look up the profile, send the OTP to that registered number, verify. One session flag carries the result: `authenticated` ("true"/"false"). (`phone_identified` and the two tiers are dropped.)

WhatsApp 15-minute lapse: reconnection re-authenticates if the next account-specific action needs it. Because all in-progress state is in tables, a lapse mid-flow loses nothing — e.g. Thompson can accept his upgrade offer 2 minutes or 2 days after receiving it.

Consequence for the demo: the signature one-breath club-access moment takes an OTP step first on every channel — consistent and secure, the only friction being one code. The identification-vs-authentication distinction and the configurable-policy framing remain a talking point.

**Platform dependency to verify:** whether Talkdesk feeds cross-channel conversation history into the agent prompt. The design does not rely on it (state-in-tables), but confirm before scripting any beat that assumes conversational continuity across a channel hop.

---

## 4. Agent Roster (7 of 10)

| # | Agent | Responsibilities | Skills (≤5) | Notes |
|---|---|---|---|---|
| — | **Orchestrator** | Routing only. Disambiguation ("your room booking, or something else?"). Deflection line for restaurant intents. Assent-tightening + no-re-dispatch rules. | — | One-line routing conditions per intent; no entitlement/date logic |
| 1 | **Auth Agent** | Identity resolution (phone/email lookup), OTP send + `verify_otp`, returns **entitlement context** payload: `{profile_id, name_given, name_surname, email, phone, is_member, membership_years, in_house, upcoming_stay{arrival, departure, confirmation}}` (identity fields let downstream agents address the guest and send confirmations without a second lookup) | `execute_sql`, `send_sms` (OTP), `verify_otp` = 3 | Reference-quality; reuse from The Wren restaurant build with entitlement-context extension only |
| 2 | **Room Reservation Agent** | Availability (`get_hotel_availability` shape), quote, create booking (atomic CTE write), lead-time guard, confirmation send | `execute_sql`, `send_email`, `send_sms` = 3 | Step 1.0 clock fetch mandatory |
| 3 | **Room Update Agent** | Modify dates/room type/party, cancel, **apply accepted upgrade offer** (`accept_upgrade_offer`) | `execute_sql`, `send_email`, `send_sms` = 3 | Step 1.0 clock fetch mandatory; preserves `confirmation_number` across modifications; claim-new-inventory-first CTE |
| 4 | **Club Access Agent** | Answers access questions via `check_club_access(profile_id, access_date)` → 5 statuses → 5 fixed templates | `execute_sql` = 1 | Tiny by design; date resolution via Step 1.0 clock fetch when customer says "tonight/tomorrow" |
| 5 | **Spa & Wellness Agent** | Cowshed Spa treatment catalog, availability, booking (`post_activity_booking` shape), personalised re-book from `activity_bookings` history (retrieved, not composed) | `execute_sql`, `send_email`, `send_sms` = 3 | Step 1.0 clock fetch mandatory |
| 6 | **Guest Services Agent** | Create service requests (catalog-constrained), status inquiry with per-status templates | `execute_sql`, `send_sms` = 2 | Room number from reservation row, never from customer input (confirm-only); requires `CheckedIn` |
| 7 | **Concierge Agent** | Venue hours, public-vs-members info, membership enquiry handoff, restaurant deflection detail | `execute_sql` = 1 | Keeps general questions out of transactional agents' prompts |

**Not agents:** the proactive outbound sends (pre-arrival upgrade offer, milestone thank-you). These are workflow-fired template messages with no model in the loop — narrative anchor: OPERA's real `getPreArrivalMemberReservations` endpoint. The *agentic* part is handling the reply.

### Orchestrator routing table (draft)
| Intent evidence | Route |
|---|---|
| identity not yet established for a Tier-2 action | Auth Agent |
| book/check room availability, rates | Room Reservation Agent |
| change/cancel room booking; "yes" to an open upgrade offer | Room Update Agent |
| pool / rooftop / Vault / club space access questions | Club Access Agent |
| spa / massage / treatment / gym booking | Spa & Wellness Agent |
| request an item or ask where a request stands | Guest Services Agent |
| hours, directions, membership info, general | Concierge Agent |
| dinner/restaurant reservation | **Deflect (fixed line):** "I'll connect you with our restaurant reservations team for Cecconi's and our other venues." |
| ambiguous "change my reservation" | Ask: room booking or spa appointment? (routing disambiguation, allowed) |

---

## 5. OPERA Cloud API Mimicry

**Fidelity policy:** mimic at three levels — skill naming (operationIds), resource vocabulary (identifiers/fields), and status semantics. Do **not** replicate full OAS payloads. Pitch line: *"each skill maps 1:1 to an OHIP endpoint; production is a connector swap, not a redesign."*

| Demo skill (Supabase SQL function) | OPERA module | Real operationId / endpoint |
|---|---|---|
| `get_guest_profile(p_profile_id)` | CRM | `getGuestProfile` — GET /crm/v1/guests/{guestId} |
| `get_member_history(p_profile_id)` | CRM | `getMemberHistory` — GET /crm/v1/memberHistory |
| `get_hotel_availability(p_hotel_id, p_arrival, p_departure, p_adults)` | PAR | `getHotelAvailability` — GET /par/v1/hotels/{hotelId}/availability |
| `get_available_upsells(p_reservation_id)` | PAR | `getAvailableUpsells` — GET /par/v1/hotels/{hotelId}/availableUpsells |
| `post_reservation(...)` | RSV | `postReservation` — POST /rsv/v1/hotels/{hotelId}/reservations |
| `put_reservation(...)` | RSV | `putReservation` — PUT /rsv/v1/hotels/{hotelId}/reservations/{reservationId} |
| `cancel_reservation(...)` | RSV | `postCancelReservation` — POST …/reservations/{reservationId}/cancellations |
| `get_pre_arrival_member_reservations(p_hotel_id, p_days_ahead)` | RSV | `getPreArrivalMemberReservations` — powers the proactive upgrade trigger |
| `get_service_requests(p_profile_id)` | FOF | `getServiceRequests` — GET /fof/v1/hotels/{hotelId}/serviceRequests |
| `post_service_request(...)` | FOF | `postServiceRequests` — POST /fof/v1/hotels/{hotelId}/serviceRequests |
| `post_activity_booking(...)` | LMS | `postActivityBooking` — POST /lms/v1/hotels/{hotelId}/reservations/{reservationId}/activityBookings |
| `get_activity_bookings(p_profile_id)` | LMS | `getActivityBookings` — GET /lms/v1/hotels/{hotelId}/activityBookings |
| `check_club_access(p_profile_id, p_access_date)` | — (demo-specific) | No OPERA equivalent; this is the entitlement layer the demo adds **on top of** OPERA data. Say so explicitly — it is the value-add, not a gap. |
| `get_entitlement_context(p_profile_id)` | — (demo-specific) | Composite over CRM + RSV data; returned by Auth Agent post-verification |

FOF `serviceRequest` field vocabulary adopted verbatim: `serviceRequestId, hotelId, code, status, priority, department, profileId, room, openDate, comment, completionDate`.
Reservation statuses adopted verbatim: `Reserved`, `CheckedIn`, `CheckedOut`, `Cancelled`, `NoShow`.

---

## 6. Entitlement Design

### `get_entitlement_context(p_profile_id)` — called once by Auth Agent
Returns JSON:
```json
{
  "profile_id": "P1001",
  "name": "James Thompson",
  "name_given": "James",
  "name_surname": "Thompson",
  "email": "james.thompson@example.co.uk",
  "phone": "+447700900101",
  "membership_id": "M2001",
  "is_member": true,
  "membership_years": 12,
  "in_house": false,
  "in_house_room": null,
  "upcoming_stay": {
    "confirmation_number": "WRENLON-KMWPT",
    "arrival_date": "2026-07-07",
    "departure_date": "2026-07-09",
    "room_type": "COSY"
  },
  "stays_this_year": 3
}
```
`membership_years` and `stays_this_year` are **computed** (from `enrollment_date` and `CheckedOut` reservations), never stored. `name_given` / `name_surname` are returned **separated** (not just the concatenated `name`) so downstream agents address the guest correctly in confirmations, and `email` / `phone` are included so the Room Reservation, Room Update, and Spa agents can send email/SMS confirmations without a second lookup (mirrors the restaurant build's `get_customer_context`).

### `check_club_access(p_profile_id, p_access_date)` — per-question, Club Access Agent
Decision is a single SQL CASE; the model maps the returned status to a fixed template and substitutes placeholders. **Five statuses:**

| Status | Condition | Template (channel-neutral) |
|---|---|---|
| `MEMBER_ACCESS` | active membership | "As a Wren Club member, you have full access to the rooftop pool and The Wren Club Upstairs." |
| `IN_HOUSE_ACCESS` | a reservation with status `CheckedIn` | "As our hotel guest, you have full club access for the duration of your stay, including the rooftop pool and lounges." |
| `UPCOMING_STAY` | `p_access_date` falls within a future `Reserved` stay | "You'll have full club access during your stay from {arrival_date} to {departure_date}, including the rooftop pool and The Wren Club Upstairs." |
| `FUTURE_STAY_ONLY` | `p_access_date` NOT covered, but a future `Reserved` stay exists | "The rooftop is reserved for members and in-house guests on {access_date}, but you'll have full access during your stay from {arrival_date} to {departure_date}." |
| `NO_ACCESS` | none of the above | "The rooftop and club spaces are reserved for members and hotel guests. I'd be happy to check room availability, or tell you about Wren Club membership." |

Return shape (always includes next stay so `FUTURE_STAY_ONLY` can be rendered):
```json
{ "access_status": "FUTURE_STAY_ONLY", "access_date": "2026-07-02",
  "next_stay": { "arrival_date": "2026-07-12", "departure_date": "2026-07-14",
                 "confirmation_number": "WRENLON-QRXVN" } }
```

**Date resolution rule (deterministic, stated in agent instruction):**
1. Customer names a date/day → resolve via Step 1.0 clock literals, pass it.
2. No date given: if `in_house` or `is_member` → pass today (London); else if `upcoming_stay` exists → pass its `arrival_date`.
3. Agent may only claim access from a status returned **this turn**.

**Status precedence & tie-breaks (resolved deterministically in the SQL CASE):**
1. **Membership evaluated first.** A guest who is both an active member and currently in-house resolves to `MEMBER_ACCESS` (the stronger, date-independent claim), not `IN_HOUSE_ACCESS`.
2. **Stay window is `[arrival_date, departure_date]` inclusive** for access purposes — a checkout-day rooftop visit still resolves to access.
3. **Multiple future stays:** `next_stay` is the soonest stay with `arrival_date >= access_date`, chosen by a deterministic `ORDER BY arrival_date` (so `FUTURE_STAY_ONLY` and `UPCOMING_STAY` always render against one specific stay).

Future-proofing: an optional `room_category_access` join point is stubbed (commented) in the function for the possible Large-and-above rooftop rule.

---

## 7. Deterministic Guard Inventory

| Guard | Mechanism | Agent |
|---|---|---|
| Verified clock | Step 1.0 `SELECT now() AT TIME ZONE 'Europe/London'` → `today` / `now_time` literals used by all subsequent guards; system-prompt clock never referenced | Room Reservation, Room Update, Spa, Club Access |
| Booking lead-time | CASE in SQL against Step 1.0 literals | Room Reservation, Spa |
| Availability + atomic write | Claim-inventory-first CTE; insert filtered on available count | Room Reservation, Room Update |
| Upgrade acceptance | `accept_upgrade_offer(offer_id)` in one transaction, claim-new-inventory-first: guarded validation (`Offered`/`Accepted`/`Declined`/expired) → claim `to_room_type` for every night → on success move the reservation and release `from_room_type`, else `NO_AVAILABILITY` with the offer left `Offered` and the guest never stranded. Idempotent; returns `ACCEPTED` / `ALREADY_ACCEPTED` / `DECLINED` / `EXPIRED` / `NO_AVAILABILITY` / `NOT_FOUND`, each mapped to a fixed template | Room Update |
| OTP match | `verify_otp` workflow MATCH/NO_MATCH; no in-model comparison | Auth |
| Service request catalog | Ask matched to `request_codes` row; department + ETA text come from the table; unmatched → GENERAL_REQUEST fallback row + duty-manager template | Guest Services |
| Room number integrity | Write target = room from `CheckedIn` reservation row; customer input used for confirmation only | Guest Services |
| Entitlement | `check_club_access` statuses only, current turn only | Club Access |
| Personalised suggestions | History row retrieved by SQL, rendered via fixed template; if query returns no row, no suggestion is made | Spa |
| Destructive-action assent | Explicit in-transcript "yes" at the Action Agent's confirmation gate (Room Update A2/C2, Room Reservation Step 4); the Orchestrator routes and relays but never runs its own confirm | Room Reservation, Room Update, Spa |
| Party-size limit | ≤ 4 guests per room; more than 4 → `escalate` `PARTY_OVER_MAX` to human (group / multi-room booking) | Room Reservation, Room Update-modify |
| Stay-length limit | Continuous stay ≤ 7 nights; more than 7 → `escalate` `STAY_OVER_MAX` | Room Reservation, Room Update-modify |
| Active-reservation limit | ≤ 5 active reservations (`Reserved`/`CheckedIn`) per profile; 5 or more → `escalate` `RESERVATION_LIMIT` | Room Reservation |

**Booking limits escalate to a human, they don't hard-fail.** The three limits above are business policy: on any hit the agent returns `escalate` with the reason code and a warm handoff line (guest is offered the reservations team, never a dead end). Enforcement is agent-side in v1 (party/stay = arithmetic against Step 1.0 dates; reservation count = an early `count(*)` read); they could later move into `post_reservation` guard clauses for hard determinism. The full catalogue of human-handoff triggers — these plus operational (`SYSTEM_ERROR`, `UNEXPECTED_DB_ERROR`) and out-of-scope (`MODIFY_RESERVATION`, `ADA_ROOM`, `PAYMENT`) reasons — lives in `talkdesk/escalation-reasons.md`; a dedicated Escalation Agent that owns the human transfer is planned (today `escalate` flows to the Orchestrator's warm handoff).

**OTP is a Talkdesk-workflow concern, not a SQL function (settled from the restaurant build).** `send_one_time_pin` / `send_one_time_pin_UK` generate the code, send it, and return it as `sent_pin`; `verify_otp` compares `entered_pin` against `sent_pin` in-workflow and returns MATCH/NO_MATCH. The secret never touches Postgres for the mechanism to work — which is already the production pattern. This repo therefore builds **no** `request_otp`/`verify_otp` function; `otp_codes` (§8.12) exists solely as a demo-read affordance so staff can surface the code when a test phone can't receive SMS.

---

## 8. Data Model (authoritative)

PostgreSQL (Supabase). Conventions: snake_case; OPERA vocabulary; every table carries `hotel_id text NOT NULL DEFAULT 'WRENLON'`; timestamps `timestamptz`; all date logic in `Europe/London`. **Claude Code must implement these tables exactly — no invented columns, no renames.**

```sql
-- 8.1 profiles  (CRM guest profile)
create table profiles (
  profile_id        text primary key,          -- 'P1001'
  hotel_id          text not null default 'WRENLON',
  name_given        text not null,
  name_surname      text not null,
  email             text,
  phone             text unique,               -- E.164, identity key for phone-match auth
  created_at        timestamptz not null default now()
);

-- 8.2 memberships  (The Wren Club)
create table memberships (
  membership_id     text primary key,          -- 'M2001'
  profile_id        text not null references profiles,
  hotel_id          text not null default 'WRENLON',
  membership_level  text not null default 'WREN_CLUB',   -- flat in v1
  enrollment_date   date not null,
  status            text not null default 'Active'
    check (status in ('Active','Lapsed','Cancelled'))
);

-- 8.3 room_types  (The Wren room categories; COSY_PLUS is an internal upgrade category)
create table room_types (
  room_type_code    text primary key,          -- 'CRASHPAD','COSY','COSY_PLUS','MEDIUM','LARGE','HERITAGE','GRAND_HERITAGE','STAIRWELL_STUDIO'
  hotel_id          text not null default 'WRENLON',
  display_name      text not null,
  sqm_range         text,
  base_rate_gbp     numeric(10,2) not null,
  sort_order        int not null
);

-- 8.4 room_inventory  (per date per room type; availability = capacity - booked)
create table room_inventory (
  hotel_id          text not null default 'WRENLON',
  room_type_code    text not null references room_types,
  inventory_date    date not null,
  capacity          int not null,
  booked            int not null default 0,
  primary key (hotel_id, room_type_code, inventory_date),
  check (booked >= 0 and booked <= capacity)
);

-- 8.5 reservations  (RSV shape)
create table reservations (
  reservation_id      text primary key,        -- 'R3001'
  confirmation_number text not null unique,    -- 'WRENLON-KMWPT' phonetic-safe alphabet: A C D E F G H J K M N P Q R T U V W X Y (no 0/O,1/I/L,5/S,8/B,2/Z)
  hotel_id            text not null default 'WRENLON',
  profile_id          text not null references profiles,
  room_type_code      text not null references room_types,
  room_number         text,                    -- assigned at check-in
  arrival_date        date not null,
  departure_date      date not null,
  adults              int not null default 1,
  rate_plan_code      text not null default 'BAR',
  reservation_status  text not null default 'Reserved'
    check (reservation_status in ('Reserved','CheckedIn','CheckedOut','Cancelled','NoShow')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (departure_date > arrival_date)
);

-- 8.6 upgrade_offers  (state-in-tables: session-proof by construction)
create table upgrade_offers (
  offer_id           text primary key,         -- 'U4001'
  hotel_id           text not null default 'WRENLON',
  profile_id         text not null references profiles,
  reservation_id     text not null references reservations,
  from_room_type     text not null references room_types (room_type_code),
  to_room_type       text not null references room_types (room_type_code),
  status             text not null default 'Offered'
    check (status in ('Offered','Accepted','Declined','Expired')),
  offered_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  responded_at       timestamptz
);

-- 8.7 request_codes  (service request catalog — determinism source)
create table request_codes (
  code              text primary key,          -- 'EXTRA_BLANKET','EXTRA_PILLOW','MINI_FRIDGE','WATER_BOTTLES','EXTRA_TOWELS','TOOTHBRUSH_KIT','IRON_BOARD','GENERAL_REQUEST'
  hotel_id          text not null default 'WRENLON',
  description       text not null,
  department        text not null,             -- 'Housekeeping','Engineering','In-Room Dining','Front Desk'
  eta_text          text not null              -- 'within 30 minutes' — the ONLY source of ETA promises
);

-- 8.8 service_requests  (FOF serviceRequest shape)
create table service_requests (
  service_request_id text primary key,         -- 'SR5001'
  hotel_id           text not null default 'WRENLON',
  code               text not null references request_codes,
  status             text not null default 'Open'
    check (status in ('Open','InProgress','Completed','Cancelled')),
  priority           text not null default 'Standard'
    check (priority in ('Standard','High')),
  department         text not null,            -- copied from request_codes at insert
  profile_id         text not null references profiles,
  reservation_id     text not null references reservations,
  room               text not null,            -- from reservation row, never customer input
  quantity           int not null default 1,
  open_date          timestamptz not null default now(),
  comment            text,                     -- guest's own wording (esp. GENERAL_REQUEST)
  completion_date    timestamptz
);

-- 8.9 activity_types  (Cowshed Spa catalog — LMS shape)
create table activity_types (
  activity_type_code text primary key,         -- 'DEEP_TISSUE_60','DEEP_TISSUE_90','SWEDISH_60','HAMMAM_RITUAL','FACIAL_60','BARBER_CUT','MANICURE'
  hotel_id           text not null default 'WRENLON',
  display_name       text not null,
  location           text not null default 'Cowshed Spa',
  duration_minutes   int not null,
  price_gbp          numeric(10,2) not null
);

-- 8.10 activity_slots  (bookable spa availability)
create table activity_slots (
  slot_id            text primary key,         -- 'AS6001'
  hotel_id           text not null default 'WRENLON',
  activity_type_code text not null references activity_types,
  slot_date          date not null,
  slot_time          time not null,
  capacity           int not null default 1,
  booked             int not null default 0,
  check (booked >= 0 and booked <= capacity)
);

-- 8.11 activity_bookings  (LMS activityBooking shape; history = past Completed rows)
create table activity_bookings (
  activity_booking_id text primary key,        -- 'AB7001'
  hotel_id            text not null default 'WRENLON',
  profile_id          text not null references profiles,
  reservation_id      text references reservations,   -- nullable: members may book without a stay
  activity_type_code  text not null references activity_types,
  slot_id             text references activity_slots, -- nullable for seeded history
  booking_date        date not null,
  booking_time        time not null,
  status              text not null default 'Booked'
    check (status in ('Booked','Completed','Cancelled','NoShow')),
  created_at          timestamptz not null default now()
);

-- 8.12 otp_codes  (demo-read affordance ONLY — lets staff read the code when a test phone can't receive SMS)
--   OTP generation, send, and verification are Talkdesk WORKFLOW skills reused from the restaurant build
--   (send_one_time_pin / send_one_time_pin_UK return the code as sent_pin; verify_otp compares in-workflow).
--   The secret lives in session-global workflow storage; there is NO request_otp/verify_otp SQL function here.
create table otp_codes (
  otp_id            text primary key,
  profile_id        text not null references profiles,
  channel           text not null check (channel in ('sms','whatsapp','voice')),
  code              text not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  consumed          boolean not null default false
);

-- 8.13 outbound_messages  (audit log that feeds the console message-log view)
--   v1 is populated ONLY by the two proactive sends (fire_pre_arrival_upgrade → 'PRE_ARRIVAL_UPGRADE',
--   fire_milestone → 'MILESTONE_THANKS'), matching the restaurant precedent where agent-sent messages
--   (booking confirmations, OTP) are delivered Talkdesk-side and not DB-logged. 'CONFIRMATION','OTP','AGENT'
--   remain valid trigger_type values reserved for a later change if the console log should also show them.
create table outbound_messages (
  message_id        text primary key,
  hotel_id          text not null default 'WRENLON',
  profile_id        text not null references profiles,
  channel           text not null check (channel in ('sms','whatsapp','email')),
  trigger_type      text not null,             -- 'PRE_ARRIVAL_UPGRADE','MILESTONE_THANKS','CONFIRMATION','OTP','AGENT'
  body              text not null,
  sent_at           timestamptz not null default now()
);

-- 8.14 auth_events  (authentication audit log; mirrors the restaurant build)
--   profile_id is plain text with NO foreign key — a log must never block
--   reset_demo's profile deletes; channel is captured because auth is channel-aware.
--   Append-only; not cleared by reset_demo. Written only via log_auth_event().
create table auth_events (
  auth_event_id     uuid primary key default gen_random_uuid(),
  hotel_id          text not null default 'WRENLON',
  profile_id        text,                        -- null when no profile matched
  channel           text,                        -- Channel Name at auth time (VOICE/CHAT/WHATSAPP/…)
  event_type        text not null,               -- 'auth_success' | 'auth_failed' | 'phone_identified'
  result            text not null check (result in ('success','failure')),
  created_at        timestamptz not null default now()
);
```

### SQL functions (implement exactly; SECURITY DEFINER; all return JSON)

| Function | Behavior summary |
|---|---|
| `get_entitlement_context(p_profile_id text)` | §6 payload; computed tenure & stays-this-year |
| `check_club_access(p_profile_id text, p_access_date date)` | §6 CASE + next_stay always returned; room-category join point stubbed as comment |
| `get_guest_profile(p_profile_id text)` | profile + membership summary |
| `get_hotel_availability(p_hotel_id text, p_arrival date, p_departure date, p_adults int)` | per room_type: min available across the date range + rate |
| `get_available_upsells(p_reservation_id text)` | next-higher room types with availability across the stay |
| `post_reservation(p_profile_id, p_room_type_code, p_arrival, p_departure, p_adults)` | atomic CTE: claim inventory rows (increment `booked` only where `booked < capacity` for **every** night) then insert; returns reservation JSON or `{"error":"NO_AVAILABILITY"}`; generates phonetic-safe confirmation_number via **generate-and-retry loop** (regenerate on unique-constraint violation, capped attempts — a coincidental collision never fails the booking) |
| `put_reservation(p_reservation_id, new dates/room_type/adults)` | **set-difference claim/release** over inventory keys `(room_type_code, inventory_date)`: with `S_old` = existing booking's keys and `S_new` = requested keys, claim `S_new \ S_old` all-or-nothing (guarded), then release `S_old \ S_new`. A room-type change adds all new-type nights and releases all old-type nights; a date-only change touches only the delta nights — overlapping nights are never double-claimed against the guest's own booking. **confirmation_number preserved**; returns updated JSON or NO_AVAILABILITY (original untouched) |
| `cancel_reservation(p_reservation_id text)` | idempotent, guarded: only a non-Cancelled→Cancelled transition releases inventory (second call never double-releases). Only `Reserved` is cancellable; `CheckedIn`/`CheckedOut` are not. Returns `CANCELLED` / `ALREADY_CANCELLED` / `NOT_CANCELLABLE` / `NOT_FOUND` |
| `accept_upgrade_offer(p_offer_id text)` | one transaction, claim-new-inventory-first (reuses the `put_reservation` pattern). Validate offer: no row → `NOT_FOUND`; `Accepted` → `ALREADY_ACCEPTED`; `Declined` → `DECLINED`; `expires_at <= now()` → `EXPIRED` (and flip status to `Expired`). Then claim `to_room_type` inventory for **every** night of the linked reservation in one statement — on failure return `NO_AVAILABILITY` (offer stays `Offered`, reservation and confirmation_number untouched, inventory unchanged; guest never stranded); on success release `from_room_type` inventory those nights, update `reservations.room_type_code` (confirmation_number preserved), set offer `Accepted` + `responded_at`, and return `ACCEPTED` with the updated reservation JSON |
| `get_pre_arrival_member_reservations(p_hotel_id text, p_days_ahead int)` | member reservations arriving within window — feeds proactive workflow (read-only) |
| `fire_pre_arrival_upgrade(p_hotel_id text, p_days_ahead int)` | demo-specific proactive send: for member reservations with an `Offered` upgrade in-window, substitute the fixed template (tenure + from/to room types, computed in SQL — no model), insert a `PRE_ARRIVAL_UPGRADE` row into `outbound_messages`; does **not** create the offer (`reset_demo` seeds it). Backs `POST /api/demo/fire-pre-arrival` |
| `fire_milestone(p_profile_id text)` | demo-specific proactive send: compute `stays_this_year` live, substitute the fixed milestone template in SQL, insert a `MILESTONE_THANKS` row into `outbound_messages`. Backs `POST /api/demo/fire-milestone` |
| `post_service_request(p_profile_id, p_code, p_quantity, p_comment)` | requires a `CheckedIn` reservation for profile (else `{"error":"NOT_IN_HOUSE"}`); room + department resolved server-side; returns full request JSON incl. `eta_text` |
| `get_service_requests(p_profile_id text)` | open + recent requests with status timestamps |
| `get_activity_availability(p_activity_type_code text, p_date date)` | open slots |
| `post_activity_booking(p_profile_id, p_slot_id)` | atomic slot claim; links reservation_id if in-house |
| `get_activity_history(p_profile_id text)` | past `Completed` bookings — powers re-book suggestion; empty result ⇒ agent makes no suggestion |
| `log_auth_event(p_profile_id, p_channel, p_event_type, p_result)` | append a row to `auth_events` (authentication audit log). Called by the Auth Agent via execute_sql at each verification outcome: `phone_identified`/success (WhatsApp Tier 1), `auth_success`/success (OTP MATCH), `auth_failed`/failure (OTP NO_MATCH or no-match; empty profile_id → null) |
| `reset_demo()` | truncate transactional rows; reseed to canonical state (below) |
| `advance_demo(p_step text)` | scripted state flips, e.g. `'complete_blanket_request'` (→ Completed + completion_date), `'check_in_thompson'`, `'expire_offers'` |

---

## 9. Personas & Seed Data

**Seeding principle: every date is an offset from `(now() at time zone 'Europe/London')::date` — no literal dates anywhere.** `reset_demo()` re-derives the world; run it the morning of any demo.

### Persona 1 — James Thompson (the member journey)
- `profiles`: P1001, phone +44 7700 900101 (WhatsApp-capable), james.thompson@example.co.uk
- `memberships`: enrolled `today - interval '12 years'`, Active → tenure computes to 12
- Reservations: upcoming `Reserved` COSY, arrival `today+5`, 2 nights, WRENLON-KMWPT; **three** `CheckedOut` stays at `today-300/-150/-40` → `stays_this_year = 3` as a live aggregate (adjust the -300 offset if demo date is early in the calendar year so all three fall in-year)
- `upgrade_offers`: U4001, COSY → COSY_PLUS, `Offered`, expires `today+4`
- Flows: proactive offer → WhatsApp "yes" (Tier 1) → `accept_upgrade_offer` → milestone thank-you message; member access questions → `MEMBER_ACCESS`

### Persona 2 — Priya Patel (in-house temporary member)
- `profiles`: P1002, phone +44 7700 900102; **no membership row**
- Reservation: `CheckedIn`, MEDIUM, room **412**, arrival `today-1`, departure `today+2`
- `activity_bookings` history: DEEP_TISSUE_60, `Completed`, dated last March (compute: March 15 of current year if today ≥ Apr 1, else previous year)
- `activity_slots`: DEEP_TISSUE_60 open slot `today+1` 15:00 (the re-book offer target)
- Flows: pool question → `IN_HOUSE_ACCESS`; spa re-book (history retrieved + tomorrow 3pm slot); service request lifecycle — EXTRA_BLANKET created on voice (Tier 2), status checked on WhatsApp (Tier 1); mid-demo `advance_demo('complete_blanket_request')`

### Persona 3 — Daniel Okafor (upcoming-stay non-member)
- `profiles`: P1003, phone +44 7700 900103; no membership
- Reservation: `Reserved`, CRASHPAD, arrival `today+10`, 2 nights
- Flows: "pool during my stay?" → `UPCOMING_STAY`; "pool **tonight**?" → `FUTURE_STAY_ONLY` (the signature line). CRASHPAD chosen deliberately — he becomes the test case if category-tiered access is later confirmed.

### Background seed
- `room_types`: 8 categories, plausible GBP rates ascending (e.g., CRASHPAD 350 → GRAND_HERITAGE 1200; COSY 450, COSY_PLUS 520, MEDIUM 595, LARGE 750, HERITAGE 900, STAIRWELL_STUDIO 850)
- `room_inventory`: `today .. today+60`, capacity per type 6–20, `booked` seeded low — **no demo path dead-ends on availability** unless scripted
- `request_codes`: EXTRA_BLANKET/Housekeeping/"within 30 minutes"; EXTRA_PILLOW/Housekeeping/"within 30 minutes"; MINI_FRIDGE/Engineering/"within 2 hours"; WATER_BOTTLES/In-Room Dining/"within 20 minutes"; EXTRA_TOWELS/Housekeeping/"within 30 minutes"; TOOTHBRUSH_KIT/Housekeeping/"within 30 minutes"; IRON_BOARD/Housekeeping/"within 45 minutes"; GENERAL_REQUEST/Front Desk/"the duty manager will follow up shortly"
- `activity_types`: DEEP_TISSUE_60 (£140), DEEP_TISSUE_90 (£195), SWEDISH_60 (£130), HAMMAM_RITUAL (£165), FACIAL_60 (£150), BARBER_CUT (£55), MANICURE (£45)
- `activity_slots`: `today .. today+14`, several times per day per treatment

---

## 10. Demo Script Beats (reference)

1. **Proactive offer (WhatsApp):** operator fires the "nightly pre-arrival job" workflow (`get_pre_arrival_member_reservations`) → Thompson's phone receives the tenure-personalised upgrade offer (fixed template; tenure + room types substituted from data).
2. **Acceptance:** Thompson replies "Yes please" → Orchestrator → Room Update Agent → `accept_upgrade_offer` (Tier 1, no OTP) → confirmed; **console shows the reservation flip COSY → COSY_PLUS live**.
3. **Access question (chat, Okafor):** "Can I use the rooftop pool tonight?" → `FUTURE_STAY_ONLY` template. The one-breath yes-and-no.
4. **In-stay service (voice, Patel):** "Could I get an extra blanket?" → OTP (Tier 2) → catalog match → request created for room 412 → **appears live on the console board**.
5. **Cross-channel status (WhatsApp, Patel):** "Where's my blanket?" → Tier 1 phone-match → status template. Between beats 4 and 5 run `advance_demo('complete_blanket_request')` to show the Completed variant if desired.
6. **Personalised spa (chat or WhatsApp, Patel):** treatment enquiry → history retrieved → "I see you enjoyed the 60-minute deep tissue in March — tomorrow at 3pm is available, shall I book it?" → Tier 2 → booked.
7. **Milestone close:** operator fires milestone workflow → Thompson's 3-stays-this-year thank-you (aggregate computed live).
8. **Restaurant deflection (any):** "Book me a table at Cecconi's" → fixed handoff line — demonstrates deliberate system boundary.

---

## 11. Front-Desk Console (companion app — built by Claude Code)

Purpose: the **staff-side view** that makes the invisible visible during demos — the audience watches data change in real time as the AI acts.

- **Views:** Reservations (filter by status; upgrade flips visible), Service Requests board (columns Open / InProgress / Completed, grouped or badged by department), Spa bookings (day view), Upgrade offers (status), Outbound messages log, Guest 360 (profile + entitlement context + history per persona).
- **Demo Control Panel:** buttons for `reset_demo()`, each `advance_demo` step, and the two proactive triggers (which insert into `outbound_messages` and call the send workflow where wired).
- **Architecture rule: the browser never talks to Supabase.** All reads and writes go browser → Next.js backend (route handlers / server actions) → Supabase, using the service-role key server-side only. No Supabase client, keys, or URLs in browser code.
- **Live updates:** the demo requires the board to update without manual refresh (a service request appearing live during a voice call is a core beat). Since the browser can't subscribe to Supabase Realtime directly, the Next.js backend bridges: a route handler subscribes to Supabase Realtime server-side and streams changes to the browser via SSE (preferred), or the client polls backend endpoints on a 2–3s interval (acceptable fallback). Either is fine; no refresh button.
- **API surface mirrors OPERA (recommended):** name the Next.js route handlers after the OHIP endpoints they mimic — e.g. `GET /api/opera/rsv/hotels/WRENLON/reservations`, `POST /api/opera/fof/hotels/WRENLON/serviceRequests`, `GET /api/opera/lms/hotels/WRENLON/activityBookings` — each a thin wrapper over the corresponding SQL function. The console's own backend then *looks like* OPERA Cloud's API surface, which strengthens the mimicry pitch: show the network tab and the audience sees OHIP-shaped calls. Demo-specific operations (entitlement, demo control) live outside the `/api/opera/` namespace, e.g. `/api/demo/reset`.
- **All writes go through the SQL functions** (the backend is a second client of the same contract the agents use — that symmetry is part of the pitch).
- Branding: The Wren-adjacent styling (dark green/brass/cream, Art Deco restraint); label it "Front Desk Console — Demo".

---

## 12. Open Questions / Discovery Checklist (per prospect)

1. Is the Cosy upgrade path Cosy → Cosy Plus (internal category?) or Cosy → Medium?
2. Is rooftop pool access tiered by room category (Large and above) for hotel guests?
3. Confirm risk-tier policy: is WhatsApp phone-match acceptable identity for accepting a complimentary upgrade?
4. Does Talkdesk feed cross-channel conversation history into the agent prompt? (Design doesn't depend on it; scripting does.)
5. WhatsApp Business template approval lead time for the two proactive message templates.
6. Real OPERA Cloud (OHIP) availability in the prospect's environment for a future production pilot; restaurant reservation platform (e.g., OpenTable) integration ownership.

---

## 13. Build Order

*Status: step 1 (Supabase backend) is implemented, deployed, and passes the full test checklist — see CLAUDE.md. Steps 2–5 are next.*

1. Supabase: schema (§8) → functions → seed + `reset_demo()`/`advance_demo()` → SQL-level tests of every function including failure paths (NO_AVAILABILITY, NOT_IN_HOUSE, EXPIRED offer). Include the upgrade sold-out case: sell out COSY_PLUS for Thompson's dates, call `accept_upgrade_offer('U4001')` → `NO_AVAILABILITY`, and verify the offer is still `Offered`, the reservation still `COSY`, and inventory unchanged.
2. Console app (§11) against the same functions
3. Talkdesk: Auth Agent extension → Club Access Agent (smallest, proves the pattern) → Guest Services → Room Reservation/Update → Spa → Concierge → Orchestrator routing + deflection.
   **Authoring vs. deployment:** author each agent's *instruction text* (persona, step logic, fixed templates, routing conditions) in a chat model — ideally one grounded in the frozen §8 function contract so skills bind to exact names/params/return shapes and templates never drift — then *assemble and deploy* the runnable agent system (Orchestrator + Action Agents, skill→tool/MCP bindings, export/import JSON) inside Talkdesk itself. Measure every agent prompt against the ~12–14k char ceiling with `printf '%s' "$TEXT" | wc -c` (§2); never estimate.
4. Per-touchpoint config: `ai_agent_settings.timezone` on voice, chat, WhatsApp (JSON `:` syntax) — verify each with a "what is the current time?" diagnostic before any flow testing
5. End-to-end script rehearsal ×3 with `reset_demo()` between runs
