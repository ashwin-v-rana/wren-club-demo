-- ============================================================================
-- 16_prearrival_service_requests.sql — pre-arrival guest service requests.
--
-- v1 post_service_request required a CheckedIn stay and pulled the room from it,
-- so a guest who had not yet checked in got NOT_IN_HOUSE. Guests legitimately
-- want to request amenities before arrival (OPERA models these as pre-arrival
-- special requests / traces on the reservation). This extends the function to
-- accept the guest's nearest UPCOMING RESERVED stay when they are not in-house,
-- logging the request against that reservation and holding it for arrival.
--
-- Determinism stays in SQL (rule 5): the function decides in-house vs pre-arrival
-- from reservation_status, sets the room, and returns a `pre_arrival` flag +
-- `arrival_date` so the agent/console word it correctly (no model judgment).
--   in-house  : CheckedIn stay  -> room = assigned room_number, pre_arrival false
--   pre-arrival: nearest upcoming Reserved stay -> room = 'On arrival'
--                (or the assigned room_number if one exists), pre_arrival true
--   neither    : NOT_IN_HOUSE (guest has no current or upcoming stay)
--
-- CREATE OR REPLACE drops a function's `SET search_path` (added by 05_harden via
-- ALTER); re-apply the harden block for every replaced function (see mig 14).
-- ============================================================================

alter table service_requests
  add column if not exists pre_arrival boolean not null default false;

create or replace function post_service_request(p_profile_id text, p_code text, p_quantity int, p_comment text)
returns json
language plpgsql
security definer
as $$
declare
  v_res     reservations;
  v_code    text;
  v_dept    text;
  v_eta     text;
  v_id      text;
  v_pre     boolean := false;
  v_room    text;
  v_arrival date := null;
begin
  -- In-house first (unchanged): a CheckedIn stay assigns the room.
  select * into v_res from reservations
  where profile_id = p_profile_id and reservation_status = 'CheckedIn'
  order by arrival_date limit 1;

  if not found then
    -- Pre-arrival: the nearest upcoming Reserved stay (not yet checked in).
    select * into v_res from reservations
    where profile_id = p_profile_id
      and reservation_status = 'Reserved'
      and departure_date >= (now() at time zone 'Europe/London')::date
    order by arrival_date limit 1;
    if not found then
      return json_build_object('error', 'NOT_IN_HOUSE');
    end if;
    v_pre := true;
  end if;

  -- Resolve catalog row; unknown code falls back to GENERAL_REQUEST.
  select code, department, eta_text into v_code, v_dept, v_eta
  from request_codes where code = p_code;
  if not found then
    select code, department, eta_text into v_code, v_dept, v_eta
    from request_codes where code = 'GENERAL_REQUEST';
  end if;

  if v_pre then
    v_room    := coalesce(v_res.room_number, 'On arrival');  -- room may be unassigned pre-checkin
    v_arrival := v_res.arrival_date;
  else
    v_room    := v_res.room_number;
  end if;

  v_id := 'SR' || nextval('seq_service_request');

  insert into service_requests (service_request_id, code, department, profile_id,
    reservation_id, room, quantity, comment, pre_arrival)
  values (v_id, v_code, v_dept, p_profile_id, v_res.reservation_id,
    v_room, coalesce(p_quantity, 1), p_comment, v_pre);

  return json_build_object(
    'service_request_id', v_id,
    'code', v_code,
    'status', 'Open',
    'department', v_dept,
    'profile_id', p_profile_id,
    'reservation_id', v_res.reservation_id,
    'room', v_room,
    'quantity', coalesce(p_quantity, 1),
    'comment', p_comment,
    'eta_text', v_eta,
    'pre_arrival', v_pre,
    'arrival_date', v_arrival
  );
end;
$$;

create or replace function get_service_requests(p_profile_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_result json;
begin
  select json_agg(json_build_object(
           'service_request_id', sr.service_request_id,
           'code', sr.code,
           'description', rc.description,
           'status', sr.status,
           'department', sr.department,
           'room', sr.room,
           'quantity', sr.quantity,
           'comment', sr.comment,
           'eta_text', rc.eta_text,
           'pre_arrival', sr.pre_arrival,
           'open_date', sr.open_date,
           'completion_date', sr.completion_date
         ) order by sr.open_date desc)
    into v_result
  from service_requests sr
  join request_codes rc on rc.code = sr.code
  where sr.profile_id = p_profile_id;

  return coalesce(v_result, '[]'::json);
end;
$$;

-- Re-harden the two replaced functions (CREATE OR REPLACE drops the search_path).
alter  function post_service_request(text, text, int, text) set search_path = public, pg_temp;
revoke execute on function post_service_request(text, text, int, text) from public, anon, authenticated;
grant  execute on function post_service_request(text, text, int, text) to service_role;

alter  function get_service_requests(text) set search_path = public, pg_temp;
revoke execute on function get_service_requests(text) from public, anon, authenticated;
grant  execute on function get_service_requests(text) to service_role;
