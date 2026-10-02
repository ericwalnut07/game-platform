import { describe, expect, it } from "vitest";
import { awardOpportunity } from "../../../src/games/commercial-hub/opportunities";
import { quoteMarket } from "../../../src/games/commercial-hub/engine";
import { quoteBuildingUse } from "../../../src/games/commercial-hub/income";
import { quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { NO_COST } from "../../../src/games/commercial-hub/resources";
import { OPPORTUNITIES } from "../../../src/games/commercial-hub/data";
import { companyOf } from "../../../src/games/commercial-hub/state";
import { act, players, rich } from "./helpers";

function award(s: ReturnType<typeof rich>, id: typeof OPPORTUNITIES[number]["id"]) { awardOpportunity(s, { ...OPPORTUNITIES.find((o) => o.id === id)!, trump: null }, players); }
describe("v0.2 economy", () => {
  it("credit crunch reverses rewards without reversing trick ranks or lead", () => {
    let s = rich("TRICK"); s.cityCondition.id = "credit-crunch"; s.trickLeader = "A"; s.trump = null;
    s.opportunities = [{ id: "special-materials", name: "test", suit: "procurement", trump: null }];
    for (let i = 0; i < 4; i++) s.playerHands[players[i]!] = [{ suit: "commerce", rank: 4 - i }];
    for (const p of players) s = act(s, { type: "PLAY_CARD", card: s.playerHands[p]![0]! }, p);
    expect(s.trickResults[0]!.ranking).toEqual(players); expect(s.trickResults[0]!.rewardRanking).toEqual([...players].reverse());
    expect(s.companies.map((c) => c.resources.materials)).toEqual([10, 11, 11, 12]); expect(s.trickLeader).toBe("A");
  });
  it.each(["sales", "processing", "purchase"] as const)("%s is immediate, optional and has no transport or market usage", (id) => {
    let s = rich("REWARD"); award(s, id);
    s = act(s, { type: "CLAIM_REWARD", amount: id === "sales" ? 2 : 1 });
    expect(s.transportCharges).toEqual([]); expect(s.usage.A!.purchases).toBe(0);
    expect(companyOf(s, "A").resources).toEqual(id === "sales" ? { materials: 10, goods: 8, cash: 36 } : id === "processing" ? { materials: 9, goods: 13, cash: 30 } : { materials: 11, goods: 10, cash: 29 });
    const before = structuredClone(companyOf(s, "B").resources); s = act(s, { type: "CLAIM_REWARD", amount: 0 }, "B"); expect(companyOf(s, "B").resources).toEqual(before); expect(s.phase).toBe("TRICK_RESULT");
  });
  it("promotion and expansion affect every building, once per use, not per sold good", () => {
    let s = rich("PRODUCTION");
    s.buildings = [
      { id: "f", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: true },
      { id: "w", playerId: "A", district: "INDUSTRIAL", suit: "industry", upgraded: false },
      { id: "h", playerId: "A", district: "MARKET", suit: "commerce", upgraded: true },
      { id: "s", playerId: "A", district: "BUSINESS", suit: "commerce", upgraded: false }
    ]; award(s, "expansion"); award(s, "promotion");
    expect(quoteBuildingUse(s, "A", "f", 1, "PUBLIC").reward).toEqual({ materials: 0, goods: 5, cash: 0 });
    expect(quoteBuildingUse(s, "A", "w", 1, "PUBLIC").reward.goods).toBe(4);
    expect(quoteBuildingUse(s, "A", "h", 2, "PUBLIC").reward.cash).toBe(8);
    expect(quoteBuildingUse(s, "A", "s", 1, "PUBLIC").reward.cash).toBe(5);
    for (const id of ["f", "h", "w", "s"]) s = act(s, { type: "USE_BUILDING", buildingId: id, amount: id === "h" ? 2 : 1, access: "PUBLIC" });
    expect(companyOf(s, "A").resources).toEqual({ materials: 8, goods: 16, cash: 43 });
    expect(s.transportCharges.reduce((n, c) => n + c.amount, 0)).toBe(8);
    expect(() => act(s, { type: "USE_BUILDING", buildingId: "f", amount: 1, access: "PUBLIC" })).toThrow();
  });
  it("produces then sells generated goods and cannot act after completion", () => {
    let s = rich("PRODUCTION"); companyOf(s, "A").resources = { materials: 1, goods: 0, cash: -3 };
    s.buildings = [{ id: "w", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false }, { id: "s", playerId: "A", district: "MARKET", suit: "commerce", upgraded: true }];
    s = act(s, { type: "USE_BUILDING", buildingId: "w", amount: 1, access: "PUBLIC" });
    s = act(s, { type: "USE_BUILDING", buildingId: "s", amount: 2, access: "PUBLIC" });
    expect(companyOf(s, "A").resources.cash).toBe(3);
    s = act(s, { type: "PRODUCTION_DONE" }); expect(() => act(s, { type: "USE_BUILDING", buildingId: "s", amount: 1, access: "PUBLIC" })).toThrow();
  });
  it.each([false, true])("warehouse/LC capacity is per building, with no stacking on one purchase (upgraded %s)", (upgraded) => {
    let s = rich("PROCUREMENT"); s.buildings = [{ id: "l", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded }];
    expect(quoteMarket(s, "A", "buy-material").cost.cash).toBe(2);
    s = act(s, { type: "MARKET", action: "buy-material" }); expect(quoteMarket(s, "A", "buy-material").cost.cash).toBe(upgraded ? 2 : 3);
    s = act(s, { type: "MARKET", action: "buy-material" }); expect(() => act(s, { type: "MARKET", action: "buy-material" })).toThrow();
    expect(s.usage.A!.discounts.l).toBe(upgraded ? 2 : 1);
  });
  it("two warehouses independently discount two purchases; bulk begins only afterwards at fixed 2", () => {
    let s = rich("PROCUREMENT"); s.buildings = ["WAREHOUSE", "PORT"].map((district, i) => ({ id: `l${i}`, district: district as "WAREHOUSE" | "PORT", playerId: "A", suit: "procurement", upgraded: false })); award(s, "bulk");
    expect(() => act(s, { type: "MARKET", action: "bulk-material" })).toThrow();
    for (let i = 0; i < 2; i++) s = act(s, { type: "MARKET", action: "buy-material" });
    expect(s.usage.A!.discounts).toEqual({ l0: 1, l1: 1 });
    for (let i = 0; i < 2; i++) { expect(quoteMarket(s, "A", "bulk-material").cost.cash).toBe(2); s = act(s, { type: "MARKET", action: "bulk-material" }); }
    expect(() => act(s, { type: "MARKET", action: "bulk-material" })).toThrow(); expect(companyOf(s, "A").resources.cash).toBe(22);
  });
  it("disposal unlocks in the special round, twice independently of normal purchases", () => {
    let s = rich("PROCUREMENT"); expect(() => quoteMarket(s, "A", "dispose-good")).toThrow(); s.specialBoomPlayed = true;
    for (let i = 0; i < 2; i++) s = act(s, { type: "MARKET", action: "dispose-good" });
    expect(() => act(s, { type: "MARKET", action: "dispose-good" })).toThrow(); expect(s.usage.A!.purchases).toBe(0); expect(s.transportCharges).toEqual([]);
  });
  it("development stacks with district cost once, then expires at round reset", () => {
    const s = rich(); award(s, "development");
    const q = quoteInvestment(s, "A", { type: "BUILD", district: "MARKET", suit: "commerce", access: "PUBLIC" });
    expect(q.cost.cash).toBe(2); expect(q.transport!.amount).toBe(0);
    const next = act(s, q.action); expect(next.benefits.A!.development).toBe(0); expect(next.cityDevelopment).toBe(2);
    next.currentInvestmentPlayer = "A"; next.benefits.A!.development = 2; next.buildings[0]!.district = "BUSINESS";
    expect(quoteInvestment(next, "A", { type: "UPGRADE", buildingId: next.buildings[0]!.id, access: "PUBLIC" }).cost.cash).toBe(1);
  });
  it("public-project rewards require investment actions, consume once and pay rebate after costs", () => {
    let s = rich(); award(s, "public-project");
    expect(s.publicProjects.every((p) => p.slots.every((s) => s.playerId === null))).toBe(true);
    s = act(s, { type: "CONTRIBUTE", projectId: "market", slot: 0, benefit: "FREE" });
    expect(companyOf(s, "A").resources.goods).toBe(10); expect(s.benefits.A!.project).toEqual([]);
    s.currentInvestmentPlayer = "B"; s = act(s, { type: "CONTRIBUTE", projectId: "market", slot: 3, benefit: "REBATE" }, "B");
    expect(companyOf(s, "B").resources.cash).toBe(29);
  });
  it("red ink prohibits cash payments but permits goods disposal and zero-cash payments", () => {
    let s = rich("PROCUREMENT"); s.specialBoomPlayed = true; companyOf(s, "A").resources.cash = -1;
    expect(() => act(s, { type: "MARKET", action: "buy-material" })).toThrow("赤字");
    s = act(s, { type: "MARKET", action: "dispose-good" }); expect(companyOf(s, "A").resources.cash).toBe(0);
    s.phase = "INVESTMENT"; s.currentInvestmentPlayer = "A"; companyOf(s, "A").resources.cash = -4;
    expect(quoteInvestment(s, "A", { type: "CONTRIBUTE", projectId: "market", slot: 0, benefit: "NONE" }).cost).toEqual({ ...NO_COST, goods: 1 });
  });
});
