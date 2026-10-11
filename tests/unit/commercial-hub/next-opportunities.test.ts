import { describe, expect, it } from "vitest";
import { createHubState, reduceHubState } from "../../../src/games/commercial-hub/engine";
import { CITY_CONDITIONS, opportunitiesAtLevel, opportunityCountKey, type Opportunity } from "../../../src/games/commercial-hub/data";
import { nextOpportunitiesAtLevel, supportReward } from "../../../src/games/commercial-hub/next-opportunities";
import { awardOpportunity, drawRound } from "../../../src/games/commercial-hub/opportunities";
import { candidateOpeningReward } from "../../../src/games/commercial-hub/next-data";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { SUITS } from "../../../src/games/commercial-hub/types";
import { quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { quoteBuildingUse } from "../../../src/games/commercial-hub/income";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { decideNpc } from "../../../src/games/commercial-hub/npc";
import { parseHubConfig } from "../../../src/games/commercial-hub/config";
const players = ["a", "b", "c", "d"];
function fresh() { return createHubState("m", players, new SeededRandom(42), { rulesVariant: "NEXT", auditor: true, trickRule: "BID", majorInvestments: true }); }
const candidates = [["goods-support", "sales"], ["materials-support", "processing"], ["cash-support", "purchase"], ["cash-support", "development"]];
describe("NEXT early opportunity adjustment", () => {
  it.each([1, 2])("has exactly two adopted candidates per suit at Lv%s", level => {
    SUITS.forEach((suit, i) => expect(nextOpportunitiesAtLevel(suit, level).map(o => o.id).sort()).toEqual((i === 3 && level === 2 ? ["development", "public-project"] : candidates[i]!).toSorted()));
  });
  it.each([1, 2])("selects support in every single slot and both distinct candidates in double slots at Lv%s", level => {
    for (const condition of CITY_CONDITIONS) for (let seed = 0; seed < 50; seed++) {
      const s = fresh(); s.cityLevel = level as 1 | 2; s.round = 2; s.marketBag = [condition.id];
      Object.keys(s.opportunityCounts).forEach(k => s.opportunityCounts[k] = k.includes("support") ? 999 : 0);
      drawRound(s, new SeededRandom(seed));
      expect(s.opportunities).toHaveLength(condition.tricks); expect(s.cityCondition).toEqual(condition);
      SUITS.forEach((suit, i) => {
        const ids = s.opportunities.filter(o => o.suit === suit).map(o => o.id);
        expect(ids).toHaveLength(condition.counts[i]!);
        if (ids.length === 2) expect(ids.toSorted()).toEqual(nextOpportunitiesAtLevel(suit, level).map(o => o.id).sort());
        else if (level === 1 || suit !== "administration") expect(ids).toEqual([candidates[i]![0]]);
        expect(s.opportunities.filter(o => o.suit === suit).every(o => o.trump === condition.trump)).toBe(true);
      });
      expect(Object.values(s.opportunityCounts).every(Number.isFinite)).toBe(true);
    }
  });
  it("uses existing count balancing and tie RNG for Lv2 administration", () => {
    for (const favored of ["development", "public-project"] as const) {
      const s = fresh(); s.round = 2; s.cityLevel = 2; s.marketBag = ["steady-growth"];
      s.opportunityCounts[`administration:${favored}`] = 0;
      s.opportunityCounts[`administration:${favored === "development" ? "public-project" : "development"}`] = 10;
      drawRound(s, new SeededRandom(1)); expect(s.opportunities.find(o => o.suit === "administration")!.id).toBe(favored);
    }
    const seen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) { const s = fresh(); s.round = 2; s.cityLevel = 2; s.marketBag = ["steady-growth"]; drawRound(s, new SeededRandom(seed)); seen.add(s.opportunities.find(o => o.suit === "administration")!.id); }
    expect(seen).toEqual(new Set(["development", "public-project"]));
  });
  it.each([3, 4])("keeps candidates, selection and RNG identical at Lv%s", level => {
    SUITS.forEach(suit => expect(nextOpportunitiesAtLevel(suit, level)).toEqual(opportunitiesAtLevel(suit, level)));
    for (const condition of [...CITY_CONDITIONS.map(c => c.id), "special"] as const) {
      const s = fresh(); s.round = 6; s.cityLevel = level as 3 | 4;
      if (condition === "special") s.specialBoomRound = 6; else s.marketBag = [condition];
      const old = structuredClone(s); old.rulesVersion = "next-trial-1";
      const a = new SeededRandom(99), b = new SeededRandom(99); drawRound(s, a); drawRound(old, b);
      expect(s.opportunities).toEqual(old.opportunities); expect(s.opportunityCounts).toEqual(old.opportunityCounts); expect(a.next()).toBe(b.next());
    }
  });
  it("keeps R1 six tricks, trump selection and all dedicated rewards", () => {
    const s = fresh(), old = structuredClone(s); old.rulesVersion = "next-trial-1";
    drawRound(s, new SeededRandom(22)); drawRound(old, new SeededRandom(22)); expect(s.opportunities).toEqual(old.opportunities);
    expect(SUITS.map(suit => s.opportunities.filter(o => o.suit === suit).length)).toEqual([2, 2, 1, 1]);
    expect(s.opportunities.filter(o => o.trump === null)).toHaveLength(1);
    for (const suit of SUITS) { const t = fresh(); const before = structuredClone(t.companies); awardOpportunity(t, { id: "opening", name: "開業", suit, trump: suit }, players); t.companies.forEach((c, i) => expect(Object.fromEntries(Object.keys(c.resources).map(k => [k, c.resources[k as keyof typeof c.resources] - before[i]!.resources[k as keyof typeof c.resources]]))).toEqual(candidateOpeningReward(suit, (i + 1) as 1 | 2 | 3 | 4))); }
  });
  it.each([1, 2])("awards support once with unchanged rank 3/4 rewards at Lv%s", level => {
    for (const suit of SUITS) for (const o of nextOpportunitiesAtLevel(suit, level).filter(o => o.id.endsWith("support"))) {
      const s = fresh(); s.round = 2; s.cityLevel = level as 1 | 2; const before = structuredClone(s.companies);
      awardOpportunity(s, { ...o, trump: null }, players);
      const expected = o.id === "cash-support" ? [{ cash: 3, materials: 0, goods: 0 }, { cash: 2, materials: 0, goods: 0 }] : o.id === "materials-support" ? [{ cash: 1, materials: 1, goods: 0 }, { cash: 0, materials: 1, goods: 0 }] : [{ cash: 1, materials: 0, goods: 1 }, { cash: 0, materials: 0, goods: 1 }];
      s.companies.forEach((c, i) => expect({ cash: c.resources.cash - before[i]!.resources.cash, materials: c.resources.materials - before[i]!.resources.materials, goods: c.resources.goods - before[i]!.resources.goods }).toEqual(expected[i] ?? { cash: 0, materials: 0, goods: 0 }));
      expect(s.rewardChoices).toEqual([]); expect(s.events.filter(e => e.type === "OPPORTUNITY_REWARD")).toHaveLength(4);
      const reversed = fresh(); reversed.cityLevel = level as 1 | 2; const prior = reversed.companies[3]!.resources.cash;
      awardOpportunity(reversed, { ...o, trump: null }, players.toReversed()); expect(reversed.companies[3]!.resources.cash - prior).toBe(expected[0]!.cash);
    }
  });
  it("counts shared cash-support ids separately and initializes procurement key", () => {
    const s = fresh(); expect(s.opportunityCounts["procurement:cash-support"]).toBe(0); s.round = 2; s.marketBag = ["construction-demand"]; drawRound(s, new SeededRandom(1));
    expect(s.opportunityCounts["procurement:cash-support"]).toBe(1); expect(s.opportunityCounts["administration:cash-support"]).toBe(1);
    expect(opportunityCountKey({ suit: "procurement", id: "cash-support" })).not.toBe(opportunityCountKey({ suit: "administration", id: "cash-support" }));
  });
  it("preserves old NEXT and formal early rewards/selection for persisted games", () => {
    const next = fresh(); next.rulesVersion = "next-trial-1"; next.round = 2;
    const formal = createHubState("formal", players, new SeededRandom(42)); formal.round = 2;
    drawRound(next, new SeededRandom(7)); drawRound(formal, new SeededRandom(7)); expect(next.opportunities).toEqual(formal.opportunities);
    const o: Opportunity = { id: "cash-support", name: "資金支援", suit: "commerce", trump: null };
    for (const s of [next, formal]) { const before = s.companies[0]!.resources.cash; awardOpportunity(s, o, players); expect(s.companies[0]!.resources.cash - before).toBe(2); }
    expect(supportReward(o, 1, false)).toEqual({ cash: 2, materials: 0, goods: 0 });
    expect(parseHubConfig({ rulesVariant: "NEXT", testVersion: "next-trial-1" }).testVersion).toBe("next-trial-2");
  });
  it.each([1, 2])("keeps normal construction costs at Lv%s, with no early discount", level => {
    const s = fresh(); s.round = 2; s.cityLevel = level as 1 | 2; s.companies[0]!.resources.cash = 10;
    expect(quoteInvestment(s, "a", { type: "BUILD", district: "WORKSHOP", suit: "industry" })).toMatchObject({ baseCash: 5, districtDiscount: 1, developmentDiscount: 0, cost: { cash: 4, materials: 0, goods: 0 }, auditFee: 0, transport: null });
    expect(quoteInvestment(s, "a", { type: "BUILD", district: "REDEVELOPMENT", suit: "industry" }).cost.cash).toBe(5);
  });
  it("requires and pays audit cash immediately while deferring transport, and preserves contractor payout", () => {
    const s = fresh(); s.round = 2; s.phase = "PRODUCTION"; s.auditor.target = "industry"; s.buildings = [{ id: "b", playerId: "a", district: "WORKSHOP", suit: "industry", upgraded: false }];
    s.companies[0]!.resources = { cash: 0, materials: 1, goods: 0 };
    expect(() => quoteBuildingUse(s, "a", "b", 1, "PUBLIC")).toThrow(); s.companies[0]!.resources.cash = 1;
    s.next!.cards.push({ id: "audit-contractor", owner: "b", purchasedRound: 1, activeRound: 2, status: "ACTIVE" });
    const before = s.companies[1]!.resources.cash;
    const after = reduceHubState(s, { type: "USE_BUILDING", playerId: "a", buildingId: "b", amount: 1, access: "PUBLIC" }, new SeededRandom(1));
    expect(after.companies[0]!.resources.cash).toBe(0); expect(after.companies[1]!.resources.cash).toBe(before + 1); expect(after.transportCharges).toHaveLength(1); expect(after.transportCharges[0]!.amount).toBe(2);
  });
  it("all four NPC policies process new procurement support and produce legal actions", () => {
    for (const type of ["standard", "production", "commerce", "development"] as const) {
      const s = fresh(); s.round = 2; s.cityLevel = 2; s.phase = "TRICK"; s.trickLeader = "a"; s.trickIndex = 0; s.opportunities = [{ id: "cash-support", name: "資金支援", suit: "procurement", trump: null }];
      const d = decideNpc(buildHubView(s, "a"), type)!; expect(d.action.type).toBe("PLAY_CARD"); expect(Number.isFinite(d.score)).toBe(true);
      expect(() => reduceHubState(s, { ...d.action, playerId: "a" }, new SeededRandom(1))).not.toThrow();
    }
  });
});
