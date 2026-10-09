import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { persistHubStart, persistHubTransition } from "../../../src/server/lib/commercial-hub-log";
import { APP_VERSION } from "../../../src/shared/version";
import { act, rich, settle } from "./helpers";
function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  const db = { prepare(sql: string) { let args: (string | number | null)[] = []; return { bind(...values: (string | number | null)[]) { args = values; return this; }, run: async () => sqlite.prepare(sql).run(...args) }; }, async batch(statements: { run: () => Promise<unknown> }[]) { for (const statement of statements) await statement.run(); } } as unknown as D1Database;
  return { db, sqlite };
}
describe("D1 summary-only logging", () => {
  it("persists the new rules version, idempotent/out-of-order summary and one settled-round row and no detail events", async () => {
    const { db, sqlite } = database(), initial = rich("PROCUREMENT");
    let s = act(initial, { type: "OFFER_TRADE", counterpart: "B", terms: { give: { cash: 0, materials: 1, goods: 0 }, receive: { cash: 1, materials: 0, goods: 0 } } });
    s.round = 12; s = settle(s);
    await persistHubTransition(db, null, s, 2000); await persistHubTransition(db, null, s, 2100); await persistHubStart(db, "ROOM01", initial, 1000);
    const summary = sqlite.prepare("SELECT * FROM commercial_hub_matches WHERE match_id='m'").get()!;
    expect(summary).toMatchObject({ rules_version: "0.5", app_version: APP_VERSION, finished_at: 2000, total_rounds: 12, end_reason: "ROUND_12", started_at: 1000 });
    expect(JSON.parse(summary.winners_json as string)).toEqual(s.result!.winners.map(p=>`seat-${s.players.indexOf(p)+1}`));
    const rows=sqlite.prepare("SELECT * FROM commercial_hub_rounds WHERE match_id='m'").all();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.companies_json as string)).toHaveLength(4);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM commercial_hub_events").get()!.n).toBe(0);
    expect(JSON.parse(summary.result_json as string).ranking).toHaveLength(4);
    expect(sqlite.prepare("SELECT finished_at, ended_reason FROM playtest_matches WHERE match_id='m'").get()).toMatchObject({ finished_at: 2000, ended_reason: "COMPLETED" }); sqlite.close();
  });
});


