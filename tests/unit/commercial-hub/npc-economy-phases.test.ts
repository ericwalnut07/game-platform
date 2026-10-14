import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { commercialHubGameModule as module } from "../../../src/games/commercial-hub/module";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { decideNpc, evaluateNpcInvestment, NPC_V1_LOGIC_VERSION } from "../../../src/games/commercial-hub/npc";
import { majorNpcPurchases } from "../../../src/games/commercial-hub/next-npc";
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
describe("formal 1.0 experimental NPC investment phases", () => {
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
