# Seed offsets (mirrors DESIGN.md §9)

All dates derive from `t = (now() at time zone 'Europe/London')::date`. No literal dates.
`reset_demo()` re-derives the entire world; run it the morning of any demo.

## Personas

| Profile | Name | Phone | Membership | Notes |
|---|---|---|---|---|
| P1001 | James Thompson | +447700900101 | M2001, enrolled `t - 12 years`, Active → tenure 12 | the member journey |
| P1002 | Priya Patel | +447700900102 | none | in-house temporary member |
| P1003 | Daniel Okafor | +447700900103 | none | upcoming-stay non-member |

## Reservations

| ID | Conf # | Profile | Type | Arrival | Departure | Status | Purpose |
|---|---|---|---|---|---|---|---|
| R3001 | WRENLON-KMWPT | P1001 | COSY | `t+5` | `t+7` | Reserved | upgrade target (U4001) |
| R3004 | WRENLON-HJKMN | P1001 | COSY | `a1` | `a1+2` | CheckedOut | stays_this_year |
| R3005 | WRENLON-PQRTV | P1001 | MEDIUM | `a2` | `a2+2` | CheckedOut | stays_this_year |
| R3006 | WRENLON-WXYCD | P1001 | LARGE | `a3` | `a3+1` | CheckedOut | stays_this_year |
| R3002 | WRENLON-FGHJK | P1002 | MEDIUM (room 412) | `t-1` | `t+2` | CheckedIn | in-house guest |
| R3003 | WRENLON-NPQRT | P1003 | CRASHPAD | `t+10` | `t+12` | Reserved | FUTURE_STAY_ONLY test |

Thompson's three CheckedOut arrivals are anchored into the current calendar year so
`stays_this_year = 3` regardless of demo date (handles DESIGN §9's early-year caveat):
- `a1 = least(date_trunc('year', t) + 20, t - 30)`
- `a2 = least(date_trunc('year', t) + 75, t - 20)`
- `a3 = t - 10`

## Other seeded state

- **upgrade_offers** U4001: P1001, R3001, COSY → COSY_PLUS, `Offered`, expires end of `t+4`.
- **activity_bookings** AB7001: P1002, DEEP_TISSUE_60, `Completed`, dated 15 March (current year if `t ≥ 1 Apr`, else previous year). Powers the spa re-book.
- **room_inventory**: every type, `t .. t+60`; capacities CRASHPAD 8 / COSY 12 / COSY_PLUS 6 / MEDIUM 15 / LARGE 10 / STAIRWELL_STUDIO 4 / HERITAGE 6 / GRAND_HERITAGE 3; `booked` reflects active (Reserved/CheckedIn) reservations.
- **activity_slots**: every treatment, `t .. t+14`, at 10:00 / 12:00 / 15:00 (capacity 1). Guarantees DEEP_TISSUE_60 `t+1` 15:00 (Patel's re-book target).

## Function-generated IDs (sequences, restarted by reset_demo)

`R` + seq_reservation (3101+), `SR` + seq_service_request (5001+), `AB` + seq_activity_booking (7101+), `MSG` + seq_message (8001+).
