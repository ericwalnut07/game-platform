import { describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom } from "../../../src/room/room-lobby";
import type { RoomState } from "../../../src/room/room-state";
import type { Env } from "../../../src/server/env";
import { createTerritory2State, currentTerritory2Turn, reduceTerritory2, territory2Preset, type Territory2State } from "../../../src/games/ooishi-territory-2/engine";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(protected ctx: unknown, protected env: unknown) {} }
}));
vi.mock("../../../src/server/lib/directory", () => ({ syncRoomDirectory: vi.fn(async () => {}) }));
vi.mock("../../../src/server/lib/crypto", () => ({
  derivePassword: vi.fn(async () => "verifier"),
  sha256: vi.fn(async (token: string) => "hash:" + token),
  randomToken: vi.fn(() => "token")
}));
import { RoomObject } from "../../../src/server/durable-objects/RoomObject";

function fixture(count: 2 | 3 | 4 = 2) {
  const config = territory2Preset(count, 2);
  const players = Array.from({ length: count }, (_, seat) => ({ id: "p" + seat, name: "Seat " + seat }));
  const state = createTerritory2State("territory2-room", players, config);
  let room = createRoom({ roomId: "room", roomCode: "STONE2", roomName: "Territory 2",
    gameId: "ooishi-territory-2", hostPlayerId: "p0", hostDisplayName: "Seat 0",
    passwordHash: "", minPlayers: count, maxPlayers: count, gameConfig: config, now: Date.now() });
  for (const player of players.slice(1)) room = joinRoom(room, player.id, player.name);
  const data = new Map<string, unknown>([
    ["room", { ...room, status: "PLAYING", gameState: state }],
    ["phaseVersion", 1],
    ["security", { passwordSalt: "salt", passwordVerifier: "verifier", hasPassword: false,
      sessionTokenHashes: Object.fromEntries(players.map(p => [p.id, "hash:" + p.id])),
      processedRequestIds: {} }]
  ]);
  const messages: { actor: string; type: string; requestId?: string; message?: string; gameView?: any }[] = [];
  const sockets = Object.fromEntries(players.map(player => [player.id, {
    readyState: 1, deserializeAttachment: () => ({ playerId: player.id }),
    send: (raw: string) => messages.push({ actor: player.id, ...JSON.parse(raw) })
  }])) as unknown as Record<string, WebSocket>;
  const pending: Promise<unknown>[] = [];
  const ctx = {
    storage: {
      get: async (key: string) => structuredClone(data.get(key)),
      put: async (key: string | Record<string, unknown>, value: unknown) => {
        await Promise.resolve();
        if (typeof key === "string") data.set(key, structuredClone(value));
        else for (const [name, entry] of Object.entries(key)) data.set(name, structuredClone(entry));
      },
      delete: async (key: string) => data.delete(key),
      setAlarm: async (time: number) => { data.set("alarmAt", time); },
      deleteAlarm: async () => { data.delete("alarmAt"); }
    },
    getWebSockets: (tag?: string) => tag ? [sockets[tag.split(":")[1]!]!] : Object.values(sockets),
    waitUntil: (promise: Promise<unknown>) => { pending.push(promise); }
  } as unknown as DurableObjectState;
  let object = new RoomObject(ctx, {} as Env);
  return {
    data, messages,
    room: () => data.get("room") as RoomState<Territory2State>,
    state: () => (data.get("room") as RoomState<Territory2State>).gameState!,
    restore: () => { object = new RoomObject(ctx, {} as Env); },
    drain: () => Promise.all(pending),
    fetch: (request: Request) => object.fetch(request),
    send: (actor: string, action: unknown, id = crypto.randomUUID(), version = data.get("phaseVersion")) =>
      object.webSocketMessage(sockets[actor]!, JSON.stringify({ type: "GAME_ACTION", requestId: id, phaseVersion: version, action })),
    raw: (actor: string, type: string, payload: Record<string, unknown> = {}) =>
      object.webSocketMessage(sockets[actor]!, JSON.stringify({ type, requestId: crypto.randomUUID(), ...payload })),
    disconnect: async (actor: string) => {
      Object.defineProperty(sockets[actor], "readyState", { value: 3, configurable: true });
      await object.webSocketClose(sockets[actor]!);
    },
    alarm: () => object.alarm()
  };
}

describe("Territory 2 through the current Durable Object", () => {
  it.each([2, 3, 4] as const)("creates a room with exactly %i selected seats", async count => {
    const f = fixture(count);
    f.data.delete("room");
    f.data.delete("security");
    const response = await f.fetch(new Request("https://room/internal/initialize", {
      method: "POST", body: JSON.stringify({
        roomId: "r", roomCode: "STONE2", roomName: "Test", gameId: "ooishi-territory-2",
        hostPlayerId: "p0", hostDisplayName: "Host", hostSessionToken: "test-session", password: "",
        gameConfig: territory2Preset(count, 2)
      })
    }));
    expect(response.status).toBe(201);
    expect(f.room()).toMatchObject({ minPlayers: count, maxPlayers: count, gameConfig: territory2Preset(count, 2) });
  });

  it("injects the authenticated identity and rejects a spoofed non-turn actor", async () => {
    const f = fixture();
    await f.send("p1", { type: "PLACE", playerId: "p0", kind: "small", index: 0 });
    expect(f.state().moves).toEqual([]);
    expect(f.messages.at(-1)).toMatchObject({ type: "ERROR" });
    await f.send("p0", { type: "PLACE", playerId: "p1", kind: "small", index: 0 });
    expect(f.state().moves).toEqual([{ seat: 0, kind: "small", index: 0 }]);
    await f.drain();
  });

  it("serializes simultaneous placement retries and preserves deduplication after hibernation", async () => {
    const f = fixture();
    const action = { type: "PLACE", kind: "small", index: 0 };
    await Promise.all([f.send("p0", action, "same-request", 1), f.send("p0", action, "same-request", 1)]);
    expect(f.state().moves).toHaveLength(1);
    expect(f.messages.filter(m => m.type === "ACTION_ACCEPTED")).toHaveLength(2);
    f.restore();
    await f.send("p0", action, "same-request", 1);
    expect(f.state().moves).toHaveLength(1);
    const guestViews = f.messages.filter(m => m.type === "GAME_VIEW" && m.actor === "p1");
    expect(guestViews.at(-1)?.gameView.legal.small).toHaveLength(63);
    expect(f.messages.filter(m => m.type === "GAME_VIEW" && m.actor === "p0").at(-1)?.gameView.legal.small).toEqual([]);
    await f.drain();
  });

  it("rejects a distinct stale placement racing with an accepted move", async () => {
    const f = fixture();
    await Promise.all([
      f.send("p0", { type: "PLACE", kind: "small", index: 0 }, "first", 1),
      f.send("p0", { type: "PLACE", kind: "small", index: 1 }, "second", 1)
    ]);
    expect(f.state().moves).toHaveLength(1);
    expect(f.messages.filter(m => m.type === "ERROR")).toHaveLength(1);
    expect(f.data.get("phaseVersion")).toBe(2);
    await f.drain();
  });

  it("rejects changing the selected player count and keeps config unchanged", async () => {
    const f = fixture();
    f.data.set("room", { ...f.room(), status: "OPEN", gameState: null });
    await f.raw("p0", "UPDATE_GAME_CONFIG", { gameConfig: territory2Preset(3, 2) });
    expect(f.room().gameConfig).toEqual(territory2Preset(2, 2));
    expect(f.messages.at(-1)).toMatchObject({ type: "ERROR", message: "人数を変更する場合は、新しい部屋を作成してください" });
  });

  it("keeps the board and current seat after disconnect, object recreation and alarm", async () => {
    const f = fixture();
    await f.send("p0", { type: "PLACE", kind: "small", index: 0 });
    const before = structuredClone(f.state());
    await f.disconnect("p1");
    f.restore();
    await f.alarm();
    expect(f.state()).toEqual(before);
    expect(f.room().players.find(p => p.playerId === "p1")?.connectionStatus).toBe("DISCONNECTED");
    expect(currentTerritory2Turn(f.state().config, f.state().moves.length).seat).toBe(1);
    await f.drain();
  });

  it("retains request history on rejected rematch and resets it only for an accepted new match", async () => {
    const f = fixture();
    await f.send("p0", { type: "PLACE", kind: "small", index: 0 }, "old-move");
    await f.raw("p0", "REMATCH");
    expect(f.state().matchId).toBe("territory2-room");
    expect((f.data.get("security") as any).processedRequestIds.p0).toContain("old-move");
    let state = f.state();
    while (state.phase === "PLAYING") {
      const turn = currentTerritory2Turn(state.config, state.moves.length);
      const index = Array.from({ length: 64 }, (_, i) => i).find(i => !state.moves.some(m => m.index === i))!;
      state = reduceTerritory2(state, { type: "PLACE", playerId: state.players[turn.seat]!.id, kind: "small", index });
    }
    f.data.set("room", { ...f.room(), status: "FINISHED", gameState: state });
    await f.raw("p1", "REMATCH");
    expect(f.state().matchId).toBe("territory2-room");
    await f.raw("p0", "REMATCH");
    expect(f.state().matchId).not.toBe("territory2-room");
    expect(f.state().moves).toEqual([]);
    expect(f.state().config).toEqual(territory2Preset(2, 2));
    expect((f.data.get("security") as any).processedRequestIds).toEqual({});
    await f.drain();
  });
});
