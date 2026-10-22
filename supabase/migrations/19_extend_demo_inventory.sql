-- 19_extend_demo_inventory.sql — top up room inventory and spa slots WITHOUT
-- touching any existing data.
--
-- Why: the seeded windows are finite (room_inventory = today..today+60,
-- activity_slots = today..today+14 from the last reset_demo()), and the only
-- way to re-date them was reset_demo(), which also truncates every
-- reservation, spa booking, service request, offer and message. On 2026-10-22
-- inventory ended 2026-10-25 and spa slots 2026-09-09, so a live agent test
-- for 2026-10-26 had nothing to book.
--
-- extend_demo_inventory() inserts ONLY the missing rows for the same windows
-- reset_demo() seeds, with the same capacities and slot times:
--   - room_inventory: every room type, today .. today+60, booked = 0;
--     skipped where (hotel_id, room_type_code, inventory_date) already exists,
--     so existing booked counts are never changed.
--   - activity_slots: every treatment, today .. today+14 at 10:00/12:00/15:00;
--     skipped where the same treatment/date/time slot already exists. New
--     slot_ids continue after the highest existing AS#### so they never
--     collide with ids that bookings reference.
-- No UPDATE or DELETE anywhere, so it is safe to run at any time, and running
-- it twice adds nothing the second time. Dates come from Europe/London.

create or replace function extend_demo_inventory()
returns json
language plpgsql
security definer
as $$
declare
  t date := (now() at time zone 'Europe/London')::date;
  v_rooms int;
  v_slots int;
  v_next int;
begin
  -- 1. room inventory — same capacities as reset_demo()
  insert into room_inventory (room_type_code, inventory_date, capacity, booked)
  select rt.room_type_code, d::date,
         case rt.room_type_code
           when 'CRASHPAD' then 8  when 'COSY' then 12 when 'COSY_PLUS' then 6
           when 'MEDIUM' then 15   when 'LARGE' then 10 when 'STAIRWELL_STUDIO' then 4
           when 'HERITAGE' then 6  when 'GRAND_HERITAGE' then 3 else 8 end,
         0
  from room_types rt
  cross join generate_series(t, t + 60, interval '1 day') d
  on conflict (hotel_id, room_type_code, inventory_date) do nothing;
  get diagnostics v_rooms = row_count;

  -- 2. spa slots — same treatments/times as reset_demo(), ids after the highest existing
  select coalesce(max(substring(slot_id from 3)::int), 6000) into v_next
  from activity_slots where slot_id ~ '^AS[0-9]+$';

  insert into activity_slots (slot_id, activity_type_code, slot_date, slot_time, capacity, booked)
  select 'AS' || (v_next + row_number() over (order by m.activity_type_code, m.d, m.tm))::text,
         m.activity_type_code, m.d, m.tm, 1, 0
  from (
    select at.activity_type_code, d::date as d, tm
    from activity_types at
    cross join generate_series(t, t + 14, interval '1 day') d
    cross join (values (time '10:00'), (time '12:00'), (time '15:00')) as times(tm)
    where not exists (
      select 1 from activity_slots s
      where s.activity_type_code = at.activity_type_code
        and s.slot_date = d::date and s.slot_time = tm)
  ) m;
  get diagnostics v_slots = row_count;

  return json_build_object(
    'status', 'EXTENDED',
    'today', t,
    'inventory_rows_added', v_rooms,
    'inventory_through', (select max(inventory_date) from room_inventory),
    'activity_slots_added', v_slots,
    'slots_through', (select max(slot_date) from activity_slots)
  );
end;
$$;

-- Self-harden (05_harden.sql's loop predates this function).
alter  function extend_demo_inventory() set search_path = public, pg_temp;
revoke execute on function extend_demo_inventory() from public, anon, authenticated;
grant  execute on function extend_demo_inventory() to service_role;
