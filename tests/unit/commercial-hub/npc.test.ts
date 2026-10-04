import { describe, expect, it } from "vitest";
import { HUB_NPC_TYPES } from "../../../src/shared/commercial-hub-npc";
import { addRoomNpc, changeRoomNpc, createRoom, disconnectRoomPlayer, joinRoom, leaveRoom, publicRoomState, setLearningConsent, setPlayerReady, transferDisconnectedHostAfterGrace } from "../../../src/room/room-lobby";
import { buildHubView } from "../../../src/games/commercial-hub/view";
import { decideNpc, npcAcceptsTrade, npcProjectGoodsReserve } from "../../../src/games/commercial-hub/npc";
import { commercialHubGameModule as module, nextNpcDecision } from "../../../src/games/commercial-hub/module";
import { changeHubConnection, reduceHubState } from "../../../src/games/commercial-hub/engine";
import { companyOf } from "../../../src/games/commercial-hub/state";
import { act, fresh, players, rich, rng as makeRng } from "./helpers";

const rng = makeRng();
function lobby() { return createRoom({ roomId: "r", roomCode: "HUB123", roomName: "Hub", gameId: "commercial-hub", hostPlayerId: "A", hostDisplayName: "private name", passwordHash: "", minPlayers: 4, maxPlayers: 4, gameConfig: {}, now: 0 }); }
describe("permanent NPC seats", () => {
  it.each([1, 2, 3, 4])("starts with %i humans and complementary NPCs; duplicates are allowed", (humans) => {
    let room = lobby();
    for (let i = 1; i < humans; i++) { room = joinRoom(room, players[i]!, "human"); room = setPlayerReady(room, players[i]!, true); }
    for (let i = humans; i < 4; i++) room = addRoomNpc(room, "A", `npc-${i}`, "standard");
    expect(room.status).toBe("READY"); expect(room.players).toHaveLength(4);
    expect(() => addRoomNpc(room, "A", "extra", "standard")).toThrow();
    if (humans < 4) {
      const id = `npc-${humans}`;
      room = changeRoomNpc(room, "A", id, "development"); expect(room.players.find((p) => p.playerId === id)?.npcType).toBe("development");
      room = changeRoomNpc(room, "A", id, null); expect(room.status).toBe("OPEN");
    }
  });
  it("rejects nonhost, poststart, invalid types and other-game NPC mutations", () => {
    let room = addRoomNpc(lobby(), "A", "npc", "standard");
    expect(() => changeRoomNpc(room, "B", "npc", null)).toThrow();
    expect(() => changeRoomNpc({ ...room, status: "PLAYING" }, "A", "npc", "production")).toThrow();
    expect(() => addRoomNpc({ ...room, gameId: "pon-inai" }, "A", "x", "standard")).toThrow();
    expect(() => addRoomNpc(room, "A", "x", "unknown" as never)).toThrow();
    expect(() => changeRoomNpc(room, "A", "A", null)).toThrow();
  });
  it("never transfers host to an NPC and closes a room when its last human leaves", () => {
    const room = addRoomNpc(lobby(), "A", "npc", "standard");
    expect(transferDisconnectedHostAfterGrace(disconnectRoomPlayer(room, "A", 0), 11_000, 10_000).hostPlayerId).toBe("A");
    expect(leaveRoom(room, "A").status).toBe("CLOSED");
    const transferred = leaveRoom(joinRoom(room, "B", "second human"), "A");
    expect(publicRoomState(transferred).players.map((p) => p.playerId)).toEqual(["B", "npc"]);
  });
  it("keeps private consent out of public room views", () => {
    const room = setLearningConsent(lobby(), "A", true);
    expect(JSON.stringify(publicRoomState(room))).not.toContain("learningConsent");
    expect(() => setLearningConsent({ ...room, status: "PLAYING" }, "A", true)).toThrow();
    expect(setLearningConsent({ ...room, status: "PLAYING" }, "A", false).players[0]?.learningConsent).toBe(false);
  });
});
describe("restricted shared NPC engine", () => {
  it.each(HUB_NPC_TYPES)("%s uses only own hand and own negotiations, and does not mutate its view", (type) => {
    const s = rich("TRICK"); s.trickLeader = "A";
    const original = buildHubView(s, "A"), snapshot = structuredClone(original), a = decideNpc(original, type);
    const changed = structuredClone(s);
    changed.playerHands.B = [{ suit: "industry", rank: 8 }]; changed.playerHands.C = [{ suit: "commerce", rank: 2 }];
    // Preserve publicly visible hand counts while altering actual hidden cards.
    changed.playerHands.B = s.playerHands.B!.map((_, i) => ({ suit: "industry", rank: i + 1 }));
    changed.playerHands.C = s.playerHands.C!.map((_, i) => ({ suit: "commerce", rank: i + 1 }));
    changed.negotiations.push({ id: "secret", proposer: "B", counterpart: "C", give: { cash: 29, materials: 0, goods: 0 }, receive: { cash: 0, materials: 1, goods: 0 }, status: "PENDING" });
    expect(decideNpc(buildHubView(changed, "A"), type)).toEqual(a); expect(original).toEqual(snapshot);
    expect(a?.action.type).toBe("PLAY_CARD");
    expect(JSON.stringify(original)).not.toMatch(/playerHands|secret|npcDecision/);
  });
  it("adapts card reward ranks to credit contraction and always follows suit", () => {
    const s = fresh(); s.phase = "TRICK"; s.trickLeader = "B";
    s.playedCards = [{ playerId: "B", card: { suit: "industry", rank: 8 } }, { playerId: "C", card: { suit: "industry", rank: 6 } }, { playerId: "D", card: { suit: "industry", rank: 4 } }];
    s.playerHands.A = [{ suit: "industry", rank: 1 }, { suit: "industry", rank: 7 }, { suit: "commerce", rank: 8 }];
    s.cityCondition = { ...s.cityCondition, id: "credit-crunch" } as typeof s.cityCondition;
    s.opportunities = [{ id: "opening", suit: "industry", trump: "industry", name: "opening" }];
    const d = decideNpc(buildHubView(s, "A"), "standard")!;
    expect(d.action).toEqual({ type: "PLAY_CARD", card: { suit: "industry", rank: 1 } });
  });
  it("production chooses extra sales capacity when supply exceeds capacity", () => {
    let s = rich(); s.round = 4;
    s.buildings = [{ id: "factory", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false }];
    companyOf(s, "A").resources = { cash: 10, materials: 2, goods: 7 };
    let d = decideNpc(buildHubView(s, "A"), "production")!;
    if (d.action.type === "ROUTE") {
      s = act(s, d.action); s.currentInvestmentPass = 2; s.currentInvestmentPlayer = "A";
      d = decideNpc(buildHubView(s, "A"), "production")!;
    }
    expect(d.action).toMatchObject({ type: "BUILD", suit: "commerce" });
  });
  it("prefers normal sales over additional production with excess inventory", () => {
    const s = rich("PRODUCTION");
    s.buildings = [{ id: "factory", playerId: "A", district: "WORKSHOP", suit: "industry", upgraded: false }, { id: "shop", playerId: "A", district: "MARKET", suit: "commerce", upgraded: true }];
    companyOf(s, "A").resources = { cash: 2, materials: 3, goods: 6 };
    expect(decideNpc(buildHubView(s, "A"), "production")?.action).toMatchObject({ type: "USE_BUILDING", buildingId: "shop", amount: 2 });
  });
  it("avoids final-round production that adds an unrecoverable transport deficit", () => {
    const s=rich("PRODUCTION");s.round=s.finalRound;s.buildings=[{id:"factory",playerId:"A",district:"WORKSHOP",suit:"industry",upgraded:false}];
    companyOf(s,"A").resources={cash:0,materials:1,goods:0};
    expect(decideNpc(buildHubView(s,"A"),"production")?.action.type).toBe("PRODUCTION_DONE");
  });
  it("compares normal sales with a feasible nearly complete project instead of selling its last good", () => {
    const s=rich("PRODUCTION");s.buildings=[{id:"shop",playerId:"A",district:"MARKET",suit:"commerce",upgraded:true}];
    companyOf(s,"A").resources={cash:10,materials:0,goods:2};
    s.publicProjects[0]!.slots.forEach((slot,i)=>slot.playerId=i===0?null:"B");
    expect(decideNpc(buildHubView(s,"A"),"production")?.action).toMatchObject({type:"USE_BUILDING",amount:1});
  });
  it("reserves only feasible public-project goods and preserves current/next normal sales", () => {
    const s = rich("PROCUREMENT"); s.specialBoomPlayed = true;
    companyOf(s, "A").resources = { cash: 3, materials: 0, goods: 4 };
    s.buildings = [{ id: "shop", playerId: "A", district: "MARKET", suit: "commerce", upgraded: true }];
    const v = buildHubView(s, "A");
    expect(npcProjectGoodsReserve(v, "standard")).toBe(0);
    expect(npcProjectGoodsReserve(v, "development")).toBeLessThanOrEqual(2);
    expect(decideNpc(v, "production")?.action).not.toEqual({ type: "MARKET", action: "dispose-good" });
  });
  it("declines negative-value investments and records an assessable pass reason", () => {
    const s = rich(); s.round = s.finalRound; companyOf(s, "A").resources = { cash: 5, materials: 0, goods: 0 };
    s.transportCharges = [{ payer: "A", payee: null, district: "MARKET", reason: "SALE", amount: 5 }];
    const d = decideNpc(buildHubView(s, "A"), "standard")!;
    expect(d.action.type).toBe("PASS_INVESTMENT"); expect(d.reasons[0]).toContain("比較"); expect(d.alternatives?.length).toBeGreaterThan(0);
  });
  it("uses a rebate to clear a final deficit even when nominal company value is unchanged", () => {
    const s=rich();s.round=s.finalRound;companyOf(s,"A").resources={cash:-1,materials:0,goods:1};s.benefits.A!.project=["REBATE"];
    const d=decideNpc(buildHubView(s,"A"),"standard")!;
    expect(d.action).toMatchObject({type:"CONTRIBUTE",benefit:"REBATE"});
    expect(companyOf(act(s,d.action),"A").resources.cash).toBe(0);
  });
  it("clears a final deficit before retaining goods for speculative projects", () => {
    const s=rich("PROCUREMENT");s.round=s.finalRound;s.specialBoomPlayed=true;companyOf(s,"A").resources={cash:-1,materials:0,goods:1};
    expect(decideNpc(buildHubView(s,"A"),"development")?.action).toEqual({type:"MARKET",action:"dispose-good"});
  });
  it("automatically completes an all-NPC match using the real module scheduler", () => {
    let state=module.createInitialState({matchId:"auto",gameIndex:1,players:players.map((id,i)=>({id,displayName:id,controller:{kind:"NPC",profile:HUB_NPC_TYPES[i]!}})),config:{},rng:makeRng()}), now=0;
    for(let step=0;step<1800 && !module.isFinished(state);step++) {
      const progress=module.getAutomaticProgress!(state,{rng,now});expect(progress).not.toBeNull();
      now+=progress!.delayMs;state=module.handleAction(state,progress!.action,{rng,now});
      state.events=[];
    }
    expect(module.isFinished(state)).toBe(true);expect(state.result?.ranking).toHaveLength(4);
  });
  it("keeps permanent NPCs separate from disconnect BOT takeover", () => {
    const s = fresh(); s.npcPlayers = { B: "standard" };
    expect(changeHubConnection(s, "B", false, 0)).toBe(s);
    expect(module.getAutomaticProgress!(s, { rng, now: 0 })?.action).toEqual({ type: "NPC_TICK" });
    const next = module.handleAction(s, { type: "NPC_TICK" }, { rng, now: 450 });
    expect(next.roundReady).toContain("B"); expect(next.connections.B?.bot).toBe(false); expect(next.npcDecision?.decision.logicVersion).toBeTruthy();
  });
});
describe("NPC negotiation automation", () => {
  const terms = { give: { cash: 0, materials: 0, goods: 1 }, receive: { cash: 0, materials: 1, goods: 0 } };
  function tradeState() { const s = rich("PROCUREMENT"); s.npcPlayers = { B: "standard", C: "production", D: "development" }; return s; }
  it("rejects an offer whose proposer spent the promised resources and continues", () => {
    let s=tradeState();
    s=act(s,{type:"OFFER_TRADE",counterpart:"B",terms:{give:{cash:20,materials:0,goods:0},receive:{cash:0,materials:1,goods:0}}});
    companyOf(s,"A").resources.cash=0;
    const after=module.handleAction(s,{type:"NPC_TICK"},{rng,now:1});
    expect(after.negotiations[0]?.status).toBe("REJECTED");expect(after.companies).toEqual(s.companies);
  });
  it("automatically answers human and NPC offers, rejecting disadvantageous terms", () => {
    let s = tradeState();
    s = act(s, { type: "OFFER_TRADE", counterpart: "B", terms: { give: { cash: 1, materials: 0, goods: 0 }, receive: { cash: 20, materials: 0, goods: 0 } } });
    const n = s.negotiations[0]!; expect(npcAcceptsTrade(buildHubView(s, "B"), "standard", n)).toBe(false);
    const d = nextNpcDecision(s)!; expect(d.playerId).toBe("B"); expect(d.decision.action).toMatchObject({ type: "ANSWER_TRADE", accept: false });
    s = module.handleAction(s, { type: "NPC_TICK" }, { rng, now: 10 }); expect(s.negotiations[0]?.status).toBe("REJECTED");
    const npcOffer = reduceHubState(s, { type: "OFFER_TRADE", playerId: "C", counterpart: "D", terms }, rng);
    for (let i=0, current=npcOffer;i<12;i++) { current=module.handleAction(current,{type:"NPC_TICK"},{rng,now:100+i}); if(current.negotiations[1]?.status!=="PENDING") return; }
    throw new Error("NPC offer was not answered");
  });
  it("requires a rule-owned deadline for NPC-to-human proposals and never chooses the human answer", () => {
    let s = tradeState();
    expect(() => reduceHubState(s, { type: "OFFER_TRADE", playerId: "B", counterpart: "A", terms }, rng)).toThrow(/回答期限/);
    s.negotiationTimeoutMs = 9_000; // explicit test fixture, no production default
    s = reduceHubState(s, { type: "OFFER_TRADE", playerId: "B", counterpart: "A", terms }, rng, 1_000);
    expect(buildHubView(s, "A").negotiations[0]?.deadlineAt).toBe(10_000);
    expect(decideNpc(buildHubView(s, "B"), "standard")).toBeNull();
    expect(s.negotiations[0]?.status).toBe("PENDING");
    const accepted = reduceHubState(s, { type: "ANSWER_TRADE", playerId: "A", negotiationId: "trade-1", accept: true }, rng, 9_999);
    expect(accepted.negotiations[0]?.status).toBe("ACCEPTED");
    expect(reduceHubState(accepted, { type: "EXPIRE_TRADES" }, rng, 10_000).companies).toEqual(accepted.companies);
  });
  it("times out once, transfers no resources, restores deadlines, and finishes rejected procurement", () => {
    let s = tradeState(); s.negotiationTimeoutMs = 9_000;
    s = reduceHubState(s, { type: "OFFER_TRADE", playerId: "B", counterpart: "A", terms }, rng, 1_000);
    const resources = structuredClone(s.companies), restored = structuredClone(s);
    const late = reduceHubState(restored, { type: "ANSWER_TRADE", playerId: "A", negotiationId: "trade-1", accept: true }, rng, 10_000);
    expect(late.negotiations[0]).toMatchObject({ status: "REJECTED", resolution: "TIMEOUT", deadlineAt: 10_000 }); expect(late.companies).toEqual(resources);
    expect(reduceHubState(late, { type: "EXPIRE_TRADES" }, rng, 20_000).companies).toEqual(resources);
    expect(() => reduceHubState(late, { type: "ANSWER_TRADE", playerId: "A", negotiationId: "trade-1", accept: true }, rng, 10_000)).toThrow();
    let current = late;
    for (let i=0;i<30 && !current.procurementDone.includes("B");i++) current=module.handleAction(current,{type:"NPC_TICK"},{rng,now:20_000+i});
    expect(current.procurementDone).toContain("B");
  });
});
