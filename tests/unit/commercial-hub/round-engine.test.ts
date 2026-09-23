import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { createHubState, drawOpportunities, reduceHubState } from "../../../src/games/commercial-hub/engine";
import { CITY_CONDITIONS, OPPORTUNITIES } from "../../../src/games/commercial-hub/data";
import { trickRanking } from "../../../src/games/commercial-hub/cards";
import { legalInvestments, networkUseKey, quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { incomeTasks, productiveIncomePlan, resolveIncome } from "../../../src/games/commercial-hub/income";
import { createPublicProject } from "../../../src/games/commercial-hub/projects";
import { NO_COST } from "../../../src/games/commercial-hub/resources";
import { commercialHubGameModule, hubPhaseKey } from "../../../src/games/commercial-hub/module";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { parseHubAction } from "../../../src/games/commercial-hub/web-actions";
import type { HubAction, HubState } from "../../../src/games/commercial-hub/state";
import type { Building, Resources } from "../../../src/games/commercial-hub/types";

const ids = ["A", "B", "C", "D"];
const fixture = () => createHubState("test", ids, new SeededRandom(42));
const step = (state: HubState, action: HubAction) => reduceHubState(state, action, new SeededRandom(123));
function resources(state: HubState, playerId: string, value: Partial<Resources>) {
  state.companies = state.companies.map((c) => c.playerId === playerId ? { ...c, resources: { ...NO_COST, ...value } } : c);
}
function investment(state: HubState, playerId = "A") {
  state.phase = "INVESTMENT"; state.investmentTurn = { playerId, step: "INVESTMENT", negotiation: null };
  return state;
}
const building = (id: string, suit: Building["suit"], upgraded = false, district: Building["district"] = "MARKET"): Building => ({ id, suit, upgraded, district, playerId: "A" });
function roundEnd(state: HubState) {
  state.phase = "INCOME";
  let next = state;
  for (const playerId of ids) next = step(next, { type: "INCOME", playerId, selections: {} });
  return next;
}

describe("confirmed v0.1 round rules", () => {
  it("starts with four private hands, fixed resources, no project and no optional configuration", () => {
    const state = fixture();
    expect(state.companies.map((c) => c.resources)).toEqual(ids.map(() => ({ materials: 2, goods: 1, cash: 4, influence: 0 })));
    expect(state.activePublicProject).toBeNull();
    expect(commercialHubGameModule.parseConfig({})).toEqual({});
    expect(() => commercialHubGameModule.parseConfig({ playerCount: 3 })).toThrow();
    expect(() => createHubState("bad", ids.slice(0, 3), new SeededRandom(1))).toThrow();
  });
  it("R1 locks City Lv during the round, then opens the first project at the following round start", () => {
    let state = investment(fixture()); state.cityDevelopment = 7;
    state = step(state, { type: "BUILD", playerId: "A", district: "WORKSHOP", suit: "industry", access: "OWN" });
    expect(state.cityDevelopment).toBe(8); expect(state.cityLevel).toBe(1);
    expect(state.activePublicProject).toBeNull();
    expect(() => quoteInvestment(state, "B", { type: "BUILD", district: "BUSINESS", suit: "industry", access: "MUNICIPAL" })).toThrow(/Lv2/);
    state = roundEnd(state); expect(state.cityLevel).toBe(2); expect(state.activePublicProject).toBeNull();
    state = step(state, { type: "ADVANCE" }); expect(state.activePublicProject?.name).toBe("中央市場");
    expect(state.round).toBe(2);
  });
  it("R1 increments development by one for both upgrades and routes", () => {
    let state = investment(fixture()); state.buildings = [building("w", "industry")];
    state = step(state, { type: "UPGRADE", playerId: "A", buildingId: "w" });
    expect(state.cityDevelopment).toBe(1);
    investment(state, "B"); state = step(state, { type: "ROUTE", playerId: "B", edgeId: "E01" });
    expect(state.cityDevelopment).toBe(2);
  });
  it("R2 draws every base suit, allows duplicates, and uses the confirmed 70/10/10/10 weighting", () => {
    const rng = new SeededRandom(987), counts: Record<string, number> = { commerce: 0, industry: 0, logistics: 0, civic: 0 };
    let duplicate = false;
    for (let i = 0; i < 6000; i++) {
      const drawn = drawOpportunities(CITY_CONDITIONS[1], rng);
      expect(drawn).toHaveLength(6);
      for (const suit of Object.keys(counts)) {
        const n = drawn.filter((o) => OPPORTUNITIES.find((entry) => entry.id === o)!.suit === suit).length;
        expect(n).toBeGreaterThanOrEqual(1); counts[suit]! += n - 1;
      }
      duplicate ||= new Set(drawn).size < drawn.length;
    }
    expect(duplicate).toBe(true); expect(counts.industry! / 12000).toBeGreaterThan(.68); expect(counts.industry! / 12000).toBeLessThan(.72);
    for (const suit of ["commerce", "logistics", "civic"]) expect(counts[suit]! / 12000).toBeGreaterThan(.08);
  });
  it("R2 gives no-priority extras uniformly and both opportunities of each suit equally", () => {
    const rng = new SeededRandom(12), counts: Record<string, number> = {};
    for (let i = 0; i < 6000; i++) for (const o of drawOpportunities(CITY_CONDITIONS[0], rng)) counts[o] = (counts[o] ?? 0) + 1;
    for (const o of OPPORTUNITIES) { expect(counts[o.id]).toBeGreaterThan(3500); expect(counts[o.id]).toBeLessThan(4000); }
    expect(drawOpportunities(CITY_CONDITIONS[2], rng)).toHaveLength(4);
  });
  it.each([0, 1, 2, 3])("R3 consumes %i route credits cash first, no more than actual cost", (credits) => {
    const state = fixture(); state.credits.A!.route = credits;
    const q = quoteInvestment(state, "A", { type: "ROUTE", edgeId: "E01" });
    expect(q.cost.cash).toBe(credits > 0 ? 0 : 1); expect(q.cost.materials).toBe(credits >= 2 ? 0 : 1);
    expect(q.uses.routeCredit).toBe(Math.min(credits, 2));
  });
  it("R3 carries unused credits and consumes the expiring LC discount first", () => {
    let state = fixture(); state.credits.A!.route = 4; state.credits.A!.transport = 3;
    state.buildings = [building("lc", "logistics", true)];
    const q = quoteInvestment(state, "A", { type: "ROUTE", edgeId: "E01" });
    expect(q.uses.route).toEqual(["lc"]); expect(q.uses.routeCredit).toBe(1); expect(q.cost).toEqual(NO_COST);
    state.phase = "ROUND_END"; state = step(state, { type: "ADVANCE" });
    expect(state.credits.A!.route).toBe(4); expect(state.credits.A!.transport).toBe(3);
  });
  it("R4 stacks building transport discounts before carry-over credits", () => {
    const state = fixture(); state.cityLevel = 2; resources(state, "A", { materials: 2, cash: 8, influence: 2 });
    state.credits.A!.transport = 3; state.buildings = [building("l1", "logistics"), building("l2", "logistics", true, "WORKSHOP")];
    const q = quoteInvestment(state, "A", { type: "BUILD", district: "BUSINESS", suit: "commerce", access: "MUNICIPAL" });
    expect(q.transport?.fee).toBe(0); expect(q.uses.transport).toEqual(["l1", "l2"]); expect(q.uses.transportCredit).toBe(0);
    state.discountUses.transport = ["l1"];
    const partial = quoteInvestment(state, "A", q.action); expect(partial.uses.transportCredit).toBe(1); expect(partial.transport?.fee).toBe(0);
  });
  it.each([0, 1])("R4 pays only the actual fee and treats the first discounted use as judged (credit=%i)", (credit) => {
    let state = investment(fixture()); state.cityLevel = 2; state.routeOwnership = { E01: "B", E09: "B", E13: "B" };
    resources(state, "A", { materials: 2, cash: 10, influence: 2 }); state.credits.A!.transport = credit;
    const before = state.companies[1]!.resources.cash;
    state = step(state, { type: "BUILD", playerId: "A", district: "BUSINESS", suit: "commerce", access: "B" });
    expect(state.companies[1]!.resources.cash).toBe(before + 1 - credit);
    expect(state.discountUses.transport).toContain(networkUseKey("A", "B"));
    const second = quoteInvestment(state, "A", { type: "BUILD", district: "INDUSTRIAL", suit: "industry", access: "B" });
    expect(second.transport?.fee).toBe(0); expect(second.uses.transportCredit).toBe(0);
  });
  it("R5 completes, scores, develops and immediately reveals the next project", () => {
    let state = fixture(); state.cityLevel = 2; state.phase = "REWARD";
    const p = createPublicProject("p1", "中央市場"); state.activePublicProject = { ...p, slots: p.slots.map((s, i) => ({ ...s, playerId: i < 5 ? "A" : null })) };
    state.rewardChoices = [{ playerId: "B", kind: "PROJECT" }];
    const before = state.companies[1]!.resources;
    state = step(state, { type: "CLAIM_REWARD", playerId: "B", amount: 5 });
    expect(state.companies[1]!.resources).toEqual(before); expect(state.cityDevelopment).toBe(3);
    expect(state.completedPublicProjects).toHaveLength(1); expect(state.activePublicProject?.name).toBe("中央駅");
    expect(state.companyValues.A!.projects).toBe(7); expect(state.companyValues.B!.projects).toBe(1);
  });
  it("R5 rewards influence without carrying a free slot when no project exists", () => {
    let state = fixture(); state.phase = "TRICK"; state.opportunities = ["public-project"];
    state.playedCards = [{ playerId: "A", card: { suit: "commerce", rank: 8 } }, { playerId: "B", card: { suit: "commerce", rank: 7 } }, { playerId: "C", card: { suit: "commerce", rank: 6 } }];
    state.playerHands.D = [{ suit: "commerce", rank: 1 }]; state.trump = null;
    state = step(state, { type: "PLAY_CARD", playerId: "D", card: state.playerHands.D[0]! });
    expect(state.companies[0]!.resources.influence).toBe(2); expect(state.companies[1]!.resources.influence).toBe(1);
    expect(state.rewardChoices).toEqual([]);
  });
  it("R5 rejects occupied free slots atomically", () => {
    const state = fixture(); state.phase = "REWARD"; state.rewardChoices = [{ playerId: "A", kind: "PROJECT" }];
    const p = createPublicProject("p", "中央市場"); state.activePublicProject = { ...p, slots: p.slots.map((s, i) => ({ ...s, playerId: i === 0 ? "B" : null })) };
    const before = structuredClone(state);
    expect(() => step(state, { type: "CLAIM_REWARD", playerId: "A", amount: 0 })).toThrow(); expect(state).toEqual(before);
  });
  it("R6 processes factory/workshop, business, trading house/shop, then civic; newly built abilities work", () => {
    const state = fixture(); resources(state, "A", { materials: 2 });
    state.buildings = [building("shop", "commerce"), building("workshop", "industry"), building("branch", "civic"), building("factory", "industry", true), building("house", "commerce", true), building("hq", "civic", true)];
    state.credits.A!.businessSale = 1; state.credits.A!.productionBoost = 1;
    expect(incomeTasks(state, "A").map((t) => t.id)).toEqual(["factory", "workshop", "business-bonus", "house", "shop", "branch", "hq"]);
    const result = resolveIncome(state, "A", productiveIncomePlan(state, "A"));
    expect(result.companies[0]!.resources).toEqual({ materials: 0, goods: 2, cash: 10, influence: 2 });
    expect(result.credits.A!.productionBoost).toBe(0); expect(result.credits.A!.businessSale).toBe(0);
    expect(state.companies[0]!.resources.materials).toBe(2);
  });
  it("R6 makes all production/sales optional, preserving unused rights", () => {
    const state = fixture(); state.buildings = [building("f", "industry", true)]; state.credits.A!.productionBoost = 1;
    const result = resolveIncome(state, "A", {});
    expect(result.companies).toEqual(state.companies); expect(result.credits.A!.productionBoost).toBe(1);
    resources(state, "A", {}); expect(() => resolveIncome(state, "A", { f: 1 })).toThrow();
  });
  it("R6 cannot use an upgraded building again after its base ability was used", () => {
    const state = fixture(); state.buildings = [building("f", "industry", true)]; state.abilityUses = [{ round: 1, buildingId: "f", ability: "production" }];
    expect(() => resolveIncome(state, "A", { f: 1 })).toThrow(/使用済み/);
  });
  it.each([true, false])("R6 activates bonuses only next round and fixes the port decision (connected=%s)", (connected) => {
    let state = fixture();
    state.districtBonuses = ["MARKET", "WORKSHOP", "GOV", "WAREHOUSE", "BUSINESS", "INDUSTRIAL", "NEW_TOWN", "PORT"].map((district) => ({ playerId: "A", district: district as Building["district"], availableRound: 2, activated: false }));
    state.routeOwnership = connected ? { E03: "A", E11: "A" } : {};
    expect(state.credits.A!.route).toBe(0); state.phase = "ROUND_END";
    state = step(state, { type: "ADVANCE" });
    expect(state.companies[0]!.resources).toEqual({ materials: 2, cash: connected ? 6 : 5, goods: 2, influence: 1 });
    expect(state.credits.A).toEqual({ route: connected ? 1 : 2, transport: 0, businessSale: 1, productionBoost: 1, constructionCash: 1 });
    const after = structuredClone(state.credits); state.phase = "ROUND_END"; state.routeOwnership = {};
    state = step(state, { type: "ADVANCE" }); expect(state.credits).toEqual(after);
  });
  it("R7 grants two LCs separate route discounts and resets them next round", () => {
    let state = investment(fixture()); resources(state, "A", { materials: 3, cash: 5 });
    state.buildings = [building("lc1", "logistics", true), building("lc2", "logistics", true, "WAREHOUSE")];
    state = step(state, { type: "ROUTE", playerId: "A", edgeId: "E01" });
    const q = quoteInvestment(state, "A", { type: "ROUTE", edgeId: "E05" }); expect(q.uses.route).toEqual(["lc2"]);
    investment(state); state = step(state, { type: "ROUTE", playerId: "A", edgeId: "E05" });
    expect(quoteInvestment(state, "A", { type: "ROUTE", edgeId: "E06" }).cost.cash).toBe(1);
    state.phase = "ROUND_END"; state = step(state, { type: "ADVANCE" }); expect(state.discountUses.route).toEqual([]);
  });
  it("R7 grants each HQ one influence discount, including project contributions", () => {
    let state = investment(fixture()); state.cityLevel = 2; resources(state, "A", { cash: 10, materials: 2 });
    state.buildings = [building("hq1", "civic", true), building("hq2", "civic", true, "GOV")];
    state.activePublicProject = createPublicProject("p", "中央市場");
    state = step(state, { type: "CONTRIBUTE", playerId: "A", slot: 4 });
    expect(state.discountUses.influence).toEqual(["hq1"]);
    const q = quoteInvestment(state, "A", { type: "BUILD", district: "BUSINESS", suit: "commerce", access: "MUNICIPAL" });
    expect(q.uses.influence).toEqual(["hq2"]); expect(q.cost.influence).toBe(0);
  });
  it("R8 ranks off-suit ties by earlier play", () => {
    expect(trickRanking([{ playerId: "A", card: { suit: "commerce", rank: 3 } }, { playerId: "B", card: { suit: "industry", rank: 8 } }, { playerId: "C", card: { suit: "logistics", rank: 8 } }, { playerId: "D", card: { suit: "civic", rank: 5 } }], null)).toEqual(ids);
  });
  it("keeps the rotating leader across a round boundary, independently of the winner", () => {
    let state = fixture(); state.phase = "TRICK_RESULT"; state.trickIndex = state.opportunities.length - 1; state.trickLeader = "C";
    state = step(state, { type: "ADVANCE" }); expect(state.trickLeader).toBe("D");
    state.phase = "ROUND_END"; state = step(state, { type: "ADVANCE" }); expect(state.trickLeader).toBe("D"); expect(state.investmentStarter).toBe("B");
  });
  it("allows an investment pass only when every action is impossible", () => {
    const state = investment(fixture()); expect(legalInvestments(state, "A").length).toBeGreaterThan(0);
    expect(() => step(state, { type: "PASS_INVESTMENT", playerId: "A" })).toThrow();
    resources(state, "A", {}); expect(step(state, { type: "PASS_INVESTMENT", playerId: "A" }).investmentTurn?.playerId).toBe("B");
  });
  it("finishes only after all income inputs, compares everyone and permits joint winners", () => {
    let state = fixture(); state.phase = "INCOME"; resources(state, "A", { cash: 100 }); resources(state, "B", { cash: 104 }); resources(state, "C", { cash: 104 });
    for (const playerId of ids.slice(0, 3)) state = step(state, { type: "INCOME", playerId, selections: {} });
    expect(state.result).toBeNull(); state = step(state, { type: "INCOME", playerId: "D", selections: {} });
    expect(state.result?.reason).toBe("VALUE_25"); expect(state.result?.winners).toEqual(["B", "C"]);
  });
  it("schedules a full final round when level four is first recognized", () => {
    let state = fixture(); state.cityDevelopment = 28;
    state = roundEnd(state); expect(state.cityLevel).toBe(4); expect(state.finalRound).toBe(2); expect(state.result).toBeNull();
    state = step(state, { type: "ADVANCE" }); expect(state.phase).toBe("ROUND_START");
    state = roundEnd(state); expect(state.result?.reason).toBe("CITY_LV4_FINAL_ROUND"); expect(state.result?.round).toBe(2);
  });
});

describe("online authority and projection", () => {
  it("whitelists action data and ignores a forged player identity", () => {
    expect(parseHubAction({ type: "ROUND_READY", playerId: "B", secret: "injected" }, "A")).toEqual({ type: "ROUND_READY", playerId: "A" });
    for (const input of [{ type: "ADVANCE" }, { type: "PLAY_CARD", card: { suit: "civic", rank: 9 } }, { type: "ANSWER_TRADE", accept: "yes" }, { type: "CONTRIBUTE", slot: -1 }, { type: "MARKET", action: "buy-influence" }]) expect(() => parseHubAction(input, "A")).toThrow();
  });
  it("never exposes another hand or the complete server state, including after JSON restoration", () => {
    const state = JSON.parse(JSON.stringify(fixture())) as HubState;
    for (const id of ids) {
      const view = buildHubView(state, id);
      expect(view.hand).toEqual(state.playerHands[id]); expect(view).not.toHaveProperty("playerHands");
      expect(JSON.stringify(view)).not.toMatch(/playerHands|displayName|sessionToken/);
      expect(view.incomeContext.companies.map((c) => c.playerId)).toEqual([id]);
      view.hand.pop(); expect(state.playerHands[id]).toHaveLength(state.cityCondition.tricks);
    }
    expect(() => buildHubView(state, "outsider")).toThrow();
  });
  it("shares a phase token for simultaneous inputs but changes it at sequential turn boundaries", () => {
    let state = fixture(); const key = hubPhaseKey(state);
    state = step(state, { type: "ROUND_READY", playerId: "A" }); expect(hubPhaseKey(state)).toBe(key);
    for (const playerId of ids.slice(1)) state = step(state, { type: "ROUND_READY", playerId });
    const before = hubPhaseKey(state); state = step(state, { type: "PLAY_CARD", playerId: "A", card: state.playerHands.A![0]! });
    expect(hubPhaseKey(state)).not.toBe(before);
  });
  it("restores an outstanding counteroffer and resolves it once", () => {
    let state = fixture(); state.phase = "INVESTMENT"; state.investmentTurn = { playerId: "A", step: "NEGOTIATION", negotiation: null };
    const terms = { give: { materials: 1, cash: 0, goods: 0 }, receive: { materials: 0, cash: 2, goods: 0 } };
    state = step(state, { type: "OFFER_TRADE", playerId: "A", counterpart: "B", terms });
    state = step(state, { type: "COUNTER_TRADE", playerId: "B", terms: { ...terms, receive: { materials: 0, cash: 1, goods: 0 } } });
    state = JSON.parse(JSON.stringify(state));
    expect(buildHubView(state, "A").investmentTurn?.negotiation?.status).toBe("COUNTERED");
    const finished = step(state, { type: "ANSWER_TRADE", playerId: "A", accept: true });
    expect(finished.companies[0]!.resources.cash).toBe(5); expect(finished.investmentTurn?.step).toBe("MARKET");
    expect(() => step(finished, { type: "ANSWER_TRADE", playerId: "A", accept: true })).toThrow();
  });
});
