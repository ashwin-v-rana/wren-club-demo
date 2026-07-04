-- ============================================================================
-- 07_membership_id.sql — add membership_id (the human-readable 'M2001' label)
-- to get_entitlement_context. Resolved via the existing profile_id → memberships
-- active-membership join; null for non-members. Display-only (quoted to the
-- guest, shown in the console) — never a query key (profile_id remains the key).
-- CREATE OR REPLACE resets SET clauses, so re-pin search_path and re-assert grant.
-- ============================================================================

create or replace function get_entitlement_context(p_profile_id text)
returns json language plpgsql security definer as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_profile profiles; v_membership_id text; v_is_member boolean; v_years int;
  v_in_house_room text; v_stays int; v_upcoming json;
begin
  select * into v_profile from profiles where profile_id = p_profile_id;
  if not found then return json_build_object('error', 'NOT_FOUND'); end if;
  select m.membership_id,
         (m.membership_id is not null),
         case when m.membership_id is not null
              then date_part('year', age(v_today, m.enrollment_date))::int end
    into v_membership_id, v_is_member, v_years
  from (select 1) x
  left join memberships m on m.profile_id = p_profile_id and m.status = 'Active';
  select room_number into v_in_house_room from reservations
  where profile_id = p_profile_id and reservation_status = 'CheckedIn'
  order by arrival_date limit 1;
  select count(*) into v_stays from reservations
  where profile_id = p_profile_id and reservation_status = 'CheckedOut'
    and date_part('year', arrival_date) = date_part('year', v_today);
  select json_build_object('confirmation_number', confirmation_number,
           'arrival_date', arrival_date, 'departure_date', departure_date,
           'room_type', room_type_code) into v_upcoming
  from reservations where profile_id = p_profile_id
    and reservation_status = 'Reserved' and arrival_date >= v_today
  order by arrival_date limit 1;
  return json_build_object(
    'profile_id', v_profile.profile_id,
    'name', v_profile.name_given || ' ' || v_profile.name_surname,
    'name_given', v_profile.name_given,
    'name_surname', v_profile.name_surname,
    'email', v_profile.email,
    'phone', v_profile.phone,
    'membership_id', v_membership_id,
    'is_member', coalesce(v_is_member, false),
    'membership_years', v_years,
    'in_house', (v_in_house_room is not null),
    'in_house_room', v_in_house_room,
    'upcoming_stay', v_upcoming,
    'stays_this_year', v_stays);
end; $$;

alter function get_entitlement_context(text) set search_path = public, pg_temp;
revoke execute on function get_entitlement_context(text) from public, anon, authenticated;
grant execute on function get_entitlement_context(text) to service_role;
