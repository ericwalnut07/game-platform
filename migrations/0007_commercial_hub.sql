-- Additive: Pon Inai's existing game/player result tables retain their meaning.
CREATE TABLE commercial_hub_matches (
  match_id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL DEFAULT 'commercial-hub' CHECK (game_id = 'commercial-hub'),
  app_version TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  player_count INTEGER NOT NULL CHECK (player_count = 4),
  started_at INTEGER,
  finished_at INTEGER,
  total_rounds INTEGER NOT NULL DEFAULT 0,
  end_reason TEXT,
  final_values_json TEXT,
  winners_json TEXT,
  city_lv4_round INTEGER,
  last_revision INTEGER NOT NULL DEFAULT -1
);
CREATE INDEX idx_commercial_hub_matches_version ON commercial_hub_matches(app_version, started_at);
CREATE TABLE commercial_hub_events (
  match_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  game_id TEXT NOT NULL DEFAULT 'commercial-hub' CHECK (game_id = 'commercial-hub'),
  app_version TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  player_id TEXT,
  payload_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, sequence)
);
CREATE INDEX idx_commercial_hub_events_type ON commercial_hub_events(event_type, match_id);
