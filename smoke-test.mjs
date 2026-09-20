import assert from "node:assert/strict";
import { dealHands } from "./dist/dealing.js";
import { SeededRandom } from "./dist/random.js";
import { getActiveColors } from "./dist/types.js";

let cases = 0;
for (const playerCount of [3, 4]) {
  const players = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
  for (let seed = 1; seed <= 1000; seed += 1) {
    const { hands } = dealHands(players, playerCount, new SeededRandom(seed));
    const ids = new Set();
    for (const playerId of players) {
      const hand = hands.get(playerId);
      assert.equal(hand.length, 6);
      assert.deepEqual([...new Set(hand.map((c) => c.number))].sort(), [1, 2, 3, 4]);
      for (const color of getActiveColors(playerCount)) {
        assert.ok(hand.some((c) => c.color === color));
      }
      for (const card of hand) {
        assert.equal(ids.has(card.id), false);
        ids.add(card.id);
      }
    }
    cases += 1;
  }
}
console.log(`Smoke test passed: ${cases} seeded deals`);
