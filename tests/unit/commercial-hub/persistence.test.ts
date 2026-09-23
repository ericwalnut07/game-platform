import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createHubState, reduceHubState } from "../../../src/games/commercial-hub/engine";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { persistHubStart, persistHubTransition } from "../../../src/server/lib/commercial-hub-log";
import { APP_VERSION } from "../../../src/shared/version";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const db = { prepare(sql: string) {
    let args: (string | number | null)[] = [];
    return { bind(...values: (string | number | null)[]) { args = values; return this; }, run: async () => sqlite.prepare(sql).run(...args) };
  }, async batch(statements: { run: () => Promise<unknown> }[]) { for (const statement of statements) await statement.run(); } } as unknown as D1Database;
  return { db, sqlite };
}
describe("commercial-hub D1 playtest records", () => {
  it("saves versioned public events once, handles out-of-order writes, and never stores private hands", async () => {
    const { db, sqlite } = database(), rng = new SeededRandom(2);
    const initial = createHubState("m", ["A", "B", "C", "D"], rng);
    let state = structuredClone(initial); state.phase = "INCOME";
    state.companies = state.companies.map((c) => ({ ...c, resources: { ...c.resources, cash: 100 } }));
    for (const playerId of state.players) state = reduceHubState(state, { type: "INCOME", playerId, selections: {} }, rng);
    await persistHubTransition(db, null, state, 2000);
    await persistHubTransition(db, null, state, 2100);
    await persistHubStart(db, "ROOM01", initial, 1000);
    const summary = sqlite.prepare("SELECT * FROM commercial_hub_matches WHERE match_id='m'").get()!;
    expect(summary).toMatchObject({ game_id: "commercial-hub", app_version: APP_VERSION, rules_version: "0.1", player_count: 4, started_at: 1000, finished_at: 2000, total_rounds: 1, end_reason: "VALUE_25", last_revision: 4 });
    expect(JSON.parse(summary.winners_json as string)).toEqual(state.result!.winners);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM commercial_hub_events").get()!.n).toBe(state.events.length);
    const stored = JSON.stringify(sqlite.prepare("SELECT * FROM commercial_hub_events").all());
    expect(stored).not.toMatch(/playerHands|sessionToken|displayName/);
    expect(sqlite.prepare("SELECT finished_at, ended_reason FROM playtest_matches WHERE match_id='m'").get()).toMatchObject({ finished_at: 2000, ended_reason: "COMPLETED" });
    sqlite.close();
  });
});
