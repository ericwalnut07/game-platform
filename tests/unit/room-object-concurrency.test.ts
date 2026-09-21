import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom } from "../../src/room/room-lobby";
import type { RoomState } from "../../src/room/room-state";
import type { ServerRoomMessage } from "../../src/shared/room-protocol";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(protected ctx: unknown, protected env: unknown) {}
  }
}));
vi.mock("../../src/server/lib/crypto", () => ({
  derivePassword: vi.fn(async () => "verifier"),
  sha256: vi.fn(async (token: string) => `hash:${token}`),
  randomToken: vi.fn(() => "token")
}));
vi.mock("../../src/server/lib/directory", () => ({ syncRoomDirectory: vi.fn(async () => {}) }));

import { RoomObject } from "../../src/server/durable-objects/RoomObject";
import { derivePassword, sha256 } from "../../src/server/lib/crypto";
import { syncRoomDirectory } from "../../src/server/lib/directory";
import type { Env } from "../../src/server/env";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function fixture() {
  const initial = joinRoom(createRoom({
    roomId: "room", roomCode: "ABC123", roomName: "race", gameId: "pon-inai",
    hostPlayerId: "A", hostDisplayName: "Host", passwordHash: "verifier",
    minPlayers: 3, maxPlayers: 4, gameConfig: { gameCount: 1 }, now: Date.now()
  }), "B", "Guest B");
  const data = new Map<string, unknown>([
    ["room", initial],
    ["security", { passwordSalt: "salt", passwordVerifier: "verifier", hasPassword: false,
      sessionTokenHashes: { A: "hash:A", B: "hash:B" }, processedRequestIds: {} }]
  ]);
  const messages: ServerRoomMessage[] = [];
  const ws = {
    readyState: 1,
    deserializeAttachment: () => ({ playerId: "B" }),
    send: (raw: string) => messages.push(JSON.parse(raw))
  } as unknown as WebSocket;
  const sockets = [ws];
  const ctx = {
    storage: {
      get: async (key: string) => structuredClone(data.get(key)),
      put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
      delete: async (key: string) => data.delete(key),
      setAlarm: async () => {}, deleteAlarm: async () => {}
    },
    getWebSockets: () => sockets,
    acceptWebSocket: (socket: WebSocket) => { sockets.push(socket); },
    waitUntil: () => {}
  } as unknown as DurableObjectState;
  const object = new RoomObject(ctx, {} as Env);
  const join = (playerId = "C") => object.fetch(new Request("https://room/internal/join", {
    method: "POST", body: JSON.stringify({ playerId, displayName: `Guest ${playerId}`, sessionToken: playerId, password: "" })
  }));
  const ready = () => object.webSocketMessage(ws, JSON.stringify({ type: "SET_READY", ready: true, requestId: "ready-B" }));
  const reconnect = () => object.fetch(new Request("https://room/internal/ws?playerId=B", {
    headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "room-v1, auth.B" }
  }));
  return { object, data, messages, join, ready, reconnect, room: () => data.get("room") as RoomState };
}

describe("room updates across external awaits", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps an accepted ready update while another player is authenticating", async () => {
    const f = fixture();
    const entered = gate(), resume = gate();
    vi.mocked(derivePassword).mockImplementationOnce(async () => {
      entered.release(); await resume.promise; return "verifier";
    });
    const joining = f.join();
    await entered.promise;
    await f.ready();
    resume.release();
    expect((await joining).status).toBe(200);
    expect(f.room().players.find((p) => p.playerId === "B")?.isReady).toBe(true);
    expect(f.room().players.map((p) => p.playerId)).toEqual(["A", "B", "C"]);
    expect((f.data.get("security") as { processedRequestIds: Record<string, string[]> }).processedRequestIds.B).toContain("ready-B");
  });

  it("keeps both players and sessions when joins overlap during token hashing", async () => {
    const f = fixture();
    const entered = gate(), resume = gate();
    vi.mocked(sha256).mockImplementationOnce(async (token) => {
      entered.release(); await resume.promise; return `hash:${token}`;
    });
    const joining = f.join("C");
    await entered.promise;
    expect((await f.join("D")).status).toBe(200);
    resume.release();
    expect((await joining).status).toBe(200);
    expect(f.room().players.map((p) => p.playerId).sort()).toEqual(["A", "B", "C", "D"]);
    expect((f.data.get("security") as { sessionTokenHashes: unknown }).sessionTokenHashes).toEqual({ A: "hash:A", B: "hash:B", C: "hash:C", D: "hash:D" });
  });

  it("does not broadcast an old ready state after a slow directory write", async () => {
    const f = fixture();
    const entered = gate(), resume = gate();
    vi.mocked(syncRoomDirectory).mockImplementationOnce(async () => {
      entered.release(); await resume.promise;
    });
    const joining = f.join();
    await entered.promise;
    await f.ready();
    const acceptedAt = f.messages.length;
    resume.release();
    await joining;
    const laterStates = f.messages.slice(acceptedAt).filter((m) => m.type === "ROOM_STATE");
    expect(laterStates.length).toBeGreaterThan(0);
    for (const message of laterStates) {
      expect(message.room.players.find((p) => p.playerId === "B")?.isReady).toBe(true);
    }
  });

  it("preserves ready state during WebSocket authentication and sends it to the new socket", async () => {
    // Node's Response rejects status 101; emulate only the Workers upgrade API.
    const NativeResponse = Response;
    vi.stubGlobal("Response", class extends NativeResponse {
      constructor(body: BodyInit | null, init: ResponseInit) {
        super(body, init.status === 101 ? { ...init, status: 200 } : init);
      }
    });
    const received: ServerRoomMessage[] = [];
    vi.stubGlobal("WebSocketPair", class {
      0 = {};
      1 = {
        readyState: 1,
        serializeAttachment: () => {},
        deserializeAttachment: () => ({ playerId: "B" }),
        send: (raw: string) => received.push(JSON.parse(raw))
      };
    });
    const f = fixture();
    const entered = gate(), resume = gate();
    vi.mocked(sha256).mockImplementationOnce(async (token) => {
      entered.release(); await resume.promise; return `hash:${token}`;
    });
    const reconnecting = f.reconnect();
    await entered.promise;
    await f.ready();
    resume.release();
    await reconnecting;
    expect(f.room().players.find((p) => p.playerId === "B")?.isReady).toBe(true);
    const state = received.find((m) => m.type === "ROOM_STATE");
    expect(state?.room.players.find((p) => p.playerId === "B")?.isReady).toBe(true);
  });

  it("rejects a reconnect when the player leaves during authentication", async () => {
    const f = fixture();
    const entered = gate(), resume = gate();
    vi.mocked(sha256).mockImplementationOnce(async (token) => {
      entered.release(); await resume.promise; return `hash:${token}`;
    });
    const reconnecting = f.reconnect();
    await entered.promise;
    const ws = { deserializeAttachment: () => ({ playerId: "B" }), readyState: 1, send: () => {} } as unknown as WebSocket;
    await f.object.webSocketMessage(ws, JSON.stringify({ type: "LEAVE_ROOM", requestId: "leave-B" }));
    resume.release();
    expect((await reconnecting).status).toBe(401);
    expect(f.room().players.map((p) => p.playerId)).toEqual(["A"]);
  });
});
