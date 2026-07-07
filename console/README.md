# The Wren — Front Desk Console (Demo)

Staff-facing console for **The Wren Hotel & Members' Club**. Next.js (App Router) +
TypeScript. The browser never talks to Supabase directly — all data flows
**browser → Next.js route handlers → Supabase (service-role, server-only)**.

> **Phase 1** (this build) is the authenticated admin shell, ported from the
> crestline partner-core pattern at the user's direction:
> **Login + roles**, **Agents** (console staff management), **Auth & Activity**
> (the `auth_events` audit log written by the AI Auth Agent), **Customers**
> (guest `profiles` + a Guest 360), and **admin change-password**.
> The demo boards (Reservations, Service Requests, Spa, Upgrades, Messages) are
> Phase 2.
>
> Note: this adds console auth, which **departs from DESIGN §11's original
> "no console auth in v1"** — a deliberate, user-directed change (see the repo
> DESIGN.md §11 note and migration `11_console_agents.sql`).

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
| `/customers`, `/customers/[id]` | Guests (`profiles`) + Guest 360 via `get_entitlement_context` |
| `/activity` | Auth & Activity — the `auth_events` log (auto-refreshing) |
| `/admin/agents` | Console staff management (admin-only): create, role, activate, reset-password, delete |

All data access is server-side (`lib/supabase-server.ts`, service role). Page
access is gated by `middleware.ts`; admin APIs by `requireAdmin`.

## Not yet built (Phase 2)

Reservations board, Service Requests board (the live "request appears during a
call" beat), Spa bookings, Upgrade offers, Outbound messages log, and the Demo
Control Panel — all over the OPERA-shaped `/api/opera/...` routes.
