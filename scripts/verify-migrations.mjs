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

for (const file of afterOps) db.exec(readFileSync(resolve(migrationsDir, file), "utf8"));

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
for (const required of ["rooms", "playtest_matches", "playtest_games", "playtest_events", "playtest_feedback", "operational_errors", "maintenance_runs"]) {
  if (!tables.has(required)) throw new Error(`Missing table after migrations: ${required}`);
}

const matchColumns = new Set(db.prepare("PRAGMA table_info(playtest_matches)").all().map((row) => row.name));
if (!matchColumns.has("ended_reason")) throw new Error("playtest_matches.ended_reason is missing");

if (firstOpsIndex >= 0) {
  const finished = db.prepare("SELECT ended_reason FROM playtest_matches WHERE match_id = ?").get("finished-before-v08");
  const unfinished = db.prepare("SELECT ended_reason FROM playtest_matches WHERE match_id = ?").get("unfinished-before-v08");
  if (finished?.ended_reason !== "COMPLETED") throw new Error("0005 did not backfill completed matches");
  if (unfinished?.ended_reason !== null) throw new Error("0005 incorrectly marked unfinished matches as completed");
}

console.log(JSON.stringify({ migrations: files, tables: [...tables].sort(), ok: true }, null, 2));
