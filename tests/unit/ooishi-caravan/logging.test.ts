import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ooishiCaravanGameModule as module } from "../../../src/games/ooishi-caravan/module";
import { applyCaravanAction } from "../../../src/games/ooishi-caravan/engine";
import { chooseCaravanNpcAction } from "../../../src/games/ooishi-caravan/npc";
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
describe("Caravan D1 logs", () => {
  it("replays every roll/move to the same final state using versioned existing tables", async () => {
    const { sqlite, db } = createDb();
    let seed = 41;
    const rng = { next: () => 0, integer: (min: number, max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return min + seed % (max - min + 1); }, shuffle: <T>(a: readonly T[]) => [...a] };
    const initial = module.createInitialState({ matchId: "caravan-log", players: [{ id: "p1", displayName: "private-one" }, { id: "p0", displayName: "private-two" }], config: module.parseConfig({ startingPlayerId: "p1" }), gameIndex: 1, now: 1000, rng });
    await persistMatchStartForGame(db, "CAR123", "ooishi-caravan", initial, 1000);
    let state = initial;
    for (let i = 0; i < 700 && state.core.phase !== "FINISHED"; i++) {
      const before = state, action = chooseCaravanNpcAction(state.core)!;
      state = module.handleAction(state, { ...action, playerId: state.players[state.core.currentSeat]!.id }, { rng });
      await persistStateTransitionForGame(db, "ooishi-caravan", before, state, 1000 + state.revision, "CAR123");
    }
    expect(state.core.phase).toBe("FINISHED");
    const match = sqlite.prepare("SELECT * FROM playtest_matches WHERE match_id='caravan-log'").get()!;
    expect(match).toMatchObject({ game_id: "ooishi-caravan", player_count: 2, game_count: 1, app_version: APP_VERSION, ended_reason: "COMPLETED", finished_at: 1000 + state.revision });
    const events = sqlite.prepare("SELECT event_type, payload_json FROM playtest_events WHERE match_id='caravan-log' ORDER BY event_id").all();
    expect(events).toHaveLength(state.revision + 2);
    expect(JSON.parse(events[0]!.payload_json as string)).toEqual({ rulesVersion: "1.0", config: initial.config, playerOrder: ["p1", "p0"] });
    let core = initial.core, revision = 0;
    for (const event of events.filter(e => e.event_type === "CARAVAN_ACTION")) {
      const payload = JSON.parse(event.payload_json as string); expect(payload.revision).toBe(++revision);
      const values = payload.dice.map((die: { value: number }) => die.value);
      if (payload.action.type === "MOVE") {
        expect(payload.to).toBe(payload.action.from + core.dice![payload.action.die as 0 | 1].value);
        expect(payload.carried).toEqual(core.board[payload.action.from - 1]!.slice(payload.action.layer));
      }
      core = applyCaravanAction(core, core.currentSeat, payload.action, { integer: () => values.shift()! });
      expect(payload.goaledCounts).toEqual(core.goaled.map(stones => stones.length));
    }
    expect(core).toEqual(state.core); expect(events.at(-1)!.event_type).toBe("CARAVAN_RESULT");
    expect(JSON.parse(events.at(-1)!.payload_json as string).result).toEqual(core.result);
    expect(JSON.stringify(events)).not.toMatch(/sessionToken|displayName|private-one|private-two/);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM playtest_games").get()!.n).toBe(0);
    sqlite.close();
  });
});
