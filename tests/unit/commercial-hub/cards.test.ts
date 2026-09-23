import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { buildHandView, cardId, clockwisePlayer, compareCards, createDeck, dealHands, investmentOrder, legalCards, playCard, trickWinner } from "../../../src/games/commercial-hub/cards";
import { CITY_CONDITIONS, OPPORTUNITIES } from "../../../src/games/commercial-hub/data";
import type { Card } from "../../../src/games/commercial-hub/types";

const players = ["A", "B", "C", "D"];
const c = (suit: Card["suit"], rank: number): Card => ({ suit, rank });

describe("commercial-hub cards and information boundaries", () => {
  it("defines the v0.1 deck, five conditions and eight opportunities", () => {
    expect(createDeck()).toHaveLength(32);
    expect(new Set(createDeck().map(cardId)).size).toBe(32);
    expect(CITY_CONDITIONS.map((condition) => [condition.name, condition.tricks, condition.trump])).toEqual([
      ["安定成長", 5, null], ["建設特需", 6, "industry"], ["信用収縮", 4, null],
      ["交通革命", 5, "logistics"], ["消費ブーム", 6, "commerce"]
    ]);
    expect(OPPORTUNITIES).toHaveLength(8);
  });
  it.each([4, 5, 6])("deals only %i cards per player and excludes undealt cards", (tricks) => {
    const hands = dealHands(players, tricks, new SeededRandom(42));
    expect(Object.values(hands).map((hand) => hand.length)).toEqual([tricks, tricks, tricks, tricks]);
    expect(new Set(Object.values(hands).flat().map(cardId)).size).toBe(tricks * 4);
  });
  it.each([["A", "B", "C"], ["A", "B", "C", "D", "E"], ["A", "B", "C", "C"]])("rejects an invalid player list %j", (...ids) => {
    expect(() => dealHands(ids, 5, new SeededRandom(1))).toThrow("4人");
  });
  it("rejects invalid trick counts", () => {
    for (const count of [0, 3, 4.5, 7, NaN]) expect(() => dealHands(players, count, new SeededRandom(1))).toThrow();
  });
  it("enforces Must Follow even when the player holds trump", () => {
    const hand = [c("commerce", 1), c("industry", 8), c("commerce", 3)];
    expect(legalCards(hand, "commerce")).toEqual([hand[0], hand[2]]);
    expect(() => playCard(hand, hand[1]!, "commerce")).toThrow("Must Follow");
    expect(playCard(hand, hand[0]!, "commerce")).toEqual([hand[1], hand[2]]);
    expect(hand).toHaveLength(3);
  });
  it("allows any held card when void, and rejects forged cards", () => {
    const hand = [c("commerce", 1), c("industry", 8)];
    expect(legalCards(hand, "civic")).toEqual(hand);
    expect(legalCards(hand, null)).toEqual(hand);
    expect(playCard(hand, c("industry", 8), "civic")).toEqual([c("commerce", 1)]);
    expect(() => playCard(hand, c("commerce", 2), null)).toThrow();
    expect(() => playCard(hand, c("industry", 9), null)).toThrow();
  });
  it("ranks trump above lead and lead above off-suit", () => {
    const played = [c("commerce", 7), c("industry", 1), c("commerce", 8), c("civic", 8)]
      .map((card, i) => ({ playerId: players[i]!, card }));
    expect(trickWinner(played, "industry")).toBe("B");
    expect(trickWinner(played, null)).toBe("C");
    expect(trickWinner(played, "commerce")).toBe("C");
  });
  it("does not invent an off-suit same-rank tiebreak for second place", () => {
    expect(compareCards(c("industry", 8), c("civic", 8), "commerce", null)).toBe(0);
    expect(compareCards(c("industry", 8), c("civic", 7), "commerce", null)).toBeGreaterThan(0);
  });
  it("rejects duplicate cards and repeated players in a trick", () => {
    const played = players.map((playerId) => ({ playerId, card: c("commerce", 1) }));
    expect(() => trickWinner(played, null)).toThrow("2枚");
    expect(() => trickWinner(played.slice(0, 3), null)).toThrow("4人");
  });
  it("rotates the leader globally, including across a six-trick round", () => {
    let leader = "A";
    const leaders = [];
    for (let i = 0; i < 11; i++) { leaders.push(leader); leader = clockwisePlayer(players, leader); }
    expect(leaders).toEqual(["A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C"]);
    expect(investmentOrder(players, "A", 1)).toEqual(["A", "B", "C", "D"]);
    expect(investmentOrder(players, "A", 2)).toEqual(["B", "C", "D", "A"]);
    expect(investmentOrder(players, "B", 1)).toEqual(["B", "C", "D", "A"]);
  });
  it("whitelists only the viewer's hand, even after JSON reload", () => {
    const hands = dealHands(players, 6, new SeededRandom(4));
    const restored = JSON.parse(JSON.stringify(hands));
    for (const viewer of players) {
      const view = buildHandView(players, restored, viewer);
      expect(Object.keys(view)).toEqual(["playerId", "hand", "handCounts"]);
      expect(view.hand).toEqual(hands[viewer]);
      for (const other of players.filter((id) => id !== viewer)) {
        for (const card of hands[other]!) expect(view.hand).not.toContainEqual(card);
      }
      expect(view.handCounts).toEqual(players.map((playerId) => ({ playerId, count: 6 })));
      view.hand[0]!.rank = 99;
      expect(restored[viewer][0].rank).toBeLessThanOrEqual(8);
    }
    expect(() => buildHandView(players, hands, "spectator")).toThrow();
    expect(() => buildHandView(players, {}, "A")).toThrow();
  });
});
