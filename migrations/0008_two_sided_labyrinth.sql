-- Online challenge records only. Solo saves and tutorial times never enter this table.
CREATE TABLE labyrinth_records (
  match_id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL DEFAULT 'two-sided-labyrinth' CHECK (game_id = 'two-sided-labyrinth'),
  app_version TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  stage_id TEXT NOT NULL CHECK (stage_id GLOB 'challenge-[0-9][0-9]'),
  play_mode TEXT NOT NULL CHECK (play_mode = 'ONLINE_DUO'),
  pair_key TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  accepted_actions INTEGER NOT NULL CHECK (accepted_actions >= 0)
);
CREATE INDEX idx_labyrinth_records_pair_stage ON labyrinth_records(pair_key, stage_id, rules_version, elapsed_ms);
