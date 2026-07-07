-- ============================================================================
-- 13_guest_profile_crud.sql — staff-managed guest profile CRUD.
--
-- The Front Desk Console needs to add / edit / delete guests (user-directed,
-- mirroring the crestline Customers tab). Per hard rule #4 (all writes go
-- through SQL functions, never direct table INSERT/UPDATE on domain tables),
-- these are SECURITY DEFINER functions the console calls via rpc — not direct
-- writes. Determinism stays in SQL: phone normalization, uniqueness, profile_id
-- generation, and a dependents-guard on delete.
--
-- No AI agent uses these (agents only read profiles); they are console-admin
-- surface, but still routed through the function layer to honor the contract.
-- All DELETEs are qualified (avoids the service-role safe-delete guard; see 12).
-- Self-hardens (05's loop predates these).
-- ============================================================================

-- create_guest_profile: allocate the next P#### id, normalize phone, insert.
create or replace function create_guest_profile(
  p_name_given text, p_name_surname text, p_email text, p_phone text
) returns json
language plpgsql
security definer
as $$
declare
  v_given   text := nullif(btrim(p_name_given), '');
  v_surname text := nullif(btrim(p_name_surname), '');
  v_email   text := nullif(btrim(p_email), '');
  v_phone   text := nullif(btrim(p_phone), '');
  v_id      text;
begin
  if v_given is null or v_surname is null then
    return json_build_object('error', 'NAME_REQUIRED');
  end if;

  if v_phone is not null then
    v_phone := regexp_replace(v_phone, '[^0-9+]', '', 'g');
    if left(v_phone, 1) <> '+' then v_phone := '+' || v_phone; end if;
    if exists (select 1 from profiles where phone = v_phone) then
      return json_build_object('error', 'DUP_PHONE');
    end if;
  end if;

  select 'P' || (coalesce(max((substring(profile_id from 2))::int), 1003) + 1)::text
    into v_id
  from profiles where profile_id ~ '^P[0-9]+$';

  insert into profiles (profile_id, name_given, name_surname, email, phone)
  values (v_id, v_given, v_surname, v_email, v_phone);

  return json_build_object('status', 'CREATED', 'profile',
    (select row_to_json(p) from (
       select profile_id, name_given, name_surname, email, phone, created_at
       from profiles where profile_id = v_id) p));
end;
$$;

-- update_guest_profile: edit an existing guest (name required; phone re-normalized).
create or replace function update_guest_profile(
  p_profile_id text, p_name_given text, p_name_surname text, p_email text, p_phone text
) returns json
language plpgsql
security definer
as $$
declare
  v_given   text := nullif(btrim(p_name_given), '');
  v_surname text := nullif(btrim(p_name_surname), '');
  v_email   text := nullif(btrim(p_email), '');
  v_phone   text := nullif(btrim(p_phone), '');
begin
  if not exists (select 1 from profiles where profile_id = p_profile_id) then
    return json_build_object('error', 'NOT_FOUND');
  end if;
  if v_given is null or v_surname is null then
    return json_build_object('error', 'NAME_REQUIRED');
  end if;

  if v_phone is not null then
    v_phone := regexp_replace(v_phone, '[^0-9+]', '', 'g');
    if left(v_phone, 1) <> '+' then v_phone := '+' || v_phone; end if;
    if exists (select 1 from profiles where phone = v_phone and profile_id <> p_profile_id) then
      return json_build_object('error', 'DUP_PHONE');
    end if;
  end if;

  update profiles
     set name_given = v_given, name_surname = v_surname, email = v_email, phone = v_phone
   where profile_id = p_profile_id;

  return json_build_object('status', 'UPDATED', 'profile',
    (select row_to_json(p) from (
       select profile_id, name_given, name_surname, email, phone, created_at
       from profiles where profile_id = p_profile_id) p));
end;
$$;

-- delete_guest_profile: only if the guest has no domain history (protects the
-- seed personas and anyone with stays/bookings). Never cascades domain data.
create or replace function delete_guest_profile(p_profile_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_res int; v_mem int; v_act int; v_sr int; v_off int; v_msg int; v_otp int;
begin
  if not exists (select 1 from profiles where profile_id = p_profile_id) then
    return json_build_object('error', 'NOT_FOUND');
  end if;

  select count(*) into v_res from reservations       where profile_id = p_profile_id;
  select count(*) into v_mem from memberships        where profile_id = p_profile_id;
  select count(*) into v_act from activity_bookings  where profile_id = p_profile_id;
  select count(*) into v_sr  from service_requests   where profile_id = p_profile_id;
  select count(*) into v_off from upgrade_offers     where profile_id = p_profile_id;
  select count(*) into v_msg from outbound_messages  where profile_id = p_profile_id;
  select count(*) into v_otp from otp_codes          where profile_id = p_profile_id;

  if v_res + v_mem + v_act + v_sr + v_off + v_msg + v_otp > 0 then
    return json_build_object('error', 'HAS_DEPENDENTS',
      'reservations', v_res, 'memberships', v_mem, 'activity_bookings', v_act,
      'service_requests', v_sr, 'upgrade_offers', v_off,
      'outbound_messages', v_msg, 'otp_codes', v_otp);
  end if;

  delete from profiles where profile_id = p_profile_id;
  return json_build_object('status', 'DELETED', 'profile_id', p_profile_id);
end;
$$;

-- Self-harden (05_harden.sql's loop predates these functions).
alter function create_guest_profile(text, text, text, text) set search_path = public, pg_temp;
revoke execute on function create_guest_profile(text, text, text, text) from public, anon, authenticated;
grant execute on function create_guest_profile(text, text, text, text) to service_role;

alter function update_guest_profile(text, text, text, text, text) set search_path = public, pg_temp;
revoke execute on function update_guest_profile(text, text, text, text, text) from public, anon, authenticated;
grant execute on function update_guest_profile(text, text, text, text, text) to service_role;

alter function delete_guest_profile(text) set search_path = public, pg_temp;
revoke execute on function delete_guest_profile(text) from public, anon, authenticated;
grant execute on function delete_guest_profile(text) to service_role;
