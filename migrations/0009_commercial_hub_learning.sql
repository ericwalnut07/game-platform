-- Private, optional-consent learning records. Never joined into public play logs.
CREATE TABLE hub_learning_matches (
  match_id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  notice_version TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  finished INTEGER NOT NULL DEFAULT 0,
  expected_records INTEGER NOT NULL DEFAULT 0,
  recorded_records INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  dropped_records INTEGER NOT NULL DEFAULT 0,
  last_failure_at INTEGER,
  consented_seats_json TEXT NOT NULL,
  withdrawn_seats_json TEXT NOT NULL DEFAULT '[]',
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_hub_learning_retention ON hub_learning_matches(expires_at);
CREATE TABLE hub_learning_records (
  match_id TEXT NOT NULL REFERENCES hub_learning_matches(match_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  seat INTEGER NOT NULL CHECK (seat BETWEEN 1 AND 4),
  kind TEXT NOT NULL,
  private_seats_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (match_id, sequence)
);
