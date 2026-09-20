import { describe, expect, it } from "vitest";
import { dealHands } from "../../../src/games/pon-inai/dealing";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { getActiveColors } from "../../../src/games/pon-inai/types";

for (const playerCount of [3, 4] as const) {
  describe(`${playerCount}-player dealing`, () => {
    it("preserves the guaranteed base distribution across many seeds", () => {
      for (let seed = 1; seed <= 500; seed += 1) {
        const players = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
        const { hands } = dealHands(players, playerCount, new SeededRandom(seed));
        const allIds = new Set<string>();

        for (const playerId of players) {
          const hand = hands.get(playerId)!;
          expect(hand).toHaveLength(6);
          expect(new Set(hand.map((c) => c.number))).toEqual(new Set([1, 2, 3, 4]));
          for (const color of getActiveColors(playerCount)) {
            expect(hand.some((c) => c.color === color)).toBe(true);
          }
          for (const card of hand) {
            expect(allIds.has(card.id)).toBe(false);
            allIds.add(card.id);
          }
        }
      }
    });
  });
}
