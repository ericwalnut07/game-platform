import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createTerritoryState, currentTurn, reduceTerritory, TERRITORY_PRESETS } from "../../../src/games/ooishi-territory/engine";
import { persistMatchStartForGame, persistStateTransitionForGame } from "../../../src/server/lib/playtest-log";
import { APP_VERSION } from "../../../src/shared/version";

function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync("migrations").filter((file) => file.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(`migrations/${name}`, "utf8"));
  }
  const db = {
    prepare(sql: string) {
      let args: (string | number | null)[] = [];
      return {
        bind(...values: (string | number | null)[]) { args = values; return this; },
        run: async () => sqlite.prepare(sql).run(...args)
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      for (const statement of statements) await statement.run();
    }
  } as unknown as D1Database;
  return { sqlite, db };
}
describe("ooishi-territory D1 logs", () => {
  it("stores versioned settings and finished public results without modifying Pon tables", async () => {
    const { sqlite, db } = createDb();
    const config = { ...TERRITORY_PRESETS[2], big: 1, medium: 0, small: 1, size: 7 };
    const initial = createTerritoryState("territory-match", [{ id: "p0", name: "青役" }, { id: "p1", name: "赤役" }], config, 1000);
    let state = initial;
    await persistMatchStartForGame(db, "ABC123", "ooishi-territory", initial, 1000);
    for (const [kind, index] of [["big", 0], ["big", 48], ["small", 1], ["small", 47]] as const) {
      const seat = currentTurn(config, state.moves.length).seat;
      const before = state;
      state = reduceTerritory(state, { type: "PLACE", playerId: state.players[seat]!.id, kind, index });
      await persistStateTransitionForGame(db, "ooishi-territory", before, state, 2000 + state.revision * 100, "ABC123");
    }
    expect(state.phase).toBe("FINISHED");

    expect(sqlite.prepare("SELECT game_id, player_count, game_count, app_version, finished_at, ended_reason FROM playtest_matches WHERE match_id='territory-match'").get())
      .toMatchObject({ game_id: "ooishi-territory", player_count: 2, game_count: 1, app_version: APP_VERSION, finished_at: 2400, ended_reason: "COMPLETED" });
    const events = sqlite.prepare("SELECT event_type, payload_json FROM playtest_events WHERE match_id='territory-match' ORDER BY event_id").all();
    expect(events.map((entry) => entry.event_type)).toEqual(["TERRITORY_CONFIG", "TERRITORY_MOVE", "TERRITORY_MOVE", "TERRITORY_MOVE", "TERRITORY_MOVE", "TERRITORY_RESULT"]);
    expect(JSON.parse(events[0]!.payload_json as string).config).toEqual(config);
    expect(JSON.parse(events[1]!.payload_json as string).revision).toBe(1);
    expect(JSON.parse(events[5]!.payload_json as string).moves).toBe(4);
    expect(JSON.stringify(events)).not.toMatch(/sessionToken|displayName|青役|赤役/);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM playtest_games").get()!.n).toBe(0);
    sqlite.close();
  });
});
