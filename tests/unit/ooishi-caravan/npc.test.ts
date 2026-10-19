import { describe, expect, it } from "vitest";
import { applyCaravanAction, createCaravanState, legalCaravanActions, legalCaravanMoves, type CaravanSeat, type CaravanState, type CaravanStone, type CaravanStoneSize } from "../../../src/games/ooishi-caravan/engine";
import { analyzeCaravanNpc, caravanNpcFeatures, CARAVAN_NPC_TUNING, chooseCaravanNpcAction, evaluateCaravanNpcState } from "../../../src/games/ooishi-caravan/npc";

const stone = (owner: CaravanSeat, size: CaravanStoneSize): CaravanStone => ({ owner, size });
const L = (owner: CaravanSeat) => stone(owner, "large"), M = (owner: CaravanSeat) => stone(owner, "medium"), S = (owner: CaravanSeat) => stone(owner, "small");
const inventory = (owner: CaravanSeat) => [L(owner), L(owner), M(owner), M(owner), M(owner), S(owner), S(owner), S(owner)];
function fixture(cells: Record<number, CaravanStone[]>, dice: readonly [number, number] = [1, 2]): CaravanState {
  const board: CaravanStone[][] = Array.from({ length: 20 }, () => []);
  for (const [point, stack] of Object.entries(cells)) board[Number(point) - 1] = stack;
  return { ...createCaravanState(), phase: "MOVING", board, dice: [{ value: dice[0], status: "AVAILABLE" }, { value: dice[1], status: "AVAILABLE" }] };
}
function executePlan(state: CaravanState) {
  const analysis = analyzeCaravanNpc(state), actor = state.currentSeat;
  let next = state;
  for (const move of analysis.sequence) {
    expect(legalCaravanActions(next, actor)).toContainEqual(move);
    next = applyCaravanAction(next, actor, move);
  }
  return { analysis, next };
}

describe("Caravan standard NPC", () => {
  it("requests a roll without choosing dice and leaves the input immutable", () => {
    const state = createCaravanState(), before = structuredClone(state);
    expect(analyzeCaravanNpc(state)).toMatchObject({ action: { type: "ROLL" }, sequence: [], diagnostics: { rootMoves: 0, simulatedMoves: 0 } });
    expect(state).toEqual(before);
  });
  it("returns no action outside its turn or after a terminal result", () => {
    expect(chooseCaravanNpcAction(createCaravanState(), 1)).toBeNull();
    const win: CaravanState = { ...createCaravanState(), phase: "FINISHED", result: { kind: "WIN", winner: 0 } };
    expect(chooseCaravanNpcAction(win)).toBeNull();
    expect(evaluateCaravanNpcState(win, 0)).toBe(CARAVAN_NPC_TUNING.terminal);
    expect(evaluateCaravanNpcState(win, 1)).toBe(-CARAVAN_NPC_TUNING.terminal);
  });
  it("takes an immediate eighth-stone goal", () => {
    const own = inventory(0); own.pop();
    const state: CaravanState = { ...fixture({ 20: [S(0)] }, [1, 6]), goaled: [own, []] };
    const { analysis, next } = executePlan(state);
    expect(analysis.action).toEqual({ type: "MOVE", from: 20, layer: 0, die: 0 });
    expect(next.result).toEqual({ kind: "WIN", winner: 0 }); expect(analysis.sequence).toHaveLength(1);
  });
  it("avoids transporting the opponent's eighth stone to a winning goal when a safe turn exists", () => {
    const enemy = inventory(1); enemy.pop();
    const state: CaravanState = { ...fixture({ 20: [L(0), S(1)], 10: [M(0)] }, [1, 2]), goaled: [[], enemy] };
    const { analysis, next } = executePlan(state);
    expect(analysis.action).toMatchObject({ type: "MOVE", from: 10 });
    expect(next.result).toBeNull(); expect(next.goaled[1]).toHaveLength(7);
    expect(next.board[19]).toEqual([L(0), S(1)]);
  });
  it("recognizes a simultaneous mixed-stack goal as a draw", () => {
    const own = inventory(0), enemy = inventory(1); own.splice(2, 1); enemy.pop();
    const state: CaravanState = { ...fixture({ 20: [M(0), S(1)] }, [1, 6]), goaled: [own, enemy] };
    const { analysis, next } = executePlan(state);
    expect(analysis.score).toBe(0); expect(next.result).toEqual({ kind: "DRAW", reason: "SIMULTANEOUS_GOALS" });
  });
  it("evaluates the second move rather than greedily taking the best immediate board", () => {
    const state = fixture({ 14: [L(0)], 20: [S(0)] }, [1, 6]);
    const greedy = [...legalCaravanMoves(state)].sort((a, b) => evaluateCaravanNpcState(applyCaravanAction(state, 0, b), 0) - evaluateCaravanNpcState(applyCaravanAction(state, 0, a), 0))[0]!;
    expect(greedy.from).toBe(20); // Immediate small-stone goal, leaving the large stone on 20 after the six.
    const { analysis, next } = executePlan(state);
    expect(analysis.sequence).toEqual([{ type: "MOVE", from: 14, layer: 0, die: 0 }, { type: "MOVE", from: 15, layer: 0, die: 1 }]);
    const greedyFirst = applyCaravanAction(state, 0, greedy);
    const greedyEnd = applyCaravanAction(greedyFirst, 0, { type: "MOVE", from: 14, layer: 0, die: 1 });
    expect(analysis.score).toBeGreaterThan(evaluateCaravanNpcState(greedyEnd, 0));
    expect(next.goaled[0]).toEqual([L(0)]); expect(next.board[19]).toEqual([S(0)]);
  });
  it("uses die slot one before zero and re-evaluates the remaining legal move", () => {
    const state = fixture({ 14: [L(0)], 20: [S(0)] }, [6, 1]);
    expect(legalCaravanMoves(state).every(move => move.die === 1)).toBe(true);
    const analysis = analyzeCaravanNpc(state);
    expect(analysis.sequence.map(move => move.die)).toEqual([1, 0]);
    const afterFirst = applyCaravanAction(state, 0, analysis.sequence[0]!);
    expect(chooseCaravanNpcAction(afterFirst)).toEqual(analysis.sequence[1]);
    expect(legalCaravanMoves(afterFirst)).toContainEqual(analysis.sequence[1]);
  });
  it("keeps an efficient mixed tower together when its own two stones can advance", () => {
    const state = fixture({ 10: [L(0), M(1), S(0)] }, [2, 2]);
    const { analysis, next } = executePlan(state);
    expect(analysis.sequence).toHaveLength(2);
    expect(analysis.sequence[0]).toMatchObject({ from: 10, layer: 0 });
    expect(next.board[13]).toEqual([L(0), M(1), S(0)]);
  });
  it("moves a buried owned stone off an enemy tower using Core ownership and landing rules", () => {
    const state = fixture({ 10: [L(1), M(0), S(1)] }, [2, 2]);
    const { analysis, next } = executePlan(state);
    expect(analysis.action).toMatchObject({ type: "MOVE", from: 10, layer: 1 });
    expect(next.board[9]).toEqual([L(1)]); expect(next.board[13]).toEqual([M(0), S(1)]);
  });
  it("uses only two moves for doubles and leaves the original snapshot intact", () => {
    const state = applyCaravanAction(createCaravanState(), 0, { type: "ROLL" }, { integer: () => 3 });
    const before = structuredClone(state), first = analyzeCaravanNpc(state), second = analyzeCaravanNpc(state);
    expect(first).toEqual(second); expect(first.sequence).toHaveLength(2);
    expect(first.diagnostics.maxDepth).toBe(2); expect(first.diagnostics.rootMoves).toBeLessThanOrEqual(16);
    expect(first.diagnostics.simulatedMoves).toBeLessThanOrEqual(144); expect(state).toEqual(before);
    executePlan(state);
  });
  it("plans only the usable die and lets the Core pass the overshooting remainder", () => {
    const state = fixture({ 19: [S(0)] }, [2, 6]);
    const { analysis, next } = executePlan(state);
    expect(analysis.sequence).toEqual([{ type: "MOVE", from: 19, layer: 0, die: 0 }]);
    expect(next.phase).toBe("AWAITING_ROLL"); expect(next.currentSeat).toBe(1);
    expect(next.dice?.map(die => die.status)).toEqual(["USED", "PASSED"]);
  });
  it("does not invent a pass or a move when both rolled dice are unusable", () => {
    const waiting: CaravanState = { ...fixture({ 20: [S(0)] }), phase: "AWAITING_ROLL", dice: null };
    const action = chooseCaravanNpcAction(waiting, 0)!;
    const passed = applyCaravanAction(waiting, 0, action, { integer: () => 6 });
    expect(passed.currentSeat).toBe(1); expect(passed.dice?.map(die => die.status)).toEqual(["PASSED", "PASSED"]);
    expect(chooseCaravanNpcAction(passed, 0)).toBeNull();
  });
  it("evaluates transport, cargo risk, free rides, merging, large-stone blocking and exact-goal faces", () => {
    const mixed = caravanNpcFeatures(fixture({ 10: [L(0), M(1), S(0)], 8: [S(0)], 9: [L(0)] }), 0);
    expect(mixed.transportPairs).toBeGreaterThan(0); expect(mixed.cargoRisk).toBeGreaterThan(0); expect(mixed.freeRide).toBeGreaterThan(0); expect(mixed.mergeOptions).toBeGreaterThan(0);
    const clear = caravanNpcFeatures(fixture({ 12: [L(1)], 1: [S(0)] }), 1);
    const blocked = caravanNpcFeatures(fixture({ 12: [L(1)], 14: [S(0)] }), 1);
    expect(blocked.blockedLarge).toBeGreaterThan(clear.blockedLarge); expect(blocked.mobility).toBeLessThan(clear.mobility);
    const near = caravanNpcFeatures(fixture({ 18: [S(0)], 20: [L(0)] }), 0);
    expect(near.goalFaces).toBe(2); expect(near.goalOptions).toBeGreaterThan(0);
  });
  it("uses symmetric opponent-relative evaluation and keeps tuning separate from the Core", () => {
    const state = fixture({ 5: [L(0), M(1)], 16: [S(1)] });
    expect(evaluateCaravanNpcState(state, 0)).toBeCloseTo(-evaluateCaravanNpcState(state, 1), 10);
    expect(Object.isFrozen(CARAVAN_NPC_TUNING)).toBe(true);
  });
});
