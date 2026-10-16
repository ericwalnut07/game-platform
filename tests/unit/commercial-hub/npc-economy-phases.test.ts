import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { commercialHubGameModule as module } from "../../../src/games/commercial-hub/module";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { decideNpc, evaluateNpcInvestment, NPC_V1_LOGIC_VERSION, NPC_PROFILES } from "../../../src/games/commercial-hub/npc";
import { majorNpcPurchases } from "../../../src/games/commercial-hub/major-npc";
import type { HubState } from "../../../src/games/commercial-hub/state";

function formal(round = 2): HubState {
  const config = module.parseConfig({ horizon: "12-14", majorInvestments: true, trickRule: "BID", auditor: true });
  const s = module.createInitialState({ matchId: "economy-phase", players: ["A", "B", "C", "D"].map(id => ({ id })), rng: new SeededRandom(71), config });
  s.round = round; s.finalRound = 14; s.cityLevel = round < 5 ? 2 : 3;
  s.phase = "INVESTMENT"; s.currentInvestmentPlayer = "A";
  s.publicProjects.forEach(p => p.availableRound = 1);
  s.companies.find(c => c.playerId === "A")!.resources = { cash: 14, materials: 5, goods: 5 };
  return s;
}
describe("formal 1.0 adopted NPC investment phases", () => {
  it("prefers founding construction over ordinary early public contribution", () => {
    const view = buildHubView(formal(), "A");
    const builds = view.investments.filter(q => q.action.type === "BUILD");
    const projects = view.investments.filter(q => q.action.type === "CONTRIBUTE");
    expect(builds.length).toBeGreaterThan(0);
    expect(projects.length).toBeGreaterThan(0);
    for (const type of ["standard", "development"] as const) {
      const construction = Math.max(...builds.map(q => evaluateNpcInvestment(view, type, q).score));
      const contribution = Math.max(...projects.map(q => evaluateNpcInvestment(view, type, q).score));
      expect(construction).toBeGreaterThan(contribution);
    }
  });
  it("allows a real public opportunity benefit to offset the early penalty", () => {
    const view = buildHubView(formal(), "A");
    const plain = view.investments.find(q => q.action.type === "CONTRIBUTE" && q.action.benefit !== "DISCOUNT_REBATE");
    expect(plain).toBeDefined();
    if (!plain || plain.action.type !== "CONTRIBUTE") throw Error("project quote unavailable");
    const better = { ...plain, action: { ...plain.action, benefit: "DISCOUNT_REBATE" as const } };
    expect(evaluateNpcInvestment(view, "standard", better).score).toBeGreaterThan(evaluateNpcInvestment(view, "standard", plain).score);
  });
  it("keeps expanding through the middle rounds instead of imposing the old four-building penalty", () => {
    const s = formal(7);
    s.buildings = [
      { id: "a1", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false },
      { id: "a2", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false },
      { id: "a3", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: false },
      { id: "a4", playerId: "A", district: "BUSINESS", suit: "commerce", upgraded: false }
    ];
    const view = buildHubView(s, "A");
    expect(view.investments.some(q => q.action.type === "BUILD")).toBe(true);
    const d = decideNpc(view, "standard")!;
    expect(d.logicVersion).toBe(NPC_V1_LOGIC_VERSION);
    expect(d.alternatives?.some(q => q.action.type === "BUILD" && Number.isFinite(q.score))).toBe(true);
  });
  it("values renewable in-kind payment more for the production profile", () => {
    const s = formal(7);
    s.buildings = [
      { id: "a1", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false },
      { id: "a2", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false },
      { id: "a3", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: false }
    ];
    s.companies.find(c => c.playerId === "A")!.resources = { cash: 16, materials: 8, goods: 7 };
    const view = buildHubView(s,"A");
    const candidates = view.investments.filter(q => q.action.type === "BUILD" && q.action.suit === "industry");
    const cashQuote = candidates.find(q => q.action.type === "BUILD" && q.action.freePayment?.cash === 2);
    if (!cashQuote || cashQuote.action.type !== "BUILD") throw Error("cash quote unavailable");
    const inKindQuote = candidates.find(q => q.action.type === "BUILD" && q.action.district === cashQuote.action.district &&
      q.action.suit === cashQuote.action.suit && q.action.freePayment?.materials === 2);
    expect(inKindQuote).toBeDefined();
    const delta = (type: "standard"|"production") =>
      evaluateNpcInvestment(view,type,inKindQuote!).score - evaluateNpcInvestment(view,type,cashQuote).score;
    expect(delta("production")).toBeGreaterThan(delta("standard"));
    expect(delta("production")).toBeGreaterThan(0);
  });
  it("adds procurement preference without changing other NPC profiles", () => {
    // Measured preference adjustment, not a separate AI or new game rule.
    expect(NPC_PROFILES.production.procurement).toBeGreaterThan(1);
    expect(NPC_PROFILES.standard.procurement).toBe(1);
    expect(NPC_PROFILES.commerce.procurement).toBe(1);
  });
  it("development invests more in upgrading assets connected to its own routes", () => {
    const s = formal(7);
    s.buildings = [
      { id: "factory", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false },
      { id: "store", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false },
      { id: "supply", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: false }
    ];
    s.companies.find(c => c.playerId === "A")!.resources = { cash: 20, materials: 6, goods: 5 };
    s.routes = [{ playerId: "A", district: "WORKSHOP" }];
    const linked = buildHubView(s,"A");
    const upgrade = linked.investments.find(q => q.action.type === "UPGRADE" && q.action.buildingId === "factory");
    expect(upgrade).toBeDefined();
    if (!upgrade) return;
    const unlinked = { ...linked, routes: [] };
    const routeEffectFor = (type: "development" | "standard") =>
      evaluateNpcInvestment(linked,type,upgrade).score -
      evaluateNpcInvestment(unlinked,type,upgrade).score;
    expect(routeEffectFor("development")).toBeGreaterThan(routeEffectFor("standard") + 1);
  });
  it("development prefers public projects with fundable remaining slots", () => {
    const s = formal(7);
    s.buildings = [
      { id: "factory", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false },
      { id: "store", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false }
    ];
    const project = s.publicProjects[0]!;
    project.slots.slice(0,3).forEach(slot => { slot.playerId = "A"; });
    const cashRich = buildHubView(s,"A");
    const q = cashRich.investments.find(x => x.action.type === "CONTRIBUTE" && x.action.projectId === project.id && x.action.benefit === "NONE");
    expect(q).toBeDefined();
    if (!q) return;
    const broke = structuredClone(cashRich);
    for (const company of broke.companies) if (company.playerId !== "A")
      company.resources = { cash: 0, materials: 0, goods: 0 };
    expect(evaluateNpcInvestment(cashRich,"development",q).score)
      .toBeGreaterThanOrEqual(evaluateNpcInvestment(broke,"development",q).score);
  });
  it("discounts large purchases that would consume operating capital", () => {
    const rich = formal(7);
    rich.next!.market = ["logistics-monopoly", null, null];
    rich.companies.find(c => c.playerId === "A")!.resources = { cash: 24, materials: 6, goods: 6 };
    const limited = structuredClone(rich);
    limited.companies.find(c => c.playerId === "A")!.resources = { cash: 5, materials: 6, goods: 6 };
    const best = (s: HubState) => Math.max(...majorNpcPurchases(buildHubView(s, "A"), "standard").filter(x => x.action.type === "BUY_MAJOR").map(x => x.score));
    expect(best(rich)).toBeGreaterThan(best(limited));
  });
});

