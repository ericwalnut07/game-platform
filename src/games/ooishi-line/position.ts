/** Position model shared by the rule engine, NPC search and views. */
export type LineSeat = 0 | 1;
export type LineStoneSize = "large" | "medium" | "small";

export interface LineStone {
  readonly owner: LineSeat;
  readonly size: LineStoneSize;
}

export interface LineHand {
  readonly large: number;
  readonly medium: number;
  readonly small: number;
}

export interface LinePosition {
  /** Row-major 4×4 board; stacks are stored bottom to top. */
  readonly board: readonly (readonly LineStone[])[];
  readonly hands: readonly [LineHand, LineHand];
  readonly nextSeat: LineSeat;
}

export interface WinningLine {
  readonly owner: LineSeat;
  readonly cells: readonly [number, number, number];
}

export const LINE_WINDOWS: readonly (readonly [number, number, number])[] = Array.from({ length: 4 }, (_, axis) =>
  Array.from({ length: 2 }, (_, start) => [
    [axis * 4 + start, axis * 4 + start + 1, axis * 4 + start + 2] as const,
    [start * 4 + axis, (start + 1) * 4 + axis, (start + 2) * 4 + axis] as const
  ]).flat()).flat();

export type LineVictory =
  | { readonly kind: "WIN"; readonly winner: LineSeat; readonly lines: readonly WinningLine[] }
  | { readonly kind: "DRAW"; readonly reason: "SIMULTANEOUS_LINES"; readonly lines: readonly WinningLine[] };

export function createLinePosition(nextSeat: LineSeat = 0): LinePosition {
  return {
    board: Array.from({ length: 16 }, () => []),
    hands: [{ large: 4, medium: 2, small: 1 }, { large: 4, medium: 2, small: 1 }],
    nextSeat
  };
}

/** Only horizontal/vertical three-cell windows count; lower layers are ignored. */
export function winningLineWindows(position: LinePosition): readonly WinningLine[] {
  const lines: WinningLine[] = [];
  const consider = (cells: readonly [number, number, number]) => {
    const tops = cells.map(cell => position.board[cell]?.at(-1));
    const first = tops[0];
    if (!first || !tops.every(stone => stone?.owner === first.owner)) return;
    if (new Set(tops.map(stone => stone!.size)).size !== 3) return;
    lines.push({ owner: first.owner, cells });
  };
  LINE_WINDOWS.forEach(consider);
  return lines;
}

export function evaluateLineVictory(position: LinePosition): LineVictory | null {
  const lines = winningLineWindows(position);
  if (!lines.length) return null;
  const winner = lines[0]!.owner;
  if (lines.some(line => line.owner !== winner)) {
    return { kind: "DRAW", reason: "SIMULTANEOUS_LINES", lines };
  }
  return { kind: "WIN", winner, lines };
}

/** Stone identities of the same owner/size are interchangeable, layer order is not. */
export function linePositionKey(position: LinePosition): string {
  return JSON.stringify([
    position.board.map(stack => stack.map(stone => [stone.owner, stone.size])),
    position.hands.map(hand => [hand.large, hand.medium, hand.small]),
    position.nextSeat
  ]);
}

export function createLineHistory(initialPosition: LinePosition): readonly string[] {
  return [linePositionKey(initialPosition)];
}

/** Called once per completed move, after the next player has been set. */
export function recordLinePosition(history: readonly string[], position: LinePosition) {
  const key = linePositionKey(position);
  const occurrences = history.reduce((count, previous) => count + Number(previous === key), 1);
  return { history: [...history, key], occurrences, repetitionDraw: occurrences >= 3 };
}
