import { describe, expect, it } from "vitest";
import {
  createLineHistory, createLinePosition, evaluateLineVictory, linePositionKey,
  recordLinePosition, winningLineWindows,
  type LinePosition, type LineSeat, type LineStone, type LineStoneSize
} from "../../../src/games/ooishi-line/position";

function positionWith(...stacks: [number, LineStone[]][]): LinePosition {
  const initial = createLinePosition();
  const board: LineStone[][] = Array.from({ length: 16 }, () => []);
  for (const [cell, stones] of stacks) board[cell] = stones;
  return { ...initial, board };
}

function lineAt(cells: readonly number[], sizes: readonly LineStoneSize[], owner: LineSeat = 0): [number, LineStone[]][] {
  return cells.map((cell, index) => [cell, [{ owner, size: sizes[index]! }]]);
}

describe("Ooishi Line confirmed position rules", () => {
  it("starts with 16 empty independent cells and large4/medium2/small1 per player", () => {
    const initial = createLinePosition();
    expect(initial.board).toHaveLength(16);
    expect(initial.board.every(stack => stack.length === 0)).toBe(true);
    expect(new Set(initial.board).size).toBe(16);
    expect(initial.hands).toEqual([{ large: 4, medium: 2, small: 1 }, { large: 4, medium: 2, small: 1 }]);
    expect(initial.hands[0]).not.toBe(initial.hands[1]);
    expect(initial.nextSeat).toBe(0);
    expect(createLinePosition(1).nextSeat).toBe(1);
    expect(evaluateLineVictory(initial)).toBeNull();
  });

  const permutations: LineStoneSize[][] = [
    ["large", "medium", "small"], ["large", "small", "medium"],
    ["medium", "large", "small"], ["medium", "small", "large"],
    ["small", "large", "medium"], ["small", "medium", "large"]
  ];
  it.each(permutations.map(sizes => ({ sizes, label: sizes.join("-") })))("accepts every size ordering: $label", ({ sizes }) => {
    for (const cells of [[0, 1, 2], [0, 4, 8]]) {
      expect(evaluateLineVictory(positionWith(...lineAt(cells, sizes)))).toMatchObject({ kind: "WIN", winner: 0 });
    }
  });

  it("detects every horizontal and vertical three-cell window for either player", () => {
    const windows: number[][] = [];
    for (let row = 0; row < 4; row++) for (let start = 0; start < 2; start++) {
      const cell = row * 4 + start;
      windows.push([cell, cell + 1, cell + 2]);
    }
    for (let col = 0; col < 4; col++) for (let start = 0; start < 2; start++) {
      const cell = start * 4 + col;
      windows.push([cell, cell + 4, cell + 8]);
    }
    expect(windows).toHaveLength(16);
    for (const owner of [0, 1] as const) for (const cells of windows) {
      expect(winningLineWindows(positionWith(...lineAt(cells, permutations[0]!, owner)))).toEqual([{ owner, cells }]);
    }
  });

  it.each([[0, 5, 10], [3, 6, 9], [1, 2, 4], [0, 1, 3]])("rejects diagonal, row-wrapping and nonconsecutive cells %j", (...cells) => {
    expect(evaluateLineVictory(positionWith(...lineAt(cells, permutations[0]!)))).toBeNull();
  });

  it("requires all three sizes and one owner", () => {
    expect(evaluateLineVictory(positionWith(...lineAt([0, 1, 2], ["large", "large", "small"])))).toBeNull();
    const mixed = lineAt([0, 1, 2], permutations[0]!);
    mixed[1] = [1, [{ owner: 1, size: "medium" }]];
    expect(evaluateLineVictory(positionWith(...mixed))).toBeNull();
  });

  it("uses the top of each stack and does not count a buried winning line", () => {
    const hidden = positionWith(
      [0, [{ owner: 0, size: "large" }, { owner: 1, size: "medium" }]],
      [1, [{ owner: 0, size: "medium" }]], [2, [{ owner: 0, size: "small" }]]
    );
    expect(evaluateLineVictory(hidden)).toBeNull();
    const exposed = { ...hidden, board: hidden.board.map((stack, cell) => cell === 0 ? stack.slice(0, -1) : stack) };
    expect(evaluateLineVictory(exposed)).toMatchObject({ kind: "WIN", winner: 0 });
    expect(hidden.board[0]).toHaveLength(2);
  });

  it("draws when both players have a winning line in the same resulting position", () => {
    const position = positionWith(...lineAt([0, 1, 2], permutations[0]!, 0), ...lineAt([12, 13, 14], permutations[1]!, 1));
    expect(evaluateLineVictory(position)).toMatchObject({ kind: "DRAW", reason: "SIMULTANEOUS_LINES" });
  });

  it("keeps a single winner when that player has multiple winning windows", () => {
    const position = positionWith(...lineAt([0, 1, 2, 3], ["large", "medium", "small", "large"]));
    expect(winningLineWindows(position)).toHaveLength(2);
    expect(evaluateLineVictory(position)).toMatchObject({ kind: "WIN", winner: 0 });
  });

  it("records the initial position, draws only at occurrence three, and preserves history", () => {
    const initial = createLinePosition();
    const first = createLineHistory(initial);
    const other = recordLinePosition(first, { ...initial, nextSeat: 1 });
    const second = recordLinePosition(other.history, initial);
    const third = recordLinePosition(second.history, initial);
    expect(other.occurrences).toBe(1);
    expect(second).toMatchObject({ occurrences: 2, repetitionDraw: false });
    expect(third).toMatchObject({ occurrences: 3, repetitionDraw: true });
    expect(first).toEqual([linePositionKey(initial)]);
    expect(second.history).toHaveLength(3);
  });

  it("keys include buried layers, stack order, owners, cells, hands and next turn", () => {
    const baseline = positionWith([0, [{ owner: 0, size: "large" }, { owner: 1, size: "medium" }]]);
    const variants: LinePosition[] = [
      positionWith([0, [{ owner: 0, size: "small" }, { owner: 1, size: "medium" }]]),
      positionWith([0, [...baseline.board[0]!].reverse()]),
      positionWith([0, [{ owner: 1, size: "large" }, { owner: 1, size: "medium" }]]),
      positionWith([1, [...baseline.board[0]!]]),
      { ...baseline, hands: [{ ...baseline.hands[0], large: 3 }, baseline.hands[1]] },
      { ...baseline, hands: [baseline.hands[0], { ...baseline.hands[1], small: 0 }] },
      { ...baseline, nextSeat: 1 }
    ];
    const key = linePositionKey(baseline);
    expect(linePositionKey(structuredClone(baseline))).toBe(key);
    for (const variant of variants) {
      expect(linePositionKey(variant)).not.toBe(key);
      expect(recordLinePosition([key, key], variant).repetitionDraw).toBe(false);
    }
  });
});
