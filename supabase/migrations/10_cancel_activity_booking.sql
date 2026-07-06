-- ============================================================================
-- 10_cancel_activity_booking.sql — spa appointment cancellation (LMS shape).
--
-- Adds cancel_activity_booking, the spa counterpart to cancel_reservation:
-- an idempotent, guarded transition that releases the slot exactly once.
-- Book-only was the v1 Spa agent scope; this closes the gap so a guest can
-- cancel a treatment the same way they can cancel a room.
--
-- Guard (mirrors cancel_reservation, frozen decision D):
--   * Only a 'Booked' appointment cancels.
--   * Only a non-Cancelled -> Cancelled transition releases the slot
--     (activity_slots.booked - 1), so a second call never double-releases.
--   * Completed / NoShow are NOT cancellable.
--   * Scoped to the guest's own profile_id (a mismatched owner reads as
--     NOT_FOUND) so one guest can never cancel another's appointment.
--   * Seeded history rows have a null slot_id (and are Completed anyway), so
--     the slot release is guarded on slot_id is not null.
--
-- Returns CANCELLED / ALREADY_CANCELLED / NOT_CANCELLABLE / NOT_FOUND.
--
-- Self-hardens at the end: 05_harden.sql already ran its loop over the then-
-- existing functions, so this new function pins its own search_path and gets
-- the same revoke-from-public / grant-to-service_role treatment.
-- ============================================================================

create or replace function cancel_activity_booking(p_profile_id text, p_activity_booking_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_booking activity_bookings;
  v_updated int;
begin
  select * into v_booking from activity_bookings
  where activity_booking_id = p_activity_booking_id and profile_id = p_profile_id;
  if not found then return json_build_object('status', 'NOT_FOUND'); end if;

  if v_booking.status = 'Cancelled' then
    return json_build_object('status', 'ALREADY_CANCELLED',
      'activity_booking_id', p_activity_booking_id);
  end if;
  if v_booking.status <> 'Booked' then
    return json_build_object('status', 'NOT_CANCELLABLE',
      'activity_booking_id', p_activity_booking_id, 'booking_status', v_booking.status);
  end if;

  update activity_bookings set status = 'Cancelled'
  where activity_booking_id = p_activity_booking_id and status = 'Booked';
  get diagnostics v_updated = row_count;

  if v_updated = 1 and v_booking.slot_id is not null then
    update activity_slots set booked = booked - 1
    where slot_id = v_booking.slot_id and booked > 0;
  end if;

  return json_build_object('status', 'CANCELLED',
    'activity_booking_id', p_activity_booking_id,
    'activity_type_code', v_booking.activity_type_code,
    'booking_date', v_booking.booking_date,
    'booking_time', v_booking.booking_time);
end;
$$;

-- Self-harden (05_harden.sql's loop predates this function).
alter function cancel_activity_booking(text, text) set search_path = public, pg_temp;
revoke execute on function cancel_activity_booking(text, text) from public, anon, authenticated;
grant execute on function cancel_activity_booking(text, text) to service_role;
