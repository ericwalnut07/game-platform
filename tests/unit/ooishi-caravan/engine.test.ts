import { describe, expect, it, vi } from "vitest";
import {
  applyCaravanAction, canLandCaravanStone, CARAVAN_GOAL_POINT, createCaravanState,
  isLegalCaravanMove, legalCaravanActions, legalCaravanMoves,
  type CaravanSeat, type CaravanState, type CaravanStone, type CaravanStoneSize
} from "../../../src/games/ooishi-caravan/engine";

const stone = (owner: CaravanSeat, size: CaravanStoneSize): CaravanStone => ({ owner, size });
const L = (owner: CaravanSeat) => stone(owner, "large");
const M = (owner: CaravanSeat) => stone(owner, "medium");
const S = (owner: CaravanSeat) => stone(owner, "small");
const inventory = (owner: CaravanSeat) => [L(owner), L(owner), M(owner), M(owner), M(owner), S(owner), S(owner), S(owner)];
function fixture(cells: Record<number, CaravanStone[]>, values: readonly [number, number] = [1, 2], seat: CaravanSeat = 0): CaravanState {
  const board: CaravanStone[][] = Array.from({ length: 20 }, () => []);
  for (const [point, stack] of Object.entries(cells)) board[Number(point) - 1] = stack;
  return { ...createCaravanState(seat), phase: "MOVING", board,
    dice: [{ value: values[0], status: "AVAILABLE" }, { value: values[1], status: "AVAILABLE" }] };
}
const move = (state: CaravanState, from: number, layer = 0, die: 0 | 1 = 0) =>
  applyCaravanAction(state, state.currentSeat, { type: "MOVE", from, layer, die });
const diceRng = (...values: number[]) => ({ integer: vi.fn((_min: number, _max: number) => values.shift()!) });

describe("Caravan setup and dice", () => {
  it("sets the exact A/D/C/B mixed groups and eight stones per owner", () => {
    const state = createCaravanState();
    expect(state).toMatchObject({ gameId: "ooishi-caravan", rulesVersion: "1.0", phase: "AWAITING_ROLL", currentSeat: 0, turnNumber: 1, moveCount: 0, dice: null, goaled: [[], []], result: null });
    expect(state.board).toHaveLength(20);
    for (const [point, expected] of [
      [1, [L(0), M(1), S(0)]], [3, [M(0), S(1)]], [7, [M(0), S(0)]], [10, [L(0)]],
      [2, [L(1), M(0), S(1)]], [4, [M(1), S(0)]], [6, [M(1), S(1)]], [11, [L(1)]]
    ] as const) expect(state.board[point - 1]).toEqual(expected);
    expect(state.board.filter(stack => stack.length)).toHaveLength(8);
    for (const owner of [0, 1] as const) expect(state.board.flat().filter(s => s.owner === owner).map(s => s.size).sort()).toEqual(inventory(owner).map(s => s.size).sort());
  });
  it("assigns first-player groups to a selected starting seat without sharing board arrays", () => {
    const state = createCaravanState(1);
    expect(state.currentSeat).toBe(1); expect(state.board[0]).toEqual([L(1), M(0), S(1)]);
    expect(state.board[1]).toEqual([L(0), M(1), S(0)]);
    expect(createCaravanState().board).not.toBe(state.board);
    expect(() => createCaravanState(2 as never)).toThrow();
  });
  it("rolls exactly two injected d6, ignoring dice supplied by the caller", () => {
    const initial = createCaravanState(), rng = diceRng(2, 5);
    const state = applyCaravanAction(initial, 0, { type: "ROLL", dice: [6, 6] }, rng);
    expect(rng.integer.mock.calls).toEqual([[1, 6], [1, 6]]);
    expect(state.dice).toEqual([{ value: 2, status: "AVAILABLE" }, { value: 5, status: "AVAILABLE" }]);
    expect(initial.dice).toBeNull(); expect(initial.board).toEqual(state.board);
    expect(legalCaravanActions(initial)).toEqual([{ type: "ROLL" }]);
    expect(legalCaravanActions(initial, 1)).toEqual([]);
    expect(() => applyCaravanAction(state, 0, { type: "ROLL" }, rng)).toThrow("既に");
    expect(() => applyCaravanAction(initial, 1, { type: "ROLL" }, rng)).toThrow("手番");
    expect(rng.integer).toHaveBeenCalledTimes(2);
  });
  it.each([0, 7, 1.5, NaN])("rejects an invalid injected die: %s", value => {
    const state = createCaravanState();
    expect(() => applyCaravanAction(state, 0, { type: "ROLL" }, diceRng(1, value))).toThrow("出目");
    expect(state.dice).toBeNull();
  });
  it("requires a trusted random source and refuses moving before rolling", () => {
    const state = createCaravanState();
    expect(() => applyCaravanAction(state, 0, { type: "ROLL" })).toThrow("乱数源");
    expect(() => move(state, 10)).toThrow();
  });
  it("lets the second die be used first and the same stone use both dice", () => {
    const state = applyCaravanAction(createCaravanState(), 0, { type: "ROLL" }, diceRng(1, 2));
    const first = move(state, 10, 0, 1);
    expect(first.board[11]).toEqual([L(0)]); expect(first.currentSeat).toBe(0);
    expect(first.dice?.map(d => d.status)).toEqual(["AVAILABLE", "USED"]);
    const second = move(first, 12, 0, 0);
    expect(second.board[12]).toEqual([L(0)]); expect(second.board[9]).toEqual([]);
    expect(second.phase).toBe("AWAITING_ROLL"); expect(second.currentSeat).toBe(1);
    expect(second.turnNumber).toBe(2); expect(second.moveCount).toBe(2);
    expect(() => move(first, 12, 0, 1)).toThrow();
  });
  it("treats doubles as two uses, never four", () => {
    const state = applyCaravanAction(createCaravanState(), 0, { type: "ROLL" }, diceRng(4, 4));
    const first = move(state, 10, 0, 0), second = move(first, 14, 0, 1);
    expect(first.board[13]).toEqual([L(0)]); expect(second.board[17]).toEqual([L(0)]);
    expect(second.dice?.map(d => d.status)).toEqual(["USED", "USED"]);
    expect(second.currentSeat).toBe(1); expect(legalCaravanMoves(second)).toEqual([]);
  });
});

describe("Caravan landing and stack movement", () => {
  it.each([
    ["large", [], true], ["large", [L(0)], false], ["large", [M(1)], false], ["large", [S(0)], false],
    ["medium", [], true], ["medium", [L(0)], true], ["medium", [L(1)], true], ["medium", [M(1)], false], ["medium", [S(0)], false],
    ["small", [], true], ["small", [L(1)], true], ["small", [M(0)], true], ["small", [M(1)], true], ["small", [S(1)], false]
  ] as const)("lands %s on %j: %s", (size, destination, expected) => {
    expect(canLandCaravanStone(size, destination)).toBe(expected);
    const state = fixture({ 5: [stone(0, size)], 6: [...destination] });
    expect(isLegalCaravanMove(state, 0, { type: "MOVE", from: 5, layer: 0, die: 0 })).toBe(expected);
  });
  it("moves a single stone forward by the selected die, ignoring intermediate occupied points", () => {
    const state = fixture({ 5: [M(0)], 6: [S(1)], 7: [S(1)] }, [3, 6]);
    const before = structuredClone(state), next = move(state, 5);
    expect(next.board[4]).toEqual([]); expect(next.board[7]).toEqual([M(0)]);
    expect(next.board[5]).toEqual([S(1)]); expect(state).toEqual(before);
  });
  it("carries all upper stones including opponents and uses the bottom stone for landing", () => {
    const state = fixture({ 5: [L(0), M(1), S(0)], 6: [L(1)] }, [1, 2]);
    expect(isLegalCaravanMove(state, 0, { type: "MOVE", from: 5, layer: 0, die: 0 })).toBe(false);
    const next = move(state, 5, 0, 1);
    expect(next.board[6]).toEqual([L(0), M(1), S(0)]); expect(next.board[4]).toEqual([]);
  });
  it("lets a buried owner leave a mixed tower with every upper stone and exposes the lower stone", () => {
    const state = fixture({ 5: [L(1), M(0), S(1)], 6: [L(1)] });
    const next = move(state, 5, 1);
    expect(next.board[4]).toEqual([L(1)]); expect(next.board[5]).toEqual([L(1), M(0), S(1)]);
  });
  it("can detach the top stone and stack it directly on an opponent large stone", () => {
    const next = move(fixture({ 5: [L(0), M(1), S(0)], 6: [L(1)] }), 5, 2);
    expect(next.board[4]).toEqual([L(0), M(1)]); expect(next.board[5]).toEqual([L(1), S(0)]);
  });
  it.each([
    null, [], { type: "PASS" }, { type: "MOVE", from: 0, layer: 0, die: 0 },
    { type: "MOVE", from: 21, layer: 0, die: 0 }, { type: "MOVE", from: 5.5, layer: 0, die: 0 },
    { type: "MOVE", from: 5, layer: -1, die: 0 }, { type: "MOVE", from: 5, layer: 1.5, die: 0 },
    { type: "MOVE", from: 5, layer: 99, die: 0 }, { type: "MOVE", from: 5, layer: 0, die: 2 }
  ])("rejects malformed or unavailable moves: %j", action => {
    const state = fixture({ 5: [L(0)] });
    expect(isLegalCaravanMove(state, 0, action)).toBe(false);
    expect(() => applyCaravanAction(state, 0, action)).toThrow();
  });
  it("rejects choosing an enemy stone and an out-of-turn action", () => {
    const state = fixture({ 5: [L(1), M(0), S(1)] });
    expect(() => move(state, 5)).toThrow();
    expect(() => move(state, 5, 2)).toThrow();
    expect(() => applyCaravanAction(state, 1, { type: "MOVE", from: 5, layer: 0, die: 0 })).toThrow("手番");
    expect(legalCaravanMoves(state, 1)).toEqual([]);
  });
});

describe("Caravan passes and exact goal", () => {
  it("uses the only legal die, then passes the unusable remainder", () => {
    const state = fixture({ 19: [L(0)] }, [2, 6]);
    expect(legalCaravanMoves(state)).toEqual([{ type: "MOVE", from: 19, layer: 0, die: 0 }]);
    const next = move(state, 19);
    expect(next.goaled).toEqual([[L(0)], []]); expect(next.currentSeat).toBe(1);
    expect(next.dice?.map(d => d.status)).toEqual(["USED", "PASSED"]);
  });
  it("ends the turn automatically when neither die has a legal move", () => {
    const waiting = { ...fixture({ 20: [L(0)] }), phase: "AWAITING_ROLL" as const, dice: null };
    const next = applyCaravanAction(waiting, 0, { type: "ROLL" }, diceRng(2, 6));
    expect(next.phase).toBe("AWAITING_ROLL"); expect(next.currentSeat).toBe(1);
    expect(next.moveCount).toBe(0); expect(next.dice?.map(d => d.status)).toEqual(["PASSED", "PASSED"]);
    expect(next.board).toEqual(waiting.board);
  });
  it("retains a blocked die when the other die can open its landing point", () => {
    const unlocking = fixture({ 14: [L(0)], 20: [S(0)] }, [1, 6]);
    expect(legalCaravanMoves(unlocking).filter(m => m.die === 1)).toEqual([]);
    const afterFirst = move(unlocking, 20, 0, 0);
    expect(afterFirst.phase).toBe("MOVING"); expect(afterFirst.currentSeat).toBe(0);
    expect(afterFirst.dice?.[1].status).toBe("AVAILABLE");
    expect(legalCaravanMoves(afterFirst)).toEqual([{ type: "MOVE", from: 14, layer: 0, die: 1 }]);
    expect(move(afterFirst, 14, 0, 1).board[19]).toEqual([L(0)]);
  });
  it("treats 20 as a normal point and goals only at 21", () => {
    expect(CARAVAN_GOAL_POINT).toBe(21);
    const next = move(fixture({ 19: [S(0)] }, [1, 1]), 19);
    expect(next.board[19]).toEqual([S(0)]); expect(next.goaled).toEqual([[], []]);
    const finish = move(next, 20, 0, 1);
    expect(finish.board[19]).toEqual([]); expect(finish.goaled).toEqual([[S(0)], []]);
  });
  it("rejects overshoot and derives the destination instead of trusting a supplied one", () => {
    const state = fixture({ 20: [L(0)] }, [2, 1]);
    expect(() => move(state, 20, 0, 0)).toThrow();
    const next = applyCaravanAction(state, 0, { type: "MOVE", from: 20, layer: 0, die: 1, to: 1 });
    expect(next.goaled[0]).toEqual([L(0)]); expect(next.board[0]).toEqual([]);
  });
  it("credits every carried stone to its owner at the goal, leaving lower stones behind", () => {
    const next = move(fixture({ 20: [L(1), M(0), S(1)] }), 20, 1);
    expect(next.board[19]).toEqual([L(1)]); expect(next.goaled).toEqual([[M(0)], [S(1)]]);
  });
  it.each([0, 1] as const)("ends immediately when seat %s's eighth stone goals, including enemy transport", owner => {
    const state = fixture({ 20: [M(0), S(1)] }, [1, 6]);
    const reserve = inventory(owner); reserve.splice(reserve.findIndex(p => p.size === (owner === 0 ? "medium" : "small")), 1);
    const goaled: [CaravanStone[], CaravanStone[]] = [[], []]; goaled[owner] = reserve;
    const next = move({ ...state, goaled }, 20);
    expect(next.phase).toBe("FINISHED"); expect(next.result).toEqual({ kind: "WIN", winner: owner });
    expect(next.goaled[owner]).toHaveLength(8); expect(legalCaravanActions(next)).toEqual([]);
    expect(() => applyCaravanAction(next, 0, { type: "ROLL" }, diceRng(1, 1))).toThrow("終了");
    expect(() => move(next, 20)).toThrow("終了");
  });
  it("draws when both owners' eighth stones are carried to goal by the same move", () => {
    const a = inventory(0), b = inventory(1); a.splice(2, 1); b.splice(5, 1);
    const state = { ...fixture({ 20: [M(0), S(1)] }), goaled: [a, b] as const };
    const next = move(state, 20);
    expect(next.result).toEqual({ kind: "DRAW", reason: "SIMULTANEOUS_GOALS" });
    expect(next.phase).toBe("FINISHED"); expect(next.goaled.map(stones => stones.length)).toEqual([8, 8]);
  });
});
