import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { createHubV1WorkState } from "../../../src/games/commercial-hub/v1-work";
import { createHubState, reduceHubState, startRound } from "../../../src/games/commercial-hub/engine";
import { commercialHubGameModule as module } from "../../../src/games/commercial-hub/module";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { awardOpportunity, drawRound } from "../../../src/games/commercial-hub/opportunities";
import { quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { legalLearningOptions } from "../../../src/games/commercial-hub/learning";
import { cardId, dealHands } from "../../../src/games/commercial-hub/cards";
import { CITY_CONDITIONS, type Opportunity } from "../../../src/games/commercial-hub/data";
import { parseHubAction } from "../../../src/games/commercial-hub/web-actions";
import { parseHubConfig } from "../../../src/games/commercial-hub/config";
import { estimateBid, winDistribution } from "../../../src/games/commercial-hub/rule-ai";
import { distinctDistrictSuits, v1Opportunities } from "../../../src/games/commercial-hub/trial-features";
import { BidPanel } from "../../../src/client/games/commercial-hub/BidPanel";
import type { HubClientAction, HubState } from "../../../src/games/commercial-hub/state";
import { SUITS } from "../../../src/games/commercial-hub/types";

const players = ["A", "B", "C", "D"];
const rng = () => new SeededRandom(212);
const expectedIds = ["sales", "promotion", "processing", "expansion", "purchase", "bulk", "development", "public-project"];
const publicOpportunity: Opportunity = { id: "public-project", name: "公共事業", suit: "administration", trump: "commerce" };
const act = (s: HubState, action: HubClientAction, playerId = "A") => reduceHubState(s, { ...action, playerId }, rng());
function fresh(bid = true) {
  const s = createHubV1WorkState("work2", players, rng(), { trickRule: bid ? "BID" : "NORMAL", auditor: true });
  s.companies.forEach(c => c.resources = { cash: 30, materials: 10, goods: 10 });
  s.publicProjects.forEach(p => p.availableRound = 1);
  return s;
}
function boom(bid = true) {
  const s = fresh(bid); s.round = 5; s.cityLevel = 3; s.cityDevelopment = 32; s.specialBoomRound = 5;
  startRound(s, rng()); return s;
}
function ready(s: HubState) { for (const p of players) s = act(s, { type: "ROUND_READY" }, p); return s; }
function investment() { const s = fresh(false); s.round = 4; s.cityLevel = 3; s.phase = "INVESTMENT"; s.currentInvestmentPlayer = "A"; return s; }
const contribute = (s: HubState, benefit: "DISCOUNT_REBATE" | "REBATE" | "DISCOUNT" | "NONE" = "DISCOUNT_REBATE", slot = 0) =>
  ({ type: "CONTRIBUTE", projectId: s.publicProjects[0]!.id, slot, benefit } as const);

describe("v1 Work 2 opportunities and eight tricks", () => {
  it("keeps opening six, normal five for every market, and uses eight only in the special boom", () => {
    const opening = fresh(); expect(opening.opportunities).toHaveLength(6);
    expect(opening.opportunities.filter(o => o.trump === null)).toHaveLength(1);
    for (const condition of CITY_CONDITIONS) {
      const s = fresh(); s.round = 2; s.marketBag = [condition.id]; startRound(s, rng());
      expect(s.opportunities).toHaveLength(5); expect(s.cityCondition.trump).toBe(condition.trump);
    }
    expect(boom().opportunities).toHaveLength(8);
  });
  it("shuffles exactly eight distinct opportunities, keeps the market bag, and removes special materials", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = fresh(); s.round = 5; s.cityLevel = 3; s.specialBoomRound = 5;
      s.marketBag = ["steady-growth"]; s.marketUsed = ["consumer-boom"];
      startRound(s, new SeededRandom(seed));
      expect(s.cityCondition.tricks).toBe(8);
      expect(s.opportunities.map(o => o.id).sort()).toEqual([...expectedIds].sort());
      expect(SUITS.map(suit => s.opportunities.filter(o => o.suit === suit).length)).toEqual([2, 2, 2, 2]);
      expect(s.opportunities.every(o => o.trump === "commerce")).toBe(true);
      expect(s.opportunities.some(o => o.id === "special-materials")).toBe(false);
      expect(s.marketBag).toEqual(["steady-growth"]); expect(s.marketUsed).toEqual(["consumer-boom"]);
      orders.add(s.opportunities.map(o => o.id).join(","));
    }
    expect(orders.size).toBeGreaterThan(20);
  });
  it("deals and consumes all 32 cards, follows suit, and gives every seat exactly two leads", () => {
    let s = ready(boom(false));
    expect(Object.values(s.playerHands).map(h => h.length)).toEqual([8, 8, 8, 8]);
    expect(new Set(Object.values(s.playerHands).flat().map(cardId)).size).toBe(32);
    let illegalChecked = false;
    while (["TRICK", "REWARD", "TRICK_RESULT"].includes(s.phase)) {
      if (s.phase === "TRICK_RESULT") s = reduceHubState(s, { type: "ADVANCE" }, rng());
      else if (s.phase === "REWARD") s = act(s, { type: "CLAIM_REWARD", amount: 0 }, s.rewardChoices[0]!.playerId);
      else {
        const v = players.map(p => buildHubView(s, p)).find(v => v.legalCards.length)!;
        const lead = s.playedCards[0]?.card.suit;
        if (lead && v.hand.some(c => c.suit === lead)) expect(v.legalCards.every(c => c.suit === lead)).toBe(true);
        const illegal = v.hand.find(c => !v.legalCards.some(l => cardId(l) === cardId(c)));
        if (illegal) { expect(() => act(s, { type: "PLAY_CARD", card: illegal }, v.playerId)).toThrow("Must Follow"); illegalChecked = true; }
        s = act(s, { type: "PLAY_CARD", card: v.legalCards[0]! }, v.playerId);
      }
    }
    expect(illegalChecked).toBe(true);
    expect(s.trickResults).toHaveLength(8);
    expect(new Set(s.trickResults.flatMap(t => t.played.map(p => cardId(p.card)))).size).toBe(32);
    expect(Object.values(s.playerHands).every(h => h.length === 0)).toBe(true);
    expect(players.map(p => s.trickResults.filter(t => t.played[0]!.playerId === p).length)).toEqual([2, 2, 2, 2]);
    expect(s.phase).toBe("AUDITOR_PLACEMENT");
    expect(s.auditorSelection!.standings.reduce((n, x) => n + x.rankSum, 0)).toBe(80);
    expect(s.auditorSelection!.standings.every(x => x.averageRank === x.rankSum / 8)).toBe(true);
  });
  it("activates the eight-trick boom on the round after actual Lv3 settlement, once", () => {
    let s = fresh(false); s.round = 4; s.cityLevel = 2; s.cityDevelopment = 32;
    s.phase = "INVESTMENT"; s.currentInvestmentPass = 2; s.investmentTurnIndex = 3; s.currentInvestmentPlayer = "A";
    s = act(s, { type: "PASS_INVESTMENT" });
    expect(s.cityLevel).toBe(3); expect(s.specialBoomRound).toBe(5); expect(s.specialBoomPlayed).toBe(false);
    for (const p of players) s = act(s, { type: "ROUND_END_READY" }, p);
    expect(s.round).toBe(5); expect(s.opportunities).toHaveLength(8);
    expect(s.specialBoomPlayed).toBe(true);
    drawRound(s, rng()); expect(s.opportunities).toHaveLength(5);
  });
  it("keeps opening third-place cash one in every suit", () => {
    for (const suit of SUITS) {
      const s = fresh(); const before = s.companies.map(c => c.resources.cash);
      awardOpportunity(s, { id: "opening", name: "開業", suit, trump: suit }, players);
      expect(s.companies[2]!.resources.cash - before[2]!).toBe(1);
      expect(s.companies[3]!.resources.cash - before[3]!).toBe(0);
    }
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])("accepts bid %s in eight tricks and keeps the declaration private", wins => {
    let s = ready(boom()); const action = parseHubAction({ type: "SUBMIT_BID", wins }, "A");
    s = reduceHubState(s, action, rng());
    expect(s.bids.A).toBe(wins);
    expect(buildHubView(s, "B").bids).toBeNull();
    expect(buildHubView(s, "B").ownBid).toBeNull();
    expect(legalLearningOptions(buildHubView(ready(boom()), "A")).choices.filter(x => x.action.type === "SUBMIT_BID")).toHaveLength(9);
  });
  it("renders 0–8 bids, bounds NPC distributions, and rejects invalid bids atomically", () => {
    const s = ready(boom()); const v = buildHubView(s, "A");
    const html = renderToStaticMarkup(createElement(BidPanel, { view: v, act: () => {}, name: p => p }));
    expect(html).toContain('value="8"'); expect(html).not.toContain('value="9"');
    expect(winDistribution(v.hand, v.opportunities)).toHaveLength(9);
    expect(estimateBid(v.hand, v.opportunities)).toBeGreaterThanOrEqual(0);
    expect(estimateBid(v.hand, v.opportunities)).toBeLessThanOrEqual(8);
    for (const wins of [-1, 9, 1.5, NaN]) {
      const before = structuredClone(s);
      expect(() => act(s, { type: "SUBMIT_BID", wins })).toThrow(); expect(s).toEqual(before);
      expect(() => parseHubAction({ type: "SUBMIT_BID", wins }, "A")).toThrow();
    }
  });
  it("completes the special round with all four NPC types, bids and auditor placement through the real module", () => {
    let s = boom(); s.npcPlayers = { A: "standard", B: "production", C: "commerce", D: "development" };
    let steps = 0; let publicRights: string[] = [];
    while (s.phase !== "ROUND_END" && s.phase !== "FINISHED") {
      if (s.phase === "PROCUREMENT" && !publicRights.length) publicRights = Object.values(s.benefits).flatMap(b => b.project);
      const progress = module.getAutomaticProgress!(s, { rng: rng(), now: steps * 1000 });
      expect(progress).not.toBeNull();
      s = module.handleAction(s, progress!.action, { rng: rng(), now: steps * 1000 });
      expect(++steps).toBeLessThan(200);
      if (steps % 17 === 0) s = JSON.parse(JSON.stringify(s));
    }
    expect(s.phase).toBe("ROUND_END"); expect(s.settlement?.round).toBe(5); expect(s.trickResults).toHaveLength(8);
    expect(Object.values(s.trickWins).reduce((a, b) => a + b, 0)).toBe(8);
    expect(Object.values(s.bids).every(n => n >= 0 && n <= 8)).toBe(true);
    expect(s.bidResults[0]!.results).toHaveLength(4);
    expect(s.events.filter(e => e.type === "AUDITOR_PLACED")).toHaveLength(1);
    expect(publicRights.sort()).toEqual(["DISCOUNT_REBATE", "REBATE"]);
    expect(v1Opportunities(s)).toBe(true); expect(distinctDistrictSuits(s)).toBe(true);
  });
});

describe("v1 public-project discount plus post-contribution rebate", () => {
  it("grants rights without cash, then discounts and rebates only the actual first/second contribution", () => {
    let s = investment(); const cash = s.companies.map(c => c.resources.cash);
    awardOpportunity(s, publicOpportunity, players);
    expect(s.benefits.A!.project).toEqual(["DISCOUNT_REBATE"]); expect(s.benefits.B!.project).toEqual(["REBATE"]);
    expect(s.benefits.C!.project).toEqual([]); expect(s.benefits.D!.project).toEqual([]);
    expect(s.companies.map(c => c.resources.cash)).toEqual(cash);
    const q = quoteInvestment(s, "A", contribute(s));
    const learning = legalLearningOptions(buildHubView(s, "A")).choices.find(x => JSON.stringify(x.action) === JSON.stringify(q.action))!;
    expect(learning.reward).toEqual({ cash: 1, materials: 0, goods: 0 });
    s = act(JSON.parse(JSON.stringify(s)), contribute(s));
    expect(s.companies[0]!.resources.cash).toBe(cash[0]! - q.cost.cash + 1);
    expect(s.benefits.A!.project).toEqual([]);
    s.currentInvestmentPlayer = "B";
    const action = contribute(s, "REBATE", 1), second = quoteInvestment(s, "B", action);
    s = act(s, action, "B");
    expect(s.companies[1]!.resources.cash).toBe(cash[1]! - second.cost.cash + 1);
    expect(s.benefits.B!.project).toEqual([]);
  });
  it("does not rebate on pass, rejected contributions, or a reused right", () => {
    const s = investment(); awardOpportunity(s, publicOpportunity, players);
    const before = structuredClone(s), cash = s.companies[0]!.resources.cash;
    expect(act(s, { type: "PASS_INVESTMENT" }).companies[0]!.resources.cash).toBe(cash);
    const invalid = { ...contribute(s), slot: 99 };
    expect(() => act(s, invalid)).toThrow(); expect(s).toEqual(before);
    let n = act(s, contribute(s)); n.currentInvestmentPlayer = "A";
    expect(() => act(n, contribute(n, "DISCOUNT_REBATE", 1))).toThrow("商機報酬");
  });
  it("stacks two reductions across a compound slot, clamps to zero and keeps audit separate", () => {
    let s = investment(); const p = s.publicProjects[0]!;
    p.slots[0] = { resource: "materials", amount: 1, cost: { cash: 0, materials: 1, goods: 1 }, playerId: null };
    s.next!.cards.push({ id: "public-works-priority", owner: "A", project: p.id, purchasedRound: 2, activeRound: 3, status: "ACTIVE" });
    s.auditor.target = "PUBLIC_PROJECTS"; s.companies[0]!.resources = { cash: 1, materials: 0, goods: 0 };
    awardOpportunity(s, publicOpportunity, players);
    const q = quoteInvestment(s, "A", contribute(s));
    expect(q.normalCost).toEqual({ cash: 0, materials: 0, goods: 0 });
    expect(q.priorityDiscount).toBe(1); expect(q.auditFee).toBe(1); expect(q.cost.cash).toBe(1);
    const poor = structuredClone(s); poor.companies[0]!.resources.cash = 0;
    expect(() => act(poor, contribute(poor))).toThrow(); expect(poor.publicProjects[0]!.slots[0]!.playerId).toBeNull();
    s = act(s, contribute(s));
    expect(s.companies[0]!.resources).toEqual({ cash: 1, materials: 0, goods: 0 });
    expect(s.next!.cards[0]!.discountUsedRound).toBe(4);
    expect(s.events.find(e => e.type === "PRIORITY_DISCOUNT")!.data.amount).toBe(1);
    s.benefits.A!.project = ["DISCOUNT_REBATE"];
    s.companies[0]!.resources = { cash: 30, materials: 10, goods: 10 };
    const again = quoteInvestment(s, "A", contribute(s, "DISCOUNT_REBATE", 1));
    expect(again.priorityDiscount).toBeUndefined();
  });
  it("never makes a one-resource slot negative when both discounts are available", () => {
    const s = investment(), p = s.publicProjects[0]!;
    p.slots[0] = { resource: "cash", amount: 1, cost: { cash: 1, materials: 0, goods: 0 }, playerId: null };
    s.next!.cards.push({ id: "public-works-priority", owner: "A", project: p.id, purchasedRound: 2, activeRound: 3, status: "ACTIVE" });
    awardOpportunity(s, publicOpportunity, players);
    const q = quoteInvestment(s, "A", contribute(s));
    expect(q.normalCost).toEqual({ cash: 0, materials: 0, goods: 0 });
    expect(q.priorityDiscount).toBe(0);
    expect(act(s, contribute(s)).companies[0]!.resources.cash).toBe(31);
  });
  it("keeps legacy discount-only rights intact even in a new state", () => {
    const s = investment(); s.benefits.A!.project = ["DISCOUNT"];
    const q = quoteInvestment(s, "A", contribute(s, "DISCOUNT"));
    expect(act(s, contribute(s, "DISCOUNT")).companies[0]!.resources.cash).toBe(30 - q.cost.cash);
  });
  it("preserves old formal, trials 1–4, and Work 1 states; normal starts and external configs stay old", () => {
    for (const version of ["0.5", "next-trial-1", "next-trial-2", "next-trial-3", "next-trial-4"] as const) {
      const s = fresh(); delete s.opportunityRule; s.rulesVersion = version;
      if (version === "0.5") { delete s.next; delete s.constructionRule; }
      s.round = 5; s.cityLevel = 3; s.specialBoomRound = 5;
      startRound(s, rng());
      expect(s.opportunities).toHaveLength(6);
      expect(s.opportunities.filter(o => o.id === "special-materials")).toHaveLength(1);
      awardOpportunity(s, publicOpportunity, players);
      expect(s.benefits.A!.project).toEqual(["DISCOUNT"]);
      const bid = ready(s);
      for (const wins of [7, 8]) expect(() => reduceHubState(bid, parseHubAction({ type: "SUBMIT_BID", wins }, "A"), rng())).toThrow();
      s.phase = "INVESTMENT"; s.currentInvestmentPlayer = "A"; s.benefits.A!.project = ["DISCOUNT_REBATE"];
      expect(() => quoteInvestment(s, "A", contribute(s))).toThrow("現在のルール");
    }
    const normal = createHubState("normal", players, rng(), { rulesVariant: "NEXT", trickRule: "BID", auditor: true });
    expect(normal).not.toHaveProperty("opportunityRule");
    expect(() => dealHands(players, 8, rng())).toThrow();
    expect(() => parseHubConfig({ rulesVariant: "NEXT", opportunityRule: "v1-work-2" })).toThrow();
  });
});
