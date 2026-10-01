import { describe, expect, it } from "vitest";
import { assertCanBuild, remainingBuildingCapacity } from "../../../src/games/commercial-hub/buildings";
import { accessOptions } from "../../../src/games/commercial-hub/logistics";
import { quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { companyValue, rankCompanies } from "../../../src/games/commercial-hub/scoring";
import { projectValue } from "../../../src/games/commercial-hub/projects";
import { companyOf } from "../../../src/games/commercial-hub/state";
import { DISTRICT_IDS, type Building, type ValueBreakdown } from "../../../src/games/commercial-hub/types";
import { act, fresh, players, rich, settle } from "./helpers";

describe("v0.2 districts, transport and ranking", () => {
  it("enforces 6 total, 3 per suit, district type, occupancy and one company building per district", () => {
    const s = rich();
    expect(() => assertCanBuild([], "A", "MARKET", "industry", 2)).toThrow();
    expect(() => assertCanBuild([], "A", "BUSINESS", "commerce", 1)).toThrow();
    const base: Building = { id: "b", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false };
    expect(() => assertCanBuild([base], "A", "MARKET", "commerce", 2)).toThrow();
    expect(() => assertCanBuild([base, { ...base, playerId: "B" }], "C", "MARKET", "commerce", 2)).toThrow();
    const buildings = ["MARKET", "BUSINESS", "REDEVELOPMENT"].map((d, i) => ({ ...base, id: String(i), district: d as Building["district"] }));
    expect(() => assertCanBuild(buildings, "A", "NEW_TOWN", "commerce", 2)).toThrow();
    expect(remainingBuildingCapacity(buildings, "A")).toMatchObject({ total: 3, bySuit: { commerce: 0 } });
    const six = [...buildings, ...buildings.map((b) => ({ ...b, suit: "industry" as const }))];
    expect(() => assertCanBuild(six, "A", "WAREHOUSE", "procurement", 2)).toThrow();
    s.buildings = six; expect(() => quoteInvestment(s, "A", { type: "UPGRADE", buildingId: "0", access: "PUBLIC" })).not.toThrow();
  });
  it("district routes allow all companies and no graph/spoke restriction, max eight", () => {
    let s = rich();
    for (const district of DISTRICT_IDS) { s.currentInvestmentPlayer = "A"; s = act(s, { type: "ROUTE", district }); }
    expect(s.routes).toHaveLength(8);
    s.currentInvestmentPlayer = "A"; expect(() => act(s, { type: "ROUTE", district: "MARKET" })).toThrow();
    s.phase = "INVESTMENT"; s.investmentTurnIndex = 0; s.currentInvestmentPlayer = "B"; s = act(s, { type: "ROUTE", district: "MARKET" }, "B"); expect(s.routes.filter((r) => r.district === "MARKET")).toHaveLength(2);
    expect(accessOptions(s, "A", "MARKET")).toEqual(["OWN", "B", "PUBLIC"]);
  });
  it("defers every fee with no owner cap; owns a route but may intentionally pay another", () => {
    let s = rich("PRODUCTION"); s.buildings = [{ id: "s", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false }, { id: "h", playerId: "A", district: "BUSINESS", suit: "commerce", upgraded: true }];
    s.routes = [{ playerId: "A", district: "MARKET" }, { playerId: "B", district: "MARKET" }, { playerId: "B", district: "BUSINESS" }];
    s = act(s, { type: "USE_BUILDING", buildingId: "s", amount: 1, access: "B" });
    s = act(s, { type: "USE_BUILDING", buildingId: "h", amount: 2, access: "B" });
    expect(companyOf(s, "B").resources.cash).toBe(30); expect(companyOf(s, "A").resources.cash).toBe(39);
    expect(s.transportCharges).toHaveLength(2);
    s = settle(s); expect(companyOf(s, "A").resources.cash).toBe(37); expect(companyOf(s, "B").resources.cash).toBe(32);
    expect(s.settlement!.cashBefore.A).toBe(39); expect(s.transportCharges).toEqual([]);
  });
  it("only first construction waives public transport, not another company's fee", () => {
    const s = rich(); s.routes = [{ playerId: "B", district: "MARKET" }];
    expect(quoteInvestment(s, "A", { type: "BUILD", district: "MARKET", suit: "commerce", access: "PUBLIC" }).transport!.amount).toBe(0);
    expect(quoteInvestment(s, "A", { type: "BUILD", district: "MARKET", suit: "commerce", access: "B" }).transport!.amount).toBe(1);
    const next = act(s, { type: "BUILD", district: "MARKET", suit: "commerce", access: "PUBLIC" });
    expect(quoteInvestment(next, "A", { type: "BUILD", district: "WORKSHOP", suit: "industry", access: "PUBLIC" }).transport!.amount).toBe(2);
    expect(quoteInvestment(next, "A", { type: "UPGRADE", buildingId: next.buildings[0]!.id, access: "PUBLIC" }).transport!.amount).toBe(2);
  });
  it("settles to negative cash before final ranking and money points", () => {
    const s = fresh(); s.round = 10; companyOf(s, "A").resources.cash = 4;
    s.transportCharges = [{ payer: "A", payee: null, amount: 6, district: "MARKET", reason: "SALE" }];
    const end = settle(s); expect(end.phase).toBe("FINISHED"); expect(companyOf(end, "A").resources.cash).toBe(-2);
    expect(end.result!.ranking.at(-1)).toMatchObject({ playerId: "A", deficit: true, value: { cash: 0 } });
  });
  it("completes a sixth project slot immediately and makes refunds available in this round", () => {
    let s = rich(); const p = s.publicProjects[0]!;
    p.slots.forEach((slot, i) => { slot.playerId = i < 5 ? i < 3 ? "A" : "B" : null; });
    companyOf(s, "A").resources = { cash: 0, goods: 0, materials: 1 };
    s = act(s, { type: "CONTRIBUTE", projectId: p.id, slot: 5, benefit: "NONE" });
    expect(companyOf(s, "A").resources.cash).toBe(4); expect(companyOf(s, "B").resources.cash).toBe(32);
    expect(s.cityDevelopment).toBe(5); expect(s.events.some((e) => e.type === "PROJECT_COMPLETED")).toBe(true);
    s.currentInvestmentPlayer = "A"; expect(() => quoteInvestment(s, "A", { type: "BUILD", district: "MARKET", suit: "commerce", access: "PUBLIC" })).not.toThrow();
    expect(() => quoteInvestment(s, "A", { type: "CONTRIBUTE", projectId: p.id, slot: 5, benefit: "NONE" })).toThrow();
    expect(projectValue(s.publicProjects[0]!, "A")).toBe(5);
  });
  it("scores completed projects only, with no tied-most bonus", () => {
    const p = fresh().publicProjects[0]!; p.slots.forEach((s, i) => s.playerId = i < 3 ? "A" : "B");
    expect(projectValue(p, "A")).toBe(3); expect(projectValue(p, "B")).toBe(3); p.slots[0]!.playerId = null; expect(projectValue(p, "A")).toBe(0);
  });
  it("counts upgraded buildings as five, up to eight routes, and resource floors", () => {
    const s = fresh(); companyOf(s, "A").resources = { cash: 11, materials: 4, goods: 4 };
    s.buildings = [{ id: "b", playerId: "A", suit: "industry", district: "WORKSHOP", upgraded: true }];
    s.routes = DISTRICT_IDS.map((district) => ({ district, playerId: "A" }));
    expect(companyValue(companyOf(s, "A"), s.buildings, s.routes, s.publicProjects)).toEqual({ buildings: 5, routes: 8, projects: 0, cash: 2, inventory: 2, assets: 13, total: 17 });
  });
  it.each(["DEFICIT", "VALUE", "ASSETS", "BUILDINGS", "PROJECTS", "TIED"] as const)("uses final tiebreak %s", (kind) => {
    const s = fresh(); const value: ValueBreakdown = { buildings: 3, routes: 2, projects: 2, assets: 7, cash: 0, inventory: 3, total: 10 };
    const scores = Object.fromEntries(players.map((p) => [p, { ...value }]));
    if (kind === "DEFICIT") companyOf(s, "B").resources.cash = -1;
    if (kind === "VALUE") scores.A!.total++;
    if (kind === "ASSETS") scores.A!.assets++;
    if (kind === "BUILDINGS") scores.A!.buildings++;
    if (kind === "PROJECTS") scores.A!.projects++;
    const ranking = rankCompanies(s.companies, scores);
    if (kind === "TIED") expect(ranking.map((r) => r.rank)).toEqual([1, 1, 1, 1]);
    else if (kind === "DEFICIT") expect(ranking.at(-1)?.playerId).toBe("B");
    else { expect(ranking[0]!.playerId).toBe("A"); expect(ranking[0]!.tieBreak).toBe(kind); expect(ranking[1]!.rank).toBe(2); }
  });
});
