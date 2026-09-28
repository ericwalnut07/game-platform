import { describe, expect, it } from "vitest";
import {
  calculateTerritory2Board,
  createTerritory2State,
  currentTerritory2Turn,
  legalTerritory2Placements,
  parseTerritory2Config,
  reduceTerritory2,
  TERRITORY2_PRESETS,
  territory2Preset,
  territory2Result,
  territory2TurnOrder,
  type Territory2State,
  type Territory2StoneKind
} from "../../../src/games/ooishi-territory-2/engine";
import {
  buildTerritory2View,
  ooishiTerritory2GameModule
} from "../../../src/games/ooishi-territory-2/module";

function players(count: number) {
  return Array.from({ length: count }, (_, side) => ({
    id: "p" + side,
    name: ["青", "赤", "黄", "緑"][side]!
  }));
}

function at(size: number, coord: string) {
  return (Number(coord.slice(1)) - 1) * size + coord.charCodeAt(0) - 65;
}

function move(seat: number, kind: Territory2StoneKind, index: number) {
  return { seat, kind, index } as const;
}

function play(state: Territory2State, kind: Territory2StoneKind, coord: string) {
  const turn = currentTerritory2Turn(state.config, state.moves.length);
  return reduceTerritory2(state, {
    type: "PLACE",
    playerId: state.players[turn.seat]!.id,
    kind,
    index: at(state.config.size, coord)
  });
}

describe("ooishi-territory-2 rules", () => {
  it("fixes board size and turn count by player count and validates the big-stone option", () => {
    expect(TERRITORY2_PRESETS[2]).toEqual({ playerCount: 2, size: 8, turns: 12, maxBigStones: 1 });
    expect(TERRITORY2_PRESETS[3]).toEqual({ playerCount: 3, size: 9, turns: 9, maxBigStones: 1 });
    expect(TERRITORY2_PRESETS[4]).toEqual({ playerCount: 4, size: 10, turns: 8, maxBigStones: 1 });
    expect(parseTerritory2Config(territory2Preset(3, 2))).toEqual({ playerCount: 3, size: 9, turns: 9, maxBigStones: 2 });
    expect(() => parseTerritory2Config({ playerCount: 3, size: 10, turns: 9, maxBigStones: 1 })).toThrow();
    expect(() => parseTerritory2Config({ playerCount: 3, size: 9, turns: 9, maxBigStones: 3 })).toThrow();
  });

  it("rotates the first player every round", () => {
    const cfg2 = TERRITORY2_PRESETS[2];
    expect(territory2TurnOrder(cfg2, 0)).toEqual([0, 1]);
    expect(territory2TurnOrder(cfg2, 1)).toEqual([1, 0]);
    expect(territory2TurnOrder(cfg2, 2)).toEqual([0, 1]);

    const cfg3 = TERRITORY2_PRESETS[3];
    expect(territory2TurnOrder(cfg3, 0)).toEqual([0, 1, 2]);
    expect(territory2TurnOrder(cfg3, 1)).toEqual([1, 2, 0]);
    expect(territory2TurnOrder(cfg3, 2)).toEqual([2, 0, 1]);
  });

  it("creates an ordinary Golden Pair and one opposing stone cuts it", () => {
    const cfg = TERRITORY2_PRESETS[2];
    const a1 = at(cfg.size, "A1"), e1 = at(cfg.size, "E1");
    let board = calculateTerritory2Board(cfg, [
      move(0, "small", a1),
      move(0, "small", e1)
    ]);
    expect(board.lines).toHaveLength(1);
    expect(board.lines[0]).toMatchObject({ side: 0, sync: false, piercing: false });
    expect(board.influences[0]![at(cfg.size, "B1")]).toBe(1);
    expect(board.influences[0]![at(cfg.size, "C1")]).toBe(1);
    expect(board.influences[0]![at(cfg.size, "D1")]).toBe(1);

    board = calculateTerritory2Board(cfg, [
      move(0, "small", a1),
      move(0, "small", e1),
      move(1, "small", at(cfg.size, "C1"))
    ]);
    expect(board.lines.filter((line) => line.side === 0)).toHaveLength(0);
    expect(board.influences[0]![at(cfg.size, "B1")]).toBe(0);
    expect(board.owners[at(cfg.size, "C1")]).toBe(1);
  });

  it("activates Sync in two directions, pierces one opponent and is cut by the second", () => {
    const cfg = TERRITORY2_PRESETS[2];
    const base = [
      move(0, "big", at(cfg.size, "A4")),
      move(0, "small", at(cfg.size, "E4")),
      move(0, "small", at(cfg.size, "A1"))
    ];
    let board = calculateTerritory2Board(cfg, base);
    expect(board.syncBigIndexes).toEqual([at(cfg.size, "A4")]);
    expect(board.syncLineCount[0]).toBe(2);

    board = calculateTerritory2Board(cfg, [
      ...base,
      move(1, "small", at(cfg.size, "B4"))
    ]);
    expect(board.syncBigIndexes).toContain(at(cfg.size, "A4"));
    expect(board.piercingLineCount[0]).toBe(1);
    expect(board.owners[at(cfg.size, "B4")]).toBe(1);
    expect(board.influences[0]![at(cfg.size, "C4")]).toBe(1);
    expect(board.influences[0]![at(cfg.size, "D4")]).toBe(1);

    board = calculateTerritory2Board(cfg, [
      ...base,
      move(1, "small", at(cfg.size, "B4")),
      move(1, "small", at(cfg.size, "C4"))
    ]);
    expect(board.syncBigIndexes).not.toContain(at(cfg.size, "A4"));
    expect(board.lines.some((line) => line.start === at(cfg.size, "A4") && line.end === at(cfg.size, "E4"))).toBe(false);
    expect(board.influences[0]![at(cfg.size, "D4")]).toBe(0);
  });

  it("counts a one-blocked zero-empty connection before Sync activation", () => {
    const cfg = TERRITORY2_PRESETS[2];
    const board = calculateTerritory2Board(cfg, [
      move(0, "big", at(cfg.size, "A4")),
      move(0, "small", at(cfg.size, "C4")),
      move(0, "small", at(cfg.size, "A1")),
      move(1, "small", at(cfg.size, "B4"))
    ]);
    expect(board.syncBigIndexes).toContain(at(cfg.size, "A4"));
    const short = board.lines.find((line) => line.start === at(cfg.size, "A4") && line.end === at(cfg.size, "C4"));
    expect(short).toMatchObject({ sync: true, piercing: true, blockerCount: 1 });
    expect(short?.between).toEqual([at(cfg.size, "B4")]);
  });

  it("an own stone splits the farther line and can cancel Sync", () => {
    const cfg = TERRITORY2_PRESETS[2];
    const board = calculateTerritory2Board(cfg, [
      move(0, "big", at(cfg.size, "A4")),
      move(0, "small", at(cfg.size, "E4")),
      move(0, "small", at(cfg.size, "A1")),
      move(0, "small", at(cfg.size, "B4"))
    ]);
    expect(board.syncBigIndexes).not.toContain(at(cfg.size, "A4"));
    expect(board.lines.some((line) => line.start === at(cfg.size, "A4") && line.end === at(cfg.size, "E4"))).toBe(false);
  });

  it("evaluates two big stones independently and never doubles a shared line", () => {
    const cfg = territory2Preset(2, 2);
    const sharedBase = [
      move(0, "big", at(cfg.size, "B5")),
      move(0, "big", at(cfg.size, "E5")),
      move(0, "small", at(cfg.size, "B1"))
    ];
    let board = calculateTerritory2Board(cfg, [
      ...sharedBase,
      move(1, "small", at(cfg.size, "C5"))
    ]);
    expect(board.syncBigIndexes).toEqual([at(cfg.size, "B5")]);
    expect(board.piercingLineCount[0]).toBe(1);
    expect(board.influences[0]![at(cfg.size, "D5")]).toBe(1);

    board = calculateTerritory2Board(cfg, [
      ...sharedBase,
      move(0, "small", at(cfg.size, "E2")),
      move(1, "small", at(cfg.size, "C5"))
    ]);
    expect(board.syncBigIndexes.sort((a, b) => a - b)).toEqual([at(cfg.size, "B5"), at(cfg.size, "E5")].sort((a, b) => a - b));
    expect(board.piercingLineCount[0]).toBe(1);
    expect(board.influences[0]![at(cfg.size, "D5")]).toBe(1);

    board = calculateTerritory2Board(cfg, [
      ...sharedBase,
      move(0, "small", at(cfg.size, "E2")),
      move(1, "small", at(cfg.size, "C5")),
      move(1, "small", at(cfg.size, "D5"))
    ]);
    expect(board.lines.some((line) =>
      (line.start === at(cfg.size, "B5") && line.end === at(cfg.size, "E5")) ||
      (line.start === at(cfg.size, "E5") && line.end === at(cfg.size, "B5"))
    )).toBe(false);
  });

  it("allows big stones only from turn 3 through the penultimate turn and enforces the cap", () => {
    const cfg = territory2Preset(2, 2);
    let state = createTerritory2State("timing", players(2), cfg);
    expect(legalTerritory2Placements(cfg, state.moves).big).toEqual([]);

    state = play(state, "small", "A1");
    state = play(state, "small", "H8");
    state = play(state, "small", "G8");
    state = play(state, "small", "B1");
    expect(currentTerritory2Turn(cfg, state.moves.length).turnNumber).toBe(3);
    expect(legalTerritory2Placements(cfg, state.moves).big.length).toBeGreaterThan(0);

    state = play(state, "big", "D1");
    state = play(state, "big", "E8");
    state = play(state, "big", "F8");
    state = play(state, "big", "F1");

    while (state.phase === "PLAYING") {
      const turn = currentTerritory2Turn(cfg, state.moves.length);
      const legal = legalTerritory2Placements(cfg, state.moves);
      if (turn.turnNumber === cfg.turns) expect(legal.big).toEqual([]);
      const index = legal.small[0]!;
      state = reduceTerritory2(state, {
        type: "PLACE",
        playerId: state.players[turn.seat]!.id,
        kind: "small",
        index
      });
    }

    expect(state.moves).toHaveLength(cfg.playerCount * cfg.turns);
    const board = calculateTerritory2Board(cfg, state.moves);
    expect(board.bigUsed).toEqual([2, 2]);
    const result = territory2Result(state);
    expect(result.scores.reduce((sum, score) => sum + score, result.neutral)).toBe(cfg.size * cfg.size);
  });

  it("keeps client identity server-authoritative and exposes legal moves only to the current player", () => {
    const cfg = TERRITORY2_PRESETS[3];
    const state = createTerritory2State("secure", players(3), cfg);
    expect(ooishiTerritory2GameModule.parseClientAction?.({
      type: "PLACE",
      playerId: "p2",
      kind: "small",
      index: 0
    }, "p0")).toEqual({ type: "PLACE", playerId: "p0", kind: "small", index: 0 });
    expect(() => reduceTerritory2(state, { type: "PLACE", playerId: "p1", kind: "small", index: 0 })).toThrow("手番");
    expect(() => buildTerritory2View(state, "intruder")).toThrow();
    expect(buildTerritory2View(state, "p0").legal.small.length).toBe(cfg.size * cfg.size);
    expect(buildTerritory2View(state, "p1").legal.small).toEqual([]);
  });
});
