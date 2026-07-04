-- ============================================================================
-- 02_functions.sql — SQL functions (skills) for The Wren (WRENLON)
-- All functions SECURITY DEFINER, return json. Determinism lives here:
-- availability, entitlement, ETA, and status transitions are single guarded
-- statements — never left to application code or a model.
-- Implements DESIGN.md §8 function table + v1.1 frozen contract decisions.
-- Time logic runs in Europe/London, fetched (never assumed).
-- ============================================================================

-- Sequences for function-generated transactional IDs. reset_demo() restarts
-- these above the seeded literal IDs so new rows never collide and stay tidy.
create sequence if not exists seq_reservation       start 3101;
create sequence if not exists seq_service_request   start 5001;
create sequence if not exists seq_activity_booking  start 7101;
create sequence if not exists seq_message           start 8001;

-- ----------------------------------------------------------------------------
-- helper: phonetic-safe confirmation number, generate-and-retry on collision
--   alphabet A C D E F G H J K M N P Q R T U V W X Y + 3 4 6 7 9  (DESIGN §8.5)
-- ----------------------------------------------------------------------------
create or replace function gen_confirmation_number()
returns text
language plpgsql
security definer
as $$
declare
  alphabet constant text := 'ACDEFGHJKMNPQRTUVWXY34679';
  code text;
  i int;
  attempts int := 0;
begin
  loop
    code := '';
    for i in 1..5 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    code := 'WRENLON-' || code;
    exit when not exists (select 1 from reservations where confirmation_number = code);
    attempts := attempts + 1;
    if attempts > 100 then
      raise exception 'gen_confirmation_number: exhausted attempts';
    end if;
  end loop;
  return code;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_guest_profile(p_profile_id) — CRM: profile + membership summary
-- ----------------------------------------------------------------------------
create or replace function get_guest_profile(p_profile_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_result json;
begin
  select json_build_object(
    'profile_id', p.profile_id,
    'hotel_id', p.hotel_id,
    'name', p.name_given || ' ' || p.name_surname,
    'name_given', p.name_given,
    'name_surname', p.name_surname,
    'email', p.email,
    'phone', p.phone,
    'is_member', (m.membership_id is not null),
    'membership_level', m.membership_level,
    'membership_status', m.status,
    'membership_years',
      case when m.membership_id is not null
           then date_part('year', age(v_today, m.enrollment_date))::int
           else null end
  )
  into v_result
  from profiles p
  left join memberships m on m.profile_id = p.profile_id and m.status = 'Active'
  where p.profile_id = p_profile_id;

  if v_result is null then
    return json_build_object('error', 'NOT_FOUND');
  end if;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_entitlement_context(p_profile_id) — §6 payload; tenure & stays computed
-- ----------------------------------------------------------------------------
create or replace function get_entitlement_context(p_profile_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_profile profiles;
  v_membership_id text;
  v_is_member boolean;
  v_years int;
  v_in_house_room text;
  v_stays int;
  v_upcoming json;
begin
  select * into v_profile from profiles where profile_id = p_profile_id;
  if not found then
    return json_build_object('error', 'NOT_FOUND');
  end if;

  select m.membership_id,
         (m.membership_id is not null),
         case when m.membership_id is not null
              then date_part('year', age(v_today, m.enrollment_date))::int end
    into v_membership_id, v_is_member, v_years
  from (select 1) x
  left join memberships m on m.profile_id = p_profile_id and m.status = 'Active';

  -- in-house = a CheckedIn reservation; capture its room number
  select room_number into v_in_house_room
  from reservations
  where profile_id = p_profile_id and reservation_status = 'CheckedIn'
  order by arrival_date limit 1;

  -- stays this (London) year = CheckedOut reservations arriving in current year
  select count(*) into v_stays
  from reservations
  where profile_id = p_profile_id
    and reservation_status = 'CheckedOut'
    and date_part('year', arrival_date) = date_part('year', v_today);

  -- soonest future Reserved stay
  select json_build_object(
           'confirmation_number', confirmation_number,
           'arrival_date', arrival_date,
           'departure_date', departure_date,
           'room_type', room_type_code
         )
    into v_upcoming
  from reservations
  where profile_id = p_profile_id
    and reservation_status = 'Reserved'
    and arrival_date >= v_today
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
    'stays_this_year', v_stays
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- check_club_access(p_profile_id, p_access_date) — §6 CASE + tie-breaks (E)
--   precedence: membership first (date-independent); stay window inclusive of
--   departure; multi-stay next_stay = soonest arrival >= access_date.
--   room-category join point stubbed for a future Large-and-above rule.
-- ----------------------------------------------------------------------------
create or replace function check_club_access(p_profile_id text, p_access_date date)
returns json
language plpgsql
security definer
as $$
declare
  v_is_member boolean;
  v_in_house boolean;
  v_status text;
  v_next json;
begin
  if not exists (select 1 from profiles where profile_id = p_profile_id) then
    return json_build_object('error', 'NOT_FOUND');
  end if;

  v_is_member := exists (
    select 1 from memberships
    where profile_id = p_profile_id and status = 'Active');

  v_in_house := exists (
    select 1 from reservations
    where profile_id = p_profile_id and reservation_status = 'CheckedIn');

  -- next_stay = soonest future Reserved stay on/after the access date
  -- (used to render UPCOMING_STAY / FUTURE_STAY_ONLY, and included for members).
  select json_build_object(
           'arrival_date', arrival_date,
           'departure_date', departure_date,
           'confirmation_number', confirmation_number
         )
    into v_next
  from reservations
  where profile_id = p_profile_id
    and reservation_status = 'Reserved'
    and departure_date >= p_access_date     -- covering OR future stay
  order by arrival_date limit 1;

  -- room-category access join point (future): a Large-and-above rooftop rule
  -- would add a condition here on the covering reservation's room_type_code.

  if v_is_member then
    v_status := 'MEMBER_ACCESS';                          -- E1: membership wins
  elsif v_in_house then
    v_status := 'IN_HOUSE_ACCESS';
  elsif exists (
      select 1 from reservations
      where profile_id = p_profile_id
        and reservation_status = 'Reserved'
        and p_access_date between arrival_date and departure_date   -- E2 inclusive
    ) then
    v_status := 'UPCOMING_STAY';
  elsif v_next is not null then
    v_status := 'FUTURE_STAY_ONLY';
  else
    v_status := 'NO_ACCESS';
  end if;

  return json_build_object(
    'access_status', v_status,
    'access_date', p_access_date,
    'next_stay', v_next
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- get_hotel_availability(hotel, arrival, departure, adults) — PAR
--   per room_type: min available across every night of the range + rate.
--   a night with no inventory row ⇒ that type shows 0 available.
-- ----------------------------------------------------------------------------
create or replace function get_hotel_availability(p_hotel_id text, p_arrival date, p_departure date, p_adults int)
returns json
language plpgsql
security definer
as $$
declare
  v_nights int := (p_departure - p_arrival);
  v_result json;
begin
  if p_departure <= p_arrival then
    return json_build_object('error', 'INVALID_DATES');
  end if;

  with nights as (
    select generate_series(p_arrival, p_departure - 1, interval '1 day')::date as d
  ),
  per_type as (
    select rt.room_type_code, rt.display_name, rt.base_rate_gbp, rt.sort_order,
      case when count(ri.inventory_date) = v_nights
           then coalesce(min(ri.capacity - ri.booked), 0) else 0 end as available
    from room_types rt
    left join room_inventory ri
      on ri.hotel_id = p_hotel_id
     and ri.room_type_code = rt.room_type_code
     and ri.inventory_date in (select d from nights)
    where rt.hotel_id = p_hotel_id
    group by rt.room_type_code, rt.display_name, rt.base_rate_gbp, rt.sort_order
  )
  select json_agg(json_build_object(
           'room_type_code', room_type_code,
           'display_name', display_name,
           'base_rate_gbp', base_rate_gbp,
           'available', available
         ) order by sort_order)
    into v_result
  from per_type;

  return json_build_object('hotel_id', p_hotel_id, 'arrival_date', p_arrival,
                           'departure_date', p_departure, 'room_types', v_result);
end;
$$;

-- ----------------------------------------------------------------------------
-- get_available_upsells(reservation_id) — PAR: next-higher types with
--   availability across the whole stay (sort_order ascending, nearest up first).
-- ----------------------------------------------------------------------------
create or replace function get_available_upsells(p_reservation_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_res reservations;
  v_cur_sort int;
  v_nights int;
  v_result json;
begin
  select * into v_res from reservations where reservation_id = p_reservation_id;
  if not found then return json_build_object('error', 'NOT_FOUND'); end if;

  select sort_order into v_cur_sort from room_types where room_type_code = v_res.room_type_code;
  v_nights := (v_res.departure_date - v_res.arrival_date);

  with nights as (
    select generate_series(v_res.arrival_date, v_res.departure_date - 1, interval '1 day')::date as d
  ),
  per_type as (
    select rt.room_type_code, rt.display_name, rt.base_rate_gbp, rt.sort_order,
      case when count(ri.inventory_date) = v_nights
           then coalesce(min(ri.capacity - ri.booked), 0) else 0 end as available
    from room_types rt
    left join room_inventory ri
      on ri.hotel_id = 'WRENLON'
     and ri.room_type_code = rt.room_type_code
     and ri.inventory_date in (select d from nights)
    where rt.sort_order > v_cur_sort
    group by rt.room_type_code, rt.display_name, rt.base_rate_gbp, rt.sort_order
  )
  select json_agg(json_build_object(
           'room_type_code', room_type_code,
           'display_name', display_name,
           'base_rate_gbp', base_rate_gbp,
           'available', available
         ) order by sort_order)
    into v_result
  from per_type
  where available > 0;

  return json_build_object('reservation_id', p_reservation_id,
                           'upsells', coalesce(v_result, '[]'::json));
end;
$$;

-- ----------------------------------------------------------------------------
-- post_reservation(...) — atomic all-or-nothing inventory claim, then insert.
--   Increments booked for EVERY night in one guarded statement; on any
--   shortfall nothing changes and NO_AVAILABILITY is returned. (Hard rule 8.)
-- ----------------------------------------------------------------------------
create or replace function post_reservation(p_profile_id text, p_room_type_code text, p_arrival date, p_departure date, p_adults int)
returns json
language plpgsql
security definer
as $$
declare
  v_nights int := (p_departure - p_arrival);
  v_claimed int;
  v_id text;
  v_conf text;
begin
  if p_departure <= p_arrival then
    return json_build_object('error', 'INVALID_DATES');
  end if;
  if not exists (select 1 from profiles where profile_id = p_profile_id) then
    return json_build_object('error', 'PROFILE_NOT_FOUND');
  end if;
  if not exists (select 1 from room_types where room_type_code = p_room_type_code) then
    return json_build_object('error', 'ROOM_TYPE_NOT_FOUND');
  end if;

  -- claim inventory: update fires only if ALL nights have an available row.
  with nights as (
    select generate_series(p_arrival, p_departure - 1, interval '1 day')::date as d
  ),
  avail as (
    select count(*) c
    from room_inventory ri join nights n on n.d = ri.inventory_date
    where ri.hotel_id = 'WRENLON' and ri.room_type_code = p_room_type_code
      and ri.booked < ri.capacity
  ),
  claim as (
    update room_inventory ri
      set booked = booked + 1
    from nights n
    where ri.hotel_id = 'WRENLON' and ri.room_type_code = p_room_type_code
      and ri.inventory_date = n.d
      and (select c from avail) = v_nights
    returning 1
  )
  select count(*) into v_claimed from claim;

  if v_claimed <> v_nights then
    return json_build_object('error', 'NO_AVAILABILITY');
  end if;

  v_id := 'R' || nextval('seq_reservation');
  v_conf := gen_confirmation_number();

  insert into reservations (reservation_id, confirmation_number, profile_id,
    room_type_code, arrival_date, departure_date, adults)
  values (v_id, v_conf, p_profile_id, p_room_type_code, p_arrival, p_departure,
    coalesce(p_adults, 1));

  return (select row_to_json(r) from (select * from reservations where reservation_id = v_id) r);
end;
$$;

-- ----------------------------------------------------------------------------
-- put_reservation(...) — set-difference claim/release (frozen decision C).
--   keys = (room_type_code, inventory_date). Claim S_new\S_old all-or-nothing,
--   then release S_old\S_new. confirmation_number preserved; on NO_AVAILABILITY
--   the original reservation and its inventory are untouched.
--   NULL params mean "unchanged".
-- ----------------------------------------------------------------------------
create or replace function put_reservation(p_reservation_id text, p_arrival date, p_departure date, p_room_type_code text, p_adults int)
returns json
language plpgsql
security definer
as $$
declare
  v_old reservations;
  v_arr date;
  v_dep date;
  v_type text;
  v_adults int;
  v_add_needed int;
  v_add_claimed int;
begin
  select * into v_old from reservations where reservation_id = p_reservation_id;
  if not found then return json_build_object('error', 'NOT_FOUND'); end if;
  if v_old.reservation_status = 'Cancelled' then
    return json_build_object('error', 'NOT_MODIFIABLE');
  end if;

  v_arr    := coalesce(p_arrival, v_old.arrival_date);
  v_dep    := coalesce(p_departure, v_old.departure_date);
  v_type   := coalesce(p_room_type_code, v_old.room_type_code);
  v_adults := coalesce(p_adults, v_old.adults);

  if v_dep <= v_arr then return json_build_object('error', 'INVALID_DATES'); end if;
  if not exists (select 1 from room_types where room_type_code = v_type) then
    return json_build_object('error', 'ROOM_TYPE_NOT_FOUND');
  end if;

  -- keys to add = new keys minus old keys
  select count(*) into v_add_needed from (
    select v_type as rt, generate_series(v_arr, v_dep - 1, interval '1 day')::date as d
    except
    select v_old.room_type_code, generate_series(v_old.arrival_date, v_old.departure_date - 1, interval '1 day')::date
  ) add_keys;

  -- claim the add set, all-or-nothing
  with add_keys as (
    select v_type as rt, generate_series(v_arr, v_dep - 1, interval '1 day')::date as d
    except
    select v_old.room_type_code, generate_series(v_old.arrival_date, v_old.departure_date - 1, interval '1 day')::date
  ),
  avail as (
    select count(*) c from add_keys ak
    join room_inventory ri on ri.hotel_id = 'WRENLON'
      and ri.room_type_code = ak.rt and ri.inventory_date = ak.d
    where ri.booked < ri.capacity
  ),
  claim as (
    update room_inventory ri set booked = booked + 1
    from add_keys ak
    where ri.hotel_id = 'WRENLON' and ri.room_type_code = ak.rt and ri.inventory_date = ak.d
      and (select c from avail) = v_add_needed
    returning 1
  )
  select count(*) into v_add_claimed from claim;

  if v_add_needed > 0 and v_add_claimed = 0 then
    return json_build_object('error', 'NO_AVAILABILITY');   -- original untouched
  end if;

  -- release the old keys no longer needed
  with release_keys as (
    select v_old.room_type_code as rt, generate_series(v_old.arrival_date, v_old.departure_date - 1, interval '1 day')::date as d
    except
    select v_type, generate_series(v_arr, v_dep - 1, interval '1 day')::date
  )
  update room_inventory ri set booked = booked - 1
  from release_keys rk
  where ri.hotel_id = 'WRENLON' and ri.room_type_code = rk.rt
    and ri.inventory_date = rk.d and ri.booked > 0;

  update reservations
    set arrival_date = v_arr, departure_date = v_dep,
        room_type_code = v_type, adults = v_adults, updated_at = now()
  where reservation_id = p_reservation_id;

  return (select row_to_json(r) from (select * from reservations where reservation_id = p_reservation_id) r);
end;
$$;

-- ----------------------------------------------------------------------------
-- cancel_reservation(reservation_id) — idempotent guard (frozen decision D).
--   Only Reserved cancels; only a non-Cancelled→Cancelled transition releases
--   inventory (no double release). CheckedIn/CheckedOut/NoShow not cancellable.
-- ----------------------------------------------------------------------------
create or replace function cancel_reservation(p_reservation_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_res reservations;
  v_updated int;
begin
  select * into v_res from reservations where reservation_id = p_reservation_id;
  if not found then return json_build_object('status', 'NOT_FOUND'); end if;
  if v_res.reservation_status = 'Cancelled' then
    return json_build_object('status', 'ALREADY_CANCELLED', 'reservation_id', p_reservation_id);
  end if;
  if v_res.reservation_status <> 'Reserved' then
    return json_build_object('status', 'NOT_CANCELLABLE',
      'reservation_id', p_reservation_id, 'reservation_status', v_res.reservation_status);
  end if;

  update reservations set reservation_status = 'Cancelled', updated_at = now()
  where reservation_id = p_reservation_id and reservation_status = 'Reserved';
  get diagnostics v_updated = row_count;

  if v_updated = 1 then
    update room_inventory ri set booked = booked - 1
    from (select generate_series(v_res.arrival_date, v_res.departure_date - 1, interval '1 day')::date as d) g
    where ri.hotel_id = 'WRENLON' and ri.room_type_code = v_res.room_type_code
      and ri.inventory_date = g.d and ri.booked > 0;
  end if;

  return json_build_object('status', 'CANCELLED', 'reservation_id', p_reservation_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- accept_upgrade_offer(offer_id) — one txn, claim-new-first (frozen contract).
--   Validate → claim to_room_type every night → release from_room_type → move
--   reservation (confirmation_number preserved) → mark offer Accepted.
--   Idempotent. Returns ACCEPTED / ALREADY_ACCEPTED / DECLINED / EXPIRED /
--   NO_AVAILABILITY / NOT_FOUND.
-- ----------------------------------------------------------------------------
create or replace function accept_upgrade_offer(p_offer_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_offer upgrade_offers;
  v_res reservations;
  v_nights int;
  v_claimed int;
begin
  select * into v_offer from upgrade_offers where offer_id = p_offer_id;
  if not found then return json_build_object('status', 'NOT_FOUND'); end if;

  if v_offer.status = 'Accepted' then
    return json_build_object('status', 'ALREADY_ACCEPTED', 'offer_id', p_offer_id);
  elsif v_offer.status = 'Declined' then
    return json_build_object('status', 'DECLINED', 'offer_id', p_offer_id);
  elsif v_offer.status = 'Expired' or v_offer.expires_at <= now() then
    update upgrade_offers set status = 'Expired' where offer_id = p_offer_id and status = 'Offered';
    return json_build_object('status', 'EXPIRED', 'offer_id', p_offer_id);
  end if;

  select * into v_res from reservations where reservation_id = v_offer.reservation_id;
  v_nights := (v_res.departure_date - v_res.arrival_date);

  -- claim the target category for every night, all-or-nothing
  with nights as (
    select generate_series(v_res.arrival_date, v_res.departure_date - 1, interval '1 day')::date as d
  ),
  avail as (
    select count(*) c from room_inventory ri join nights n on n.d = ri.inventory_date
    where ri.hotel_id = 'WRENLON' and ri.room_type_code = v_offer.to_room_type
      and ri.booked < ri.capacity
  ),
  claim as (
    update room_inventory ri set booked = booked + 1
    from nights n
    where ri.hotel_id = 'WRENLON' and ri.room_type_code = v_offer.to_room_type
      and ri.inventory_date = n.d
      and (select c from avail) = v_nights
    returning 1
  )
  select count(*) into v_claimed from claim;

  if v_claimed <> v_nights then
    -- guest never stranded: offer stays Offered, reservation & inventory intact
    return json_build_object('status', 'NO_AVAILABILITY', 'offer_id', p_offer_id);
  end if;

  -- release the original category for those nights
  update room_inventory ri set booked = booked - 1
  from (select generate_series(v_res.arrival_date, v_res.departure_date - 1, interval '1 day')::date as d) g
  where ri.hotel_id = 'WRENLON' and ri.room_type_code = v_offer.from_room_type
    and ri.inventory_date = g.d and ri.booked > 0;

  update reservations set room_type_code = v_offer.to_room_type, updated_at = now()
  where reservation_id = v_res.reservation_id;

  update upgrade_offers set status = 'Accepted', responded_at = now()
  where offer_id = p_offer_id;

  return json_build_object(
    'status', 'ACCEPTED',
    'offer_id', p_offer_id,
    'reservation', (select row_to_json(r) from (select * from reservations where reservation_id = v_res.reservation_id) r)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- get_pre_arrival_member_reservations(hotel, days_ahead) — RSV: member
--   reservations arriving within the window (feeds the proactive workflow).
-- ----------------------------------------------------------------------------
create or replace function get_pre_arrival_member_reservations(p_hotel_id text, p_days_ahead int)
returns json
language plpgsql
security definer
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_result json;
begin
  select json_agg(json_build_object(
           'reservation_id', r.reservation_id,
           'confirmation_number', r.confirmation_number,
           'profile_id', r.profile_id,
           'name', p.name_given || ' ' || p.name_surname,
           'arrival_date', r.arrival_date,
           'departure_date', r.departure_date,
           'room_type_code', r.room_type_code,
           'membership_years', date_part('year', age(v_today, m.enrollment_date))::int
         ) order by r.arrival_date)
    into v_result
  from reservations r
  join profiles p on p.profile_id = r.profile_id
  join memberships m on m.profile_id = r.profile_id and m.status = 'Active'
  where r.hotel_id = p_hotel_id
    and r.reservation_status = 'Reserved'
    and r.arrival_date between v_today and v_today + p_days_ahead;

  return coalesce(v_result, '[]'::json);
end;
$$;

-- ----------------------------------------------------------------------------
-- post_service_request(profile, code, quantity, comment) — FOF.
--   Requires a CheckedIn reservation (else NOT_IN_HOUSE). Room + department
--   resolved server-side from the reservation and request_codes catalog.
--   Unknown code ⇒ GENERAL_REQUEST fallback (Front Desk). Returns eta_text.
-- ----------------------------------------------------------------------------
create or replace function post_service_request(p_profile_id text, p_code text, p_quantity int, p_comment text)
returns json
language plpgsql
security definer
as $$
declare
  v_res reservations;
  v_code text;
  v_dept text;
  v_eta text;
  v_id text;
begin
  select * into v_res from reservations
  where profile_id = p_profile_id and reservation_status = 'CheckedIn'
  order by arrival_date limit 1;
  if not found then
    return json_build_object('error', 'NOT_IN_HOUSE');
  end if;

  -- resolve catalog row; unknown code falls back to GENERAL_REQUEST
  select code, department, eta_text into v_code, v_dept, v_eta
  from request_codes where code = p_code;
  if not found then
    select code, department, eta_text into v_code, v_dept, v_eta
    from request_codes where code = 'GENERAL_REQUEST';
  end if;

  v_id := 'SR' || nextval('seq_service_request');

  insert into service_requests (service_request_id, code, department, profile_id,
    reservation_id, room, quantity, comment)
  values (v_id, v_code, v_dept, p_profile_id, v_res.reservation_id,
    v_res.room_number, coalesce(p_quantity, 1), p_comment);

  return json_build_object(
    'service_request_id', v_id,
    'code', v_code,
    'status', 'Open',
    'department', v_dept,
    'profile_id', p_profile_id,
    'reservation_id', v_res.reservation_id,
    'room', v_res.room_number,
    'quantity', coalesce(p_quantity, 1),
    'comment', p_comment,
    'eta_text', v_eta
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- get_service_requests(profile) — FOF: open + recent requests with timestamps
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- get_activity_availability(activity_type, date) — LMS: open slots
-- ----------------------------------------------------------------------------
create or replace function get_activity_availability(p_activity_type_code text, p_date date)
returns json
language plpgsql
security definer
as $$
declare
  v_result json;
begin
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
    and booked < capacity;

  return coalesce(v_result, '[]'::json);
end;
$$;

-- ----------------------------------------------------------------------------
-- post_activity_booking(profile, slot_id) — LMS: atomic slot claim; links the
--   current in-house reservation if one exists.
-- ----------------------------------------------------------------------------
create or replace function post_activity_booking(p_profile_id text, p_slot_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_slot activity_slots;
  v_claimed int;
  v_res_id text;
  v_id text;
begin
  select * into v_slot from activity_slots where slot_id = p_slot_id;
  if not found then return json_build_object('error', 'SLOT_NOT_FOUND'); end if;

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

-- ----------------------------------------------------------------------------
-- get_activity_history(profile) — LMS: past Completed bookings. Empty result
--   ⇒ agent makes no re-book suggestion (do not fabricate one).
-- ----------------------------------------------------------------------------
create or replace function get_activity_history(p_profile_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_result json;
begin
  select json_agg(json_build_object(
           'activity_booking_id', ab.activity_booking_id,
           'activity_type_code', ab.activity_type_code,
           'display_name', at.display_name,
           'location', at.location,
           'booking_date', ab.booking_date,
           'booking_time', ab.booking_time,
           'status', ab.status
         ) order by ab.booking_date desc)
    into v_result
  from activity_bookings ab
  join activity_types at on at.activity_type_code = ab.activity_type_code
  where ab.profile_id = p_profile_id and ab.status = 'Completed';

  return coalesce(v_result, '[]'::json);
end;
$$;

-- ----------------------------------------------------------------------------
-- fire_pre_arrival_upgrade(hotel, days_ahead) — proactive send (A2).
--   For member reservations with an Offered upgrade in-window, compose the
--   fixed template in SQL (no model) and log a PRE_ARRIVAL_UPGRADE row. Does
--   not create the offer (reset_demo seeds it).
-- ----------------------------------------------------------------------------
create or replace function fire_pre_arrival_upgrade(p_hotel_id text, p_days_ahead int)
returns json
language plpgsql
security definer
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_result json;
begin
  with targets as (
    select o.offer_id, o.profile_id, p.name_surname,
           date_part('year', age(v_today, m.enrollment_date))::int as years,
           ft.display_name as from_name, tt.display_name as to_name,
           r.arrival_date
    from upgrade_offers o
    join reservations r on r.reservation_id = o.reservation_id
    join profiles p on p.profile_id = o.profile_id
    join memberships m on m.profile_id = o.profile_id and m.status = 'Active'
    join room_types ft on ft.room_type_code = o.from_room_type
    join room_types tt on tt.room_type_code = o.to_room_type
    where o.hotel_id = p_hotel_id
      and o.status = 'Offered'
      and r.arrival_date between v_today and v_today + p_days_ahead
  ),
  sent as (
    insert into outbound_messages (message_id, profile_id, channel, trigger_type, body)
    select 'MSG' || nextval('seq_message'), t.profile_id, 'whatsapp', 'PRE_ARRIVAL_UPGRADE',
      format(
        'Dear Mr %s, as a valued Wren Club member of %s years, we would be delighted to offer you a complimentary upgrade from our %s room to a %s for your upcoming stay arriving %s. Simply reply YES and we will take care of it.',
        t.name_surname, t.years, t.from_name, t.to_name, to_char(t.arrival_date, 'FMDay DD FMMonth'))
    from targets t
    returning message_id, profile_id, body
  )
  select json_agg(json_build_object('message_id', message_id, 'profile_id', profile_id, 'body', body))
    into v_result from sent;

  return json_build_object('trigger_type', 'PRE_ARRIVAL_UPGRADE',
                           'sent', coalesce(v_result, '[]'::json));
end;
$$;

-- ----------------------------------------------------------------------------
-- fire_milestone(profile) — proactive send (A2). Compute stays_this_year live,
--   compose the fixed milestone template in SQL, log a MILESTONE_THANKS row.
-- ----------------------------------------------------------------------------
create or replace function fire_milestone(p_profile_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_profile profiles;
  v_stays int;
  v_ord text;
  v_id text;
  v_body text;
begin
  select * into v_profile from profiles where profile_id = p_profile_id;
  if not found then return json_build_object('error', 'NOT_FOUND'); end if;

  select count(*) into v_stays from reservations
  where profile_id = p_profile_id and reservation_status = 'CheckedOut'
    and date_part('year', arrival_date) = date_part('year', v_today);

  v_ord := case v_stays when 1 then '1st' when 2 then '2nd' when 3 then '3rd'
                        else v_stays || 'th' end;
  v_id := 'MSG' || nextval('seq_message');
  v_body := format(
    'Dear Mr %s, thank you for making The Wren part of your year — this marks your %s stay with us in %s. It is a genuine pleasure to welcome you back, and we look forward to seeing you again soon.',
    v_profile.name_surname, v_ord, date_part('year', v_today)::int);

  insert into outbound_messages (message_id, profile_id, channel, trigger_type, body)
  values (v_id, p_profile_id, 'whatsapp', 'MILESTONE_THANKS', v_body);

  return json_build_object('trigger_type', 'MILESTONE_THANKS',
                           'message_id', v_id, 'profile_id', p_profile_id,
                           'stays_this_year', v_stays, 'body', v_body);
end;
$$;
