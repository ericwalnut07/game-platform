-- Additive migration. Historical event and learning rows remain intact.
ALTER TABLE commercial_hub_matches ADD COLUMN config_json TEXT;
ALTER TABLE commercial_hub_matches ADD COLUMN npc_json TEXT;
ALTER TABLE commercial_hub_matches ADD COLUMN result_json TEXT;
ALTER TABLE commercial_hub_matches ADD COLUMN bid_results_json TEXT;
ALTER TABLE commercial_hub_matches ADD COLUMN archive_key TEXT;
ALTER TABLE commercial_hub_matches ADD COLUMN archive_revision INTEGER NOT NULL DEFAULT -1;
CREATE TABLE commercial_hub_rounds (
  match_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  city_level INTEGER NOT NULL,
  city_development INTEGER NOT NULL,
  companies_json TEXT NOT NULL,
  bid_results_json TEXT NOT NULL,
  auditor_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, round_number)
);
ALTER TABLE hub_learning_matches ADD COLUMN archive_key TEXT;
ALTER TABLE hub_learning_matches ADD COLUMN archive_revision INTEGER NOT NULL DEFAULT -1;
