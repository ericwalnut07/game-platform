ALTER TABLE playtest_games ADD COLUMN true_mission_type TEXT;
ALTER TABLE playtest_games ADD COLUMN verdict_accuracy TEXT;
ALTER TABLE playtest_game_players ADD COLUMN personality_type TEXT;

UPDATE playtest_games
SET true_mission_type = json_extract(true_mission_json, '$.type')
WHERE true_mission_type IS NULL;

UPDATE playtest_games
SET verdict_accuracy = CASE
  WHEN json_extract(verdict_json, '$.type') = 'UNDECIDED' THEN 'UNDECIDED'
  WHEN has_pon = 1
    AND json_extract(verdict_json, '$.type') = 'PLAYER'
    AND json_extract(verdict_json, '$.playerId') = pon_player_id THEN 'CORRECT'
  WHEN has_pon = 0 AND json_extract(verdict_json, '$.type') = 'NO_PON' THEN 'CORRECT'
  ELSE 'WRONG'
END
WHERE verdict_accuracy IS NULL;

UPDATE playtest_game_players
SET personality_type = json_extract(personality_json, '$.type')
WHERE personality_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_playtest_games_relation
  ON playtest_games(false_relation, has_pon);

CREATE INDEX IF NOT EXISTS idx_playtest_games_mission_type
  ON playtest_games(true_mission_type);

CREATE INDEX IF NOT EXISTS idx_playtest_games_accuracy
  ON playtest_games(verdict_accuracy);

CREATE INDEX IF NOT EXISTS idx_playtest_feedback_self_round
  ON playtest_feedback(suspected_self, self_suspicion_round);
