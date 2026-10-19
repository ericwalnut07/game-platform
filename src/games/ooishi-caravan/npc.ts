import {
  applyCaravanAction, CARAVAN_GOAL_POINT, legalCaravanMoves,
  type CaravanAction, type CaravanMove, type CaravanSeat, type CaravanState
} from "./engine";

/** Strategy parameters, not game rules. One standard NPC, with complete current-turn search. */
export const CARAVAN_NPC_TUNING = Object.freeze({
  goaled: 18, progress: 0.8, tailDistance: -0.6,
  transportPairs: 1.2, cargoRisk: -0.8, freeRide: 0.5,
  mobility: 0.4, mergeOptions: 0.5, goalOptions: 3, goalFaces: 0.8,
  blockedLarge: 0.7,
  terminal: 1_000_000
});

export interface CaravanNpcFeatures {
  goaled: number;
  progress: number;
  tailDistance: number;
  transportPairs: number;
  cargoRisk: number;
  freeRide: number;
  mobility: number;
  mergeOptions: number;
  goalOptions: number;
  goalFaces: number;
  blockedLarge: number;
}

/** Evaluate legal options for each possible next d6 face, without rolling the live dice. */
export function caravanNpcFeatures(state: CaravanState, seat: CaravanSeat): CaravanNpcFeatures {
  const result: CaravanNpcFeatures = {
    goaled: state.goaled[seat].length, progress: state.goaled[seat].length * CARAVAN_GOAL_POINT,
    tailDistance: 0, transportPairs: 0, cargoRisk: 0, freeRide: 0,
    mobility: 0, mergeOptions: 0, goalOptions: 0, goalFaces: 0, blockedLarge: 0
  };
  let ownLarge = 0, largeMoves = 0;
  state.board.forEach((stack, index) => stack.forEach((stone, layer) => {
    if (stone.owner !== seat) return;
    const point = index + 1;
    result.progress += point;
    result.tailDistance = Math.max(result.tailDistance, CARAVAN_GOAL_POINT - point);
    if (stone.size === "large") ownLarge++;
    for (const upper of stack.slice(layer + 1)) {
      if (upper.owner === seat) result.transportPairs++;
      else result.cargoRisk += 0.5 + point / CARAVAN_GOAL_POINT;
    }
    result.freeRide += stack.slice(0, layer).filter(lower => lower.owner !== seat).length;
  }));
  // These are hypothetical future single-die turns; the real state is never mutated.
  for (let face = 1; face <= 6; face++) {
    const future: CaravanState = { ...state, phase: "MOVING", currentSeat: seat,
      dice: [{ value: face, status: "AVAILABLE" }, { value: face, status: "USED" }] };
    const moves = legalCaravanMoves(future);
    result.mobility += moves.length / 6;
    let canGoal = false;
    for (const move of moves) {
      const stack = state.board[move.from - 1]!, to = move.from + face;
      if (stack[move.layer]!.size === "large") largeMoves++;
      if (to === CARAVAN_GOAL_POINT) {
        canGoal = true;
        result.goalOptions += stack.slice(move.layer).filter(stone => stone.owner === seat).length / 6;
      } else if (state.board[to - 1]!.some(stone => stone.owner === seat)) result.mergeOptions += 1 / 6;
    }
    if (canGoal) result.goalFaces++;
  }
  // Includes blocked/overshooting faces: fewer safe landing options for large stones.
  result.blockedLarge = ownLarge - largeMoves / 6;
  return result;
}

export function evaluateCaravanNpcState(state: CaravanState, seat: CaravanSeat): number {
  if (state.result) return state.result.kind === "DRAW" ? 0 : state.result.winner === seat
    ? CARAVAN_NPC_TUNING.terminal : -CARAVAN_NPC_TUNING.terminal;
  const own = caravanNpcFeatures(state, seat), enemy = caravanNpcFeatures(state, seat === 0 ? 1 : 0);
  let score = 0;
  for (const key of ["goaled", "progress", "tailDistance", "transportPairs", "cargoRisk", "freeRide", "mobility", "mergeOptions", "goalOptions", "goalFaces"] as const) {
    score += (own[key] - enemy[key]) * CARAVAN_NPC_TUNING[key];
  }
  score += (enemy.blockedLarge - own.blockedLarge) * CARAVAN_NPC_TUNING.blockedLarge;
  return score;
}

export interface CaravanNpcAnalysis {
  action: CaravanAction | null;
  /** Planned moves for the already-rolled turn only; recomputed after each accepted move. */
  sequence: readonly CaravanMove[];
  score: number;
  diagnostics: { rootMoves: number; simulatedMoves: number; evaluatedLeaves: number; cacheHits: number; maxDepth: number };
}

export function analyzeCaravanNpc(state: CaravanState, seat: CaravanSeat = state.currentSeat): CaravanNpcAnalysis {
  const diagnostics = { rootMoves: 0, simulatedMoves: 0, evaluatedLeaves: 0, cacheHits: 0, maxDepth: 0 };
  if (state.phase === "FINISHED" || state.currentSeat !== seat) return { action: null, sequence: [], score: evaluateCaravanNpcState(state, seat), diagnostics };
  if (state.phase === "AWAITING_ROLL") return { action: { type: "ROLL" }, sequence: [], score: evaluateCaravanNpcState(state, seat), diagnostics };

  const cache = new Map<string, number>();
  function evaluate(end: CaravanState) {
    // Same position reached by different die orders has the same static value.
    const key = JSON.stringify([end.board, end.goaled, end.result]);
    const cached = cache.get(key);
    if (cached !== undefined) { diagnostics.cacheHits++; return cached; }
    diagnostics.evaluatedLeaves++;
    const score = evaluateCaravanNpcState(end, seat); cache.set(key, score); return score;
  }
  function search(current: CaravanState, path: readonly CaravanMove[]): { score: number; sequence: readonly CaravanMove[] } {
    diagnostics.maxDepth = Math.max(diagnostics.maxDepth, path.length);
    if (current.phase !== "MOVING" || current.currentSeat !== seat) return { score: evaluate(current), sequence: path };
    const moves = legalCaravanMoves(current);
    if (!moves.length) return { score: evaluate(current), sequence: path };
    let best: { score: number; sequence: readonly CaravanMove[] } | null = null;
    for (const move of moves) {
      diagnostics.simulatedMoves++;
      const next = applyCaravanAction(current, seat, move);
      const candidate = search(next, [...path, move]);
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best!;
  }
  diagnostics.rootMoves = legalCaravanMoves(state).length;
  const best = search(state, []);
  return { action: best.sequence[0] ?? null, sequence: best.sequence, score: best.score, diagnostics };
}

export function chooseCaravanNpcAction(state: CaravanState, seat: CaravanSeat = state.currentSeat): CaravanAction | null {
  return analyzeCaravanNpc(state, seat).action;
}
