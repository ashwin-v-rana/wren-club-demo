-- ============================================================================
-- 08_auth_events.sql — authentication audit log (mirrors the restaurant build's
-- auth_events, adapted to hotel conventions).
--   * profile_id is plain text with NO foreign key: a log must never block
--     reset_demo's profile deletes, and it's append-only (not cleared by reset).
--   * channel is captured because the hotel auth is channel-aware.
--   * Writes go through log_auth_event() (hard rule 4 — no raw INSERT from agents).
-- The Auth Agent calls log_auth_event via execute_sql at each verification
-- outcome: phone_identified/success (WhatsApp Tier 1), auth_success/success
-- (OTP MATCH), auth_failed/failure (OTP NO_MATCH, or no profile → empty id → null).
-- ============================================================================

create table auth_events (
  auth_event_id uuid primary key default gen_random_uuid(),
  hotel_id      text not null default 'WRENLON',
  profile_id    text,                                   -- null when no profile matched
  channel       text,                                   -- Channel Name at auth time (VOICE/CHAT/WHATSAPP/…)
  event_type    text not null,                          -- 'auth_success' | 'auth_failed' | 'phone_identified'
  result        text not null check (result in ('success','failure')),
  created_at    timestamptz not null default now()
);
alter table auth_events enable row level security;

create or replace function log_auth_event(p_profile_id text, p_channel text, p_event_type text, p_result text)
returns json language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into auth_events (profile_id, channel, event_type, result)
  values (nullif(p_profile_id, ''), nullif(p_channel, ''), p_event_type, p_result)
  returning auth_event_id into v_id;
  return json_build_object('auth_event_id', v_id, 'logged', true);
end; $$;

alter function log_auth_event(text, text, text, text) set search_path = public, pg_temp;
revoke execute on function log_auth_event(text, text, text, text) from public, anon, authenticated;
grant execute on function log_auth_event(text, text, text, text) to service_role;
