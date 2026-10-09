import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "migrations");
const files = readdirSync(migrationsDir).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
if (files.length === 0) throw new Error("No migrations found");

const db = new DatabaseSync(":memory:");
const firstOpsIndex = files.findIndex((name) => name === "0005_operations.sql");
const beforeOps = firstOpsIndex >= 0 ? files.slice(0, firstOpsIndex) : files;
const afterOps = firstOpsIndex >= 0 ? files.slice(firstOpsIndex) : [];

for (const file of beforeOps) db.exec(readFileSync(resolve(migrationsDir, file), "utf8"));

if (firstOpsIndex >= 0) {
  db.prepare(`
    INSERT INTO playtest_matches(match_id, room_code, game_id, player_count, game_count, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("finished-before-v08", "ABC123", "pon-inai", 3, 3, 1000, 2000);
  db.prepare(`
    INSERT INTO playtest_matches(match_id, room_code, game_id, player_count, game_count, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run("unfinished-before-v08", "ABC124", "pon-inai", 3, 3, 1000);
}

for (const file of afterOps) {
  if(file === "0010_commercial_hub_archives.sql") {
    db.exec("INSERT INTO commercial_hub_matches(match_id,app_version,rules_version,player_count) VALUES ('legacy-archive-test','0.17.0','0.5',4)");
    db.exec("INSERT INTO commercial_hub_events(match_id,sequence,app_version,round_number,event_type,payload_json,recorded_at) VALUES ('legacy-archive-test',1,'0.17.0',1,'ROUND_STARTED','{}',1)");
    db.exec("INSERT INTO hub_learning_matches(match_id,room_code,notice_version,started_at,expires_at,consented_seats_json,updated_at) VALUES ('legacy-archive-test','ABC123','1',1,999999,'[1]',1)");
    db.exec("INSERT INTO hub_learning_records(match_id,sequence,seat,kind,private_seats_json,payload_json) VALUES ('legacy-archive-test',1,1,'DECISION','[1]','{}')");
  }
  db.exec(readFileSync(resolve(migrationsDir, file), "utf8"));
}

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
for (const required of ["rooms", "playtest_matches", "playtest_games", "playtest_events", "playtest_feedback", "operational_errors", "maintenance_runs", "commercial_hub_matches", "commercial_hub_events", "labyrinth_records", "hub_learning_matches", "hub_learning_records", "commercial_hub_rounds"]) {
  if (!tables.has(required)) throw new Error(`Missing table after migrations: ${required}`);
}

const matchColumns = new Set(db.prepare("PRAGMA table_info(playtest_matches)").all().map((row) => row.name));
if (!matchColumns.has("ended_reason")) throw new Error("playtest_matches.ended_reason is missing");
if (!matchColumns.has("app_version")) throw new Error("playtest_matches.app_version is missing");
const feedbackColumns = new Set(db.prepare("PRAGMA table_info(playtest_feedback)").all().map((row) => row.name));
if (!feedbackColumns.has("rules_clarity")) throw new Error("playtest_feedback.rules_clarity is missing");
if (!feedbackColumns.has("free_comment")) throw new Error("playtest_feedback.free_comment is missing");

if (firstOpsIndex >= 0) {
  const finished = db.prepare("SELECT ended_reason FROM playtest_matches WHERE match_id = ?").get("finished-before-v08");
  const unfinished = db.prepare("SELECT ended_reason FROM playtest_matches WHERE match_id = ?").get("unfinished-before-v08");
  if (finished?.ended_reason !== "COMPLETED") throw new Error("0005 did not backfill completed matches");
  if (unfinished?.ended_reason !== null) throw new Error("0005 incorrectly marked unfinished matches as completed");
  const versioned = db.prepare("SELECT app_version FROM playtest_matches WHERE match_id = ?").get("finished-before-v08");
  if (versioned?.app_version !== "PRE_0.9") throw new Error("0006 did not backfill pre-v0.9 match version");
}

db.prepare("INSERT INTO commercial_hub_matches(match_id, app_version, rules_version, player_count) VALUES ('hub-test', '0.10.0', '0.1', 4)").run();
const insertHubEvent = db.prepare("INSERT INTO commercial_hub_events(match_id, sequence, app_version, round_number, event_type, payload_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(match_id, sequence) DO NOTHING");
insertHubEvent.run("hub-test", 1, "0.10.0", 1, "TRADE_ACCEPTED", "{}", 1);
insertHubEvent.run("hub-test", 1, "0.10.0", 1, "TRADE_ACCEPTED", "{}", 1);
if (db.prepare("SELECT COUNT(*) AS n FROM commercial_hub_events").get().n !== 2) throw new Error("Hub event deduplication failed");
if (db.prepare("SELECT game_id FROM commercial_hub_matches WHERE match_id = 'hub-test'").get().game_id !== "commercial-hub") throw new Error("Hub game ID incorrect");

console.log(JSON.stringify({ migrations: files, tables: [...tables].sort(), ok: true }, null, 2));


for(const table of ["commercial_hub_events","hub_learning_records"]) {
 if(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE match_id='legacy-archive-test'`).get().n !== 1) throw new Error(`0010 removed historical ${table}`);
}
for(const table of ["commercial_hub_matches","hub_learning_matches"]) {
 const row=db.prepare(`SELECT archive_key,archive_revision FROM ${table} WHERE match_id='legacy-archive-test'`).get();
 if(row.archive_key !== null || row.archive_revision !== -1) throw new Error(`Unexpected archive backfill for ${table}`);
}
const insertRound=db.prepare("INSERT INTO commercial_hub_rounds VALUES ('hub-test',1,1,0,'[]','{}','{}',1) ON CONFLICT(match_id,round_number) DO NOTHING");
insertRound.run();insertRound.run();
if(db.prepare("SELECT COUNT(*) AS n FROM commercial_hub_rounds").get().n !== 1) throw new Error("Round summary deduplication failed");
console.log("0010 preserves legacy detail rows and deduplicates round summaries");
