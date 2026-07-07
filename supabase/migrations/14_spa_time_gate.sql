-- ============================================================================
-- 14_spa_time_gate.sql — move the spa same-day time gate INTO SQL (rule 5).
--
-- Bug: at 19:17 Europe/London the Spa agent offered 10:00, 12:00, and 15:00
-- slots for "tonight" — all already past. Root cause: get_activity_availability
-- returned every slot for the date and the same-day "must book >= 2h ahead"
-- filter was left to the agent (DESIGN.md 8.x / section 7, agent Step 1 clock +
-- STEP 4 drop). The weak model does not apply that time comparison reliably,
-- and a US-based tester's client clock made it worse. Determinism for
-- availability/time promises must live in Postgres, in Europe/London, per
-- CLAUDE.md rule 5 — never in the model.
--
-- Fix: both functions now compute now() AT TIME ZONE 'Europe/London' themselves.
--   - get_activity_availability: drops today's slots earlier than now + 2h, and
--     naturally returns nothing for a past date. Future dates unaffected.
--   - post_activity_booking: authoritative write gate — rejects a slot that is
--     within the 2h same-day window (covers a stale slot_id offered before a
--     WhatsApp session lapse). Reuses NO_AVAILABILITY so the Spa agent's
--     existing re-check loop offers other times with no agent change.
-- The agent's Step-1 clock + STEP 4 same-day drop remain as a redundant
-- secondary check (belt-and-braces); this SQL gate is now the source of truth.
-- SET search_path is included inline so it survives CREATE OR REPLACE (05_harden
-- pinned it via ALTER; replacing the body would otherwise not carry it here).
-- ============================================================================

create or replace function get_activity_availability(p_activity_type_code text, p_date date)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now    timestamp;   -- Europe/London wall-clock
  v_today  date;
  v_cutoff timestamp;   -- now + 2h: earliest bookable slot today
  v_result json;
begin
  v_now    := now() at time zone 'Europe/London';
  v_today  := v_now::date;
  v_cutoff := v_now + interval '2 hours';

  select json_agg(json_build_object(
           'slot_id', slot_id,
           'slot_date', slot_date,
           'slot_time', slot_time,
           'available', capacity - booked
         ) order by slot_time)
    into v_result
  from activity_slots
  where activity_type_code = p_activity_type_code
    and slot_date = p_date
    and booked < capacity
    and (
      p_date > v_today                                    -- future date: all open slots
      or (p_date = v_today                                -- today: only >= now + 2h
          and (slot_date + slot_time) >= v_cutoff)
    );                                                    -- past date: no rows match

  return coalesce(v_result, '[]'::json);
end;
$$;

create or replace function post_activity_booking(p_profile_id text, p_slot_id text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slot    activity_slots;
  v_claimed int;
  v_res_id  text;
  v_id      text;
  v_now     timestamp;   -- Europe/London wall-clock
begin
  select * into v_slot from activity_slots where slot_id = p_slot_id;
  if not found then return json_build_object('error', 'SLOT_NOT_FOUND'); end if;

  -- same-day 2h notice / past-slot guard (authoritative; Europe/London).
  -- Reuse NO_AVAILABILITY so the Spa agent's existing re-check loop handles it.
  v_now := now() at time zone 'Europe/London';
  if (v_slot.slot_date + v_slot.slot_time) < (v_now + interval '2 hours') then
    return json_build_object('error', 'NO_AVAILABILITY');
  end if;

  update activity_slots set booked = booked + 1
  where slot_id = p_slot_id and booked < capacity;
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    return json_build_object('error', 'NO_AVAILABILITY');
  end if;

  select reservation_id into v_res_id from reservations
  where profile_id = p_profile_id and reservation_status = 'CheckedIn'
  order by arrival_date limit 1;

  v_id := 'AB' || nextval('seq_activity_booking');

  insert into activity_bookings (activity_booking_id, profile_id, reservation_id,
    activity_type_code, slot_id, booking_date, booking_time, status)
  values (v_id, p_profile_id, v_res_id, v_slot.activity_type_code, v_slot.slot_id,
    v_slot.slot_date, v_slot.slot_time, 'Booked');

  return (select row_to_json(b) from (select * from activity_bookings where activity_booking_id = v_id) b);
end;
$$;
