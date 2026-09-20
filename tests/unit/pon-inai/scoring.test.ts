import { describe, expect, it } from "vitest";
import { calculateFactionPoints, calculateSpadariPoints, isInitialPonVoteCorrect } from "../../../src/games/pon-inai/scoring";

describe("scoring", () => {
  const players = ["A", "B", "C", "D"];

  it("awards no faction points when no-Pon game is misjudged", () => {
    const points = calculateFactionPoints(players, false, undefined, { type: "PLAYER", playerId: "A" });
    expect([...points.values()]).toEqual([0, 0, 0, 0]);
  });

  it("awards everyone +2 when no-Pon is correctly judged", () => {
    const points = calculateFactionPoints(players, false, undefined, { type: "NO_PON" });
    expect([...points.values()]).toEqual([2, 2, 2, 2]);
  });

  it("uses the initial truth vote independently", () => {
    expect(isInitialPonVoteCorrect({ type: "PLAYER", playerId: "C" }, true, "C")).toBe(true);
    expect(isInitialPonVoteCorrect({ type: "NO_PON" }, false)).toBe(true);
  });

  it("scores Spadari ties using the mission result", () => {
    const counts = new Map([["A", 2], ["B", 2], ["C", 0], ["D", 0]]);
    expect(calculateSpadariPoints(true, counts).get("A")).toBe(2);
    expect(calculateSpadariPoints(false, counts).get("A")).toBe(1);
  });
});
