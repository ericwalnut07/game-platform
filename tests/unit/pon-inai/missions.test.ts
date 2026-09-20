import { describe, expect, it } from "vitest";
import { evaluateMission, type Mission } from "../../../src/games/pon-inai/missions";
import { buildPublicSummary, deriveUniqueTopColor } from "../../../src/games/pon-inai/public-summary";
import type { Card, Color, Confidence, RoundResult } from "../../../src/games/pon-inai/types";
import { createEmptyColorCounts } from "../../../src/games/pon-inai/cards";

function round(roundNo: 1 | 2 | 3 | 4, cards: readonly [Color, 1 | 2 | 3 | 4][]): RoundResult {
  const colorCounts = createEmptyColorCounts();
  const players = cards.map(([color, number], i) => {
    colorCounts[color] += 1;
    const card: Card = { id: `${roundNo}-${i}`, color, number, copy: 1 };
    return { playerId: `P${i + 1}`, card, confidence: "NORMAL" as Confidence };
  });
  const sum = cards.reduce((acc, [, n]) => acc + n, 0);
  return {
    round: roundNo,
    players,
    numberSum: sum,
    numberAverage: sum / cards.length,
    colorCounts,
    uniqueTopColor: deriveUniqueTopColor(colorCounts)
  };
}

describe("mission evaluation", () => {
  it("evaluates color sync from public data", () => {
    const summary = buildPublicSummary([
      round(1, [["RED", 1], ["BLUE", 2], ["GREEN", 3], ["YELLOW", 4]]),
      round(2, [["BLUE", 1], ["BLUE", 2], ["BLUE", 3], ["BLUE", 4]])
    ]);
    const mission: Mission = { type: "COLOR_SYNC", minimumSynchronizedRounds: 1 };
    expect(evaluateMission(mission, { playerCount: 4, summary })).toBe(true);
  });

  it("counts only unique-top-color changes for color rotation", () => {
    const summary = buildPublicSummary([
      round(1, [["RED", 1], ["RED", 2], ["BLUE", 3], ["GREEN", 4]]),
      round(2, [["BLUE", 1], ["BLUE", 2], ["RED", 3], ["GREEN", 4]]),
      round(3, [["GREEN", 1], ["GREEN", 2], ["RED", 3], ["BLUE", 4]])
    ]);
    const mission: Mission = { type: "COLOR_ROTATION", minimumChanges: 2 };
    expect(evaluateMission(mission, { playerCount: 4, summary })).toBe(true);
  });
});
