import { describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom } from "../../../src/room/room-lobby";
import type { RoomState } from "../../../src/room/room-state";
import { createHubState } from "../../../src/games/commercial-hub/engine";
import { SeededRandom } from "../../../src/games/pon-inai/random";
import type { HubClientAction, HubState } from "../../../src/games/commercial-hub/state";
import { createPublicProject } from "../../../src/games/commercial-hub/projects";
import type { ServerRoomMessage } from "../../../src/shared/room-protocol";
import type { Env } from "../../../src/server/env";

vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(protected ctx: unknown, protected env: unknown) {} } }));
vi.mock("../../../src/server/lib/directory", () => ({ syncRoomDirectory: vi.fn(async () => {}) }));
import { RoomObject } from "../../../src/server/durable-objects/RoomObject";

function fixture(state: HubState, actor = "A") {
  let room = createRoom({ roomId: "r", roomCode: "HUB123", roomName: "Hub", gameId: "commercial-hub", hostPlayerId: "A", hostDisplayName: "Alice", passwordHash: "", minPlayers: 4, maxPlayers: 4, gameConfig: {}, now: Date.now() });
  for (const id of ["B", "C", "D"]) room = joinRoom(room, id, id);
  const data = new Map<string, unknown>([["room", { ...room, status: "PLAYING", gameState: state }], ["phaseVersion", 1],
    ["security", { passwordSalt: "", passwordVerifier: "", hasPassword: false, sessionTokenHashes: { A: "a", B: "b", C: "c", D: "d" }, processedRequestIds: {} }]]);
  const messages: ServerRoomMessage[] = [];
  const ws = { readyState: 1, deserializeAttachment: () => ({ playerId: actor }), send: (raw: string) => messages.push(JSON.parse(raw)) } as unknown as WebSocket;
  const ctx = { storage: { get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); }, delete: async (key: string) => data.delete(key), setAlarm: async () => {}, deleteAlarm: async () => {} },
    getWebSockets: () => [ws], waitUntil: (promise: Promise<unknown>) => { promise.catch(() => {}); } } as unknown as DurableObjectState;
  let object = new RoomObject(ctx, {} as Env);
  return { data, messages, state: () => (data.get("room") as RoomState<HubState>).gameState!,
    restore: () => { object = new RoomObject(ctx, {} as Env); },
    send: (action: unknown, requestId = crypto.randomUUID(), version = data.get("phaseVersion")) => object.webSocketMessage(ws, JSON.stringify({ type: "GAME_ACTION", phaseVersion: version, requestId, action })) };
}
const terms = { give: { materials: 1, goods: 0, cash: 0 }, receive: { materials: 0, goods: 0, cash: 1 } };
type Case = { title: string; action: HubClientAction; actor?: string; prepare?: (s: HubState) => void };
const cases: Case[] = [
  { title: "card", action: { type: "PLAY_CARD", card: { suit: "commerce", rank: 1 } }, prepare(s) { s.phase = "TRICK"; s.playerHands.A = [{ suit: "commerce", rank: 1 }]; } },
  { title: "offer", action: { type: "OFFER_TRADE", counterpart: "B", terms }, prepare(s) { s.investmentTurn = { playerId: "A", step: "NEGOTIATION", negotiation: null }; } },
  { title: "counter", actor: "B", action: { type: "COUNTER_TRADE", terms }, prepare(s) { s.investmentTurn = { playerId: "A", step: "NEGOTIATION", negotiation: { ...terms, counterpart: "B", status: "OFFERED" } }; } },
  ...[true, false].map((accept): Case => ({ title: accept ? "accept" : "reject", actor: "B", action: { type: "ANSWER_TRADE", accept }, prepare(s) { s.investmentTurn = { playerId: "A", step: "NEGOTIATION", negotiation: { ...terms, counterpart: "B", status: "OFFERED" } }; } })),
  { title: "market", action: { type: "MARKET", action: "buy-material" }, prepare(s) { s.investmentTurn = { playerId: "A", step: "MARKET", negotiation: null }; } },
  { title: "build", action: { type: "BUILD", suit: "industry", district: "WORKSHOP", access: "OWN" } },
  { title: "upgrade", action: { type: "UPGRADE", buildingId: "w" }, prepare(s) { s.buildings = [{ id: "w", playerId: "A", suit: "industry", district: "WORKSHOP", upgraded: false }]; } },
  { title: "route", action: { type: "ROUTE", edgeId: "E01" } },
  { title: "project contribution", action: { type: "CONTRIBUTE", slot: 0 }, prepare(s) { s.cityLevel = 2; s.activePublicProject = createPublicProject("p", "中央市場"); } }
];
describe("commercial-hub through the shared Durable Object", () => {
  it.each(cases)("requestId makes $title idempotent, including after hibernation/reload", async ({ action, actor, prepare }) => {
    const s = createHubState("match", ["A", "B", "C", "D"], new SeededRandom(4));
    s.phase = "INVESTMENT"; s.investmentTurn = { playerId: "A", step: "INVESTMENT", negotiation: null }; prepare?.(s);
    const f = fixture(s, actor);
    await f.send(action, "same-request");
    expect(f.messages.filter((m) => m.type === "ERROR")).toEqual([]);
    const accepted = structuredClone(f.state()); expect(accepted.revision).toBe(1);
    f.restore(); await f.send(action, "same-request", 1);
    expect(f.state()).toEqual(accepted);
    expect(f.messages.filter((m) => m.type === "ACTION_ACCEPTED")).toHaveLength(2);
  });
  it("binds a forged actor to the session, rejects wrong turns and Must Follow via the API", async () => {
    const s = createHubState("match", ["A", "B", "C", "D"], new SeededRandom(4));
    s.phase = "TRICK"; s.playedCards = [{ playerId: "A", card: { suit: "commerce", rank: 8 } }];
    s.playerHands.B = [{ suit: "commerce", rank: 1 }, { suit: "industry", rank: 8 }];
    const f = fixture(s, "B");
    await f.send({ type: "PLAY_CARD", playerId: "A", card: { suit: "industry", rank: 8 } });
    expect(f.state().playedCards).toHaveLength(1); expect(f.messages.at(-1)?.type).toBe("ERROR");
    await f.send({ type: "PLAY_CARD", playerId: "A", card: { suit: "commerce", rank: 1 } });
    expect(f.state().playedCards[1]?.playerId).toBe("B");
    const accepted = structuredClone(f.state()); await f.send({ type: "PLAY_CARD", card: { suit: "industry", rank: 8 } });
    expect(f.state()).toEqual(accepted); expect(f.messages.at(-1)?.type).toBe("ERROR");
    for (const m of f.messages.filter((m) => m.type === "GAME_VIEW")) expect(JSON.stringify(m.gameView)).not.toContain("playerHands");
  });
  it("rejects a stale new request even if the next action would otherwise be legal", async () => {
    const s = createHubState("m", ["A", "B", "C", "D"], new SeededRandom(1));
    s.phase = "INVESTMENT"; s.investmentTurn = { playerId: "A", step: "NEGOTIATION", negotiation: null };
    const f = fixture(s); await f.send({ type: "SKIP_NEGOTIATION" });
    await f.send({ type: "MARKET", action: "buy-material" }, "stale", 1);
    expect(f.state().investmentTurn?.step).toBe("MARKET"); expect(f.state().publicMarketUsedByPlayer).toEqual([]);
    expect(f.messages.at(-1)?.type).toBe("ERROR");
  });
});
