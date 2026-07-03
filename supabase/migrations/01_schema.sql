-- ============================================================================
-- 01_schema.sql — The Wren Hotel & Members' Club (WRENLON)
-- Mimics Oracle OPERA Cloud (OHIP) as the system of record.
-- Implements DESIGN.md §8 exactly: 13 tables, dependency order, OPERA vocabulary.
-- Conventions: snake_case; every table carries hotel_id default 'WRENLON';
-- timestamps timestamptz; all date logic runs in Europe/London (in functions).
-- RLS enabled on every table with NO policies — access is service-role only,
-- through the Next.js backend and the Talkdesk agents' execute_sql skill.
-- ============================================================================

-- 8.1 profiles  (CRM guest profile)
create table profiles (
  profile_id        text primary key,          -- 'P1001'
  hotel_id          text not null default 'WRENLON',
  name_given        text not null,
  name_surname      text not null,
  email             text,
  phone             text unique,               -- E.164, identity key for phone-match auth
  created_at        timestamptz not null default now()
);

-- 8.2 memberships  (The Wren Club)
create table memberships (
  membership_id     text primary key,          -- 'M2001'
  profile_id        text not null references profiles,
  hotel_id          text not null default 'WRENLON',
  membership_level  text not null default 'WREN_CLUB',   -- flat in v1
  enrollment_date   date not null,
  status            text not null default 'Active'
    check (status in ('Active','Lapsed','Cancelled'))
);

-- 8.3 room_types  (The Wren room categories; COSY_PLUS is an internal upgrade category)
create table room_types (
  room_type_code    text primary key,          -- 'CRASHPAD','COSY','COSY_PLUS','MEDIUM','LARGE','HERITAGE','GRAND_HERITAGE','STAIRWELL_STUDIO'
  hotel_id          text not null default 'WRENLON',
  display_name      text not null,
  sqm_range         text,
  base_rate_gbp     numeric(10,2) not null,
  sort_order        int not null
);

-- 8.4 room_inventory  (per date per room type; availability = capacity - booked)
create table room_inventory (
  hotel_id          text not null default 'WRENLON',
  room_type_code    text not null references room_types,
  inventory_date    date not null,
  capacity          int not null,
  booked            int not null default 0,
  primary key (hotel_id, room_type_code, inventory_date),
  check (booked >= 0 and booked <= capacity)
);

-- 8.5 reservations  (RSV shape)
-- confirmation_number phonetic-safe alphabet: A C D E F G H J K M N P Q R T U V W X Y
--   + digits 3 4 6 7 9  (no 0/O, 1/I/L, 5/S, 8/B, 2/Z). Format 'WRENLON-XXXXX'.
create table reservations (
  reservation_id      text primary key,        -- 'R3001'
  confirmation_number text not null unique,    -- 'WRENLON-KMWPT'
  hotel_id            text not null default 'WRENLON',
  profile_id          text not null references profiles,
  room_type_code      text not null references room_types,
  room_number         text,                    -- assigned at check-in
  arrival_date        date not null,
  departure_date      date not null,
  adults              int not null default 1,
  rate_plan_code      text not null default 'BAR',
  reservation_status  text not null default 'Reserved'
    check (reservation_status in ('Reserved','CheckedIn','CheckedOut','Cancelled','NoShow')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (departure_date > arrival_date)
);

-- 8.6 upgrade_offers  (state-in-tables: session-proof by construction)
create table upgrade_offers (
  offer_id           text primary key,         -- 'U4001'
  hotel_id           text not null default 'WRENLON',
  profile_id         text not null references profiles,
  reservation_id     text not null references reservations,
  from_room_type     text not null references room_types (room_type_code),
  to_room_type       text not null references room_types (room_type_code),
  status             text not null default 'Offered'
    check (status in ('Offered','Accepted','Declined','Expired')),
  offered_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  responded_at       timestamptz
);

-- 8.7 request_codes  (service request catalog — determinism source)
create table request_codes (
  code              text primary key,          -- 'EXTRA_BLANKET','EXTRA_PILLOW','MINI_FRIDGE','WATER_BOTTLES','EXTRA_TOWELS','TOOTHBRUSH_KIT','IRON_BOARD','GENERAL_REQUEST'
  hotel_id          text not null default 'WRENLON',
  description       text not null,
  department        text not null,             -- 'Housekeeping','Engineering','In-Room Dining','Front Desk'
  eta_text          text not null              -- 'within 30 minutes' — the ONLY source of ETA promises
);

-- 8.8 service_requests  (FOF serviceRequest shape)
create table service_requests (
  service_request_id text primary key,         -- 'SR5001'
  hotel_id           text not null default 'WRENLON',
  code               text not null references request_codes,
  status             text not null default 'Open'
    check (status in ('Open','InProgress','Completed','Cancelled')),
  priority           text not null default 'Standard'
    check (priority in ('Standard','High')),
  department         text not null,            -- copied from request_codes at insert
  profile_id         text not null references profiles,
  reservation_id     text not null references reservations,
  room               text not null,            -- from reservation row, never customer input
  quantity           int not null default 1,
  open_date          timestamptz not null default now(),
  comment            text,                     -- guest's own wording (esp. GENERAL_REQUEST)
  completion_date    timestamptz
);

-- 8.9 activity_types  (Cowshed Spa catalog — LMS shape)
create table activity_types (
  activity_type_code text primary key,         -- 'DEEP_TISSUE_60','DEEP_TISSUE_90','SWEDISH_60','HAMMAM_RITUAL','FACIAL_60','BARBER_CUT','MANICURE'
  hotel_id           text not null default 'WRENLON',
  display_name       text not null,
  location           text not null default 'Cowshed Spa',
  duration_minutes   int not null,
  price_gbp          numeric(10,2) not null
);

-- 8.10 activity_slots  (bookable spa availability)
create table activity_slots (
  slot_id            text primary key,         -- 'AS6001'
  hotel_id           text not null default 'WRENLON',
  activity_type_code text not null references activity_types,
  slot_date          date not null,
  slot_time          time not null,
  capacity           int not null default 1,
  booked             int not null default 0,
  check (booked >= 0 and booked <= capacity)
);

-- 8.11 activity_bookings  (LMS activityBooking shape; history = past Completed rows)
create table activity_bookings (
  activity_booking_id text primary key,        -- 'AB7001'
  hotel_id            text not null default 'WRENLON',
  profile_id          text not null references profiles,
  reservation_id      text references reservations,   -- nullable: members may book without a stay
  activity_type_code  text not null references activity_types,
  slot_id             text references activity_slots, -- nullable for seeded history
  booking_date        date not null,
  booking_time        time not null,
  status              text not null default 'Booked'
    check (status in ('Booked','Completed','Cancelled','NoShow')),
  created_at          timestamptz not null default now()
);

-- 8.12 otp_codes  (demo-read affordance ONLY — lets staff read the code when a
--   test phone can't receive SMS). OTP generation/send/verification are Talkdesk
--   WORKFLOW skills reused from the restaurant build (send_one_time_pin[_UK]
--   return the code as sent_pin; verify_otp compares in-workflow). The secret
--   lives in session-global workflow storage; there is NO request_otp/verify_otp
--   SQL function here. See DESIGN.md §7.
create table otp_codes (
  otp_id            text primary key,
  profile_id        text not null references profiles,
  channel           text not null check (channel in ('sms','whatsapp','voice')),
  code              text not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  consumed          boolean not null default false
);

-- 8.13 outbound_messages  (audit log that feeds the console message-log view)
--   v1 is populated ONLY by the two proactive sends (fire_pre_arrival_upgrade →
--   'PRE_ARRIVAL_UPGRADE', fire_milestone → 'MILESTONE_THANKS'). 'CONFIRMATION',
--   'OTP','AGENT' remain valid trigger_type values reserved for later. See DESIGN.md §8.13.
create table outbound_messages (
  message_id        text primary key,
  hotel_id          text not null default 'WRENLON',
  profile_id        text not null references profiles,
  channel           text not null check (channel in ('sms','whatsapp','email')),
  trigger_type      text not null,             -- 'PRE_ARRIVAL_UPGRADE','MILESTONE_THANKS','CONFIRMATION','OTP','AGENT'
  body              text not null,
  sent_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row-Level Security: enable on every table, define NO policies.
-- The service-role key (backend + agents' execute_sql) bypasses RLS; any other
-- key (e.g. a leaked anon key) is denied all access. No console user auth in v1.
-- ----------------------------------------------------------------------------
alter table profiles          enable row level security;
alter table memberships       enable row level security;
alter table room_types        enable row level security;
alter table room_inventory    enable row level security;
alter table reservations      enable row level security;
alter table upgrade_offers    enable row level security;
alter table request_codes     enable row level security;
alter table service_requests  enable row level security;
alter table activity_types    enable row level security;
alter table activity_slots    enable row level security;
alter table activity_bookings enable row level security;
alter table otp_codes         enable row level security;
alter table outbound_messages enable row level security;
