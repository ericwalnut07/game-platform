import { describe, expect, it } from "vitest";
import { AUDITOR_TARGETS, auditFee, districtAuditTarget, selectAuditor } from "../../../src/games/commercial-hub/auditor";
import { DISTRICTS, OPPORTUNITIES } from "../../../src/games/commercial-hub/data";
import { changeHubConnection, quoteMarket, startRound } from "../../../src/games/commercial-hub/engine";
import { quoteBuildingUse } from "../../../src/games/commercial-hub/income";
import { legalInvestments, quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { awardOpportunity } from "../../../src/games/commercial-hub/opportunities";
import { createPublicProjects, projectSlotCost, projectValue } from "../../../src/games/commercial-hub/projects";
import { companyValue } from "../../../src/games/commercial-hub/scoring";
import { companyOf, type TrickResult } from "../../../src/games/commercial-hub/state";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { parseHubAction } from "../../../src/games/commercial-hub/web-actions";
import { hubEventPayload } from "../../../src/server/lib/commercial-hub-log";
import { act, fresh, players, rich, rng, settle } from "./helpers";

function result(ranking: string[], reversed = false, id: "development" | "special-materials" = "development"): TrickResult {
  return { round: 2, index: 0, opportunity: { id, name: id, suit: "administration", trump: null }, played: [], ranking, rewardRanking: reversed ? [...ranking].reverse() : [...ranking] };
}
describe("v0.5 public projects", () => {
  it.each([[1, ["market", "station"]], [2, ["market", "station", "city-hall"]], [3, ["market", "station", "city-hall", "logistics-port", "industrial-institute"]], [4, ["market", "station", "city-hall", "logistics-port", "industrial-institute"]]] as const)("unlocks exactly the projects at Lv%s", (level, ids) => {
    expect(createPublicProjects(level).map((p) => p.id)).toEqual(ids);
  });
  it.each([["market", 1, 2, 2], ["station", 2, 1, 2], ["city-hall", 2, 2, 3], ["logistics-port", 3, 2, 3], ["industrial-institute", 2, 3, 3]] as const)("has two slots of each exact cost for %s", (id, m, g, c) => {
    const project = createPublicProjects(3).find((p) => p.id === id)!;
    expect(project.slots).toHaveLength(6);
    expect(project.slots.map((s) => [s.resource, s.amount])).toEqual([["materials", m], ["materials", m], ["goods", g], ["goods", g], ["cash", c], ["cash", c]]);
    for (const [i, s] of project.slots.entries()) expect(projectSlotCost(project, i)).toEqual({ cash: 0, goods: 0, materials: 0, [s.resource]: s.amount });
  });
  it.each([[0, 0], [1, 1], [2, 3], [3, 5], [4, 7], [5, 9], [6, 11]])("scores %s own slots as %s without any majority bonus", (count, value) => {
    const project = createPublicProjects()[0]!;
    project.slots.forEach((s, i) => s.playerId = i < count ? "A" : "B");
    expect(projectValue(project, "A")).toBe(value);
    project.slots[0]!.playerId = null; expect(projectValue(project, "A")).toBe(0);
  });
  it.each(["materials", "goods", "cash"] as const)("discounts only one unit of the selected %s cost, never audit fees", (resource) => {
    const s = rich(); s.round = 2; s.config.auditor = true; s.auditor.target = "PUBLIC_PROJECTS";
    s.publicProjects = createPublicProjects(3); s.benefits.A!.project = ["DISCOUNT"];
    const p = s.publicProjects.find((p) => p.id === "logistics-port")!, slot = p.slots.findIndex((s) => s.resource === resource);
    const q = quoteInvestment(s, "A", { type: "CONTRIBUTE", projectId: p.id, slot, benefit: "DISCOUNT" });
    expect(q.normalCost[resource]).toBe(p.slots[slot]!.amount - 1); expect(q.auditFee).toBe(1);
    expect(q.cost.cash).toBe(q.normalCost.cash + 1);
    const next = act(s, q.action); expect(next.benefits.A!.project).toEqual([]);
    companyOf(s, "A").resources.cash = q.normalCost.cash; expect(() => act(s, q.action)).toThrow();
  });
  it("requires full payment before giving the second-place cash rebate", () => {
    const s = rich(); s.benefits.A!.project = ["REBATE"]; companyOf(s, "A").resources.cash = 1;
    const a = { type: "CONTRIBUTE", projectId: "market", slot: 4, benefit: "REBATE" } as const;
    expect(() => act(s, a)).toThrow(); companyOf(s, "A").resources.cash = 2;
    expect(companyOf(act(s, a), "A").resources.cash).toBe(1);
    expect(() => parseHubAction({ ...a, benefit: "FREE" }, "A")).toThrow();
  });
});
describe("v0.5 procurement and disposal", () => {
  it.each([[false, 1, 2], [true, 1, 2], [true, 2, 3]] as const)("warehouse/center upgraded=%s cash mode=%s supplies %s", (upgraded, amount, materials) => {
    const s = rich("PROCUREMENT"); s.buildings = [{ id: "w", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded }];
    const q = quoteBuildingUse(s, "A", "w", amount, "PUBLIC"); expect(q.cost.cash).toBe(amount); expect(q.reward.materials).toBe(materials);
    const used = act(s, { type: "USE_BUILDING", buildingId: "w", amount, access: "PUBLIC" });
    expect(() => act(used, { type: "USE_BUILDING", buildingId: "w", amount: 1, access: "PUBLIC" })).toThrow();
  });
  it("offers first/second purchase rewards for cash1 with materials2/1 and no market count", () => {
    let s = rich("REWARD"); awardOpportunity(s, { ...OPPORTUNITIES.find((o) => o.id === "purchase")!, trump: null }, players);
    expect(s.rewardChoices.map((q) => [q.cash, q.materials])).toEqual([[1, 2], [1, 1]]);
    s = act(s, { type: "CLAIM_REWARD", amount: 1 }); s = act(s, { type: "CLAIM_REWARD", amount: 1 }, "B");
    expect(companyOf(s, "A").resources).toEqual({ cash: 29, materials: 12, goods: 10 });
    expect(companyOf(s, "B").resources).toEqual({ cash: 29, materials: 11, goods: 10 });
    expect(s.usage.A!.purchases).toBe(0); expect(s.transportCharges).toEqual([]);
  });
  it.each(["dispose-good", "dispose-material"] as const)("permits %s in R1 with one shared disposal limit and separate market limit", (action) => {
    let s = rich("PROCUREMENT"); expect(s.round).toBe(1); expect(s.specialBoomPlayed).toBe(false);
    const old = { ...companyOf(s, "A").resources };
    s = act(s, { type: "MARKET", action });
    expect(companyOf(s, "A").resources.cash).toBe(old.cash + 1);
    expect(companyOf(s, "A").resources[action === "dispose-good" ? "goods" : "materials"]).toBe(9);
    for (const a of ["dispose-good", "dispose-material"] as const) expect(() => act(s, { type: "MARKET", action: a })).toThrow("1R1回");
    s = act(s, { type: "MARKET", action: "buy-material" }); expect(() => quoteMarket(s, "A", "buy-material")).toThrow("1R1回");
    s.round++; startRound(s, rng()); s.phase = "PROCUREMENT"; expect(quoteMarket(s, "A", action).reward.cash).toBe(1);
  });
  it.each([[5, 3, 0, 0], [6, 4, 1, 1], [11, 7, 1, 1], [12, 8, 2, 2]])("floors cash%s and combined inventory%s independently", (cash, inventory, cashPoints, inventoryPoints) => {
    const score = companyValue({ playerId: "A", resources: { cash, materials: 1, goods: inventory - 1 } }, [], [], []);
    expect(score.cash).toBe(cashPoints); expect(score.inventory).toBe(inventoryPoints);
  });
});
describe("v0.5 auditor rights and suit groups", () => {
  it("counts reversed reward eligibility rather than true winners during credit contraction", () => {
    const rankings = [result(["A", "B", "C", "D"], true), result(["A", "B", "C", "D"], true)];
    const selection = selectAuditor(players, "C", rankings); expect(selection.playerId).toBe("B");
    expect(selection.standings.find((s) => s.playerId === "A")).toMatchObject({ missed: 2, averageRank: 1 });
    expect(selection.standings.find((s) => s.playerId === "D")).toMatchObject({ missed: 0, averageRank: 4 });
    expect(selection.tieBreak).toBe("AVERAGE_RANK");
  });
  it("uses missed count before rank, rank before clockwise seat, and the round's first lead", () => {
    const byMissed = selectAuditor(players, "A", [result(["A", "B", "C", "D"]), result(["D", "B", "A", "C"])]);
    expect(byMissed.playerId).toBe("C"); expect(byMissed.tieBreak).toBe("MISSED");
    const byRank = selectAuditor(players, "A", [result(["A", "B", "C", "D"])]);
    expect(byRank.playerId).toBe("D"); expect(byRank.tieBreak).toBe("AVERAGE_RANK");
    const tied = [result(["A", "B", "C", "D"]), result(["B", "A", "D", "C"])];
    expect(selectAuditor(players, "C", tied)).toMatchObject({ playerId: "C", tieBreak: "CLOCKWISE_SEAT" });
    expect(selectAuditor(players, "D", tied).playerId).toBe("D");
    expect(selectAuditor(players, "A", tied).playerId).toBe("C");
    const s = fresh(); s.round = 3; s.trickLeader = "D"; startRound(s, rng()); expect(s.roundTrickStarter).toBe("D");
  });
  it("counts the third-place special-materials reward as acquired", () => {
    const selection = selectAuditor(players, "A", [result(players, false, "special-materials")]);
    expect(selection.standings.map((s) => [s.playerId, s.missed])).toEqual([["D", 1], ["C", 0], ["B", 0], ["A", 0]]);
    expect(selection.tieBreak).toBe("MISSED");
  });
  it("has exactly five targets, each district suit contains two districts", () => {
    expect(AUDITOR_TARGETS).toEqual(["commerce", "industry", "procurement", "administration", "PUBLIC_PROJECTS"]);
    for (const target of AUDITOR_TARGETS.slice(0, 4)) expect(DISTRICTS.filter((d) => districtAuditTarget(d.id) === target)).toHaveLength(2);
    const s = rich(); s.round = 2; s.config.auditor = true;
    for (const target of AUDITOR_TARGETS) {
      s.auditor.target = target;
      for (const d of DISTRICTS) expect(auditFee(s, d.id)).toBe(Number(districtAuditTarget(d.id) === target));
    }
  });
  it("charges upgrades/routes/use in both suit districts, including the placer, never construction", () => {
    let s = rich(); s.round = 2; s.config.auditor = true; s.auditor.target = "commerce";
    s.routes = [{ playerId: "B", district: "MARKET" }];
    for (const district of ["MARKET", "BUSINESS"] as const) {
      const quotes = legalInvestments(s, "A").filter((q) => q.action.type === "BUILD" && q.action.district === district);
      expect(quotes).toHaveLength(1); expect(quotes[0]).toMatchObject({ auditFee: 0, transport: null }); expect(quotes[0]!.action).not.toHaveProperty("access");
      expect(quoteInvestment(s, "A", { type: "ROUTE", district }).auditFee).toBe(1);
    }
    const q = legalInvestments(s, "A").find((q) => q.action.type === "BUILD" && q.action.district === "MARKET")!;
    companyOf(s, "A").resources.cash = q.normalCost.cash; s = act(s, q.action); expect(s.transportCharges).toEqual([]);
    s.phase = "PRODUCTION"; companyOf(s, "A").resources.cash = 0;
    expect(() => quoteBuildingUse(s, "A", s.buildings[0]!.id, 1, "PUBLIC")).toThrow();
    companyOf(s, "A").resources.cash = 1; expect(quoteBuildingUse(s, "A", s.buildings[0]!.id, 1, "PUBLIC").auditFee).toBe(1);
  });
});
describe("v0.5 ending, restoration and private aggregate logs", () => {
  it.each([[7, 10, "LV4_BY_R8"], [8, 10, "LV4_BY_R8"], [9, 11, "LV4_R9"], [10, 12, "LV4_R10_OR_LATER"], [11, 12, "LV4_R10_OR_LATER"], [12, 12, "LV4_R10_OR_LATER"]] as const)("first Lv4 in R%s locks R%s through reload/reconnect and full settlement", (round, finalRound, reason) => {
    let s = fresh(); s.round = round; s.cityLevel = 3; s.cityDevelopment = 64;
    s = settle(s); expect(s.finalRoundDecision).toMatchObject({ round, finalRound, reason }); expect(s.cityReachedRounds["4"]).toBe(round);
    const restored = changeHubConnection(changeHubConnection(JSON.parse(JSON.stringify(s)), "A", false, 1000), "A", true, 2000);
    expect(buildHubView(restored, "A").finalRoundDecision).toEqual(s.finalRoundDecision);
    if (s.result) { expect(s.phase).toBe("FINISHED"); return; }
    if (round < finalRound) { s = restored; s.round = finalRound - 1; s = settle(s); expect(s.result).toBeNull(); s.round++; }
    s.transportCharges = [{ payer: "A", payee: "B", amount: 1, district: "MARKET", reason: "SALE" }];
    const before = companyOf(s, "A").resources.cash; s = settle(s);
    expect(s.phase).toBe("FINISHED"); expect(companyOf(s, "A").resources.cash).toBe(before - 1); expect(s.finalRoundDecision).toMatchObject({ round, finalRound, reason });
  });
  it("reaches the hard R12 end even without Lv4 and records level arrival and private per-round economics", () => {
    let s = fresh(); s.cityDevelopment = 16; s = settle(s); expect(s.cityReachedRounds).toEqual({ "2": 1, "3": null, "4": null });
    s.round = 2; s.cityDevelopment = 32; s = settle(s); expect(s.cityReachedRounds["3"]).toBe(2);
    s.round = 12; s = settle(s); expect(s.finalRoundDecision?.reason).toBe("NO_LV4_BY_R12"); expect(s.result?.round).toBe(12);
    const event = s.events.find((e) => e.type === "ROUND_SETTLED" && e.round === 12)!;
    const payload = hubEventPayload(s, event); expect(payload).toHaveProperty("statistics");
    expect(s.roundStatistics.at(-1)!.companies).toHaveLength(4);
    const v = buildHubView(s, "A"); expect(v).not.toHaveProperty("roundStatistics"); expect(v.events).not.toContainEqual(expect.objectContaining({ data: expect.objectContaining({ statistics: expect.anything() }) }));
    expect(v).not.toHaveProperty("companyValues");
  });
});
