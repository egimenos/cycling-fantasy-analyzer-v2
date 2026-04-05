-- Minimal seed for CI e2e tests.
-- Contains the 20 riders from valid-price-list.txt + lightweight race results
-- so the analyze flow returns matched riders with non-zero scores.

-- ── Riders ──────────────────────────────────────────────────────────────────────

INSERT INTO riders (id, pcs_slug, full_name, normalized_name, current_team, nationality) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'tadej-pogacar',       'Tadej Pogačar',       'tadej pogacar',       'UAE Team Emirates',              'SI'),
  ('a0000000-0000-0000-0000-000000000002', 'jonas-vingegaard',    'Jonas Vingegaard',    'jonas vingegaard',    'Visma-Lease a Bike',             'DK'),
  ('a0000000-0000-0000-0000-000000000003', 'remco-evenepoel',     'Remco Evenepoel',     'remco evenepoel',     'Soudal Quick-Step',              'BE'),
  ('a0000000-0000-0000-0000-000000000004', 'primoz-roglic',       'Primož Roglič',       'primoz roglic',       'Red Bull-BORA-hansgrohe',        'SI'),
  ('a0000000-0000-0000-0000-000000000005', 'juan-ayuso',          'Juan Ayuso',          'juan ayuso',          'UAE Team Emirates',              'ES'),
  ('a0000000-0000-0000-0000-000000000006', 'joao-almeida',        'João Almeida',        'joao almeida',        'UAE Team Emirates',              'PT'),
  ('a0000000-0000-0000-0000-000000000007', 'mikel-landa',         'Mikel Landa',         'mikel landa',         'Soudal Quick-Step',              'ES'),
  ('a0000000-0000-0000-0000-000000000008', 'adam-yates',          'Adam Yates',          'adam yates',          'UAE Team Emirates',              'GB'),
  ('a0000000-0000-0000-0000-000000000009', 'enric-mas',           'Enric Mas',           'enric mas',           'Movistar',                       'ES'),
  ('a0000000-0000-0000-0000-000000000010', 'richard-carapaz',     'Richard Carapaz',     'richard carapaz',     'EF Education-EasyPost',          'EC'),
  ('a0000000-0000-0000-0000-000000000011', 'geraint-thomas',      'Geraint Thomas',      'geraint thomas',      'INEOS Grenadiers',               'GB'),
  ('a0000000-0000-0000-0000-000000000012', 'romain-bardet',       'Romain Bardet',       'romain bardet',       'dsm-firmenich PostNL',           'FR'),
  ('a0000000-0000-0000-0000-000000000013', 'jai-hindley',         'Jai Hindley',         'jai hindley',         'Red Bull-BORA-hansgrohe',        'AU'),
  ('a0000000-0000-0000-0000-000000000014', 'sepp-kuss',           'Sepp Kuss',           'sepp kuss',           'Visma-Lease a Bike',             'US'),
  ('a0000000-0000-0000-0000-000000000015', 'aleksandr-vlasov',    'Aleksandr Vlasov',    'aleksandr vlasov',    'Red Bull-BORA-hansgrohe',        'RU'),
  ('a0000000-0000-0000-0000-000000000016', 'giulio-ciccone',      'Giulio Ciccone',      'giulio ciccone',      'Lidl-Trek',                      'IT'),
  ('a0000000-0000-0000-0000-000000000017', 'tom-pidcock',         'Tom Pidcock',         'tom pidcock',         'INEOS Grenadiers',               'GB'),
  ('a0000000-0000-0000-0000-000000000018', 'miguel-angel-lopez',  'Miguel Ángel López',  'miguel angel lopez',  'Astana Qazaqstan',               'CO'),
  ('a0000000-0000-0000-0000-000000000019', 'antonio-tiberi',      'Antonio Tiberi',      'antonio tiberi',      'Bahrain Victorious',             'IT'),
  ('a0000000-0000-0000-0000-000000000020', 'ben-oconnor',         'Ben O''Connor',       'ben o''connor',       'Decathlon AG2R La Mondiale',     'AU');

-- ── Race results ────────────────────────────────────────────────────────────────
-- Minimal realistic results: 2 races × ~3 categories each per rider.
-- Tour de France 2025 (grand_tour) + Giro d'Italia 2025 (grand_tour)

-- Helper: rider_id short alias via the fixed UUIDs above
-- rider 01 = Pogacar, 02 = Vingegaard, ... 20 = O'Connor

-- ── Tour de France 2025 — GC ────────────────────────────────────────────────────
INSERT INTO race_results (rider_id, race_slug, race_name, race_type, race_class, year, category, position, race_date) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 1,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000002', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 2,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000003', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 3,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000004', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 4,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000005', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 6,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000006', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 7,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000007', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 8,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000008', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 9,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000009', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 10, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000010', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 12, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000011', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 14, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000012', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 16, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000013', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 18, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000014', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 20, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000015', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 22, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000016', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 25, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000017', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 28, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000018', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 30, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000019', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 11, '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000020', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'gc', 5,  '2025-07-27');

-- ── Tour de France 2025 — Stage wins / top finishes ─────────────────────────────
INSERT INTO race_results (rider_id, race_slug, race_name, race_type, race_class, year, category, position, stage_number, race_date) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'stage', 1, 8,  '2025-07-12'),
  ('a0000000-0000-0000-0000-000000000001', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'stage', 1, 15, '2025-07-19'),
  ('a0000000-0000-0000-0000-000000000002', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'stage', 1, 11, '2025-07-16'),
  ('a0000000-0000-0000-0000-000000000003', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'stage', 1, 16, '2025-07-20'),
  ('a0000000-0000-0000-0000-000000000004', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'stage', 2, 8,  '2025-07-12'),
  ('a0000000-0000-0000-0000-000000000017', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'stage', 1, 5,  '2025-07-09'),
  ('a0000000-0000-0000-0000-000000000020', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'stage', 1, 17, '2025-07-21');

-- ── Tour de France 2025 — Mountain classification ───────────────────────────────
INSERT INTO race_results (rider_id, race_slug, race_name, race_type, race_class, year, category, position, race_date) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'mountain', 1,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000002', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'mountain', 3,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000010', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'mountain', 2,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000016', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'mountain', 4,  '2025-07-27'),
  ('a0000000-0000-0000-0000-000000000018', 'tour-de-france', 'Tour de France', 'grand_tour', 'UWT', 2025, 'mountain', 5,  '2025-07-27');

-- ── Giro d'Italia 2025 — GC ────────────────────────────────────────────────────
INSERT INTO race_results (rider_id, race_slug, race_name, race_type, race_class, year, category, position, race_date) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 1,  '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000006', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 2,  '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000019', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 3,  '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000007', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 4,  '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000010', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 5,  '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000013', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 6,  '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000015', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 8,  '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000018', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 10, '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000009', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 7,  '2025-06-01'),
  ('a0000000-0000-0000-0000-000000000012', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'gc', 12, '2025-06-01');

-- ── Giro d'Italia 2025 — Stage wins ────────────────────────────────────────────
INSERT INTO race_results (rider_id, race_slug, race_name, race_type, race_class, year, category, position, stage_number, race_date) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'stage', 1, 9,  '2025-05-18'),
  ('a0000000-0000-0000-0000-000000000006', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'stage', 1, 14, '2025-05-24'),
  ('a0000000-0000-0000-0000-000000000019', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'stage', 1, 19, '2025-05-30'),
  ('a0000000-0000-0000-0000-000000000014', 'giro-d-italia', 'Giro d''Italia', 'grand_tour', 'UWT', 2025, 'stage', 1, 17, '2025-05-28');

-- ── Vuelta a España 2024 — GC (previous season for temporal depth) ──────────────
INSERT INTO race_results (rider_id, race_slug, race_name, race_type, race_class, year, category, position, race_date) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 1,  '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000009', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 2,  '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000010', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 3,  '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000008', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 5,  '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000007', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 6,  '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000020', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 4,  '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000011', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 8,  '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000014', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 10, '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000016', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 15, '2024-09-08'),
  ('a0000000-0000-0000-0000-000000000005', 'vuelta-a-espana', 'Vuelta a España', 'grand_tour', 'UWT', 2024, 'gc', 7,  '2024-09-08');

-- ── Mini tour — Itzulia 2025 (for mini_tour race_type coverage) ─────────────────
INSERT INTO race_results (rider_id, race_slug, race_name, race_type, race_class, year, category, position, race_date) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'itzulia-basque-country', 'Itzulia Basque Country', 'mini_tour', 'UWT', 2025, 'gc', 1, '2025-04-12'),
  ('a0000000-0000-0000-0000-000000000003', 'itzulia-basque-country', 'Itzulia Basque Country', 'mini_tour', 'UWT', 2025, 'gc', 2, '2025-04-12'),
  ('a0000000-0000-0000-0000-000000000004', 'itzulia-basque-country', 'Itzulia Basque Country', 'mini_tour', 'UWT', 2025, 'gc', 3, '2025-04-12'),
  ('a0000000-0000-0000-0000-000000000005', 'itzulia-basque-country', 'Itzulia Basque Country', 'mini_tour', 'UWT', 2025, 'gc', 4, '2025-04-12'),
  ('a0000000-0000-0000-0000-000000000007', 'itzulia-basque-country', 'Itzulia Basque Country', 'mini_tour', 'UWT', 2025, 'gc', 5, '2025-04-12'),
  ('a0000000-0000-0000-0000-000000000017', 'itzulia-basque-country', 'Itzulia Basque Country', 'mini_tour', 'UWT', 2025, 'gc', 6, '2025-04-12');

-- ── ML score cache ──────────────────────────────────────────────────────────────
-- Pre-cached ML predictions for Tour de France 2026 so E2E tests don't need
-- to call the real ML service. Model version must match the mock server (mock-v1).
INSERT INTO ml_scores (rider_id, race_slug, year, predicted_score, model_version, gc_pts, stage_pts, mountain_pts, sprint_pts) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'tour-de-france', 2025, 240, 'mock-v1', 120, 72, 24, 24),
  ('a0000000-0000-0000-0000-000000000002', 'tour-de-france', 2025, 230, 'mock-v1', 115, 69, 23, 23),
  ('a0000000-0000-0000-0000-000000000003', 'tour-de-france', 2025, 220, 'mock-v1', 110, 66, 22, 22),
  ('a0000000-0000-0000-0000-000000000004', 'tour-de-france', 2025, 210, 'mock-v1', 105, 63, 21, 21),
  ('a0000000-0000-0000-0000-000000000005', 'tour-de-france', 2025, 200, 'mock-v1', 100, 60, 20, 20),
  ('a0000000-0000-0000-0000-000000000006', 'tour-de-france', 2025, 190, 'mock-v1', 95, 57, 19, 19),
  ('a0000000-0000-0000-0000-000000000007', 'tour-de-france', 2025, 180, 'mock-v1', 90, 54, 18, 18),
  ('a0000000-0000-0000-0000-000000000008', 'tour-de-france', 2025, 170, 'mock-v1', 85, 51, 17, 17),
  ('a0000000-0000-0000-0000-000000000009', 'tour-de-france', 2025, 160, 'mock-v1', 80, 48, 16, 16),
  ('a0000000-0000-0000-0000-000000000010', 'tour-de-france', 2025, 150, 'mock-v1', 75, 45, 15, 15),
  ('a0000000-0000-0000-0000-000000000011', 'tour-de-france', 2025, 140, 'mock-v1', 70, 42, 14, 14),
  ('a0000000-0000-0000-0000-000000000012', 'tour-de-france', 2025, 130, 'mock-v1', 65, 39, 13, 13),
  ('a0000000-0000-0000-0000-000000000013', 'tour-de-france', 2025, 120, 'mock-v1', 60, 36, 12, 12),
  ('a0000000-0000-0000-0000-000000000014', 'tour-de-france', 2025, 110, 'mock-v1', 55, 33, 11, 11),
  ('a0000000-0000-0000-0000-000000000015', 'tour-de-france', 2025, 100, 'mock-v1', 50, 30, 10, 10),
  ('a0000000-0000-0000-0000-000000000016', 'tour-de-france', 2025, 90, 'mock-v1', 45, 27, 9, 9),
  ('a0000000-0000-0000-0000-000000000017', 'tour-de-france', 2025, 80, 'mock-v1', 40, 24, 8, 8),
  ('a0000000-0000-0000-0000-000000000018', 'tour-de-france', 2025, 70, 'mock-v1', 35, 21, 7, 7),
  ('a0000000-0000-0000-0000-000000000019', 'tour-de-france', 2025, 60, 'mock-v1', 30, 18, 6, 6),
  ('a0000000-0000-0000-0000-000000000020', 'tour-de-france', 2025, 50, 'mock-v1', 25, 15, 5, 5);
