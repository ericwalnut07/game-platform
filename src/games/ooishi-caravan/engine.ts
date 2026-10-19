import type { GameRandomSource } from "../core/GameModule";

export type CaravanSeat = 0 | 1;
export type CaravanStoneSize = "large" | "medium" | "small";
export interface CaravanStone { readonly owner: CaravanSeat; readonly size: CaravanStoneSize }
export interface CaravanDie { readonly value: number; readonly status: "AVAILABLE" | "USED" | "PASSED" }
export type CaravanResult = { readonly kind: "WIN"; readonly winner: CaravanSeat }
  | { readonly kind: "DRAW"; readonly reason: "SIMULTANEOUS_GOALS" };
export interface CaravanState {
  readonly gameId: "ooishi-caravan";
  readonly rulesVersion: "1.0";
  readonly phase: "AWAITING_ROLL" | "MOVING" | "FINISHED";
  /** Indices 0..19 are points 1..20; stacks are bottom to top. */
  readonly board: readonly (readonly CaravanStone[])[];
  /** Finished stones are grouped by their owner, including stones carried by the opponent. */
  readonly goaled: readonly [readonly CaravanStone[], readonly CaravanStone[]];
  readonly currentSeat: CaravanSeat;
  readonly dice: readonly [CaravanDie, CaravanDie] | null;
  readonly turnNumber: number;
  readonly moveCount: number;
  readonly result: CaravanResult | null;
}
export type CaravanMove = { readonly type: "MOVE"; readonly from: number; readonly layer: number; readonly die: 0 | 1 };
export type CaravanAction = { readonly type: "ROLL" } | CaravanMove;
export const CARAVAN_GOAL_POINT = 21;
const otherSeat = (seat: CaravanSeat): CaravanSeat => seat === 0 ? 1 : 0;
const isPoint = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 20;

/** The starting player gets the first-player positions, whichever seat they occupy. */
export function createCaravanState(startingSeat: CaravanSeat = 0): CaravanState {
  if (startingSeat !== 0 && startingSeat !== 1) throw new Error("開始プレイヤーが不正です");
  const board: CaravanStone[][] = Array.from({ length: 20 }, () => []);
  const group = (owner: CaravanSeat, points: readonly [number, number, number, number]) => {
    const enemy = otherSeat(owner), [a, d, c, b] = points;
    board[a - 1] = [{ owner, size: "large" }, { owner: enemy, size: "medium" }, { owner, size: "small" }];
    board[d - 1] = [{ owner, size: "medium" }, { owner: enemy, size: "small" }];
    board[c - 1] = [{ owner, size: "medium" }, { owner, size: "small" }];
    board[b - 1] = [{ owner, size: "large" }];
  };
  group(startingSeat, [1, 3, 7, 10]);
  group(otherSeat(startingSeat), [2, 4, 6, 11]);
  return { gameId: "ooishi-caravan", rulesVersion: "1.0", phase: "AWAITING_ROLL", board,
    goaled: [[], []], currentSeat: startingSeat, dice: null, turnNumber: 1, moveCount: 0, result: null };
}

/** Caravan allows medium/small on empty points too, and small directly on large. */
export function canLandCaravanStone(size: CaravanStoneSize, destination: readonly CaravanStone[]): boolean {
  const top = destination.at(-1);
  if (size === "large") return !top;
  if (size === "medium") return !top || top.size === "large";
  if (size === "small") return !top || top.size === "large" || top.size === "medium";
  return false;
}

export function isLegalCaravanMove(state: CaravanState, actor: CaravanSeat, value: unknown): value is CaravanMove {
  if (state.phase !== "MOVING" || actor !== state.currentSeat || !state.dice || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const move = value as Record<string, unknown>;
  if (move.type !== "MOVE" || !isPoint(move.from) || !Number.isInteger(move.layer) || (move.layer as number) < 0 ||
    (move.die !== 0 && move.die !== 1)) return false;
  const die = state.dice[move.die], stone = state.board[move.from - 1]![(move.layer as number)];
  if (die.status !== "AVAILABLE" || !stone || stone.owner !== actor) return false;
  const to = move.from + die.value;
  return to === CARAVAN_GOAL_POINT || (to < CARAVAN_GOAL_POINT && canLandCaravanStone(stone.size, state.board[to - 1]!));
}

/** Human and NPC decisions share these actions. A die slot is consumed once, even for doubles. */
export function legalCaravanMoves(state: CaravanState, actor: CaravanSeat = state.currentSeat): readonly CaravanMove[] {
  if (state.phase !== "MOVING" || actor !== state.currentSeat) return [];
  const moves: CaravanMove[] = [];
  state.board.forEach((stack, index) => stack.forEach((_, layer) => {
    for (const die of [0, 1] as const) {
      const move: CaravanMove = { type: "MOVE", from: index + 1, layer, die };
      if (isLegalCaravanMove(state, actor, move)) moves.push(move);
    }
  }));
  return moves;
}

export function legalCaravanActions(state: CaravanState, actor: CaravanSeat = state.currentSeat): readonly CaravanAction[] {
  if (actor !== state.currentSeat || state.phase === "FINISHED") return [];
  return state.phase === "AWAITING_ROLL" ? [{ type: "ROLL" }] : legalCaravanMoves(state, actor);
}

function finishUnusedDice(dice: CaravanState["dice"]): CaravanState["dice"] {
  if (!dice) return null;
  const finish = (die: CaravanDie): CaravanDie => die.status === "AVAILABLE" ? { ...die, status: "PASSED" } : die;
  return [finish(dice[0]), finish(dice[1])];
}

/** Do not discard a blocked die while the other die can still unlock a move for it. */
function advanceIfBlocked(state: CaravanState): CaravanState {
  if (legalCaravanMoves(state).length) return state;
  return { ...state, phase: "AWAITING_ROLL", currentSeat: otherSeat(state.currentSeat),
    turnNumber: state.turnNumber + 1, dice: finishUnusedDice(state.dice) };
}

/** One roll or one die-backed move. Randomness is injected by the caller, not accepted from action data. */
export function applyCaravanAction(state: CaravanState, actor: CaravanSeat, value: unknown, rng?: Pick<GameRandomSource, "integer">): CaravanState {
  if (state.phase === "FINISHED") throw new Error("対局は終了しています");
  if (actor !== state.currentSeat) throw new Error("現在の手番ではありません");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ゲーム操作が不正です");
  const input = value as Record<string, unknown>;
  if (input.type === "ROLL") {
    if (state.phase !== "AWAITING_ROLL") throw new Error("この手番のサイコロは既に振りました");
    if (!rng) throw new Error("サイコロの乱数源が必要です");
    const values = [rng.integer(1, 6), rng.integer(1, 6)];
    if (values.some(value => !Number.isInteger(value) || value < 1 || value > 6)) throw new Error("サイコロの出目が不正です");
    return advanceIfBlocked({ ...state, phase: "MOVING", dice: [
      { value: values[0]!, status: "AVAILABLE" }, { value: values[1]!, status: "AVAILABLE" }
    ] });
  }
  if (!isLegalCaravanMove(state, actor, value)) throw new Error("この石・出目では移動できません");
  const move = value, dice = state.dice!;
  const board = state.board.map(stack => [...stack]);
  const moving = board[move.from - 1]!.splice(move.layer);
  const to = move.from + dice[move.die].value;
  const goaled: [CaravanStone[], CaravanStone[]] = [[...state.goaled[0]], [...state.goaled[1]]];
  if (to === CARAVAN_GOAL_POINT) for (const stone of moving) goaled[stone.owner].push(stone);
  else board[to - 1]!.push(...moving);
  const used = (index: 0 | 1): CaravanDie => index === move.die ? { ...dice[index], status: "USED" } : dice[index];
  const completed = goaled.map(stones => stones.length === 8);
  const result: CaravanResult | null = completed[0] && completed[1] ? { kind: "DRAW", reason: "SIMULTANEOUS_GOALS" }
    : completed[0] || completed[1] ? { kind: "WIN", winner: completed[0] ? 0 : 1 } : null;
  const next: CaravanState = { ...state, board, goaled, dice: [used(0), used(1)],
    moveCount: state.moveCount + 1, phase: result ? "FINISHED" : "MOVING", result };
  return result ? { ...next, dice: finishUnusedDice(next.dice) } : advanceIfBlocked(next);
}
