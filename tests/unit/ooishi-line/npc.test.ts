import { describe, expect, it } from "vitest";
import { applyLineAction, createLineState, isLegalLineAction, legalLineActions, type LineState } from "../../../src/games/ooishi-line/engine";
import { analyzeLineNpc, chooseLineNpcAction, LINE_NPC_TUNING } from "../../../src/games/ooishi-line/npc";
import { createLineHistory, type LinePosition, type LineSeat, type LineStone, type LineStoneSize } from "../../../src/games/ooishi-line/position";

const stone = (owner: LineSeat, size: LineStoneSize): LineStone => ({ owner, size });
const large = (owner: LineSeat) => stone(owner, "large");
const medium = (owner: LineSeat) => stone(owner, "medium");
const small = (owner: LineSeat) => stone(owner, "small");
const rng = { integer: (min: number) => min };
function fixture(stacks: readonly [number, LineStone[]][], nextSeat: LineSeat = 0): LineState {
  const state = createLineState(nextSeat);
  const board: LineStone[][] = Array.from({ length: 16 }, () => []);
  const hands: [Record<LineStoneSize, number>, Record<LineStoneSize, number>] = [{ ...state.position.hands[0] }, { ...state.position.hands[1] }];
  for (const [cell, pieces] of stacks) { board[cell] = pieces; for (const piece of pieces) hands[piece.owner][piece.size]--; }
  for (const hand of hands) expect(Object.values(hand).every(count => count >= 0)).toBe(true);
  const position: LinePosition = { board, hands, nextSeat };
  return { ...state, position, history: createLineHistory(position) };
}
function immediateWins(state: LineState, seat: LineSeat) {
  return legalLineActions(state).filter(action => {
    const next = applyLineAction(state, state.position.nextSeat, action);
    return next.result?.kind === "WIN" && next.result.winner === seat;
  });
}

describe("Ooishi Line standard NPC", () => {
  it.each([0, 1] as const)("never misses an immediate winning placement for seat %i", seat => {
    const enemy = seat === 0 ? 1 : 0;
    const state = fixture([[0, [large(seat)]], [1, [large(enemy), medium(seat)]], [2, [large(enemy), medium(enemy)]]], seat);
    const before = structuredClone(state);
    const analysis = analyzeLineNpc(state, rng);
    expect(analysis.diagnostics.immediateWins).toBeGreaterThan(0);
    expect(isLegalLineAction(state, seat, analysis.action)).toBe(true);
    expect(applyLineAction(state, seat, analysis.action).result).toMatchObject({ kind: "WIN", winner: seat });
    expect(state).toEqual(before);
  });

  it("finds an immediate winning board move when the small reserve is exhausted", () => {
    const state = fixture([[0, [large(0)]], [1, [large(1), medium(0)]], [2, [large(1), medium(1)]], [15, [large(0), medium(0), small(0)]]]);
    const action = chooseLineNpcAction(state, rng)!;
    expect(action.type).toBe("MOVE");
    expect(applyLineAction(state, 0, action).result).toMatchObject({ kind: "WIN", winner: 0 });
  });

  it("blocks every immediate winning reply when a defence exists", () => {
    const state = fixture([[0, [large(1)]], [1, [large(0), medium(1)]], [2, [large(0), medium(0)]]]);
    const analysis = analyzeLineNpc(state, rng);
    expect(analysis.diagnostics.unsafeActions).toBeGreaterThan(0);
    expect(analysis.action).not.toBeNull();
    const after = applyLineAction(state, 0, analysis.action);
    expect(after.result?.kind === "WIN" && after.result.winner === 1).not.toBe(true);
    expect(immediateWins(after, 1)).toEqual([]);
  });

  it("keeps an immediate defence even under a tiny search budget", () => {
    const state = fixture([[0, [large(1)]], [1, [large(0), medium(1)]], [2, [large(0), medium(0)]]]);
    const analysis = analyzeLineNpc(state, rng, { maxNodes: 1, rootWidth: 1 });
    expect(analysis.diagnostics.searchedNodes).toBeLessThanOrEqual(1);
    expect(immediateWins(applyLineAction(state, 0, analysis.action), 1)).toEqual([]);
  });

  it("avoids handing the opponent a line by exposing a buried large stone", () => {
    const state = fixture([[0, [large(1), medium(0)]], [1, [large(0), medium(1)]], [2, [large(0), medium(1), small(1)]], [15, [large(1)]]]);
    expect(applyLineAction(state, 0, { type: "MOVE", from: 0, layer: 1, to: 15 }).result).toMatchObject({ kind: "WIN", winner: 1 });
    const after = applyLineAction(state, 0, chooseLineNpcAction(state, rng));
    expect(after.result?.kind === "WIN" && after.result.winner === 1).not.toBe(true);
    expect(immediateWins(after, 1)).toEqual([]);
  });

  it("bounds search work and candidate counts while selecting a legal opening", () => {
    const state = createLineState();
    const analysis = analyzeLineNpc(state, rng, { maxNodes: 80 });
    expect(isLegalLineAction(state, 0, analysis.action)).toBe(true);
    expect(analysis.diagnostics.rootCandidates).toBeLessThanOrEqual(LINE_NPC_TUNING.rootWidth);
    expect(analysis.diagnostics.searchedNodes).toBeLessThanOrEqual(80);
    expect(analysis.diagnostics.tacticalNodes).toBeGreaterThan(0);
  });

  it("never searches or chooses another move after a genuine threefold draw", () => {
    let state = applyLineAction(createLineState(), 0, { type: "PLACE", size: "large", to: 0 });
    state = applyLineAction(state, 1, { type: "PLACE", size: "large", to: 15 });
    for (let repeat = 0; repeat < 2; repeat++) for (const [from, to] of [[0, 1], [15, 14], [1, 0], [14, 15]]) {
      state = applyLineAction(state, state.position.nextSeat, { type: "MOVE", from, layer: 0, to });
    }
    expect(state.result).toEqual({ kind: "DRAW", reason: "THREEFOLD_REPETITION" });
    expect(chooseLineNpcAction(state, rng)).toBeNull();
    expect(analyzeLineNpc(state, rng)).toMatchObject({ score: 0, diagnostics: { legalActions: 0, searchedNodes: 0 } });
  });

  it("rejects unbounded or invalid search settings", () => {
    for (const limits of [{ depth: Infinity }, { depth: 0 }, { maxNodes: -1 }, { beamWidth: 1.5 }]) {
      expect(() => analyzeLineNpc(createLineState(), rng, limits)).toThrow("探索設定");
    }
  });
});
