CREATE TABLE IF NOT EXISTS operational_errors (
  error_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  request_id TEXT,
  route TEXT,
  room_code TEXT,
  player_id TEXT,
  details_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operational_errors_created
  ON operational_errors(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_errors_room
  ON operational_errors(room_code, created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at INTEGER NOT NULL,
  deleted_rooms INTEGER NOT NULL,
  deleted_events INTEGER NOT NULL,
  deleted_errors INTEGER NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_ran_at
  ON maintenance_runs(ran_at DESC);

ALTER TABLE playtest_matches ADD COLUMN ended_reason TEXT;

UPDATE playtest_matches
SET ended_reason = 'COMPLETED'
WHERE finished_at IS NOT NULL AND ended_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_playtest_matches_end_reason
  ON playtest_matches(ended_reason, finished_at);
