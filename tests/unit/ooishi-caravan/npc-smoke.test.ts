import { afterAll, describe, expect, it } from "vitest";
import { applyCaravanAction, createCaravanState, legalCaravanActions, type CaravanSeat, type CaravanState } from "../../../src/games/ooishi-caravan/engine";
import { analyzeCaravanNpc } from "../../../src/games/ooishi-caravan/npc";

const reports: { seed: number; first: CaravanSeat; moves: number; rolls: number; passes: number; result: unknown }[] = [];
const timings: number[] = [];
function rng(seed: number) {
  let value = seed;
  return { integer(min: number, max: number) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return min + Math.floor(value / 4294967296 * (max - min + 1));
  } };
}
function audit(state: CaravanState) {
  const all = [...state.board.flat(), ...state.goaled.flat()];
  expect(all).toHaveLength(16);
  for (const owner of [0, 1] as const) {
    expect(all.filter(stone => stone.owner === owner && stone.size === "large")).toHaveLength(2);
    expect(all.filter(stone => stone.owner === owner && stone.size === "medium")).toHaveLength(3);
    expect(all.filter(stone => stone.owner === owner && stone.size === "small")).toHaveLength(3);
    expect(state.goaled[owner].every(stone => stone.owner === owner)).toBe(true);
  }
  const rank = { large: 3, medium: 2, small: 1 };
  for (const stack of state.board) for (let layer = 1; layer < stack.length; layer++) expect(rank[stack[layer - 1]!.size]).toBeGreaterThan(rank[stack[layer]!.size]);
}

describe("Caravan NPC short self-play simulation", () => {
  it.each([{ seed: 41, first: 0 }, { seed: 41, first: 1 }, { seed: 97, first: 0 }, { seed: 97, first: 1 }] as const)("finishes seed $seed, first seat $first without illegal moves or repeated dice", ({ seed, first }) => {
    const random = rng(seed), usedDice = new Map<number, Set<number>>();
    let state = createCaravanState(first), steps = 0, rolls = 0, passes = 0;
    while (state.phase !== "FINISHED" && steps++ < 2000) {
      const start = performance.now(), analysis = analyzeCaravanNpc(state);
      timings.push(performance.now() - start);
      expect(analysis.action).not.toBeNull();
      expect(legalCaravanActions(state)).toContainEqual(analysis.action);
      expect(analysis.diagnostics.maxDepth).toBeLessThanOrEqual(2);
      expect(analysis.diagnostics.simulatedMoves).toBeLessThanOrEqual(144);
      const action = analysis.action!;
      if (action.type === "ROLL") rolls++;
      else {
        const used = usedDice.get(state.turnNumber) ?? new Set<number>();
        expect(used.has(action.die)).toBe(false); used.add(action.die); usedDice.set(state.turnNumber, used);
      }
      const before = state;
      state = applyCaravanAction(state, state.currentSeat, action, random);
      if (state.turnNumber !== before.turnNumber) passes += state.dice!.filter(die => die.status === "PASSED").length;
      audit(state);
    }
    expect(state.phase).toBe("FINISHED");
    expect(state.moveCount).toBeLessThanOrEqual(266);
    const completed = state.goaled.map(stones => stones.length === 8);
    expect(completed.some(Boolean)).toBe(true);
    expect(state.result).toEqual(completed.every(Boolean) ? { kind: "DRAW", reason: "SIMULTANEOUS_GOALS" } : { kind: "WIN", winner: completed[0] ? 0 : 1 });
    reports.push({ seed, first, moves: state.moveCount, rolls, passes, result: state.result });
  });
});

afterAll(() => {
  const sorted = [...timings].sort((a, b) => a - b);
  console.log(JSON.stringify({ gameId: "ooishi-caravan", mode: "standard-npc-self-play", games: reports.length,
    moves: reports.reduce((sum, game) => sum + game.moves, 0), decisions: timings.length,
    timingMs: { mean: timings.reduce((sum, value) => sum + value, 0) / timings.length, p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) }, reports }));
});
