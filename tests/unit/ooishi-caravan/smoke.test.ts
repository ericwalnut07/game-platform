import { describe, expect, it } from "vitest";
import { applyCaravanAction, createCaravanState, legalCaravanActions, type CaravanSeat, type CaravanState } from "../../../src/games/ooishi-caravan/engine";

function random(seed: number) {
  let value = seed >>> 0;
  return { integer(min: number, max: number) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return min + Math.floor(value / 4294967296 * (max - min + 1));
  } };
}
const distanceToGoal = (state: CaravanState) => state.board.reduce((total, stack, index) => total + stack.length * (20 - index), 0);
function audit(state: CaravanState) {
  const all = [...state.board.flat(), ...state.goaled.flat()];
  expect(all).toHaveLength(16);
  for (const owner of [0, 1] as const) {
    const own = all.filter(stone => stone.owner === owner);
    expect(own.filter(stone => stone.size === "large")).toHaveLength(2);
    expect(own.filter(stone => stone.size === "medium")).toHaveLength(3);
    expect(own.filter(stone => stone.size === "small")).toHaveLength(3);
    expect(state.goaled[owner].every(stone => stone.owner === owner)).toBe(true);
  }
  const rank = { large: 3, medium: 2, small: 1 };
  for (const stack of state.board) for (let layer = 1; layer < stack.length; layer++) expect(rank[stack[layer - 1]!.size]).toBeGreaterThan(rank[stack[layer]!.size]);
  const completed = state.goaled.map(stones => stones.length === 8);
  expect(state.phase === "FINISHED").toBe(completed.some(Boolean));
  if (completed.every(Boolean)) expect(state.result).toEqual({ kind: "DRAW", reason: "SIMULTANEOUS_GOALS" });
  else if (completed.some(Boolean)) expect(state.result).toEqual({ kind: "WIN", winner: completed[0] ? 0 : 1 });
  else expect(state.result).toBeNull();
}

describe("Caravan Core short seeded smoke (random legal play, no NPC)", () => {
  it.each(Array.from({ length: 12 }, (_, index) => ({ seed: index + 1, first: (index % 2) as CaravanSeat })))("finishes seed $seed with starting seat $first, preserving all stones and dice", ({ seed, first }) => {
    const rng = random(seed), perTurnDice = new Map<number, Set<number>>();
    let state = createCaravanState(first), steps = 0;
    audit(state);
    while (state.phase !== "FINISHED" && steps++ < 2000) {
      const actions = legalCaravanActions(state);
      expect(actions.length).toBeGreaterThan(0);
      const action = actions[rng.integer(0, actions.length - 1)]!;
      const before = state;
      if (action.type === "MOVE") {
        const moving = before.board[action.from - 1]!.slice(action.layer), die = before.dice![action.die];
        expect(moving[0]!.owner).toBe(before.currentSeat); expect(die.status).toBe("AVAILABLE");
        const used = perTurnDice.get(before.turnNumber) ?? new Set<number>();
        expect(used.has(action.die)).toBe(false); used.add(action.die); perTurnDice.set(before.turnNumber, used);
        const to = action.from + die.value;
        expect(to).toBeLessThanOrEqual(21);
        if (to < 21) {
          const top = before.board[to - 1]!.at(-1), bottom = moving[0]!.size;
          expect(!top || (bottom === "medium" && top.size === "large") || (bottom === "small" && ["large", "medium"].includes(top.size))).toBe(true);
        }
        state = applyCaravanAction(before, before.currentSeat, action);
        expect(distanceToGoal(state)).toBe(distanceToGoal(before) - moving.length * die.value);
      } else {
        state = applyCaravanAction(before, before.currentSeat, action, rng);
        expect(distanceToGoal(state)).toBe(distanceToGoal(before));
      }
      audit(state);
    }
    expect(state.phase).toBe("FINISHED"); expect(state.moveCount).toBeLessThanOrEqual(266);
    expect(legalCaravanActions(state)).toEqual([]);
  });
});
