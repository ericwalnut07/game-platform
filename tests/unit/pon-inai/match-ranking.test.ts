import { describe, expect, it } from "vitest";
import { rankMatch } from "../../../src/games/pon-inai/match-ranking";

describe("match ranking", () => {
  it("breaks only the top-score tie by Spadari votes then correct initial Pon votes", () => {
    const result = rankMatch([
      { playerId: "A", totalScore: 20, totalSpadariVotes: 4, correctInitialPonVotes: 2 },
      { playerId: "B", totalScore: 20, totalSpadariVotes: 3, correctInitialPonVotes: 3 },
      { playerId: "C", totalScore: 15, totalSpadariVotes: 9, correctInitialPonVotes: 5 },
      { playerId: "D", totalScore: 10, totalSpadariVotes: 9, correctInitialPonVotes: 5 }
    ]);
    expect(result.map((r) => [r.playerId, r.rank])).toEqual([["A", 1], ["B", 2], ["C", 3], ["D", 4]]);
  });

  it("allows co-champions and uses competition ranking", () => {
    const result = rankMatch([
      { playerId: "A", totalScore: 20, totalSpadariVotes: 4, correctInitialPonVotes: 2 },
      { playerId: "B", totalScore: 20, totalSpadariVotes: 4, correctInitialPonVotes: 2 },
      { playerId: "C", totalScore: 15, totalSpadariVotes: 1, correctInitialPonVotes: 1 },
      { playerId: "D", totalScore: 10, totalSpadariVotes: 0, correctInitialPonVotes: 0 }
    ]);
    expect(result.map((r) => r.rank)).toEqual([1, 1, 3, 4]);
  });
});
