import {
  createLineHistory, createLinePosition, evaluateLineVictory, recordLinePosition,
  type LinePosition, type LineSeat, type LineStone, type LineStoneSize, type LineVictory
} from "./position";

export type LineAction =
  | { readonly type: "PLACE"; readonly size: LineStoneSize; readonly to: number }
  | { readonly type: "MOVE"; readonly from: number; readonly layer: number; readonly to: number };

export type LineResult = LineVictory | { readonly kind: "DRAW"; readonly reason: "THREEFOLD_REPETITION" };

export interface LineState {
  readonly gameId: "ooishi-line";
  readonly rulesVersion: "1.0";
  readonly phase: "PLAYING" | "FINISHED";
  readonly position: LinePosition;
  readonly history: readonly string[];
  readonly ply: number;
  readonly result: LineResult | null;
}

/** Public rendering and legality need no repetition history. */
export type LineDisplayState = Omit<LineState, "history">;

const SIZES: readonly LineStoneSize[] = ["large", "medium", "small"];
const isCell = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < 16;

export function createLineState(nextSeat: LineSeat = 0): LineState {
  const position = createLinePosition(nextSeat);
  return { gameId: "ooishi-line", rulesVersion: "1.0", phase: "PLAYING", position,
    history: createLineHistory(position), ply: 0, result: null };
}

/** Owners do not constrain stacking. Size of the moving group's bottom stone does. */
export function canLandLineStone(size: LineStoneSize, destination: readonly LineStone[]): boolean {
  const top = destination.at(-1);
  if (size === "large") return !top;
  if (size === "medium") return top?.size === "large";
  if (size === "small") return top?.size === "medium";
  return false;
}

export function isLegalLineAction(state: Pick<LineState, "phase" | "position">, actor: LineSeat, value: unknown): value is LineAction {
  if (state.phase !== "PLAYING" || actor !== state.position.nextSeat || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  if (!isCell(action.to)) return false;
  const { board, hands } = state.position;
  if (action.type === "PLACE") {
    if (!SIZES.includes(action.size as LineStoneSize)) return false;
    const size = action.size as LineStoneSize;
    return hands[actor][size] > 0 && canLandLineStone(size, board[action.to]!);
  }
  if (action.type !== "MOVE" || !isCell(action.from) || action.from === action.to ||
    !Number.isInteger(action.layer) || (action.layer as number) < 0) return false;
  const stone = board[action.from]![(action.layer as number)];
  return stone?.owner === actor && canLandLineStone(stone.size, board[action.to]!);
}

/** NPCs and human views use the same legal actions; no NPC-only moves. */
export function legalLineActions(state: Pick<LineState, "phase" | "position">): readonly LineAction[] {
  if (state.phase !== "PLAYING") return [];
  const actor = state.position.nextSeat;
  const actions: LineAction[] = [];
  for (let to = 0; to < 16; to++) {
    for (const size of SIZES) {
      const action: LineAction = { type: "PLACE", size, to };
      if (isLegalLineAction(state, actor, action)) actions.push(action);
    }
    state.position.board.forEach((stack, from) => stack.forEach((_, layer) => {
      const action: LineAction = { type: "MOVE", from, layer, to };
      if (isLegalLineAction(state, actor, action)) actions.push(action);
    }));
  }
  return actions;
}

/** One completed action, one turn change and one history entry. Input snapshots are immutable. */
export function applyLineAction(state: LineState, actor: LineSeat, value: unknown): LineState {
  if (state.phase !== "PLAYING") throw new Error("対局は終了しています");
  if (actor !== state.position.nextSeat) throw new Error("現在の手番ではありません");
  if (!isLegalLineAction(state, actor, value)) throw new Error("この配置・移動はできません");
  const action = value;
  const board = state.position.board.map(stack => [...stack]);
  const hands: [Record<LineStoneSize, number>, Record<LineStoneSize, number>] = [{ ...state.position.hands[0] }, { ...state.position.hands[1] }];
  if (action.type === "PLACE") {
    board[action.to]!.push({ owner: actor, size: action.size });
    hands[actor][action.size]--;
  } else {
    const moving = board[action.from]!.splice(action.layer);
    board[action.to]!.push(...moving);
  }
  const position: LinePosition = { board, hands, nextSeat: actor === 0 ? 1 : 0 };
  const recorded = recordLinePosition(state.history, position);
  const result = evaluateLineVictory(position) ?? (recorded.repetitionDraw ? { kind: "DRAW", reason: "THREEFOLD_REPETITION" } as const : null);
  return { ...state, position, history: recorded.history, ply: state.ply + 1, result,
    phase: result ? "FINISHED" : "PLAYING" };
}
