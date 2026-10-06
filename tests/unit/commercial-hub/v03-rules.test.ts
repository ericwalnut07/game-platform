import { describe, expect, it } from "vitest";
import { opportunitiesAtLevel, OPPORTUNITIES } from "../../../src/games/commercial-hub/data";
import { quoteMarket, startRound } from "../../../src/games/commercial-hub/engine";
import { buildingUseOptions, quoteBuildingUse } from "../../../src/games/commercial-hub/income";
import { legalLearningOptions } from "../../../src/games/commercial-hub/learning";
import { awardOpportunity, drawRound } from "../../../src/games/commercial-hub/opportunities";
import { createPublicProjects, projectValue } from "../../../src/games/commercial-hub/projects";
import { cityLevel } from "../../../src/games/commercial-hub/scoring";
import { companyOf } from "../../../src/games/commercial-hub/state";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { parseHubAction } from "../../../src/games/commercial-hub/web-actions";
import { SUITS } from "../../../src/games/commercial-hub/types";
import { act, fresh, players, rich, rng, settle } from "./helpers";

describe("v0.3 procurement, support opportunities and staged projects", () => {
  it.each([false, true])("uses each procurement building once independently of the market: upgraded=%s", (upgraded) => {
    let s = rich("PROCUREMENT");
    s.buildings = ["WAREHOUSE", "PORT"].map((district, i) => ({ id: `w${i}`, playerId: "A", district: district as "WAREHOUSE" | "PORT", suit: "procurement", upgraded }));
    expect(quoteMarket(s, "A", "buy-material").cost.cash).toBe(3);
    for (const b of s.buildings) {
      const amount = upgraded ? 2 : 1;
      const q = quoteBuildingUse(s, "A", b.id, amount, "PUBLIC");
      expect(q.cost.cash).toBe(upgraded ? 2 : 1); expect(q.reward.materials).toBe(upgraded ? 3 : 2);
      expect(q.transport.amount).toBe(2);
      s = act(s, { type: "USE_BUILDING", buildingId: b.id, amount, access: "PUBLIC" });
      expect(() => act(s, { type: "USE_BUILDING", buildingId: b.id, amount, access: "PUBLIC" })).toThrow();
    }
    s = act(s, { type: "MARKET", action: "buy-material" });
    expect(() => act(s, { type: "MARKET", action: "buy-material" })).toThrow("1R1回");
    expect(s.usage.A!.buildings).toEqual(["w0", "w1"]); expect(s.usage.A!.purchases).toBe(1);
    expect(companyOf(s, "A").resources).toEqual({ cash: upgraded ? 23 : 25, materials: upgraded ? 17 : 15, goods: 10 });
  });
  it.each([["OWN", 0], ["B", 1], ["PUBLIC", 2]] as const)("settles %s procurement transport once per activation", (access, fee) => {
    let s = rich("PROCUREMENT"); s.buildings = [{ id: "w", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: true }];
    s.routes = [{ playerId: "A", district: "WAREHOUSE" }, { playerId: "B", district: "WAREHOUSE" }];
    s.benefits.A!.bulk = 3;
    s = act(s, { type: "USE_BUILDING", buildingId: "w", amount: 2, access, bonus: 3 });
    expect(companyOf(s, "A").resources).toEqual({ cash: 28, materials: 16, goods: 10 });
    expect(s.transportCharges).toHaveLength(1); expect(s.transportCharges[0]).toMatchObject({ amount: fee, reason: "PROCUREMENT" });
    s = settle(s); expect(companyOf(s, "A").resources.cash).toBe(28 - fee); expect(companyOf(s, "B").resources.cash).toBe(access === "B" ? 31 : 30);
  });
  it.each([false, true])("stacks bulk rewards and can split or concentrate them (%s)", (split) => {
    let s = rich("PROCUREMENT"); s.buildings = ["WAREHOUSE", "PORT"].map((district, i) => ({ id: `w${i}`, playerId: "A", district: district as "WAREHOUSE" | "PORT", suit: "procurement", upgraded: false }));
    const bulk = { ...OPPORTUNITIES.find((o) => o.id === "bulk")!, trump: null };
    awardOpportunity(s, bulk, players); awardOpportunity(s, bulk, ["B", "A", "C", "D"]);
    expect(s.benefits.A!.bulk).toBe(3); expect(s.benefits.C!.bulk).toBe(0);
    expect(() => quoteBuildingUse(s, "A", "w0", 1, "PUBLIC", 4)).toThrow();
    s = act(s, { type: "USE_BUILDING", buildingId: "w0", amount: 1, access: "PUBLIC", bonus: split ? 1 : 3 });
    s = act(s, { type: "USE_BUILDING", buildingId: "w1", amount: 1, access: "PUBLIC", bonus: split ? 2 : 0 });
    expect(s.benefits.A!.bulk).toBe(0); expect(companyOf(s, "A").resources.materials).toBe(17);
    expect(companyOf(s, "A").resources.cash).toBe(28);
    s.benefits.A!.bulk = 2; s.round++; startRound(s, rng()); expect(s.benefits.A!.bulk).toBe(0); expect(s.usage.A!.buildings).toEqual([]);
  });
  it("rejects the old bulk action, other owners, wrong phases and post-completion use; exposes exact own legal choices", () => {
    let s = rich("PROCUREMENT"); s.benefits.A!.bulk = 2;
    expect(buildingUseOptions(s, "A")).toEqual([]);
    s.buildings = [{ id: "w", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: false }, { id: "f", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false }];
    expect(() => parseHubAction({ type: "MARKET", action: "bulk-material" }, "A")).toThrow();
    expect(() => quoteBuildingUse(s, "B", "w", 1, "PUBLIC")).toThrow();
    expect(() => quoteBuildingUse(s, "A", "f", 1, "PUBLIC", 1)).toThrow();
    const v = buildHubView(s, "A"), legal = legalLearningOptions(v).choices.filter((q) => q.action.type === "USE_BUILDING");
    expect(legal.map((q) => q.reward!.materials)).toEqual([2, 3, 4]);
    for (const q of legal) expect(() => act(s, q.action)).not.toThrow();
    s = act(s, { type: "PROCUREMENT_DONE" }); expect(buildHubView(s, "A").buildingOptions).toEqual([]);
    expect(() => act(s, { type: "USE_BUILDING", buildingId: "w", amount: 1, access: "PUBLIC" })).toThrow();
    s.phase = "PRODUCTION"; expect(() => quoteBuildingUse(s, "A", "w", 1, "PUBLIC")).toThrow();
    expect(() => quoteBuildingUse(s, "A", "f", 1, "PUBLIC", 1)).toThrow();
  });
  it.each(["cash-support", "materials-support", "goods-support"] as const)("%s rewards only first and second, including credit-crunch reward order", (id) => {
    const s = rich(), before = structuredClone(s.companies), o = OPPORTUNITIES.find((o) => o.id === id)!;
    awardOpportunity(s, { ...o, trump: null }, [...players].reverse());
    const resource = id === "cash-support" ? "cash" : id === "materials-support" ? "materials" : "goods";
    expect(s.companies.map((c, i) => c.resources[resource] - before[i]!.resources[resource])).toEqual([0, 0, 1, id === "cash-support" ? 2 : 1]);
    expect(s.rewardChoices).toEqual([]);
  });
  it.each([1, 2, 3, 4])("has exactly the adopted two opportunities per suit at Lv%s", (level) => {
    const table = level === 1 ? [["cash-support", "goods-support"], ["materials-support", "processing"], ["purchase", "materials-support"], ["development", "cash-support"]]
      : level === 2 ? [["sales", "cash-support"], ["processing", "materials-support"], ["purchase", "materials-support"], ["development", "public-project"]]
      : [["sales", "promotion"], ["processing", "expansion"], ["purchase", "bulk"], ["development", "public-project"]];
    SUITS.forEach((suit, i) => expect(opportunitiesAtLevel(suit, level).map((o) => o.id).sort()).toEqual(table[i]!.sort()));
    const s = fresh(); s.cityLevel = level as typeof s.cityLevel; const random = rng();
    for (let round = 2; round < 30; round++) { s.round = round; drawRound(s, random); for (const o of s.opportunities) expect(table[SUITS.indexOf(o.suit)]).toContain(o.id); }
  });
  it("uses exact 16/32/64 thresholds", () => { expect([0, 15, 16, 31, 32, 63, 64].map(cityLevel)).toEqual([1, 1, 2, 2, 3, 3, 4]); });
  it("reveals city hall, logistics port and institute once, preserving initial and completed projects", () => {
    let s = fresh(); const first = structuredClone(s.publicProjects); s.cityDevelopment = 16; s = settle(s);
    expect(s.publicProjects.slice(0, 2)).toEqual(first); expect(s.publicProjects[2]).toMatchObject({ id: "city-hall", name: "市庁舎" });
    expect(s.publicProjects[2]!.slots.map((x) => x.resource)).toEqual(["materials", "materials", "goods", "goods", "cash", "cash"]);
    s.publicProjects[0]!.slots.forEach((slot) => slot.playerId = "A"); s.round++; s.cityDevelopment = 32; s = settle(s);
    expect(s.publicProjects).toHaveLength(5); expect(s.publicProjects[4]).toMatchObject({ id: "industrial-institute", name: "産業研究所" });
    expect(s.publicProjects[4]!.slots.map((x) => x.resource)).toEqual(["materials", "materials", "goods", "goods", "cash", "cash"]);
    s.round++; s = settle(s); expect(s.publicProjects).toHaveLength(5); expect(buildHubView(s, "A").publicProjects[0]!.slots.every((x) => x.playerId === "A")).toBe(true);
  });
  it.each(["logistics-port", "industrial-institute"])("applies the new cost, no completion payout, value and development to %s", (projectId) => {
    let s = rich(); s.publicProjects = createPublicProjects(3); const p = s.publicProjects.find((x) => x.id === projectId)!;
    p.slots.forEach((slot, i) => slot.playerId = i < 3 ? "A" : i < 5 ? "B" : null);
    s = act(s, { type: "CONTRIBUTE", projectId, slot: 5, benefit: "NONE" });
    expect(companyOf(s, "A").resources.cash).toBe(27); expect(companyOf(s, "B").resources.cash).toBe(30);
    expect(s.cityDevelopment).toBe(5); expect(projectValue(s.publicProjects.find((x) => x.id === projectId)!, "A")).toBe(7);
    s.currentInvestmentPlayer = "A"; expect(() => act(s, { type: "CONTRIBUTE", projectId, slot: 5, benefit: "NONE" })).toThrow();
  });
});

