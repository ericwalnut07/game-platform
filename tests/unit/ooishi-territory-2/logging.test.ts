import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createTerritory2State,
  currentTerritory2Turn,
  legalTerritory2Placements,
  reduceTerritory2,
  territory2Preset
} from "../../../src/games/ooishi-territory-2/engine";
import { persistMatchStartForGame, persistStateTransitionForGame } from "../../../src/server/lib/playtest-log";
import { APP_VERSION } from "../../../src/shared/version";

function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync("migrations").filter((file) => file.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync("migrations/" + name, "utf8"));
  }
  const db = {
    prepare(sql: string) {
      let args: (string | number | null)[] = [];
      return {
        bind(...values: (string | number | null)[]) {
          args = values;
          return this;
        },
        run: async () => sqlite.prepare(sql).run(...args)
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      for (const statement of statements) await statement.run();
    }
  } as unknown as D1Database;
  return { sqlite, db };
}

describe("ooishi-territory-2 D1 logs", () => {
  it("stores the big-stone option, moves and public final Sync result in shared playtest tables", async () => {
    const { sqlite, db } = createDb();
    const config = territory2Preset(2, 2);
    const initial = createTerritory2State("territory2-match", [
      { id: "p0", name: "青役" },
      { id: "p1", name: "赤役" }
    ], config, 1000);
    let state = initial;

    await persistMatchStartForGame(db, "ABC123", "ooishi-territory-2", initial, 1000);

    while (state.phase === "PLAYING") {
      const turn = currentTerritory2Turn(config, state.moves.length);
      const legal = legalTerritory2Placements(config, state.moves);
      const before = state;
      const useBig = (turn.turnNumber === 3 || turn.turnNumber === 4) && legal.big.length > 0;
      state = reduceTerritory2(state, {
        type: "PLACE",
        playerId: state.players[turn.seat]!.id,
        kind: useBig ? "big" : "small",
        index: (useBig ? legal.big : legal.small)[0]!
      });
      await persistStateTransitionForGame(
        db,
        "ooishi-territory-2",
        before,
        state,
        2000 + state.revision * 100,
        "ABC123"
      );
    }

    expect(sqlite.prepare("SELECT game_id, player_count, game_count, app_version, finished_at, ended_reason FROM playtest_matches WHERE match_id='territory2-match'").get())
      .toMatchObject({
        game_id: "ooishi-territory-2",
        player_count: 2,
        game_count: 1,
        app_version: APP_VERSION,
        finished_at: 4400,
        ended_reason: "COMPLETED"
      });

    const events = sqlite.prepare("SELECT event_type, payload_json FROM playtest_events WHERE match_id='territory2-match' ORDER BY event_id").all();
    expect(events[0]!.event_type).toBe("TERRITORY2_CONFIG");
    expect(JSON.parse(events[0]!.payload_json as string).config.maxBigStones).toBe(2);
    expect(events.filter((entry) => entry.event_type === "TERRITORY2_MOVE")).toHaveLength(24);
    expect(events.at(-1)!.event_type).toBe("TERRITORY2_RESULT");
    const result = JSON.parse(events.at(-1)!.payload_json as string);
    expect(result.moves).toBe(24);
    expect(result.bigUsed).toEqual([2, 2]);
    expect(result.syncBigCount).toHaveLength(2);
    expect(JSON.stringify(events)).not.toMatch(/sessionToken|displayName|青役|赤役/);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM playtest_games").get()!.n).toBe(0);
    sqlite.close();
  });
});
