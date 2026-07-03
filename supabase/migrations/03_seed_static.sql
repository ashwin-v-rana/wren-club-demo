-- ============================================================================
-- 03_seed_static.sql — non-transactional catalog seed (DESIGN.md §9 background)
-- These three tables are NOT truncated by reset_demo(); they are the stable
-- catalog. All date-relative data (inventory, slots, personas) lives in
-- reset_demo() (04_demo_functions.sql) so the world re-derives on demand.
-- No literal dates appear here — none are needed.
-- ============================================================================

-- room_types: 8 categories, GBP rates ascending; COSY_PLUS is the internal
-- upgrade category sitting between COSY and MEDIUM. sort_order follows rate.
insert into room_types (room_type_code, display_name, sqm_range, base_rate_gbp, sort_order) values
  ('CRASHPAD',         'Crash Pad',        '9–11 sqm',  350.00, 1),
  ('COSY',             'Cosy',             '14–16 sqm', 450.00, 2),
  ('COSY_PLUS',        'Cosy Plus',        '16–18 sqm', 520.00, 3),
  ('MEDIUM',           'Medium',           '18–22 sqm', 595.00, 4),
  ('LARGE',            'Large',            '24–30 sqm', 750.00, 5),
  ('STAIRWELL_STUDIO', 'Stairwell Studio', '20–24 sqm', 850.00, 6),
  ('HERITAGE',         'Heritage',         '30–38 sqm', 900.00, 7),
  ('GRAND_HERITAGE',   'Grand Heritage',   '40–55 sqm', 1200.00, 8);

-- request_codes: service-request catalog — department + eta_text are the ONLY
-- source of routing and ETA promises (determinism). Values per DESIGN.md §9.
insert into request_codes (code, description, department, eta_text) values
  ('EXTRA_BLANKET',   'Extra blanket',                  'Housekeeping',   'within 30 minutes'),
  ('EXTRA_PILLOW',    'Extra pillow',                   'Housekeeping',   'within 30 minutes'),
  ('MINI_FRIDGE',     'In-room mini-fridge',            'Engineering',    'within 2 hours'),
  ('WATER_BOTTLES',   'Bottled water',                  'In-Room Dining', 'within 20 minutes'),
  ('EXTRA_TOWELS',    'Extra towels',                   'Housekeeping',   'within 30 minutes'),
  ('TOOTHBRUSH_KIT',  'Toothbrush kit',                 'Housekeeping',   'within 30 minutes'),
  ('IRON_BOARD',      'Iron and ironing board',         'Housekeeping',   'within 45 minutes'),
  ('GENERAL_REQUEST', 'General request',                'Front Desk',     'the duty manager will follow up shortly');

-- activity_types: Cowshed Spa & wellness catalog (LMS shape). Prices per §9.
insert into activity_types (activity_type_code, display_name, location, duration_minutes, price_gbp) values
  ('DEEP_TISSUE_60', 'Deep Tissue Massage (60 min)', 'Cowshed Spa', 60,  140.00),
  ('DEEP_TISSUE_90', 'Deep Tissue Massage (90 min)', 'Cowshed Spa', 90,  195.00),
  ('SWEDISH_60',     'Swedish Massage (60 min)',     'Cowshed Spa', 60,  130.00),
  ('HAMMAM_RITUAL',  'Hammam Ritual',                'Cowshed Spa', 90,  165.00),
  ('FACIAL_60',      'Signature Facial (60 min)',    'Cowshed Spa', 60,  150.00),
  ('BARBER_CUT',     'Barber Cut',                   'Cowshed Spa', 45,  55.00),
  ('MANICURE',       'Manicure',                     'Cowshed Spa', 45,  45.00);
