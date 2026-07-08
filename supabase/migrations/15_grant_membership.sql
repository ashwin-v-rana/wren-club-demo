-- ============================================================================
-- 15_grant_membership.sql — grant a guest an Active Wren Club membership.
--
-- "Make someone a member" had no function: memberships were seed-only in
-- reset_demo(), and the guest-profile CRUD (13) never touched memberships.
-- Per hard rule #4 (all writes go through SQL functions, never a direct
-- INSERT on a domain table), this adds a SECURITY DEFINER function the console
-- (Customers / Guest 360) and agents call via rpc. is_member / membership_years
-- stay COMPUTED (rule 6) — this only writes the memberships row they derive from.
--
-- Idempotent (rule 7 style, distinct guarded statuses):
--   NOT_FOUND       — no such profile
--   ALREADY_MEMBER  — profile already has an Active membership (no-op)
--   REACTIVATED     — had a Lapsed/Cancelled membership; set back to Active
--                     (original enrollment_date preserved, so tenure is kept)
--   GRANTED         — new membership row created
-- membership_id is allocated M#### the same way create_guest_profile allocates
-- P####. enrollment_date defaults to Europe/London "today" (rules 2/3 — no date
-- literals); an explicit past date may be passed to give tenure so
-- membership_years is non-zero (there is no separate "permanent" flag — an
-- Active membership with no expiry IS permanent).
-- Self-hardens (05_harden.sql's loop predates this function).
-- ============================================================================

create or replace function grant_membership(
  p_profile_id text, p_enrollment_date date default null
) returns json
language plpgsql
security definer
as $$
declare
  v_today  date := (now() at time zone 'Europe/London')::date;
  v_enroll date := coalesce(p_enrollment_date, v_today);
  v_id       text;
  v_existing text;
begin
  if not exists (select 1 from profiles where profile_id = p_profile_id) then
    return json_build_object('error', 'NOT_FOUND');
  end if;

  -- Already an Active member: idempotent no-op, echo the existing membership.
  select membership_id into v_existing
    from memberships
   where profile_id = p_profile_id and status = 'Active'
   order by enrollment_date asc
   limit 1;
  if v_existing is not null then
    return json_build_object('status', 'ALREADY_MEMBER', 'membership',
      (select row_to_json(m) from (
         select membership_id, profile_id, membership_level, enrollment_date, status
         from memberships where membership_id = v_existing) m));
  end if;

  -- A Lapsed/Cancelled membership exists: reactivate the longest-tenured one
  -- (keep its enrollment_date so membership_years is unchanged).
  select membership_id into v_existing
    from memberships
   where profile_id = p_profile_id
   order by enrollment_date asc
   limit 1;
  if v_existing is not null then
    update memberships set status = 'Active'
     where membership_id = v_existing;
    return json_build_object('status', 'REACTIVATED', 'membership',
      (select row_to_json(m) from (
         select membership_id, profile_id, membership_level, enrollment_date, status
         from memberships where membership_id = v_existing) m));
  end if;

  -- No membership yet: allocate the next M#### and insert an Active row.
  select 'M' || (coalesce(max((substring(membership_id from 2))::int), 2000) + 1)::text
    into v_id
    from memberships where membership_id ~ '^M[0-9]+$';

  insert into memberships (membership_id, profile_id, enrollment_date, status)
  values (v_id, p_profile_id, v_enroll, 'Active');

  return json_build_object('status', 'GRANTED', 'membership',
    (select row_to_json(m) from (
       select membership_id, profile_id, membership_level, enrollment_date, status
       from memberships where membership_id = v_id) m));
end;
$$;

-- Self-harden (05_harden.sql's loop predates this function).
alter  function grant_membership(text, date) set search_path = public, pg_temp;
revoke execute on function grant_membership(text, date) from public, anon, authenticated;
grant  execute on function grant_membership(text, date) to service_role;
