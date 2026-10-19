import { describe, expect, it } from "vitest";
import { ooishiLineGameModule as module, orderLinePlayers, parseLineConfig } from "../../../src/games/ooishi-line/module";
import { gameCatalog } from "../../../src/server/lib/catalog";

const rng = { next: () => 0, integer: (min: number) => min, shuffle: <T>(items: readonly T[]) => [...items].reverse() };
const players = [{ id: "host", displayName: "Host" }, { id: "guest", displayName: "Guest" }];
const initial = () => module.createInitialState({ matchId: "line", players, config: parseLineConfig({}), gameIndex: 1, rng, now: 123 });

describe("Line online module", () => {
  it("accepts explicit/default config", () => {
    expect(parseLineConfig(undefined)).toEqual({ turnOrderMode: "host-select" });
    expect(parseLineConfig({ turnOrderMode: "host-select", startingPlayerId: "guest" })).toEqual({ turnOrderMode: "host-select", startingPlayerId: "guest" });
    expect(parseLineConfig({ turnOrderMode: "random" })).toEqual({ turnOrderMode: "random" });
  });
  it.each([{ turnOrderMode: "other" }, { startingPlayerId: 1 }, { startingPlayerId: "" }, { startingPlayerId: "x".repeat(101) }])("rejects invalid config %j", value => {
    expect(() => parseLineConfig(value)).toThrow();
  });
  it("uses the actual current host when a previously selected player is absent", () => {
    const seats = [{ playerId: "guest" }, { playerId: "host" }];
    expect(orderLinePlayers(seats, parseLineConfig({ startingPlayerId: "gone" }), "host", rng).map(p => p.playerId)).toEqual(["host", "guest"]);
    expect(orderLinePlayers(seats, parseLineConfig({ turnOrderMode: "random" }), "host", rng)).toEqual([...seats].reverse());
    expect(seats[0]!.playerId).toBe("guest");
  });
  it("uses exactly two distinct humans and starts at seat zero", () => {
    const state = initial(); expect(state.startedAt).toBe(123); expect(state.core.position.nextSeat).toBe(0);
    for (const invalid of [players.slice(0, 1), [players[0]!, players[0]!], [players[0]!, { ...players[1]!, controller: { kind: "NPC" as const, profile: "standard" } }]]) {
      expect(() => module.createInitialState({ matchId: "bad", players: invalid, config: parseLineConfig({}), gameIndex: 1, rng })).toThrow();
    }
  });
  it("strips forged identity, accepts legal stacking and exposes no repetition history", () => {
    const state = initial(); const action = module.parseClientAction!({ type: "PLACE", size: "large", to: 0, playerId: "guest", seat: 1 }, "host");
    expect(action).toEqual({ type: "PLACE", size: "large", to: 0, playerId: "host" });
    const next = module.handleAction(state, action, { rng });
    const stacked = module.handleAction(next, module.parseClientAction!({ type: "PLACE", size: "medium", to: 0 }, "guest"), { rng });
    expect(stacked.core.position.board[0]).toHaveLength(2);
    const view = module.buildPlayerView(stacked, "guest");
    expect(view.mySeat).toBe(1); expect(view.state).not.toHaveProperty("history"); expect(view.state.position).toEqual(stacked.core.position);
    expect(() => module.buildPlayerView(stacked, "forged")).toThrow();
    expect(module.getStateInfo!(stacked)).toMatchObject({ phase: "PLAYING:2", currentGameId: "ooishi-line", matchFinished: false });
  });
  it.each([{ type: "PLACE", size: "small", to: -1 }, { type: "PLACE", size: "other", to: 0 }, { type: "MOVE", from: 0, layer: 3, to: 1 }, { type: "MOVE", from: 0, layer: 0.5, to: 1 }, { type: "PASS" }])("rejects malformed network action %j", value => {
    expect(() => module.parseClientAction!(value, "host")).toThrow();
  });
  it("lists both supported modes with exactly two seats", () => {
    expect(gameCatalog.find(game => game.id === "ooishi-line")).toMatchObject({ title: "大石のライン", supportedModes: ["SOLO", "ONLINE"], minPlayers: 2, maxPlayers: 2 });
  });
});
