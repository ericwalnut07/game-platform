import { describe, expect, it } from "vitest";
import { buildHandView, cardId, clockwisePlayer, createDeck, dealHands, investmentOrder, legalCards, playCard, trickRanking } from "../../../src/games/commercial-hub/cards";
import { createHubState, reduceHubState, startRound } from "../../../src/games/commercial-hub/engine";
import { drawRound, openingReward } from "../../../src/games/commercial-hub/opportunities";
import { CITY_CONDITIONS, OPPORTUNITIES } from "../../../src/games/commercial-hub/data";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { SUITS } from "../../../src/games/commercial-hub/types";
import { fresh, players, rng } from "./helpers";

describe("v0.2 cards and opportunities", () => {
  it("uses exactly 32 unique cards and deals 5/6 without exposing undealt cards", () => {
    expect(new Set(createDeck().map(cardId)).size).toBe(32);
    for (const n of [5, 6]) { const h = dealHands(players, n, rng()); expect(Object.values(h).map((h) => h.length)).toEqual([n, n, n, n]); expect(new Set(Object.values(h).flat().map(cardId)).size).toBe(n * 4); }
    for (const n of [4, 7, NaN]) expect(() => dealHands(players, n, rng())).toThrow();
    expect(() => dealHands(["A", "B", "C", "C"], 6, rng())).toThrow();
  });
  it("enforces Must Follow and refuses cards not in hand", () => {
    const h = [{ suit: "commerce", rank: 1 }, { suit: "industry", rank: 8 }] as const;
    expect(legalCards(h, "commerce")).toEqual([h[0]]);
    expect(() => playCard(h, h[1], "commerce")).toThrow("Must Follow");
    expect(() => playCard(h, { suit: "commerce", rank: 8 }, null)).toThrow();
    expect(playCard(h, h[1], "administration")).toEqual([h[0]]);
  });
  it("uniquely ranks trump, lead, off-suit and off-suit same rank by suit", () => {
    const cards = [{ suit: "commerce", rank: 1 }, { suit: "industry", rank: 8 }, { suit: "procurement", rank: 8 }, { suit: "administration", rank: 8 }] as const;
    const played = cards.map((card, i) => ({ playerId: players[i]!, card }));
    expect(trickRanking(played, null)).toEqual(["A", "B", "C", "D"]);
    expect(trickRanking(played, "administration")).toEqual(["D", "A", "B", "C"]);
    expect(trickRanking([played[0]!, played[3]!, played[2]!, played[1]!], null)).toEqual(["A", "B", "C", "D"]);
  });
  it("randomly starts all four seats, preserves seats and global lead across rounds", () => {
    const starts = new Set<string>(); for (let n = 1; n <= 100; n++) starts.add(createHubState("m", players, new SeededRandom(n)).startingPlayer);
    expect(starts.size).toBe(4);
    const s = fresh(); s.trickLeader = "C"; s.phase = "TRICK_RESULT"; s.trickIndex = 5;
    const next = reduceHubState(s, { type: "ADVANCE" }, rng()); expect(next.trickLeader).toBe("D");
    next.round = 2; startRound(next, rng()); expect(next.trickLeader).toBe("D");
    expect(investmentOrder(players, "C", 1)).toEqual(["C", "D", "A", "B"]);
    expect(investmentOrder(players, "C", 2)).toEqual(["D", "A", "B", "C"]);
    expect(clockwisePlayer(players, "C", 6)).toBe("A");
  });
  it("opening has fixed counts, matching trumps and exactly one random NT", () => {
    const nt = new Set<number>();
    for (let seed = 1; seed <= 80; seed++) {
      const s = createHubState("m", players, new SeededRandom(seed));
      expect(SUITS.map((suit) => s.opportunities.filter((o) => o.suit === suit).length)).toEqual([2, 2, 1, 1]);
      expect(s.opportunities.filter((o) => o.trump === null)).toHaveLength(1);
      expect(s.opportunities.every((o) => o.trump === null || o.trump === o.suit)).toBe(true);
      nt.add(s.opportunities.findIndex((o) => o.trump === null)); expect(s.marketUsed).toEqual([]);
    }
    expect(nt.size).toBe(6);
  });
  it.each([
    ["commerce", [{ cash: 2, goods: 1, materials: 0 }, { cash: 1, goods: 1, materials: 0 }]],
    ["industry", [{ cash: 1, goods: 0, materials: 2 }, { cash: 1, goods: 0, materials: 1 }]],
    ["procurement", [{ cash: 1, goods: 1, materials: 1 }, { cash: 1, goods: 0, materials: 1 }]],
    ["administration", [{ cash: 3, goods: 0, materials: 0 }, { cash: 2, goods: 0, materials: 0 }]]
  ] as const)("opening %s rewards all four places", (suit, top) => {
    expect(openingReward(suit, 1)).toEqual(top[0]); expect(openingReward(suit, 2)).toEqual(top[1]);
    expect(openingReward(suit, 3)).toEqual({ cash: 1, goods: 0, materials: 0 }); expect(openingReward(suit, 4)).toEqual({ cash: 0, goods: 0, materials: 0 });
  });
  it("draws all five normal conditions before refill; special consumes no normal market", () => {
    const s = fresh(), random = rng(), seen: string[] = [];
    for (let round = 2; round <= 11; round++) { s.round = round; drawRound(s, random); seen.push(s.cityCondition.id); expect(s.opportunities).toHaveLength(5); }
    expect(new Set(seen.slice(0, 5)).size).toBe(5); expect(new Set(seen.slice(5)).size).toBe(5);
    const bag = [...s.marketBag], used = [...s.marketUsed], count = s.opportunityCounts.purchase + s.opportunityCounts.bulk;
    s.round = 12; s.specialBoomRound = 12; drawRound(s, random);
    expect(s.marketBag).toEqual(bag); expect(s.marketUsed).toEqual(used); expect(s.opportunities).toHaveLength(6);
    expect(s.opportunities.filter((o) => o.id === "special-materials")).toHaveLength(1);
    expect(s.opportunityCounts.purchase + s.opportunityCounts.bulk).toBe(count + 1);
  });
  it("balances each suit and forces both types on double appearances", () => {
    const s = fresh(), random = rng();
    for (let round = 2; round <= 60; round++) {
      s.round = round; drawRound(s, random);
      for (const suit of SUITS) {
        const types = OPPORTUNITIES.filter((o) => o.suit === suit), appearances = s.opportunities.filter((o) => o.suit === suit);
        if (appearances.length === 2) expect(new Set(appearances.map((o) => o.id)).size).toBe(2);
        expect(Math.abs(s.opportunityCounts[types[0]!.id] - s.opportunityCounts[types[1]!.id])).toBeLessThanOrEqual(1);
      }
    }
    expect(CITY_CONDITIONS.every((c) => c.tricks === 5)).toBe(true);
  });
  it("projects own hand only and isolates mutations", () => {
    const s = fresh(), view = buildHandView(players, s.playerHands, "A");
    expect(Object.keys(view).sort()).toEqual(["hand", "handCounts", "playerId"]);
    expect(view.hand).toEqual(s.playerHands.A); view.hand[0]!.rank = 99; expect(s.playerHands.A![0]!.rank).not.toBe(99);
  });
});
