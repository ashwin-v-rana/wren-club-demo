-- ============================================================================
-- 09_fix_upgrade_greeting.sql — the pre-arrival upgrade WhatsApp hard-coded
-- "Dear Mr %s", which mis-genders any female member (e.g. Ms Patel). We don't
-- store title/gender, so greet with given + surname ("Dear James Thompson"),
-- matching the Room Update confirmation email/SMS. Only the greeting changes;
-- targeting, channel, and body are otherwise identical to 02_functions.sql.
-- CREATE OR REPLACE resets SET clauses, so re-pin search_path and re-assert grant.
-- ============================================================================

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
    select o.offer_id, o.profile_id, p.name_given, p.name_surname,
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
        'Dear %s %s, as a valued Wren Club member of %s years, we would be delighted to offer you a complimentary upgrade from our %s room to a %s for your upcoming stay arriving %s. Simply reply YES and we will take care of it.',
        t.name_given, t.name_surname, t.years, t.from_name, t.to_name, to_char(t.arrival_date, 'FMDay DD FMMonth'))
    from targets t
    returning message_id, profile_id, body
  )
  select json_agg(json_build_object('message_id', message_id, 'profile_id', profile_id, 'body', body))
    into v_result from sent;

  return json_build_object('trigger_type', 'PRE_ARRIVAL_UPGRADE',
                           'sent', coalesce(v_result, '[]'::json));
end;
$$;

alter function fire_pre_arrival_upgrade(text, int) set search_path = public, pg_temp;
revoke execute on function fire_pre_arrival_upgrade(text, int) from public, anon, authenticated;
grant execute on function fire_pre_arrival_upgrade(text, int) to service_role;
