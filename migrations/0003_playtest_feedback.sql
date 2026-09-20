CREATE TABLE IF NOT EXISTS playtest_feedback (
  game_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  suspected_self INTEGER NOT NULL,
  self_suspicion_round INTEGER,
  trial_suspects_json TEXT NOT NULL,
  single_obvious_suspect INTEGER NOT NULL,
  summary_usefulness INTEGER NOT NULL,
  fun_rating INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_playtest_feedback_match
  ON playtest_feedback(match_id, game_id);
