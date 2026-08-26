-- ============================================================================
-- 18_reset_demo_preserve_guests.sql — stop reset_demo() deleting guests that
-- were added after seeding.
--
-- Cause: reset_demo() cleared persona master data with two WHOLESALE deletes
-- (`delete from memberships where true;` / `delete from profiles where true;`
-- — see 12) and then reinserted only P1001-P1003 + M2001. So "reseed the spa
-- slots and room inventory" and "delete every guest ever created through the
-- console" were the same button. On 2026-08-25 that wiped four real demo
-- guests (P1004-P1007) plus the memberships granted to them; recovery needed a
-- full project restore from backup.
--
-- Fix: scope both deletes to the three seeded personas. Everything else is
-- reproduced verbatim from 12_fix_reset_demo_delete.sql.
--
-- Why this is FK-safe: every table with a foreign key to profiles
-- (memberships, reservations, upgrade_offers, service_requests,
-- activity_bookings, otp_codes, outbound_messages) is either truncated at the
-- top of this function or deleted just below, so no child row can outlive its
-- parent. auth_events deliberately has no FK (see 08) and is append-only.
--
-- Both deletes keep an explicit WHERE clause, satisfying the service-role
-- safe-delete guard that 12 was written to fix (`= any(...)` qualifies).
--
-- Consequence worth knowing: preserved guests keep their profile and
-- membership, but their TRANSACTIONAL data (stays, spa bookings, requests) is
-- still truncated — that is the point of a reseed. So a preserved guest is
-- recognised and still a member on the next call, with stays_this_year back at
-- 0. Profile ids also no longer get reused: create_guest_profile allocates
-- max(P####)+1, which now counts the survivors.
--
-- CREATE OR REPLACE resets a function's SET search_path (grants are kept), so
-- re-pin search_path afterwards, matching 05_harden.
-- ============================================================================

create or replace function reset_demo()
returns json
language plpgsql
security definer
as $$
declare
  t date := (now() at time zone 'Europe/London')::date;
  a1 date; a2 date; a3 date;
  v_march date;
  -- the personas this function owns and re-derives; everyone else is left alone
  v_seed_ids text[] := array['P1001', 'P1002', 'P1003'];
  v_preserved int;
begin
  -- 1. clear transactional state
  truncate table reservations, upgrade_offers, service_requests, activity_bookings,
                 activity_slots, room_inventory, otp_codes, outbound_messages cascade;

  -- seeded personas are master data this function owns; re-derive them fresh.
  -- Scoped so console/agent-created guests and their memberships SURVIVE a
  -- reseed. Qualified WHERE satisfies the service-role safe-delete guard (12).
  delete from memberships where profile_id = any(v_seed_ids);
  delete from profiles    where profile_id = any(v_seed_ids);

  select count(*) into v_preserved from profiles;

  -- 2. profiles
  insert into profiles (profile_id, name_given, name_surname, email, phone) values
    ('P1001', 'James', 'Thompson', 'james.thompson@example.co.uk', '+447700900101'),
    ('P1002', 'Priya', 'Patel',    'priya.patel@example.co.uk',    '+447700900102'),
    ('P1003', 'Daniel','Okafor',   'daniel.okafor@example.co.uk',  '+447700900103');

  -- 3. membership — Thompson, enrolled 12 years ago, Active
  insert into memberships (membership_id, profile_id, enrollment_date, status)
  values ('M2001', 'P1001', (t - interval '12 years')::date, 'Active');

  -- 4. room inventory: every type, today .. today+60, booked 0 (reflected below)
  insert into room_inventory (room_type_code, inventory_date, capacity, booked)
  select rt.room_type_code, d::date,
         case rt.room_type_code
           when 'CRASHPAD' then 8  when 'COSY' then 12 when 'COSY_PLUS' then 6
           when 'MEDIUM' then 15   when 'LARGE' then 10 when 'STAIRWELL_STUDIO' then 4
           when 'HERITAGE' then 6  when 'GRAND_HERITAGE' then 3 else 8 end,
         0
  from room_types rt
  cross join generate_series(t, t + 60, interval '1 day') d;

  -- 5. reservations
  insert into reservations (reservation_id, confirmation_number, profile_id, room_type_code,
    arrival_date, departure_date, adults, reservation_status) values
    ('R3001', 'WRENLON-KMWPT', 'P1001', 'COSY',   t + 5, t + 7, 1, 'Reserved');

  a1 := least(date_trunc('year', t)::date + 20, t - 30);
  a2 := least(date_trunc('year', t)::date + 75, t - 20);
  a3 := t - 10;
  insert into reservations (reservation_id, confirmation_number, profile_id, room_type_code,
    arrival_date, departure_date, adults, reservation_status) values
    ('R3004', 'WRENLON-HJKMN', 'P1001', 'COSY',   a1, a1 + 2, 1, 'CheckedOut'),
    ('R3005', 'WRENLON-PQRTV', 'P1001', 'MEDIUM', a2, a2 + 2, 1, 'CheckedOut'),
    ('R3006', 'WRENLON-WXYCD', 'P1001', 'LARGE',  a3, a3 + 1, 1, 'CheckedOut');

  insert into reservations (reservation_id, confirmation_number, profile_id, room_type_code,
    room_number, arrival_date, departure_date, adults, reservation_status) values
    ('R3002', 'WRENLON-FGHJK', 'P1002', 'MEDIUM', '412', t - 1, t + 2, 1, 'CheckedIn');

  insert into reservations (reservation_id, confirmation_number, profile_id, room_type_code,
    arrival_date, departure_date, adults, reservation_status) values
    ('R3003', 'WRENLON-NPQRT', 'P1003', 'CRASHPAD', t + 10, t + 12, 1, 'Reserved');

  -- reflect active (Reserved/CheckedIn) reservations into booked counts
  update room_inventory ri set booked = ri.booked + sub.cnt
  from (
    select r.room_type_code, g::date as inv_date, count(*) cnt
    from reservations r
    cross join generate_series(r.arrival_date, r.departure_date - 1, interval '1 day') g
    where r.reservation_status in ('Reserved', 'CheckedIn')
    group by r.room_type_code, g::date
  ) sub
  where ri.hotel_id = 'WRENLON' and ri.room_type_code = sub.room_type_code
    and ri.inventory_date = sub.inv_date;

  -- 6. upgrade offer — Thompson COSY -> COSY_PLUS, Offered, expires end of today+4
  insert into upgrade_offers (offer_id, profile_id, reservation_id, from_room_type,
    to_room_type, status, expires_at)
  values ('U4001', 'P1001', 'R3001', 'COSY', 'COSY_PLUS', 'Offered',
    ((t + 5)::timestamp at time zone 'Europe/London'));

  -- 7. activity slots — every treatment, today .. today+14, three times/day
  insert into activity_slots (slot_id, activity_type_code, slot_date, slot_time, capacity, booked)
  select 'AS' || (6000 + row_number() over (order by at.activity_type_code, d, tm))::text,
         at.activity_type_code, d::date, tm, 1, 0
  from activity_types at
  cross join generate_series(t, t + 14, interval '1 day') d
  cross join (values (time '10:00'), (time '12:00'), (time '15:00')) as times(tm);

  -- 8. Patel's spa history — one Completed DEEP_TISSUE_60 last March
  v_march := make_date(extract(year from t)::int, 3, 15);
  if t < make_date(extract(year from t)::int, 4, 1) then
    v_march := make_date(extract(year from t)::int - 1, 3, 15);
  end if;
  insert into activity_bookings (activity_booking_id, profile_id, reservation_id,
    activity_type_code, slot_id, booking_date, booking_time, status)
  values ('AB7001', 'P1002', null, 'DEEP_TISSUE_60', null, v_march, time '14:00', 'Completed');

  -- 9. restart sequences above the seeded literal IDs
  perform setval('seq_reservation',      3101, false);
  perform setval('seq_service_request',  5001, false);
  perform setval('seq_activity_booking', 7101, false);
  perform setval('seq_message',          8001, false);

  return json_build_object(
    'status', 'RESET_OK',
    'today', t,
    'profiles', (select count(*) from profiles),
    'preserved_guests', v_preserved,
    'reservations', (select count(*) from reservations),
    'inventory_rows', (select count(*) from room_inventory),
    'activity_slots', (select count(*) from activity_slots),
    'offers', (select count(*) from upgrade_offers)
  );
end;
$$;

-- Re-pin search_path (CREATE OR REPLACE cleared it); grants are preserved.
alter function reset_demo() set search_path = public, pg_temp;
revoke execute on function reset_demo() from public, anon, authenticated;
grant execute on function reset_demo() to service_role;
