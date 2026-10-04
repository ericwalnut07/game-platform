import { describe, expect, it } from "vitest";
import { createHubState, reduceHubState, changeHubConnection, startRound, BOT_GRACE_MS } from "../../../src/games/commercial-hub/engine";
import { parseHubConfig } from "../../../src/games/commercial-hub/config";
import { commercialHubGameModule as module, hubPhaseKey } from "../../../src/games/commercial-hub/module";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { quoteInvestment } from "../../../src/games/commercial-hub/investment";
import { quoteBuildingUse, buildingUseOptions } from "../../../src/games/commercial-hub/income";
import { parseHubAction } from "../../../src/games/commercial-hub/web-actions";
import { companyOf, type HubState, type HubClientAction } from "../../../src/games/commercial-hub/state";
import { legalLearningOptions } from "../../../src/games/commercial-hub/learning";
import { decideNpc } from "../../../src/games/commercial-hub/npc";
import { HUB_NPC_TYPES } from "../../../src/shared/commercial-hub-npc";
import { act, fresh, players, rich, rng, settle } from "./helpers";

function fixture(bid = true, auditor = true, round = 2): HubState {
  const s = createHubState("rules04", players, rng(), { trickRule: bid ? "BID" : "NORMAL", auditor });
  s.round = round; s.trickLeader = "A"; s.trump = "commerce";
  s.opportunities = [0, 1].map(() => ({ id: "development", name: "行政", suit: "administration", trump: "commerce" }));
  s.playerHands = Object.fromEntries(players.map((p, i) => [p, [{ suit: "commerce", rank: 8 - i }, { suit: "commerce", rank: 4 - i }]]));
  return s;
}
function ready(s: HubState): HubState { for (const p of players) s = act(s, { type: "ROUND_READY" }, p); return s; }
function declared(s: HubState, numbers = [2, 0, 1, 2]): HubState { s = ready(s); for (const [i, p] of players.entries()) s = act(s, { type: "SUBMIT_BID", wins: numbers[i]! }, p); return s; }
function tricks(s: HubState): HubState {
  while (["TRICK", "REWARD", "TRICK_RESULT"].includes(s.phase)) {
    if (s.phase === "TRICK_RESULT") s = reduceHubState(s, { type: "ADVANCE" }, rng());
    else if (s.phase === "REWARD") s = act(s, { type: "CLAIM_REWARD", amount: 0 }, s.rewardChoices[0]!.playerId);
    else { const v = players.map((p) => buildHubView(s, p)).find((v) => v.legalCards.length)!; s = act(s, { type: "PLAY_CARD", card: v.legalCards[0]! }, v.playerId); }
  }
  return s;
}

describe("v0.4 independent settings and bid privacy", () => {
  it.each([false, true].flatMap((bid) => [false, true].map((auditor) => [bid, auditor])))("supports bid=%s auditor=%s without changing the map or ending", (bid, auditor) => {
    const config = { trickRule: bid ? "BID" : "NORMAL", auditor };
    expect(module.parseConfig(config)).toEqual(config);
    let s = ready(fixture(bid, auditor)); expect(s.phase).toBe(bid ? "BID" : "TRICK");
    if (bid) for (const p of players) s = act(s, { type: "SUBMIT_BID", wins: 0 }, p);
    s = tricks(s);
    if (bid) { expect(s.phase).toBe("BID_RESULT"); s = reduceHubState(s, { type: "ADVANCE" }, rng()); }
    expect(s.phase).toBe(auditor ? "AUDITOR_PLACEMENT" : "PROCUREMENT");
    expect(s.finalRound).toBe(12); expect(s.cityLevel).toBe(1);
    if (!bid) { expect(s.bidResults).toEqual([]); expect(Object.values(s.predictionPoints)).toEqual([0, 0, 0, 0]); expect(s.events.some((e) => e.type.startsWith("BID"))).toBe(false); expect(s.companyValues.A).not.toHaveProperty("prediction"); }
    if (!auditor) expect(s.events.some((e) => e.type.startsWith("AUDITOR"))).toBe(false);
  });
  it("keeps empty legacy room configuration compatible and rejects new map/round options", () => {
    expect(parseHubConfig({})).toEqual({ trickRule: "NORMAL", auditor: false });
    for (const input of [null, [], { auditor: "true" }, { trickRule: "SECRET" }, { map: "new" }, { maxRounds: 20 }]) expect(() => parseHubConfig(input)).toThrow();
  });
  it("locks zero, hides every other declaration in projections and events, and publishes atomically", () => {
    let s = ready(fixture()); const key = hubPhaseKey(s);
    s = act(s, { type: "SUBMIT_BID", wins: 0 });
    expect(hubPhaseKey(s)).toBe(key); expect(() => act(s, { type: "SUBMIT_BID", wins: 1 })).toThrow("確定済み");
    expect(buildHubView(s, "A").ownBid).toBe(0);
    for (const p of players.slice(1)) { const v = buildHubView(s, p); expect(v.bids).toBeNull(); expect(v.ownBid).toBeNull(); expect(v.bidSubmitted).toEqual(["A"]); expect(v.events.filter((e) => e.type === "BID_SUBMITTED")[0]!.data).toEqual({}); }
    const changed = structuredClone(s); changed.bids.A = 2;
    expect(buildHubView(changed, "B")).toEqual(buildHubView(s, "B"));
    for (const p of players.slice(1)) { s = act(s, { type: "SUBMIT_BID", wins: 2 }, p); if (p !== "D") expect(buildHubView(s, "A").bids).toBeNull(); }
    expect(s.phase).toBe("TRICK"); expect(s.bidsRevealed).toBe(true);
    for (const p of players) expect(buildHubView(s, p).bids).toEqual({ A: 0, B: 2, C: 2, D: 2 }); // No sum constraint.
    expect(s.events.filter((e) => e.type === "BIDS_REVEALED")).toHaveLength(1);
  });
  it.each([-1, 3, 1.5, NaN, Infinity])("rejects out-of-round-range declaration %s atomically", (wins) => {
    const s = ready(fixture()), before = structuredClone(s);
    expect(() => act(s, { type: "SUBMIT_BID", wins })).toThrow(); expect(s).toEqual(before);
  });
  it("authenticates rule actions and rejects public ADVANCE, absent targets and skip", () => {
    expect(parseHubAction({ type: "SUBMIT_BID", wins: 0, playerId: "B" }, "A")).toEqual({ type: "SUBMIT_BID", wins: 0, playerId: "A" });
    expect(parseHubAction({ type: "PLACE_AUDITOR", target: "PUBLIC_PROJECTS", playerId: "B" }, "A")).toMatchObject({ playerId: "A" });
    for (const input of [{ type: "ADVANCE" }, { type: "PLACE_AUDITOR" }, { type: "PLACE_AUDITOR", target: "SKIP" }]) expect(() => parseHubAction(input, "A")).toThrow();
  });
  it("scores zero and multiple hits equally, misses zero, and accumulates without changing asset tiebreaks", () => {
    let s = tricks(declared(fixture(true, false)));
    expect(s.phase).toBe("BID_RESULT"); expect(s.trickWins).toEqual({ A: 2, B: 0, C: 0, D: 0 });
    expect(s.bidResults[0]!.results.map((r) => r.points)).toEqual([1, 1, 0, 0]); expect(s.predictionPoints).toEqual({ A: 1, B: 1, C: 0, D: 0 });
    expect(s.companyValues.A!.prediction).toBe(1);
    const firstAssets = s.companyValues.A!.assets;
    expect(module.getAutomaticProgress!(s, { rng: rng(), now: 0 })?.action).toEqual({ type: "ADVANCE" });
    s = reduceHubState(s, { type: "ADVANCE" }, rng()); expect(s.predictionPoints.A).toBe(1); expect(s.companyValues.A!.assets).toBe(firstAssets);
    expect(() => reduceHubState(s, { type: "ADVANCE" }, rng())).toThrow();
    s.round++; startRound(s, rng()); expect(s.bids).toEqual({}); expect(s.predictionPoints.A).toBe(1);
    s = fixture(true, false, 3); s.predictionPoints.A = 1; s = tricks(declared(s)); expect(s.predictionPoints.A).toBe(2);
    s.round = 12; s = settle(s); expect(s.result!.ranking.find((r) => r.playerId === "A")!.value.prediction).toBe(2);
  });
  it("counts actual first place in credit contraction independently of reward ranking", () => {
    const s = declared(fixture()); s.cityCondition.id = "credit-crunch";
    const end = tricks(s); expect(end.trickWins.A).toBe(2); expect(end.lastAdministrationWinner).toBe("A");
    expect(end.trickResults.every((r) => r.ranking[0] === "A" && r.rewardRanking[0] === "D")).toBe(true);
    expect(end.phase).toBe("BID_RESULT"); expect(end.auditor.placementPlayer).toBeNull();
    const next = reduceHubState(end, { type: "ADVANCE" }, rng()); expect(next.auditor.placementPlayer).toBe("A");
  });
  it("restores locked declarations after reconnect and delegates only unresolved ones after 60 seconds", () => {
    let s = ready(fixture()); s = changeHubConnection(s, "A", false, 1000);
    s = reduceHubState(s, { type: "BOT_TICK" }, rng(), 1000 + BOT_GRACE_MS - 1); expect(s.bids.A).toBeUndefined();
    s = reduceHubState(s, { type: "BOT_TICK" }, rng(), 1000 + BOT_GRACE_MS); const wins = s.bids.A;
    expect(wins).toBeDefined(); expect(buildHubView(s, "B").bids).toBeNull();
    s = reduceHubState(s, { type: "BOT_TICK" }, rng(), 1000 + BOT_GRACE_MS + 450); expect(s.bids.A).toBe(wins);
    s = changeHubConnection(structuredClone(s), "A", true, 62000); expect(buildHubView(s, "A").ownBid).toBe(wins); expect(s.connections.A!.bot).toBe(false);
  });
});

describe("v0.4 auditor placement and immediate bank payments", () => {
  it.each([false, true])("has no first-round placement, bid=%s", (bid) => {
    let s = tricks(bid ? declared(fixture(bid, true, 1)) : ready(fixture(bid, true, 1)));
    if (bid) s = reduceHubState(s, { type: "ADVANCE" }, rng());
    expect(s.phase).toBe("PROCUREMENT"); expect(s.auditor.target).toBeNull(); expect(s.auditor.placementPlayer).toBeNull();
  });
  it("gives only the last administrative true winner placement, preserves old target and permits staying", () => {
    const initial = fixture(false, true); initial.playerHands.A![1]!.rank = 3; initial.playerHands.B![1]!.rank = 4;
    initial.auditor.target = "PUBLIC_PROJECTS";
    let s = tricks(ready(initial)); expect(s.trickResults.map((r) => r.ranking[0])).toEqual(["A", "B"]);
    expect(s.auditor).toEqual({ target: "PUBLIC_PROJECTS", placementPlayer: "B" });
    expect(() => act(s, { type: "PLACE_AUDITOR", target: "MARKET" }, "A")).toThrow("配置権");
    expect(() => act(s, { type: "PASS_INVESTMENT" }, "B")).toThrow();
    expect(() => act(s, { type: "PLACE_AUDITOR", target: "SKIP" } as HubClientAction, "B")).toThrow();
    s = act(s, { type: "PLACE_AUDITOR", target: "PUBLIC_PROJECTS" }, "B"); expect(s.phase).toBe("PROCUREMENT"); expect(s.auditor.target).toBe("PUBLIC_PROJECTS");
    expect(s.events.at(-1)).toMatchObject({ type: "AUDITOR_PLACED", playerId: "B", data: { target: "PUBLIC_PROJECTS" } });
  });
  it("delegates placement after a disconnect and returns the seat without undoing the move", () => {
    let s = tricks(ready(fixture(false, true))); s = changeHubConnection(s, "A", false, 10);
    s = reduceHubState(s, { type: "BOT_TICK" }, rng(), 10 + BOT_GRACE_MS); expect(s.phase).toBe("PROCUREMENT"); expect(s.auditor.target).not.toBeNull();
    const target = s.auditor.target; s = changeHubConnection(s, "A", true, 61000); expect(s.auditor.target).toBe(target); expect(s.connections.A!.bot).toBe(false);
  });
  function audited(phase: HubState["phase"] = "INVESTMENT") { const s = rich(phase); s.round = 2; s.config.auditor = true; s.auditor.target = "MARKET"; return s; }
  it.each(["BUILD", "UPGRADE", "ROUTE"] as const)("adds one to %s for the placer, rejects insufficiency and charges no other district", (type) => {
    const s = audited(); if (type === "UPGRADE") s.buildings = [{ id: "b", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false }];
    const action: HubClientAction = type === "BUILD" ? { type, district: "MARKET", suit: "commerce", access: "PUBLIC" } : type === "UPGRADE" ? { type, buildingId: "b", access: "PUBLIC" } : { type, district: "MARKET" };
    const q = quoteInvestment(s, "A", action); expect(q.auditFee).toBe(1); expect(q.cost.cash).toBe(q.normalCost.cash + 1);
    companyOf(s, "A").resources.cash = q.normalCost.cash; const before = structuredClone(s);
    expect(() => act(s, action)).toThrow(); expect(s).toEqual(before);
    s.auditor.target = "PUBLIC_PROJECTS"; expect(quoteInvestment(s, "A", action).auditFee).toBe(0);
    companyOf(s, "A").resources.cash = 30; s.auditor.target = "MARKET";
    const next = act(s, action); expect(companyOf(next, "A").resources.cash).toBe(30 - q.cost.cash); expect(companyOf(next, "B").resources.cash).toBe(30);
  });
  it.each([1, 2])("charges building use once for quantity %s plus separate deferred transport", (amount) => {
    let s = audited("PRODUCTION"); s.buildings = [{ id: "b", playerId: "A", district: "MARKET", suit: "commerce", upgraded: true }];
    const q = quoteBuildingUse(s, "A", "b", amount, "PUBLIC"); expect(q).toMatchObject({ normalCost: { cash: 0, goods: amount }, auditFee: 1, cost: { cash: 1, goods: amount }, reward: { cash: 3 * amount }, transport: { amount: 2 } });
    companyOf(s, "A").resources.cash = 0; expect(() => act(s, { type: "USE_BUILDING", buildingId: "b", amount, access: "PUBLIC" })).toThrow();
    companyOf(s, "A").resources.cash = 1; s = act(s, { type: "USE_BUILDING", buildingId: "b", amount, access: "PUBLIC" }); expect(companyOf(s, "A").resources.cash).toBe(3 * amount); expect(s.transportCharges).toHaveLength(1);
  });
  it.each(["NONE", "FREE", "REBATE"] as const)("audits every project including %s benefit without discounting the fee", (benefit) => {
    for (const project of fresh().publicProjects) {
      const s = audited(); s.auditor.target = "PUBLIC_PROJECTS"; s.benefits.A!.project = benefit === "NONE" ? [] : [benefit];
      const a = { type: "CONTRIBUTE", projectId: project.id, slot: 0, benefit } as const, q = quoteInvestment(s, "A", a);
      expect(q.auditFee).toBe(1); expect(q.cost.cash).toBe(q.normalCost.cash + 1);
      if (benefit === "FREE") expect(q.normalCost).toEqual({ cash: 0, materials: 0, goods: 0 });
      companyOf(s, "A").resources.cash = q.normalCost.cash; expect(() => act(s, a)).toThrow();
      s.config.auditor = false; expect(quoteInvestment(s, "A", a).auditFee).toBe(0);
    }
  });
  it("leaves direct opportunity rewards and the public market untaxed", () => {
    const s = audited("PROCUREMENT"); expect(buildHubView(s, "A").marketChoices[0]!.cost.cash).toBe(3);
    const v = buildHubView(s, "A"); expect(legalLearningOptions(v).choices).not.toContainEqual({ action: { type: "PLACE_AUDITOR", target: "MARKET" } });
  });
});

describe("v0.4 quantities and public-information NPCs", () => {
  it.each([false, true].flatMap((bid) => [false, true].map((auditor) => [bid, auditor])))("the real all-NPC scheduler finishes bid=%s auditor=%s", (bid, auditor) => {
    const random = rng(); let s = module.createInitialState({ matchId: "auto04", gameIndex: 1, players: players.map((id, i) => ({ id, displayName: id, controller: { kind: "NPC", profile: HUB_NPC_TYPES[i]! } })), config: { trickRule: bid ? "BID" : "NORMAL", auditor }, rng: random }), now = 0;
    for (let i = 0; i < 2400 && !s.result; i++) { const progress = module.getAutomaticProgress!(s, { rng: random, now }); expect(progress).not.toBeNull(); now += progress!.delayMs; s = module.handleAction(s, progress!.action, { rng: random, now }); s.events = []; }
    expect(s.phase).toBe("FINISHED"); expect(s.bidResults).toHaveLength(bid ? s.round : 0); expect(s.auditor.target !== null).toBe(auditor);
  });
  it.each([[0, 2], [1, 1]])("NPC buys against demand: inventory %s selects quantity %s", (materials, amount) => {
    const s = rich("PROCUREMENT"); s.round = 4; s.usage.A!.proposed = true;
    s.buildings = [{ id: "w", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: true }, { id: "f", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false }, { id: "c", playerId: "A", district: "MARKET", suit: "commerce", upgraded: false }];
    s.routes = [{ playerId: "A", district: "WAREHOUSE" }];
    companyOf(s, "A").resources = { cash: 16, goods: 0, materials: materials! };
    expect(decideNpc(buildHubView(s, "A"), "standard")!.action).toMatchObject({ type: "USE_BUILDING", buildingId: "w", amount });
  });
  it("development establishes a production/sales foundation before an unused route", () => {
    const s = rich(); s.round = 2; companyOf(s, "A").resources = { cash: 9, materials: 1, goods: 0 };
    const d = decideNpc(buildHubView(s, "A"), "development")!; expect(d.action.type).toBe("BUILD");
    expect(d.action.type === "BUILD" && ["commerce", "industry"].includes(d.action.suit)).toBe(true);
  });
  it.each([1, 2])("logistics quantity %s retains bulk, consumes the whole use, and resets next round", (amount) => {
    let s = rich("PROCUREMENT"); s.buildings = [{ id: "b", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: true }]; s.benefits.A!.bulk = 3;
    const q = quoteBuildingUse(s, "A", "b", amount, "PUBLIC", 3); expect(q.cost.cash).toBe(amount); expect(q.reward.materials).toBe(amount + 3);
    s = act(s, { type: "USE_BUILDING", buildingId: "b", amount, access: "PUBLIC", bonus: 3 }); expect(s.benefits.A!.bulk).toBe(0);
    expect(() => act(s, { type: "USE_BUILDING", buildingId: "b", amount: 1, access: "PUBLIC" })).toThrow();
    s.round++; startRound(s, rng()); s.phase = "PROCUREMENT"; expect(buildingUseOptions(s, "A").map((q) => q.amount)).toEqual([1, 2]);
  });
  it("offers only the affordable small quantity when the center cannot pay for two", () => {
    const s = rich("PROCUREMENT"); s.round = 2; s.config.auditor = true; s.auditor.target = "WAREHOUSE";
    s.buildings = [{ id: "b", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: true }]; companyOf(s, "A").resources.cash = 2;
    const options = buildingUseOptions(s, "A"); expect(options.map((q) => q.amount)).toEqual([1]); expect(options[0]!.cost.cash).toBe(2);
    companyOf(s, "A").resources.cash = 1; expect(buildingUseOptions(s, "A")).toEqual([]);
  });
  it.each(HUB_NPC_TYPES)("%s never uses hidden hands or unpublished bids for declaration/card/auditor choices", (type) => {
    let s = ready(fixture()); const a = decideNpc(buildHubView(s, "A"), type);
    s.bids.B = 2; const original = buildHubView(s, "A"), before = structuredClone(original);
    s.playerHands.B = s.playerHands.B!.map((c) => ({ ...c, rank: 1 })); s.bids.B = 0;
    expect(decideNpc(buildHubView(s, "A"), type)).toEqual(a); expect(original).toEqual(before);
    s = tricks(declared(fixture())); s = reduceHubState(s, { type: "ADVANCE" }, rng());
    const decision = decideNpc(buildHubView(s, "A"), type)!; expect(decision.action.type).toBe("PLACE_AUDITOR"); expect(() => act(s, decision.action)).not.toThrow();
    s.auditor.target = decision.action.type === "PLACE_AUDITOR" ? decision.action.target : null;
    expect(decideNpc(buildHubView(s, "A"), type)!.action).toEqual(decision.action); // A tied best target may be retained.
  });
  it("logs exact legal bid and auditor domains without revealing declarations to peers", () => {
    const s = ready(fixture()); expect(legalLearningOptions(buildHubView(s, "A")).choices.map((q) => q.action)).toEqual([0, 1, 2].map((wins) => ({ type: "SUBMIT_BID", wins })));
    const end = reduceHubState(tricks(declared(fixture())), { type: "ADVANCE" }, rng());
    expect(legalLearningOptions(buildHubView(end, "A")).choices).toHaveLength(9); expect(legalLearningOptions(buildHubView(end, "B")).choices).toEqual([]);
  });
});
