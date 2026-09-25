import { describe, expect, it } from "vitest";
import {
  affectedCells, calculateBoard, createTerritoryState, currentTurn, isLegalPlacement, legalPlacements,
  parseTerritoryConfig, reduceTerritory, TERRITORY_PRESETS, territoryReport, territoryResult,
  turnOrder, type StoneKind, type TerritoryConfig, type TerritoryState
} from "../../../src/games/ooishi-territory/engine";
import { ooishiTerritoryGameModule, buildTerritoryView } from "../../../src/games/ooishi-territory/module";

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: ["青", "赤", "黄", "緑"][i]! }));
}
function coordinate(size: number, text: string) {
  return (Number(text.slice(1)) - 1) * size + text.charCodeAt(0) - 65;
}
function play(state: TerritoryState, kind: StoneKind, at: string) {
  const seat = currentTurn(state.config, state.moves.length).seat;
  return reduceTerritory(state, { type: "PLACE", playerId: state.players[seat]!.id, kind, index: coordinate(state.config.size, at) });
}
describe("ooishi-territory shared rules", () => {
  it("validates trial settings and keeps standard 2/3/4-person presets", () => {
    for (const n of [2, 3, 4] as const) {
      expect(parseTerritoryConfig(TERRITORY_PRESETS[n])).toEqual(TERRITORY_PRESETS[n]);
      expect(TERRITORY_PRESETS[n].bigBan).toBe(1);
      expect(TERRITORY_PRESETS[n].expRule).toBe(1);
      expect(TERRITORY_PRESETS[n].medRule).toBe(1);
    }
    expect(() => parseTerritoryConfig({ ...TERRITORY_PRESETS[2], playerCount: 1 })).toThrow();
    expect(() => parseTerritoryConfig({ ...TERRITORY_PRESETS[2], size: 12 })).toThrow();
    expect(() => parseTerritoryConfig({ ...TERRITORY_PRESETS[4], big: 5, medium: 6, small: 12, size: 7 })).toThrow();
    expect(() => parseTerritoryConfig({ ...TERRITORY_PRESETS[2], bigBan: 3 })).toThrow();
  });
  it("uses 5x5, 3x3 and cardinal-only influences with no center bonus", () => {
    const size = 9, center = coordinate(size, "E5");
    expect(affectedCells(size, center, "big")).toHaveLength(24);
    expect(affectedCells(size, center, "medium")).toHaveLength(8);
    expect(affectedCells(size, center, "small")).toHaveLength(4);
    expect(affectedCells(size, center, "exp")).toEqual(affectedCells(size, center, "small"));
    for (const kind of ["big", "medium", "small"] as StoneKind[]) expect(affectedCells(size, center, kind)).not.toContain(center);
    expect(affectedCells(size, coordinate(size, "A1"), "big")).toHaveLength(8);
    expect(affectedCells(size, coordinate(size, "A1"), "medium")).toHaveLength(3);
    expect(affectedCells(size, coordinate(size, "A1"), "small")).toHaveLength(2);
  });
  it("keeps occupied cells owned, tied/unreached cells neutral and scores exhaustive", () => {
    const config = TERRITORY_PRESETS[2];
    const a = coordinate(config.size, "A1"), e = coordinate(config.size, "E1"), c = coordinate(config.size, "C1");
    const board = calculateBoard(config, [{ seat: 0, kind: "big", index: a }, { seat: 1, kind: "big", index: e }]);
    expect(board.influences[0]![c]).toBe(1);
    expect(board.influences[1]![c]).toBe(1);
    expect(board.owners[c]).toBe(-1);
    expect(board.owners[coordinate(config.size, "H8")]).toBe(-1);
    const occupied = calculateBoard(config, [
      { seat: 0, kind: "small", index: coordinate(config.size, "B2") },
      { seat: 1, kind: "big", index: coordinate(config.size, "C2") },
      { seat: 1, kind: "medium", index: coordinate(config.size, "C3") },
      { seat: 1, kind: "small", index: coordinate(config.size, "B3") }
    ]);
    const target = coordinate(config.size, "B2");
    expect(occupied.influences[1]![target]).toBe(3);
    expect(occupied.owners[target]).toBe(0);
    expect(occupied.scores.reduce((a, b) => a + b, occupied.neutral)).toBe(config.size ** 2);
  });
  it("forces opening big and penultimate remaining big; prevents final Moon Volley", () => {
    const config: TerritoryConfig = { ...TERRITORY_PRESETS[2], big: 2, medium: 1, small: 1 };
    let state = createTerritoryState("m", players(2), config);
    const initial = legalPlacements(config, state.moves);
    expect(initial.big.length).toBeGreaterThan(0);
    expect(initial.medium).toEqual([]); expect(initial.small).toEqual([]); expect(initial.exp).toEqual([]);
    state = play(state, "big", "A1"); state = play(state, "big", "G7");
    state = play(state, "small", "B1"); state = play(state, "small", "F7");
    expect(currentTurn(config, state.moves.length).round).toBe(2);
    const penultimate = legalPlacements(config, state.moves);
    expect(penultimate.big.length).toBeGreaterThan(0);
    expect(penultimate.medium).toEqual([]); expect(penultimate.small).toEqual([]); expect(penultimate.exp).toEqual([]);
    state = play(state, "big", "D2"); state = play(state, "big", "D6");
    const final = legalPlacements(config, state.moves);
    expect(final.big).toEqual([]); expect(final.exp).toEqual([]);
    expect(final.medium.length).toBeGreaterThan(0);
    state = play(state, "medium", "C2"); state = play(state, "medium", "E6");
    expect(state.phase).toBe("FINISHED");
    expect(territoryResult(state).scores.reduce((a, b) => a + b, territoryResult(state).neutral)).toBe(64);
  });
  it("lets a Moon Volley small stone host medium, but never chains medium directly into medium", () => {
    const config = { ...TERRITORY_PRESETS[2] };
    let state = createTerritoryState("m", players(2), config);
    state = play(state, "big", "A1"); state = play(state, "big", "G7");
    state = play(state, "exp", "E5"); state = play(state, "small", "F7");
    const board = calculateBoard(config, state.moves), medium = coordinate(config.size, "E6");
    expect(isLegalPlacement(config, state.moves, board, "medium", medium)).toBe(true);
    expect(isLegalPlacement({ ...config, medRule: 0 }, state.moves, board, "medium", medium)).toBe(false);
    state = play(state, "medium", "E6"); state = play(state, "medium", "G6");
    expect(isLegalPlacement(config, state.moves, calculateBoard(config, state.moves), "medium", coordinate(config.size, "E7"))).toBe(false);
    expect(territoryReport(state)).toContain("ムーンボレー");
    expect(territoryReport(state)).not.toContain("遠征");
  });
  it("rotates seats and accepts no spoofed client player identity", () => {
    const config = TERRITORY_PRESETS[3];
    expect(turnOrder(config, 0)).toEqual([0, 1, 2]);
    expect(turnOrder(config, 1)).toEqual([1, 2, 0]);
    expect(turnOrder(config, 2)).toEqual([2, 0, 1]);
    expect(turnOrder(TERRITORY_PRESETS[4], 1)).toEqual([3, 2, 1, 0]);
    const state = createTerritoryState("m", players(3), config);
    expect(ooishiTerritoryGameModule.parseClientAction?.({ type: "PLACE", playerId: "p1", kind: "big", index: 0 }, "p0"))
      .toEqual({ type: "PLACE", playerId: "p0", kind: "big", index: 0 });
    expect(() => reduceTerritory(state, { type: "PLACE", playerId: "p1", kind: "big", index: 0 })).toThrow("手番");
    expect(() => buildTerritoryView(state, "intruder")).toThrow();
    expect(buildTerritoryView(state, "p1").legal.big).toEqual([]);
    expect(buildTerritoryView(state, "p0").legal.big.length).toBeGreaterThan(0);
  });
  it("replays the 2-player local trial with exactly the reported 27/25/12 score", () => {
    let state = createTerritoryState("two", players(2), TERRITORY_PRESETS[2]);
    const moves: [StoneKind, string][] = [
      ["big","C3"],["big","F6"],["small","E5"],["small","D4"],["medium","E6"],["small","D7"],
      ["big","F3"],["medium","G4"],["small","F7"],["exp","B4"],["medium","G5"],["medium","B5"],
      ["small","G7"],["small","D3"],["exp","B7"],["small","D2"],["medium","C7"],["big","F5"],
      ["small","E4"],["medium","C2"]
    ];
    for (const [kind, coord] of moves) state = play(state, kind, coord);
    expect(state.phase).toBe("FINISHED");
    expect(territoryResult(state)).toMatchObject({ scores: [27, 25], neutral: 12, winners: ["p0"] });
  });
  it("replays the 3-player 9.5-minute trial with exactly the reported 19/20/20/22 score", () => {
    let state = createTerritoryState("three", players(3), TERRITORY_PRESETS[3]);
    const moves: [StoneKind, string][] = [
      ["big","E5"],["big","C5"],["big","G7"],["small","E3"],["small","E8"],["small","G3"],
      ["big","C3"],["small","C7"],["exp","H8"],["medium","G5"],["small","H7"],["medium","E2"],
      ["medium","H6"],["small","D8"],["medium","C4"],["small","I5"],["small","F7"],["medium","E6"],
      ["small","F8"],["small","B7"],["exp","I2"],["small","A3"],["medium","C8"],["exp","B1"],
      ["medium","B2"],["big","C2"],["big","F3"],["medium","D2"],["medium","H2"],["small","A5"]
    ];
    for (const [kind, coord] of moves) state = play(state, kind, coord);
    expect(state.phase).toBe("FINISHED");
    expect(territoryResult(state)).toMatchObject({ scores: [19, 20, 20], neutral: 22, winners: ["p1","p2"] });
  });
  it("replays the balanced 4-player 8.6-minute trial with 17/15/15/18/35 scores", () => {
    let state = createTerritoryState("four", players(4), TERRITORY_PRESETS[4]);
    const moves: [StoneKind, string][] = [
      ["big","C3"],["big","E6"],["big","H3"],["big","H8"],
      ["small","F7"],["medium","F5"],["big","H6"],["small","C5"],
      ["exp","B9"],["medium","I6"],["small","E4"],["medium","C7"],
      ["small","I4"],["exp","G9"],["small","F9"],["medium","C9"],
      ["medium","H9"],["small","D4"],["big","C4"],["small","E9"],
      ["medium","G6"],["small","B6"],["medium","I8"],["small","I9"],
      ["small","E2"],["big","F3"],["big","C8"],["small","B8"],
      ["small","I3"],["medium","B3"],["small","G4"],["small","B2"]
    ];
    for (const [kind, coord] of moves) state = play(state, kind, coord);
    expect(state.phase).toBe("FINISHED");
    expect(territoryResult(state)).toMatchObject({ scores: [17, 15, 15, 18], neutral: 35, winners: ["p3"] });
  });

});
