CREATE TABLE IF NOT EXISTS rooms (
  room_code TEXT PRIMARY KEY,
  room_name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  status TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  has_password INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_status_updated
  ON rooms(status, updated_at DESC);
