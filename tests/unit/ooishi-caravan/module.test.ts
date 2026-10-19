import { describe, expect, it, vi } from "vitest";
import { ooishiCaravanGameModule as module, orderCaravanPlayers, parseCaravanConfig } from "../../../src/games/ooishi-caravan/module";
import { legalCaravanMoves } from "../../../src/games/ooishi-caravan/engine";
import { gameCatalog } from "../../../src/server/lib/catalog";
const rng = { next: () => 0, integer: (min: number) => min, shuffle: <T>(items: readonly T[]) => [...items].reverse() };
const players = [{ id: "host", displayName: "Host" }, { id: "guest", displayName: "Guest" }];
const initial = () => module.createInitialState({ matchId: "caravan", players, config: parseCaravanConfig({}), gameIndex: 1, rng, now: 123 });
describe("Caravan online module", () => {
  it("accepts default, explicit and random settings", () => {
    expect(parseCaravanConfig(undefined)).toEqual({ turnOrderMode: "host-select" });
    expect(parseCaravanConfig({ startingPlayerId: "guest" })).toEqual({ turnOrderMode: "host-select", startingPlayerId: "guest" });
    expect(parseCaravanConfig({ turnOrderMode: "random" })).toEqual({ turnOrderMode: "random" });
  });
  it.each([{ turnOrderMode: "other" }, { startingPlayerId: 1 }, { startingPlayerId: "" }, { startingPlayerId: "x".repeat(101) }])("rejects invalid config %j", value => expect(() => parseCaravanConfig(value)).toThrow());
  it("rotates designated starts, falls back to actual host and shuffles all players without mutation", () => {
    const seats = [{ playerId: "guest" }, { playerId: "host" }];
    expect(orderCaravanPlayers(seats, parseCaravanConfig({ startingPlayerId: "guest" }), "host", rng)).toEqual(seats);
    expect(orderCaravanPlayers(seats, parseCaravanConfig({ startingPlayerId: "gone" }), "host", rng)).toEqual([...seats].reverse());
    expect(orderCaravanPlayers(seats, parseCaravanConfig({ turnOrderMode: "random" }), "host", rng)).toEqual([...seats].reverse());
    expect(seats[0]!.playerId).toBe("guest");
  });
  it("requires exactly two distinct human seats, assigning first-player positions to seat zero", () => {
    expect(initial()).toMatchObject({ startedAt: 123, revision: 0, core: { currentSeat: 0, phase: "AWAITING_ROLL" } });
    expect(initial().core.board[0]![0]!.owner).toBe(0);
    for (const invalid of [players.slice(0, 1), [players[0]!, players[0]!], [players[0]!, { ...players[1]!, controller: { kind: "NPC" as const, profile: "standard" } }]]) {
      expect(() => module.createInitialState({ matchId: "bad", players: invalid, config: parseCaravanConfig({}), gameIndex: 1, rng })).toThrow();
    }
  });
  it("uses server dice, strips forged identity/dice/target and increments every accepted action", () => {
    const integer = vi.fn().mockReturnValueOnce(2).mockReturnValueOnce(4);
    const action = module.parseClientAction!({ type: "ROLL", playerId: "guest", seat: 1, dice: [6, 6] }, "host");
    expect(action).toEqual({ type: "ROLL", playerId: "host" });
    const rolled = module.handleAction(initial(), action, { rng: { ...rng, integer } });
    expect(rolled.core.dice?.map(d => d.value)).toEqual([2, 4]); expect(integer).toHaveBeenCalledTimes(2);
    expect(rolled.revision).toBe(1); expect(module.getStateInfo!(rolled).phase).toBe("MOVING:1");
    const move = legalCaravanMoves(rolled.core)[0]!;
    const next = module.handleAction(rolled, module.parseClientAction!({ ...move, to: 21, playerId: "guest" }, "host"), { rng });
    expect(next.revision).toBe(2); expect(next.core.moveCount).toBe(1);
    expect(next.core.board[move.from + rolled.core.dice![move.die].value - 1]).not.toHaveLength(0);
    expect(next.core.goaled).toEqual([[], []]);
    expect(module.buildPlayerView(next, "guest")).toMatchObject({ mySeat: 1, state: next.core, revision: 2 });
    expect(() => module.buildPlayerView(next, "outsider")).toThrow();
    expect(() => module.handleAction(next, { type: "ROLL", playerId: "outsider" }, { rng })).toThrow();
  });
  it.each([{ type: "MOVE", from: 0, layer: 0, die: 0 }, { type: "MOVE", from: 21, layer: 0, die: 0 }, { type: "MOVE", from: 1, layer: 3, die: 0 }, { type: "MOVE", from: 1, layer: 0.5, die: 0 }, { type: "MOVE", from: 1, layer: 0, die: 2 }, { type: "PASS" }])("rejects malformed network action %j", value => expect(() => module.parseClientAction!(value, "host")).toThrow());
  it("advertises solo and online with exactly two seats", () => expect(gameCatalog.find(g => g.id === "ooishi-caravan")).toMatchObject({ title: "大石のキャラバン", supportedModes: ["SOLO", "ONLINE"], minPlayers: 2, maxPlayers: 2 }));
});
