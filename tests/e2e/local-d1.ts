import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let databasePath: string | undefined;

/** Read the local WAL database without starting a second Workerd writer. */
export function queryLocalD1(sql: string): Record<string, unknown>[] {
  if (!/^\s*SELECT\b/i.test(sql)) throw new Error("E2E database inspection is read-only");
  if (!databasePath) {
    const root = resolve(".wrangler/state/v3/d1");
    const matches: string[] = [];
    for (const file of readdirSync(root, { recursive: true })) {
      if (!file.endsWith(".sqlite") || file.endsWith("metadata.sqlite")) continue;
      const path = resolve(root, file), db = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
      try {
        if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='commercial_hub_matches'").get()) matches.push(path);
      } finally { db.close(); }
    }
    if (matches.length !== 1) throw new Error(`Expected one migrated local game database, found ${matches.length}`);
    databasePath = matches[0]!;
  }
  const db = new DatabaseSync(databasePath, { readOnly: true, timeout: 5000 });
  try { return db.prepare(sql).all(); }
  finally { db.close(); }
}
