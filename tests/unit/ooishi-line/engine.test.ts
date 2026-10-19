import { describe, expect, it } from "vitest";
import { applyLineAction, canLandLineStone, createLineState, isLegalLineAction, legalLineActions, type LineAction, type LineState } from "../../../src/games/ooishi-line/engine";
import { createLineHistory, type LinePosition, type LineSeat, type LineStone, type LineStoneSize } from "../../../src/games/ooishi-line/position";

const stone = (owner: LineSeat, size: LineStoneSize): LineStone => ({ owner, size });
const large = (owner: LineSeat) => stone(owner, "large");
const medium = (owner: LineSeat) => stone(owner, "medium");
const small = (owner: LineSeat) => stone(owner, "small");

function fixture(stacks: readonly [number, LineStone[]][], nextSeat: LineSeat = 0): LineState {
  const initial = createLineState(nextSeat);
  const board: LineStone[][] = Array.from({ length: 16 }, () => []);
  const hands = [{ ...initial.position.hands[0] }, { ...initial.position.hands[1] }] as const;
  for (const [cell, stack] of stacks) {
    board[cell] = stack;
    for (const piece of stack) hands[piece.owner][piece.size]--;
  }
  for (const hand of hands) expect(Object.values(hand).every(count => count >= 0)).toBe(true);
  const position: LinePosition = { board, hands, nextSeat };
  return { ...initial, position, history: createLineHistory(position) };
}

function act(state: LineState, action: LineAction) {
  return applyLineAction(state, state.position.nextSeat, action);
}

function expectInventory(state: LineState) {
  for (const owner of [0, 1] as const) for (const [size, total] of [["large", 4], ["medium", 2], ["small", 1]] as const) {
    const placed = state.position.board.flat().filter(piece => piece.owner === owner && piece.size === size).length;
    expect(placed + state.position.hands[owner][size]).toBe(total);
  }
}

describe("Ooishi Line actions", () => {
  it("creates a playable empty 4×4 state with 16 large placements and no other moves", () => {
    const state = createLineState();
    expect(state).toMatchObject({ gameId: "ooishi-line", rulesVersion: "1.0", phase: "PLAYING", ply: 0, result: null });
    expect(state.history).toHaveLength(1);
    expect(legalLineActions(state)).toEqual(Array.from({ length: 16 }, (_, to) => ({ type: "PLACE", size: "large", to })));
    expect(createLineState(1).position.nextSeat).toBe(1);
    expectInventory(state);
  });

  it.each([0, 1] as const)("uses only size conditions on a destination owned by seat %i", owner => {
    const destinations = [[], [large(owner)], [large(owner), medium(owner)], [large(owner), medium(owner), small(owner)]];
    const expected = { large: [true, false, false, false], medium: [false, true, false, false], small: [false, false, true, false] };
    for (const size of ["large", "medium", "small"] as const) {
      expect(destinations.map(destination => canLandLineStone(size, destination))).toEqual(expected[size]);
    }
  });

  it("places one stone, consumes exactly one reserve and alternates the next player", () => {
    let state = createLineState();
    const before = structuredClone(state);
    state = act(state, { type: "PLACE", size: "large", to: 0 });
    expect(state.position.board[0]).toEqual([large(0)]);
    expect(state.position.hands).toEqual([{ large: 3, medium: 2, small: 1 }, { large: 4, medium: 2, small: 1 }]);
    expect(state.position.nextSeat).toBe(1);
    expect(state.ply).toBe(1);
    expect(state.history).toHaveLength(2);
    expect(before.position.board.flat()).toEqual([]);
    state = act(state, { type: "PLACE", size: "medium", to: 0 });
    state = act(state, { type: "PLACE", size: "small", to: 0 });
    expect(state.position.board[0]).toEqual([large(0), medium(1), small(0)]);
    expect(state.position.nextSeat).toBe(1);
    expectInventory(state);
  });

  it.each([
    { size: "medium" as const, stack: [] },
    { size: "small" as const, stack: [] },
    { size: "small" as const, stack: [large(1)] },
    { size: "large" as const, stack: [large(1)] },
    { size: "medium" as const, stack: [large(1), medium(1)] },
    { size: "small" as const, stack: [large(1), medium(1), small(1)] }
  ])("rejects invalid $size placement on $stack", ({ size, stack }) => {
    const state = fixture([[0, stack]]);
    const action = { type: "PLACE", size, to: 0 } as const;
    expect(isLegalLineAction(state, 0, action)).toBe(false);
    expect(() => applyLineAction(state, 0, action)).toThrow("配置・移動");
  });

  it("cannot place a reserve that is exhausted, while board movement remains available", () => {
    const state = fixture([[0, [large(0)]], [1, [large(0)]], [2, [large(0)]], [3, [large(0)]]]);
    expect(state.position.hands[0].large).toBe(0);
    expect(isLegalLineAction(state, 0, { type: "PLACE", size: "large", to: 15 })).toBe(false);
    expect(isLegalLineAction(state, 0, { type: "MOVE", from: 0, layer: 0, to: 15 })).toBe(true);
  });

  it("moves a single stone directly to a distant nonaligned cell", () => {
    const state = fixture([[0, [large(0)]], [5, [large(1)]]]);
    const next = act(state, { type: "MOVE", from: 0, layer: 0, to: 14 });
    expect(next.position.board[0]).toEqual([]);
    expect(next.position.board[14]).toEqual([large(0)]);
    expect(next.position.board[5]).toEqual([large(1)]);
    expect(next.position.hands).toEqual(state.position.hands);
    expectInventory(next);
  });

  it("moves the selected large stone and every mixed-owner layer above it", () => {
    const state = fixture([[0, [large(0), medium(1), small(0)]]]);
    const before = structuredClone(state);
    const next = act(state, { type: "MOVE", from: 0, layer: 0, to: 15 });
    expect(next.position.board[0]).toEqual([]);
    expect(next.position.board[15]).toEqual([large(0), medium(1), small(0)]);
    expect(next.position.hands).toEqual(state.position.hands);
    expect(state).toEqual(before);
    expectInventory(next);
  });

  it("moves a middle stone with an opposing top and leaves lower stones exposed", () => {
    const state = fixture([[0, [large(1), medium(0), small(1)]], [14, [large(1)]]]);
    const next = act(state, { type: "MOVE", from: 0, layer: 1, to: 14 });
    expect(next.position.board[0]).toEqual([large(1)]);
    expect(next.position.board[14]).toEqual([large(1), medium(0), small(1)]);
    expectInventory(next);
  });

  it("moves only the selected top small stone onto another medium", () => {
    const state = fixture([[0, [large(0), medium(1), small(0)]], [15, [large(1), medium(0)]]]);
    const next = act(state, { type: "MOVE", from: 0, layer: 2, to: 15 });
    expect(next.position.board[0]).toEqual([large(0), medium(1)]);
    expect(next.position.board[15]).toEqual([large(1), medium(0), small(0)]);
    expectInventory(next);
  });

  it("uses the moving group's bottom for landing, even when its top could fit", () => {
    const state = fixture([[0, [large(0), medium(1), small(0)]], [15, [large(1), medium(0)]]]);
    expect(isLegalLineAction(state, 0, { type: "MOVE", from: 0, layer: 0, to: 15 })).toBe(false);
    expect(isLegalLineAction(state, 0, { type: "MOVE", from: 0, layer: 2, to: 15 })).toBe(true);
    expect(isLegalLineAction(state, 0, { type: "MOVE", from: 0, layer: 1, to: 14 })).toBe(false);
    const middle = fixture([[0, [large(1), medium(0), small(1)]]]);
    expect(isLegalLineAction(middle, 0, { type: "MOVE", from: 0, layer: 1, to: 15 })).toBe(false);
  });

  it("rejects selection of an opposing layer, movement to itself, and the wrong actor", () => {
    const state = fixture([[0, [large(0), medium(1), small(0)]], [15, [large(1)]]]);
    for (const action of [
      { type: "MOVE", from: 0, layer: 1, to: 15 },
      { type: "MOVE", from: 0, layer: 0, to: 0 },
      { type: "MOVE", from: 1, layer: 0, to: 15 }
    ]) expect(isLegalLineAction(state, 0, action)).toBe(false);
    expect(() => applyLineAction(state, 1, { type: "PLACE", size: "large", to: 14 })).toThrow("手番");
  });

  it.each([null, [], { type: "PASS" }, { type: "PLACE", size: "huge", to: 0 },
    { type: "PLACE", size: "large", to: -1 }, { type: "PLACE", size: "large", to: 16 },
    { type: "PLACE", size: "large", to: 0.5 }, { type: "PLACE", size: "large", to: "0" },
    { type: "MOVE", from: 0, layer: -1, to: 15 }, { type: "MOVE", from: 0, layer: 0.5, to: 15 },
    { type: "MOVE", from: 16, layer: 0, to: 15 }, { type: "MOVE", from: 0, layer: 99, to: 15 }
  ])("rejects malformed actions %j", action => {
    const state = fixture([[0, [large(0)]]]);
    expect(isLegalLineAction(state, 0, action)).toBe(false);
    expect(() => applyLineAction(state, 0, action)).toThrow();
  });

  it.each([[0, 1, 2], [0, 4, 8]])("finishes a real placement with a horizontal/vertical line %j", (a, b, c) => {
    const state = fixture([[a, [large(0)]], [b, [large(1), medium(0)]], [c, [large(1), medium(1)]]]);
    const next = act(state, { type: "PLACE", size: "small", to: c });
    expect(next).toMatchObject({ phase: "FINISHED", result: { kind: "WIN", winner: 0 }, ply: 1 });
    expect(legalLineActions(next)).toEqual([]);
    expect(() => applyLineAction(next, 1, { type: "PLACE", size: "large", to: 15 })).toThrow("終了");
  });

  it("can award the opponent a win by exposing a buried stone", () => {
    const state = fixture([[0, [large(1), medium(0)]], [1, [large(0), medium(1)]],
      [2, [large(0), medium(1), small(1)]], [15, [large(1)]]]);
    const next = act(state, { type: "MOVE", from: 0, layer: 1, to: 15 });
    expect(next.result).toMatchObject({ kind: "WIN", winner: 1 });
  });

  it("draws when one move completes our destination line and exposes the opponent's source line", () => {
    const state = fixture([
      [0, [large(1), medium(0)]], [1, [large(0), medium(1)]], [2, [large(0), medium(0), small(1)]],
      [4, [large(0)]], [5, [large(1)]], [6, [large(1), medium(1), small(0)]]
    ]);
    const next = act(state, { type: "MOVE", from: 0, layer: 1, to: 5 });
    expect(next.phase).toBe("FINISHED");
    expect(next.result).toMatchObject({ kind: "DRAW", reason: "SIMULTANEOUS_LINES", lines: [{ owner: 1, cells: [0, 1, 2] }, { owner: 0, cells: [4, 5, 6] }] });
    expectInventory(next);
  });

  it("draws at the third identical position through different legal move sequences", () => {
    let state = act(createLineState(), { type: "PLACE", size: "large", to: 0 });
    state = act(state, { type: "PLACE", size: "large", to: 15 });
    for (const [from, to] of [[0, 1], [15, 14], [1, 0], [14, 15]]) state = act(state, { type: "MOVE", from: from!, layer: 0, to: to! });
    expect(state.phase).toBe("PLAYING");
    for (const [from, to] of [[0, 4], [15, 11], [4, 0], [11, 15]]) state = act(state, { type: "MOVE", from: from!, layer: 0, to: to! });
    expect(state).toMatchObject({ phase: "FINISHED", ply: 10, result: { kind: "DRAW", reason: "THREEFOLD_REPETITION" } });
    expect(state.history).toHaveLength(11);
    expectInventory(state);
  });

  it("preserves inventory and legal-action consistency through bounded seeded playouts", () => {
    for (let seed = 1; seed <= 8; seed++) {
      let random = seed, state = createLineState((seed % 2) as LineSeat);
      for (let turn = 0; turn < 80 && state.phase === "PLAYING"; turn++) {
        const actions = legalLineActions(state);
        expect(actions.length).toBeGreaterThan(0);
        expect(new Set(actions.map(action => JSON.stringify(action))).size).toBe(actions.length);
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        state = act(state, actions[random % actions.length]!);
        expectInventory(state);
        expect(state.position.board).toHaveLength(16);
        expect(state.position.board.every(stack => stack.length <= 3)).toBe(true);
      }
    }
  });
});
