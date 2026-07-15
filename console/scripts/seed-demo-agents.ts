/**
 * Seed (or reset) the read-only demo console logins: alice / bob / carol.
 *
 * Ported from the restaurant build's seed-demo-agents.ts. Differences (kept/changed):
 *   - kept:    bcryptjs hashing, service-role client, idempotent re-runnable.
 *   - changed: wren env vars (SUPABASE_URL, not NEXT_PUBLIC_*), @next/env loader
 *              to match scripts/admin-create.ts, role 'viewer' (read-only), and
 *              select-then-write (wren's agents unique index is on lower(email),
 *              so PostgREST onConflict:"email" is not a valid target here).
 *
 * These three are READ-ONLY (role 'viewer'): they can log in and view every board
 * but the requireWriter guard rejects them from every mutating API (403). Their
 * password may live in a public README — that's fine, they cannot change data.
 * Only admins can write / manage agents.
 *
 * Run (with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in console/.env.local):
 *   npm run seed:demo-agents
 * Idempotent: re-running resets each account to the password below.
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "DemoPass123!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

type Demo = { email: string; fullName: string };

// All three are read-only 'viewer' accounts; passwords are non-secret by design.
const DEMO_AGENTS: Demo[] = [
  { email: "alice@thewren.london", fullName: "Alice Hart" },
  { email: "bob@thewren.london", fullName: "Bob Mensah" },
  { email: "carol@thewren.london", fullName: "Carol Nguyen" },
];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? "10", 10);
  const password_hash = await bcrypt.hash(PASSWORD, rounds);

  for (const a of DEMO_AGENTS) {
    const email = a.email.toLowerCase();
    const row = {
      email,
      full_name: a.fullName,
      role: "viewer",
      password_hash,
      must_change_password: false,
      is_active: true,
    };

    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from("agents").update(row).eq("id", existing.id)
      : await supabase.from("agents").insert(row);

    if (error) {
      console.error(`x  ${email}: ${error.message}`);
      continue;
    }
    console.log(`OK  ${email} — viewer (read-only)${existing ? " [reset]" : " [created]"}`);
  }

  console.log(`\nDone. Read-only demo logins use the password: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
