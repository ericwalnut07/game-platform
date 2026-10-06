import { createLearningJournal } from "../../../src/games/commercial-hub/learning";
import { describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom } from "../../../src/room/room-lobby";
import type { RoomState } from "../../../src/room/room-state";
import type { HubState } from "../../../src/games/commercial-hub/state";
import { companyOf } from "../../../src/games/commercial-hub/state";
import type { Env } from "../../../src/server/env";
import { fresh, players, rich } from "./helpers";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(protected ctx: unknown, protected env: unknown) {} } }));
vi.mock("../../../src/server/lib/directory", () => ({ syncRoomDirectory: vi.fn(async () => {}) }));
import { RoomObject } from "../../../src/server/durable-objects/RoomObject";
function fixture(state: HubState, env: Partial<Env> = {}) {
  let room = createRoom({ roomId: "r", roomCode: "HUB123", roomName: "Hub", gameId: "commercial-hub", hostPlayerId: "A", hostDisplayName: "A", passwordHash: "", minPlayers: 4, maxPlayers: 4, gameConfig: {}, now: Date.now() });
  for (const id of players.slice(1)) room = joinRoom(room, id, id);
  room = { ...room, players: room.players.map(p => state.npcPlayers?.[p.playerId] ? { ...p, npcType: state.npcPlayers[p.playerId] } : p) };
  const data = new Map<string, unknown>([["room", { ...room, status: "PLAYING", gameState: state }], ["phaseVersion", 1], ["security", { passwordSalt: "", passwordVerifier: "", hasPassword: false, sessionTokenHashes: { A: "a", B: "b", C: "c", D: "d" }, processedRequestIds: {} }]]);
  const messages: { actor: string; type: string; gameView?: any; message?: string }[] = [];
  const sockets = Object.fromEntries(players.map((id) => [id, { readyState: 1, deserializeAttachment: () => ({ playerId: id }), send: (raw: string) => messages.push({ actor: id, ...JSON.parse(raw) }) }])) as unknown as Record<string, WebSocket>;
  const pending: Promise<unknown>[] = [];
  const ctx = { storage: { get: async (key: string) => structuredClone(data.get(key)), put: async (key: string | Record<string, unknown>, value: unknown) => { await Promise.resolve(); if(typeof key === "string") data.set(key, structuredClone(value)); else for(const [k,v] of Object.entries(key)) data.set(k,structuredClone(v)); }, delete: async (key: string) => data.delete(key), setAlarm: async (n: number) => { data.set("alarmAt", n); }, deleteAlarm: async () => {} }, getWebSockets: (tag?: string) => tag ? [sockets[tag.split(":")[1]!]!] : Object.values(sockets), waitUntil: (p: Promise<unknown>) => { pending.push(p.catch(() => {})); } } as unknown as DurableObjectState;
  let object = new RoomObject(ctx, env as Env);
  return { data, messages, drain: async () => { await Promise.all(pending); }, restore: () => { object = new RoomObject(ctx, env as Env); }, state: () => (data.get("room") as RoomState<HubState>).gameState!,
    send: (actor: string, action: unknown, requestId = crypto.randomUUID(), version = data.get("phaseVersion")) => object.webSocketMessage(sockets[actor]!, JSON.stringify({ type: "GAME_ACTION", phaseVersion: version, requestId, action })),
    raw: (actor: string, type: string) => object.webSocketMessage(sockets[actor]!, JSON.stringify({ type, requestId: crypto.randomUUID() })),
    disconnect: async (actor: string) => { Object.defineProperty(sockets[actor], "readyState", { value: 3 }); await object.webSocketClose(sockets[actor]!); },
    alarm: () => object.alarm() };
}
const terms = { give: { materials: 1, goods: 0, cash: 0 }, receive: { materials: 0, goods: 0, cash: 1 } };
describe("v0.2 shared Durable Object", () => {
  it("serializes secret simultaneous bids, authenticates actors and deduplicates a locked declaration after hibernation", async () => {
    const s = fresh(); s.config.trickRule = "BID"; s.phase = "BID"; const f = fixture(s);
    await Promise.all([f.send("A", { type: "SUBMIT_BID", wins: 0, playerId: "D" }, "bid-A", 1), f.send("B", { type: "SUBMIT_BID", wins: 6 }, "bid-B", 1)]);
    expect(f.state().bids).toEqual({ A: 0, B: 6 }); expect(f.data.get("phaseVersion")).toBe(1);
    for (const m of f.messages.filter((m) => m.type === "GAME_VIEW" && ["C", "D"].includes(m.actor))) {
      expect(m.gameView.bids).toBeNull(); expect(m.gameView.ownBid).toBeNull();
      expect(m.gameView.events.filter((e: { type: string }) => e.type === "BID_SUBMITTED").every((e: { data: unknown }) => JSON.stringify(e.data) === "{}")).toBe(true);
    }
    const before = structuredClone(f.state()); f.restore(); await f.send("A", { type: "SUBMIT_BID", wins: 0 }, "bid-A", 1); expect(f.state()).toEqual(before);
    await f.send("A", { type: "SUBMIT_BID", wins: 1 }, "bid-A-again", 1); expect(f.state().bids.A).toBe(0); expect(f.messages.filter((m) => m.type === "ERROR")).toHaveLength(1);
    await Promise.all([f.send("C", { type: "SUBMIT_BID", wins: 0 }, "bid-C", 1), f.send("D", { type: "SUBMIT_BID", wins: 6 }, "bid-D", 1)]);
    expect(f.state().phase).toBe("TRICK"); expect(f.state().events.filter((e) => e.type === "BIDS_REVEALED")).toHaveLength(1);
    for (const p of players) expect(f.messages.filter((m) => m.type === "GAME_VIEW" && m.actor === p).at(-1)?.gameView.bids).toEqual({ A: 0, B: 6, C: 0, D: 6 });
  });
  it("persists auditor placement and bank fees once across retries, and rejects unauthorized placement", async () => {
    const s = rich(); s.round = 2; s.config.auditor = true; s.phase = "AUDITOR_PLACEMENT"; s.auditor.placementPlayer = "A";
    const f = fixture(s); await f.send("B", { type: "PLACE_AUDITOR", target: "commerce" }, "wrong"); expect(f.state().auditor.target).toBeNull();
    await f.send("A", { type: "PLACE_AUDITOR", target: "PUBLIC_PROJECTS" }, "place"); const placed = structuredClone(f.state());
    f.restore(); await f.send("A", { type: "PLACE_AUDITOR", target: "PUBLIC_PROJECTS" }, "place", 1); expect(f.state()).toEqual(placed);
    const room = f.data.get("room") as RoomState<HubState>; room.gameState!.phase = "INVESTMENT"; room.gameState!.currentInvestmentPlayer = "A"; room.gameState!.benefits.A!.project = ["DISCOUNT"];
    f.data.set("room", room); f.restore(); const input = { type: "CONTRIBUTE", projectId: "market", slot: 0, benefit: "DISCOUNT" };
    await f.send("A", input, "free-audited"); expect(companyOf(f.state(), "A").resources.cash).toBe(29);
    f.restore(); await f.send("A", input, "free-audited"); expect(companyOf(f.state(), "A").resources.cash).toBe(29);
    expect(f.state().events.filter((e) => e.type === "CONTRIBUTE")).toHaveLength(1);
  });
  it("validates the NPC deadline only for Hub without blocking Pon match starts", async () => {
    for (const gameId of ["pon-inai", "commercial-hub"]) {
      const f = fixture(fresh(), { HUB_NPC_TRADE_RESPONSE_SECONDS: "undecided" });
      const room = f.data.get("room") as RoomState;
      f.data.set("room", { ...room, gameId, gameConfig: gameId === "pon-inai" ? { gameCount: 1 } : {},
        status: "READY", gameState: undefined, players: room.players.map(p => ({ ...p, isReady: true })) });
      await f.raw("A", "START_MATCH");
      if (gameId === "pon-inai") {
        expect(f.messages.filter(m => m.type === "ERROR")).toEqual([]);
        expect((f.data.get("room") as RoomState).status).toBe("PLAYING");
      } else {
        expect(f.messages.filter(m => m.type === "ERROR").map(m => m.message)).toEqual(["NPC回答期限の設定が不正です"]);
        expect((f.data.get("room") as RoomState).status).toBe("READY");
      }
    }
  });
  it("serializes simultaneous market inputs without losing updates or invalidating peers", async () => {
    const f = fixture(rich("PROCUREMENT")); await Promise.all(players.map((p) => f.send(p, { type: "MARKET", action: "buy-material" }, `market-${p}`, 1)));
    expect(f.state().companies.map((c) => c.resources.cash)).toEqual([27, 27, 27, 27]); expect(f.state().revision).toBe(4); expect(f.data.get("phaseVersion")).toBe(1); expect(f.messages.filter((m) => m.type === "ERROR")).toEqual([]);
  });
  it("enforces one market buy on three simultaneous requests and deduplicates retry after hibernation", async () => {
    const f = fixture(rich("PROCUREMENT")); await Promise.all([f.send("A", { type: "MARKET", action: "buy-material" }, "first"), f.send("A", { type: "MARKET", action: "buy-material" }, "second"), f.send("A", { type: "MARKET", action: "buy-material" }, "third")]);
    expect(f.state().usage.A!.purchases).toBe(1); expect(f.state().revision).toBe(1); expect(f.messages.filter((m) => m.type === "ERROR")).toHaveLength(2);
    for (let i = 0; i < 50; i++) await f.raw("A", "HEARTBEAT");
    const before = structuredClone(f.state()); f.restore(); await f.send("A", { type: "MARKET", action: "buy-material" }, "first"); expect(f.state()).toEqual(before);
  });
  it("serializes two players targeting one project slot and returns the latest ownership", async () => {
    const f = fixture(rich()); const action = { type: "CONTRIBUTE", projectId: "market", slot: 0, benefit: "NONE" };
    await Promise.all([f.send("A", action, "claim-A", 1), f.send("B", action, "claim-B", 1)]);
    expect(f.state().publicProjects[0]!.slots[0]!.playerId).toBe("A");
    expect(companyOf(f.state(), "A").resources.materials).toBe(9); expect(companyOf(f.state(), "B").resources.materials).toBe(10);
    expect(f.state().events.filter((e) => e.type === "CONTRIBUTE")).toHaveLength(1);
    expect(f.messages.filter((m) => m.type === "ERROR" && m.actor === "B")).toHaveLength(1);
    expect(f.messages.filter((m) => m.type === "GAME_VIEW" && m.actor === "B").at(-1)?.gameView.publicProjects[0].slots[0].playerId).toBe("A");
  });
  it("deduplicates procurement ability and pooled bonus with simultaneous requests", async () => {
    const s = rich("PROCUREMENT"); s.benefits.A!.bulk = 3;
    s.buildings = [{ id: "w", playerId: "A", district: "WAREHOUSE", suit: "procurement", upgraded: true }];
    const f = fixture(s), action = { type: "USE_BUILDING", buildingId: "w", amount: 2, access: "PUBLIC", bonus: 3 };
    await Promise.all([f.send("A", action, "use-1"), f.send("A", action, "use-2")]);
    expect(f.state().benefits.A!.bulk).toBe(0); expect(f.state().usage.A!.buildings).toEqual(["w"]);
    expect(companyOf(f.state(), "A").resources).toEqual({ cash: 28, materials: 16, goods: 10 }); expect(f.state().transportCharges).toHaveLength(1);
    f.restore(); await f.send("A", action, "use-1"); expect(companyOf(f.state(), "A").resources.materials).toBe(16);
  });
  it("settles competing acceptances against current balances and hides nonparty proposals in broadcasts", async () => {
    const s = rich("PROCUREMENT"); companyOf(s, "B").resources.cash = 1; const f = fixture(s);
    await f.send("A", { type: "OFFER_TRADE", counterpart: "B", terms }); await f.send("C", { type: "OFFER_TRADE", counterpart: "B", terms });
    for (const m of f.messages.filter((m) => m.type === "GAME_VIEW" && m.actor === "D")) { expect(m.gameView.negotiations).toEqual([]); expect(m.gameView).not.toHaveProperty("companyValues"); expect(m.gameView).not.toHaveProperty("playerHands"); }
    await Promise.all([f.send("B", { type: "ANSWER_TRADE", negotiationId: "trade-1", accept: true }, "a"), f.send("B", { type: "ANSWER_TRADE", negotiationId: "trade-2", accept: true }, "b")]);
    expect(f.state().negotiations.filter((n) => n.status === "ACCEPTED")).toHaveLength(1); expect(companyOf(f.state(), "B").resources.cash).toBe(0); expect(f.messages.filter((m) => m.type === "ERROR")).toHaveLength(1);
  });
  it("authenticates card actors, rejects Must Follow and stale sequential versions", async () => {
    const s = rich("TRICK"); s.trickLeader = "A"; s.playedCards = [{ playerId: "A", card: { suit: "commerce", rank: 8 } }]; s.playerHands.B = [{ suit: "commerce", rank: 1 }, { suit: "industry", rank: 8 }]; const f = fixture(s);
    await f.send("B", { type: "PLAY_CARD", playerId: "A", card: { suit: "industry", rank: 8 } }); expect(f.state().playedCards).toHaveLength(1);
    await f.send("B", { type: "PLAY_CARD", playerId: "A", card: { suit: "commerce", rank: 1 } }); expect(f.state().playedCards[1]!.playerId).toBe("B");
    const before = structuredClone(f.state()); await f.send("C", { type: "PLAY_CARD", card: s.playerHands.C![0]! }, "stale", 1); expect(f.state()).toEqual(before);
  });
  it("deduplicates each investment kind and does not clear history on rejected restarts", async () => {
    for (const action of [{ type: "BUILD", district: "MARKET", suit: "commerce", access: "PUBLIC" }, { type: "ROUTE", district: "MARKET" }, { type: "CONTRIBUTE", projectId: "market", slot: 0, benefit: "NONE" }, { type: "UPGRADE", buildingId: "b", access: "PUBLIC" }]) {
      const s = rich(); if (action.type === "UPGRADE") s.buildings = [{ id: "b", playerId: "A", suit: "commerce", district: "MARKET", upgraded: false }];
      const f = fixture(s); await f.send("A", action, "invest"); expect(f.state().revision).toBe(1); const after = structuredClone(f.state());
      await f.raw("A", "REMATCH"); await f.raw("A", "START_MATCH"); f.restore(); await f.send("A", action, "invest", 1); expect(f.state()).toEqual(after);
    }
  });
  it("serializes an NPC purchase with a human purchase and does not repeat an alarm", async () => {
    const now = Date.now(), clock = vi.spyOn(Date,"now").mockReturnValue(now);
    try {
      const s=rich("PROCUREMENT");s.npcPlayers={B:"production"};s.companies[1]!.resources={cash:15,materials:0,goods:0};s.usage.B!.proposed=true;s.buildings=[{id:"factory",playerId:"B",district:"WORKSHOP",suit:"industry",upgraded:false}];
      const f=fixture(s);f.data.set("scheduledAction",{version:1,dueAt:now,action:{type:"NPC_TICK"}});
      await Promise.all([f.alarm(), f.send("A",{type:"MARKET",action:"buy-material"},"same")]);
      expect(f.state().usage.A!.purchases).toBe(1);expect(f.state().usage.B!.purchases).toBe(1);
      f.restore();await f.alarm();await f.send("A",{type:"MARKET",action:"buy-material"},"same");
      expect(f.state().usage.A!.purchases).toBe(1);expect(f.state().usage.B!.purchases).toBe(1);
    } finally {clock.mockRestore();}
  });
  it("resolves answer/expiry races once and restores a pending deadline after disconnect", async () => {
    const now=Date.now(),clock=vi.spyOn(Date,"now").mockReturnValue(now);
    try {
      const s=rich("PROCUREMENT");s.npcPlayers={B:"standard"};s.negotiationTimeoutMs=9000;
      const f=fixture(s);
      // The state is a server-created NPC offer; clients cannot act as the NPC.
      s.negotiations=[{id:"trade-1",proposer:"B",counterpart:"A",...terms,status:"PENDING",createdAt:now,deadlineAt:now+9000}];
      (f.data.get("room") as RoomState<HubState>).gameState=s;
      await f.disconnect("A");f.restore();
      expect(f.state().negotiations[0]?.deadlineAt).toBe(now+9000);
      f.data.set("scheduledAction",{version:1,dueAt:now+9000,action:{type:"EXPIRE_TRADES"}});
      clock.mockReturnValue(now+9000);const before=structuredClone(f.state().companies);
      await Promise.all([f.send("A",{type:"ANSWER_TRADE",negotiationId:"trade-1",accept:true}),f.alarm()]);
      expect(f.state().negotiations[0]).toMatchObject({status:"REJECTED",resolution:"TIMEOUT"});expect(f.state().companies).toEqual(before);
      expect(f.state().events.filter(e=>e.type==="TRADE_ACCEPTED")).toHaveLength(0);
    } finally {clock.mockRestore();}
  });
  it("persists a failed-learning outbox with the accepted state and does not expose it to peers", async () => {
    const s=rich("PROCUREMENT"),f=fixture(s),room=f.data.get("room") as RoomState<HubState>;
    const consenting=room.players.map(p=>({...p,learningConsent:p.playerId==="A"}));
    f.data.set("learning:m",createLearningJournal(s,room.roomCode,consenting,Date.now()));
    const warning=vi.spyOn(console,"warn").mockImplementation(()=>{});
    try {
      await f.send("A",{type:"MARKET",action:"buy-material"},"logged");await f.drain();
      expect(f.state().usage.A!.purchases).toBe(1);
      const journal=f.data.get("learning:m") as {queue:unknown[];failures:number};
      expect(journal.queue).toHaveLength(1);expect(journal.failures).toBeGreaterThan(0);expect(f.data.get("learningFlush")).toBeTruthy();
      expect(JSON.stringify(f.messages)).not.toMatch(/legalOptions|consentedSeats|privateGroups|"before"/);
    } finally {warning.mockRestore();}
  });
  it("persists a 60 second takeover alarm, survives hibernation and executes only unresolved actions", async () => {
    const clock = vi.spyOn(Date, "now"); const now = Date.now(); clock.mockReturnValue(now);
    try {
      const f = fixture(fresh()); await f.disconnect("B"); expect(f.state().connections.B!.disconnectedAt).toBe(now); expect(f.data.get("alarmAt")).toBe(now + 60_000);
      f.restore(); clock.mockReturnValue(now + 60_000); await f.alarm(); expect(f.state().connections.B!.bot).toBe(true); expect(f.state().roundReady).toContain("B");
      expect(f.state().events.filter((e) => e.type === "BOT_STARTED")).toHaveLength(1);
      await f.alarm(); expect(f.state().roundReady.filter((p) => p === "B")).toHaveLength(1);
    } finally { clock.mockRestore(); }
  });
});

describe("v0.5 ending state in shared Durable Object", () => {
  it("keeps the fixed final round through hibernation and phase transitions without leaking aggregate values", async () => {
    const s = rich("ROUND_END"); s.round = 9; s.finalRound = 11;
    s.finalRoundDecision = { round: 9, finalRound: 11, reason: "LV4_R9" }; s.cityLevel4Round = 9; s.cityReachedRounds["4"] = 9;
    s.roundStatistics = [{ round: 9, companies: players.map((playerId) => ({ playerId, resources: companyOf(s, playerId).resources, lowerBuildings: 0, upperBuildings: 0, routes: 0, value: s.companyValues[playerId]!, contributions: {} })) }];
    const f = fixture(s); await f.send("A", { type: "ROUND_END_READY" }); f.restore();
    for (const actor of players.slice(1)) await f.send(actor, { type: "ROUND_END_READY" });
    expect(f.state().round).toBe(10); expect(f.state().finalRoundDecision).toEqual(s.finalRoundDecision);
    for (const message of f.messages.filter((m) => m.type === "GAME_VIEW")) {
      expect(message.gameView.finalRound).toBe(11); expect(message.gameView.finalRoundDecision).toEqual(s.finalRoundDecision);
      expect(message.gameView).not.toHaveProperty("roundStatistics"); expect(message.gameView).not.toHaveProperty("companyValues");
    }
  });
});
