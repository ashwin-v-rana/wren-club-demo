-- ============================================================================
-- 11_console_agents.sql -- console staff accounts (Front Desk Console auth).
--
-- NOTE: this is a DEPARTURE from the original DESIGN §11 ("no console auth in
-- v1"), made at the user's direction: the console is now an authenticated
-- admin app (login + roles + change-password), ported from the crestline
-- partner-core pattern. This `agents` table holds CONSOLE STAFF users
-- (csr / supervisor / admin) -- it is NOT related to the Talkdesk AI agents.
--
-- Accessed by the Next.js backend with the service-role key only (bcrypt hashes
-- never leave the server). RLS is enabled with NO policies, so a leaked anon
-- key reads nothing -- same belt-and-braces posture as every other table.
-- ============================================================================

create table if not exists agents (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null,
  full_name            text not null,
  role                 text not null default 'csr'
                         check (role in ('csr','supervisor','admin')),
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  password_hash        text not null,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Case-insensitive unique email.
create unique index if not exists agents_email_lower_key on agents (lower(email));

-- Keep updated_at fresh on every change.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists agents_set_updated_at on agents;
create trigger agents_set_updated_at
  before update on agents
  for each row execute function set_updated_at();

-- RLS on, no policies (service-role bypasses RLS; anon/authenticated get nothing).
alter table agents enable row level security;

-- Harden the trigger function the same way 05_harden.sql treats the rest.
alter function set_updated_at() set search_path = public, pg_temp;
revoke execute on function set_updated_at() from public, anon, authenticated;
grant execute on function set_updated_at() to service_role;
