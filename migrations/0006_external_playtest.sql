ALTER TABLE playtest_matches ADD COLUMN app_version TEXT;
UPDATE playtest_matches SET app_version = 'PRE_0.9' WHERE app_version IS NULL;
CREATE INDEX IF NOT EXISTS idx_playtest_matches_version ON playtest_matches(app_version, started_at);

ALTER TABLE playtest_feedback ADD COLUMN rules_clarity INTEGER;
ALTER TABLE playtest_feedback ADD COLUMN free_comment TEXT;
