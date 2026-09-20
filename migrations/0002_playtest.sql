CREATE TABLE IF NOT EXISTS playtest_matches (
  match_id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  game_id TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  game_count INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS playtest_games (
  game_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  game_index INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  has_pon INTEGER NOT NULL,
  pon_player_id TEXT,
  mission_category TEXT NOT NULL,
  true_mission_json TEXT NOT NULL,
  false_mission_json TEXT,
  false_relation TEXT,
  mission_success INTEGER NOT NULL,
  verdict_json TEXT NOT NULL,
  ending_id TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_playtest_games_match
  ON playtest_games(match_id, game_index);

CREATE TABLE IF NOT EXISTS playtest_rounds (
  game_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  round_json TEXT NOT NULL,
  PRIMARY KEY(game_id, round_number)
);

CREATE TABLE IF NOT EXISTS playtest_game_players (
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  displayed_mission_json TEXT NOT NULL,
  personality_json TEXT NOT NULL,
  initial_hand_json TEXT NOT NULL,
  remaining_cards_json TEXT NOT NULL,
  confidence_history_json TEXT NOT NULL,
  initial_pon_vote_json TEXT,
  runoff_pon_vote_json TEXT,
  spadari_vote_player_id TEXT,
  personality_success INTEGER NOT NULL,
  spadari_point INTEGER NOT NULL,
  faction_point INTEGER NOT NULL,
  truth_vote_point INTEGER NOT NULL,
  personality_point INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  PRIMARY KEY(game_id, player_id)
);

CREATE TABLE IF NOT EXISTS playtest_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  total_spadari_votes INTEGER NOT NULL,
  correct_initial_pon_votes INTEGER NOT NULL,
  final_rank INTEGER NOT NULL,
  PRIMARY KEY(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS playtest_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  game_id TEXT,
  game_index INTEGER,
  room_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  phase TEXT,
  player_id TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_playtest_events_match_time
  ON playtest_events(match_id, created_at);
