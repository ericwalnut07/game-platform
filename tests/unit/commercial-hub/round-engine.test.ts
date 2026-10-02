import { describe, expect, it } from "vitest";
import { BOT_GRACE_MS, botAction, changeHubConnection, createHubState, reduceHubState, startRound } from "../../../src/games/commercial-hub/engine";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { companyOf } from "../../../src/games/commercial-hub/state";
import { commercialHubGameModule, hubPhaseKey } from "../../../src/games/commercial-hub/module";
import { parseHubAction } from "../../../src/games/commercial-hub/web-actions";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import { act, fresh, players, rich, rng, settle } from "./helpers";
const terms = { give: { materials: 1, goods: 0, cash: 0 }, receive: { materials: 0, goods: 0, cash: 1 } };

describe("v0.2 phases, privacy and bots", () => {
  it("starts with 1/1/0 and three visible projects", () => { const s = fresh(); expect(s.companies.every((c) => JSON.stringify(c.resources) === JSON.stringify({ materials: 1, cash: 1, goods: 0 }))).toBe(true); expect(s.publicProjects).toHaveLength(3); expect(s.rulesVersion).toBe("0.2"); });
  it("requires four completions in both simultaneous phases and never changes the token for an ordinary market action", () => {
    let s = rich("PROCUREMENT"), key = hubPhaseKey(s); s = act(s, { type: "MARKET", action: "buy-material" }); expect(hubPhaseKey(s)).toBe(key);
    for (const p of players) { s = act(s, { type: "PROCUREMENT_DONE" }, p); if (p !== "D") expect(s.phase).toBe("PROCUREMENT"); }
    expect(s.phase).toBe("PRODUCTION"); for (const p of players) s = act(s, { type: "PRODUCTION_DONE" }, p); expect(s.phase).toBe("INVESTMENT");
  });
  it("limits offers per round, allows unlimited receipt and revalidates balances atomically", () => {
    let s = rich("PROCUREMENT"); s = act(s, { type: "OFFER_TRADE", counterpart: "B", terms });
    expect(() => act(s, { type: "OFFER_TRADE", counterpart: "C", terms })).toThrow();
    s = act(s, { type: "OFFER_TRADE", counterpart: "B", terms }, "C"); expect(s.negotiations.filter((n) => n.counterpart === "B")).toHaveLength(2);
    companyOf(s, "B").resources.cash = 0;
    expect(() => act(s, { type: "ANSWER_TRADE", negotiationId: "trade-1", accept: true }, "B")).toThrow();
    expect(companyOf(s, "A").resources.materials).toBe(10); expect(s.negotiations[0]!.status).toBe("PENDING");
    s = act(s, { type: "ANSWER_TRADE", negotiationId: "trade-1", accept: false }, "B");
    expect(() => act(s, { type: "OFFER_TRADE", counterpart: "D", terms })).toThrow();
  });
  it("permits market/trade in either order and immediately reuses traded resources", () => {
    let s = rich("PROCUREMENT"); companyOf(s, "A").resources.cash = 2;
    s = act(s, { type: "OFFER_TRADE", counterpart: "B", terms });
    s = act(s, { type: "ANSWER_TRADE", negotiationId: "trade-1", accept: true }, "B");
    s = act(s, { type: "MARKET", action: "buy-material" }); expect(companyOf(s, "A").resources.cash).toBe(0);
    expect(s.events.filter((e) => e.type === "TRADE_ACCEPTED")).toHaveLength(1);
  });
  it("refuses gifts, unowned resources, counteroffers and private identities", () => {
    const s = rich("PROCUREMENT");
    expect(() => act(s, { type: "OFFER_TRADE", counterpart: "B", terms: { ...terms, give: { materials: 0, goods: 0, cash: 0 } } })).toThrow("無償");
    expect(() => act(s, { type: "OFFER_TRADE", counterpart: "B", terms: { ...terms, give: { materials: 999, goods: 0, cash: 0 } } })).toThrow();
    expect(() => parseHubAction({ type: "COUNTER_TRADE", terms }, "A")).toThrow();
    expect(() => parseHubAction({ type: "BOT_TICK" }, "A")).toThrow();
    expect(parseHubAction({ type: "PROCUREMENT_DONE", playerId: "B" }, "A")).toEqual({ type: "PROCUREMENT_DONE", playerId: "A" });
  });
  it("projects only participant offers and own value; expired/rejected terms never enter public logs", () => {
    let s = rich("PROCUREMENT"); s = act(s, { type: "OFFER_TRADE", counterpart: "B", terms });
    expect(buildHubView(s, "A").negotiations).toHaveLength(1); expect(buildHubView(s, "B").negotiations).toHaveLength(1); expect(buildHubView(s, "C").negotiations).toEqual([]);
    for (const p of players) { const v = buildHubView(s, p); expect(v).not.toHaveProperty("companyValues"); expect(v).not.toHaveProperty("playerHands"); expect(v.events.some((e) => JSON.stringify(e).includes('"give"'))).toBe(false); }
    for (const p of players) s = act(s, { type: "PROCUREMENT_DONE" }, p);
    expect(s.negotiations[0]!.status).toBe("EXPIRED"); expect(buildHubView(s, "D").negotiations).toEqual([]);
    expect(() => act(s, { type: "ANSWER_TRADE", negotiationId: "trade-1", accept: true }, "B")).toThrow();
  });
  it("rotates each investment pass, allows a voluntary pass, and continues next round at +2 seats", () => {
    let s = rich(); s.startingPlayer = "C"; s.investmentStarter = "C"; s.currentInvestmentPlayer = "C";
    const order: string[] = [];
    for (let i = 0; i < 8; i++) { const p = s.currentInvestmentPlayer!; order.push(p); s = act(s, { type: "PASS_INVESTMENT" }, p); }
    expect(order).toEqual(["C", "D", "A", "B", "D", "A", "B", "C"]);
    for (const p of players) s = act(s, { type: "ROUND_END_READY" }, p); expect(s.investmentStarter).toBe("A");
  });
  it("levels only at round end, one level at a time with surplus carried, and schedules special/final rounds", () => {
    let s = fresh(); s.cityDevelopment = 60;
    s = settle(s); expect(s.cityLevel).toBe(2); expect(s.cityDevelopment).toBe(60); expect(s.specialBoomRound).toBeNull();
    s.round = 2; s = settle(s); expect(s.cityLevel).toBe(3); expect(s.specialBoomRound).toBe(3);
    s.round = 3; startRound(s, rng()); expect(s.cityCondition.id).toBe("special-boom"); expect(s.specialBoomPlayed).toBe(true);
    s = settle(s); expect(s.cityLevel).toBe(4); expect(s.finalRound).toBe(4); expect(s.result).toBeNull();
    s.round = 4; s = settle(s); expect(s.result?.reason).toBe("CITY_LV4_FINAL_ROUND");
  });
  it("never ends for 25 value and always ends R10 after settlement", () => {
    let s = fresh(); companyOf(s, "A").resources.cash = 400;
    s = settle(s); expect(s.result).toBeNull(); expect(s.companyValues.A!.total).toBeGreaterThan(25);
    s.round = 10; s = settle(s); expect(s.result?.reason).toBe("ROUND_10");
  });
  it("R9 is the last Lv4 scheduling round; no round 11 is scheduled", () => {
    for (const round of [9, 10]) { const s = fresh(); s.round = round; s.cityLevel = 3; s.cityDevelopment = 44; expect(settle(s).finalRound).toBe(10); }
  });
  it("starts a clean rematch with unchanged seat order but newly sampled starter", () => {
    const old = rich(); old.round = 10; old.cityDevelopment = 55; old.routes = [{ playerId: "A", district: "MARKET" }];
    const s = createHubState("new-match", old.players, new SeededRandom(999));
    expect(s.players).toEqual(old.players); expect(s.matchId).not.toBe(old.matchId); expect(s.buildings).toEqual([]); expect(s.routes).toEqual([]); expect(s.cityLevel).toBe(1); expect(s.events).toHaveLength(1); expect(s.result).toBeNull();
  });
  it("activates only after 60s, continues from committed actions and returns control without rollback", () => {
    let s = fresh(); s = changeHubConnection(s, "A", false, 1000);
    expect(commercialHubGameModule.getAutomaticProgress!(s, { rng: rng(), now: 2000 })?.delayMs).toBe(59_000);
    s = reduceHubState(s, { type: "BOT_TICK" }, rng(), 1000 + BOT_GRACE_MS - 1); expect(s.connections.A!.bot).toBe(false);
    s = reduceHubState(s, { type: "BOT_TICK" }, rng(), 1000 + BOT_GRACE_MS); expect(s.connections.A!.bot).toBe(true); expect(s.roundReady).toContain("A");
    const after = changeHubConnection(s, "A", true, 63_000); expect(after.roundReady).toContain("A"); expect(after.connections.A!.bot).toBe(false);
    expect(after.events.filter((e) => ["BOT_STARTED", "PLAYER_RETURNED"].includes(e.type)).map((e) => e.type)).toEqual(["BOT_STARTED", "PLAYER_RETURNED"]);
  });
  it("a quick reconnect cancels takeover and simple BOT does not spend or negotiate", () => {
    let s = fresh(); s = changeHubConnection(changeHubConnection(s, "A", false, 1), "A", true, 999);
    s = reduceHubState(s, { type: "BOT_TICK" }, rng(), 100_000); expect(s.connections.A!.bot).toBe(false);
    s.phase = "PROCUREMENT"; expect(botAction(s, "A")).toEqual({ type: "PROCUREMENT_DONE" });
    s.phase = "INVESTMENT"; s.currentInvestmentPlayer = "A"; expect(botAction(s, "A")).toEqual({ type: "PASS_INVESTMENT" });
  });
});
