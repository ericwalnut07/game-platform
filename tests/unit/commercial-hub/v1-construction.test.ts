import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { createHubV1WorkState } from "../../../src/games/commercial-hub/v1-work";
import { createHubState, reduceHubState } from "../../../src/games/commercial-hub/engine";
import { assertCanBuild, districtBuildingSlots } from "../../../src/games/commercial-hub/buildings";
import { buildingAvailability, legalInvestments, quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { quoteBuildingUse } from "../../../src/games/commercial-hub/income";
import { decideNpc, evaluateNpcInvestment } from "../../../src/games/commercial-hub/npc";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { parseHubConfig } from "../../../src/games/commercial-hub/config";
import { parseHubAction } from "../../../src/games/commercial-hub/web-actions";
import { distinctDistrictSuits } from "../../../src/games/commercial-hub/trial-features";
import { DISTRICTS } from "../../../src/games/commercial-hub/data";
import type { Building, BuildingSuit, DistrictId } from "../../../src/games/commercial-hub/types";
import type { HubState, HubClientAction } from "../../../src/games/commercial-hub/state";

const rng = () => new SeededRandom(101);
const freePayment = { cash: 2, materials: 0, goods: 0 };
function fresh() {
  const s = createHubV1WorkState("work1", ["A", "B", "C", "D"], rng(), { trickRule: "NORMAL", auditor: true });
  s.phase = "INVESTMENT"; s.currentInvestmentPlayer = "A"; s.round = 4; s.cityLevel = 3;
  s.companies.forEach(c => c.resources = { cash: 50, materials: 10, goods: 10 });
  return s;
}
const building = (id: string, district: DistrictId, suit: BuildingSuit = "commerce", playerId = "A"): Building => ({ id, district, suit, playerId, upgraded: false });
const build = (district: DistrictId, suit: BuildingSuit): Extract<HubClientAction, {type: "BUILD"}> => ({ type: "BUILD", district, suit, freePayment });
const act = (s: HubState, a: HubClientAction, playerId = "A") => reduceHubState(s, { ...a, playerId }, rng());

describe("v1 Work 1 district construction", () => {
  it.each(DISTRICTS.map(d => d.id))("permits mixed suits and rejects own duplicate in %s", district => {
    const s = fresh(); s.buildings = [building("shop", district)];
    for (const suit of ["industry", "procurement"] as const) {
      expect(quoteInvestment(s, "A", build(district, suit))).toBeDefined();
      const n = act(s, build(district, suit));
      expect(n.buildings.filter(b => b.district === district && b.playerId === "A")).toHaveLength(2);
      expect(new Set(n.buildings.map(b => b.id)).size).toBe(2);
    }
    expect(() => act(s, build(district, "commerce"))).toThrow("自社の同系統");
    expect(s.buildings).toHaveLength(1);
    const availability = buildingAvailability(s, "A", legalInvestments(s, "A"));
    expect(availability.find(x => x.district === district && x.suit === "commerce")?.reason).toContain("自社の同系統");
  });

  it.each(DISTRICTS.map(d => d.id))("permits another company same suit and preserves slots in %s", district => {
    const s = fresh(); s.buildings = [building("other", district, "commerce", "B")];
    expect(act(s, build(district, "commerce")).buildings).toHaveLength(2);
    const slots = districtBuildingSlots(district, true);
    s.buildings = Array.from({ length: slots }, (_, i) => building(String(i), district, "commerce", "B"));
    expect(() => act(s, build(district, "industry"))).toThrow("満杯");
  });

  it("keeps 21 normal slots, six normal buildings, suit three including private, and private one", () => {
    expect(DISTRICTS.reduce((n, d) => n + districtBuildingSlots(d.id, true), 0)).toBe(21);
    const s = fresh();
    s.next!.cards.push({ id: "business-expansion", owner: "A", purchasedRound: 2, activeRound: 3, status: "ACTIVE" });
    s.buildings = [
      building("1", "MARKET"), building("2", "MARKET", "industry"),
      building("3", "WORKSHOP"), building("4", "WORKSHOP", "procurement"),
      building("5", "WAREHOUSE", "industry"), building("6", "WAREHOUSE", "procurement")
    ];
    expect(() => act(s, build("NEW_TOWN", "commerce"))).toThrow("通常マップは6棟");
    expect(buildingAvailability(s, "A", legalInvestments(s, "A")).find(x => x.district === "NEW_TOWN")?.reason).toContain("6棟");
    const n = act(s, build("PRIVATE", "commerce"));
    expect(n.buildings).toHaveLength(7);
    expect(() => quoteInvestment(n, "A", build("PRIVATE", "industry"))).toThrow();
    s.buildings.push(building("private", "PRIVATE"));
    s.buildings.splice(4, 2);
    expect(() => quoteInvestment(s, "A", build("NEW_TOWN", "commerce"))).toThrow("上限");
    expect(() => quoteInvestment(s, "B", build("PRIVATE", "industry"))).toThrow("有効な自社専用地区");
  });

  it("keeps unlocks, district corrections, free payment and construction without transport or audit", () => {
    const s = fresh(); s.buildings = [building("shop", "MARKET")]; s.auditor.target = "commerce";
    const mixed = quoteInvestment(s, "A", build("MARKET", "industry"));
    expect(mixed.cost).toEqual({ cash: 6, materials: 0, goods: 0 });
    expect(mixed.transport).toBeNull(); expect(mixed.auditFee).toBe(0);
    s.benefits.A!.development = 1;
    expect(quoteInvestment(s, "A", build("MARKET", "industry")).cost.cash).toBe(5);
    s.cityLevel = 1;
    expect(() => act(s, build("BUSINESS", "industry"))).toThrow("外周地区");
    s.cityLevel = 2;
    expect(quoteInvestment(s, "A", build("BUSINESS", "industry"))).toBeDefined();
  });

  it("upgrades and operates co-located buildings independently by id, across restore", () => {
    let s = fresh();
    s.buildings = [building("shop", "MARKET"), building("mill", "MARKET", "industry")];
    s.routes = [{ playerId: "A", district: "MARKET" }]; s.auditor.target = "commerce";
    s = act(s, { type: "UPGRADE", buildingId: "mill", access: "OWN", freePayment });
    expect(s.buildings.map(b => b.upgraded)).toEqual([false, true]);
    expect(s.transportCharges[0]?.amount).toBe(0);
    s.currentInvestmentPlayer = "A";
    s = act(JSON.parse(JSON.stringify(s)), { type: "UPGRADE", buildingId: "shop", access: "OWN", freePayment });
    expect(s.buildings.every(b => b.upgraded)).toBe(true);
    expect(distinctDistrictSuits(s)).toBe(true);
    s.phase = "PRODUCTION";
    s = act(s, { type: "USE_BUILDING", buildingId: "mill", amount: 1, access: "OWN" });
    expect(quoteBuildingUse(s, "A", "shop", 2, "OWN")).toBeDefined();
    s = act(s, { type: "USE_BUILDING", buildingId: "shop", amount: 2, access: "OWN" });
    expect(s.usage.A!.buildings).toEqual(["mill", "shop"]);
    expect(() => act(s, { type: "USE_BUILDING", buildingId: "mill", amount: 1, access: "OWN" })).toThrow("未使用");
    expect(s.events.filter(e => e.type === "BUILDING_USED")).toHaveLength(2);
  });

  it("charges audit and forced monopoly per operation/upgrade, settles routes and denies blocked detours", () => {
    let s = fresh(); s.buildings = [building("shop", "MARKET"), building("mill", "MARKET", "industry")];
    s.auditor.target = "commerce";
    s.routes = [{ playerId: "B", district: "MARKET" }, { playerId: "A", district: "MARKET" }];
    s.next!.cards.push({ id: "logistics-monopoly", owner: "B", purchasedRound: 2, activeRound: 3, status: "ACTIVE", targetSuit: "commerce" });
    for (const id of ["shop", "mill"]) {
      const q = quoteInvestment(s, "A", { type: "UPGRADE", buildingId: id, access: "B", freePayment });
      expect(q.auditFee).toBe(1); expect(q.transport).toMatchObject({ payee: "B", amount: 1, forcedMonopoly: true });
      expect(() => quoteInvestment(s, "A", { type: "UPGRADE", buildingId: id, access: "PUBLIC", freePayment })).toThrow();
    }
    const beforeA = s.companies[0]!.resources.cash, beforeB = s.companies[1]!.resources.cash;
    s.phase = "PRODUCTION";
    for (const id of ["mill", "shop"]) s = act(s, { type: "USE_BUILDING", buildingId: id, amount: 1, access: "B" });
    expect(s.companies[1]!.resources.cash).toBe(beforeB);
    expect(s.transportCharges).toHaveLength(2);
    expect(s.companies[0]!.resources.cash).toBe(beforeA - 2 + 3);
    s.next!.blocked = ["B"];
    for (const id of ["shop", "mill"]) {
      const unspent = structuredClone(s); unspent.usage.A!.buildings = [];
      expect(() => quoteBuildingUse(unspent, "A", id, 1, "PUBLIC")).toThrow();
      expect(() => quoteBuildingUse(unspent, "A", id, 1, "OWN")).toThrow();
    }
    s.phase = "INVESTMENT"; s.currentInvestmentPass = 2; s.investmentTurnIndex = 3; s.currentInvestmentPlayer = "A";
    s = act(s, { type: "PASS_INVESTMENT" });
    expect(s.companies[1]!.resources.cash).toBe(beforeB + 2);
    expect(s.settlement?.charges.filter(c => c.payee === "B")).toHaveLength(2);
  });

  it.each(["standard", "production", "commerce", "development"] as const)("lets %s NPC select a newly legal mixed district", type => {
    const s = fresh(); s.cityLevel = 1; s.next!.market = [null, null, null];
    s.buildings = [building("shop", "MARKET")];
    for (const d of ["WORKSHOP", "WAREHOUSE", "REDEVELOPMENT"] as const) {
      for (let i = 0; i < districtBuildingSlots(d, true); i++) s.buildings.push(building(d + i, d, "industry", "B"));
    }
    s.routes = [{ playerId: "A", district: "MARKET" }];
    const v = buildHubView(s, "A"); const decision = decideNpc(v, type)!;
    expect(decision.action).toMatchObject({ type: "BUILD", district: "MARKET" });
    const n = act(s, decision.action);
    expect(n.buildings.filter(b => b.playerId === "A")).toHaveLength(2);
    const q = v.investments.find(q => JSON.stringify(q.action) === JSON.stringify(decision.action))!;
    expect(evaluateNpcInvestment(v, type, q).reasons.join(" ")).toContain("同地区の異系統");
  });

  it("leaves all existing saved rules and normal starts unchanged; rejects external switches", () => {
    const old = createHubState("old", ["A", "B", "C", "D"], rng(), { rulesVariant: "NEXT", trickRule: "NORMAL", auditor: false });
    expect(old).not.toHaveProperty("constructionRule"); expect(buildHubView(old, "A")).not.toHaveProperty("constructionRule");
    for (const rulesVersion of ["0.5", "next-trial-1", "next-trial-2", "next-trial-3", "next-trial-4"] as const) {
      const s = fresh(); delete s.constructionRule; s.rulesVersion = rulesVersion;
      if (rulesVersion === "0.5") delete s.next;
      s.buildings = [building("shop", "MARKET")];
      expect(() => assertCanBuild(s.buildings, "A", "MARKET", "industry", 3, !!s.next, 6, !!s.next)).toThrow();
      s.buildings = [building("redev", "REDEVELOPMENT")];
      if (s.next) expect(() => assertCanBuild(s.buildings, "A", "REDEVELOPMENT", "commerce", 3, true)).not.toThrow();
      else expect(() => assertCanBuild(s.buildings, "A", "REDEVELOPMENT", "industry", 3)).toThrow();
      const n = act(JSON.parse(JSON.stringify(s)), { type: "PASS_INVESTMENT" });
      expect(n.rulesVersion).toBe(rulesVersion); expect(distinctDistrictSuits(n)).toBe(false);
    }
    expect(() => parseHubConfig({ rulesVariant: "NEXT", constructionRule: "v1-distinct-suits" })).toThrow();
    const action = parseHubAction({ type: "PASS_INVESTMENT", constructionRule: "v1-distinct-suits" }, "A");
    expect(action).toEqual({ type: "PASS_INVESTMENT", playerId: "A" });
    old.phase = "INVESTMENT"; old.currentInvestmentPlayer = "A";
    expect(reduceHubState(old, action, rng())).not.toHaveProperty("constructionRule");
  });
});
