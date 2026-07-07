# The Wren — Front Desk Console (Demo)

Staff-facing console for **The Wren Hotel & Members' Club**. Next.js (App Router) +
TypeScript. The browser never talks to Supabase directly — all data flows
**browser → Next.js route handlers → Supabase (service-role, server-only)**.

> **Phase 1 + Phase 2 are both built.**
> - **Phase 1** (auth admin shell, ported from crestline partner-core at the
>   user's direction): **Login + roles**, **Agents** (console staff management),
>   **Auth & Activity** (the `auth_events` log written by the AI Auth Agent),
>   **Customers** (guest `profiles` + Guest 360, with **add/edit/delete**), and
>   **admin change-password**.
> - **Phase 2** (demo boards + Demo Control Panel): Reservations, Service
>   Requests board, Spa, Upgrade offers, Outbound messages — all live-polling
>   (no refresh button) over OPERA-shaped `/api/opera/...` routes.
>
> Note: console auth **departs from DESIGN §11's original "no console auth in
> v1"** — a deliberate, user-directed change (see DESIGN.md §11 and migration
> `11_console_agents.sql`). Customer add/edit/delete writes go through SQL
> functions (migration `13_guest_profile_crud`), per hard rule #4.

## Prerequisites

1. **Apply the DB migration** `supabase/migrations/11_console_agents.sql` to the
   hotel/club project (`gqfrpmzwdlmscdascyqm`) — it creates the `agents` staff
   table (`supabase db push` or the Supabase MCP `apply_migration`).

2. **Create `console/.env.local`** (copy from `.env.example`):
   ```
   SUPABASE_URL=https://gqfrpmzwdlmscdascyqm.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role key from the Supabase dashboard>
   JWT_SECRET=<long random string>
   BCRYPT_ROUNDS=10
   ```
   Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   There are **no `NEXT_PUBLIC_SUPABASE_*` vars** on purpose (hard rule).

## Run

```bash
cd console
npm install
# create the first admin (staff login):
npm run admin:create ada@thewren.london "Ada Byron" admin 'TempPass123!'
npm run dev            # http://localhost:3000
```

Sign in with that admin; you'll be prompted to set a new password on first login.

## Admin CLI

```bash
npm run admin:create <email> "<full name>" <csr|supervisor|admin> <password>
npm run admin:set-password <email> <new-password>
```

## What's here (Phase 1)

| Route | Purpose |
|---|---|
| `/login`, `/change-password` | Staff auth (bcrypt + `jose` JWT cookie), forced first-login reset |
| `/` | Overview — guest + activity snapshot |
| `/customers`, `/customers/[id]` | Guests (`profiles`) + Guest 360 via `get_entitlement_context`; **add / edit / delete** (via `create/update/delete_guest_profile`) |
| `/activity` | Auth & Activity — the `auth_events` log (auto-refreshing) |
| `/admin/agents` | Console staff management (admin-only): create, role, activate, reset-password, delete |
| `/reservations` | Reservations board (status filter; upgrade flips room type) |
| `/service-requests` | Service Requests board — Open / In Progress / Completed (the live beat) |
| `/spa` | Spa bookings (day view) |
| `/upgrades` | Upgrade offers (from → to, status) |
| `/messages` | Outbound messages log (proactive sends) |

The demo boards poll every 3s (no refresh button). The always-visible **Demo
Control Panel** runs `reset_demo`, the `advance_demo` steps, and the two
proactive-send jobs — all through the SQL functions.

All data access is server-side (`lib/supabase-server.ts`, service role). Page
access is gated by `middleware.ts`; admin APIs by `requireAdmin`.

## Optional polish (not built)

SSE live updates (currently 3s polling), and a Spa day-picker.
