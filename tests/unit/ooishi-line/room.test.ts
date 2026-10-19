import { describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom } from "../../../src/room/room-lobby";
import type { RoomState } from "../../../src/room/room-state";
import type { Env } from "../../../src/server/env";
import { ooishiLineGameModule as module, type LineMatchState } from "../../../src/games/ooishi-line/module";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class { constructor(protected ctx: unknown, protected env: unknown) {} }
}));
vi.mock("../../../src/server/lib/directory", () => ({ syncRoomDirectory: vi.fn(async () => {}) }));
vi.mock("../../../src/server/lib/crypto", () => ({
  derivePassword: vi.fn(async () => "verifier"),
  sha256: vi.fn(async (token: string) => "hash:" + token),
  randomToken: vi.fn(() => "token")
}));
vi.mock("../../../src/server/lib/random", () => ({
  cryptoRandom: {
    next: () => 0.5,
    integer: (min: number) => min,
    shuffle: <T>(items: readonly T[]) => [...items].reverse()
  }
}));
import { RoomObject } from "../../../src/server/durable-objects/RoomObject";

function fixture() {
  const count = 2;
  const config = module.parseConfig({});
  const players = Array.from({ length: count }, (_, seat) => ({ id: "p" + seat, displayName: "Seat " + seat }));
  const state = module.createInitialState({ matchId: "line-room", gameIndex: 1, players, config, rng: { next: () => 0, integer: min => min, shuffle: items => [...items] } });
  let room = createRoom({ roomId: "room", roomCode: "STONE2", roomName: "Line",
    gameId: "ooishi-line", hostPlayerId: "p0", hostDisplayName: "Seat 0",
    passwordHash: "", minPlayers: count, maxPlayers: count, gameConfig: config, now: Date.now() });
  for (const player of players.slice(1)) room = joinRoom(room, player.id, player.displayName);
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
    room: () => data.get("room") as RoomState<LineMatchState>,
    state: () => {
      const line = (data.get("room") as RoomState<LineMatchState>).gameState!;
      if (line.core.history.length) return line;
      const key = `line-history:${line.matchId}`, count = data.get(key) as number;
      const history = JSON.parse(Array.from({ length: count }, (_, i) => data.get(`${key}:${i}`)).join("")) as string[];
      return { ...line, core: { ...line.core, history } };
    },
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


function lobby(f: ReturnType<typeof fixture>, config: unknown = {}) {
  f.data.set("room", { ...f.room(), status: "READY", gameState: undefined,
    gameConfig: module.parseConfig(config), players: f.room().players.map(player => ({ ...player, isReady: true })) });
}

describe("Line online Durable Object", () => {
  it.each([undefined, "p0", "p1", "removed"])("starts the chosen player with host fallback: %s", async startingPlayerId => {
    const f = fixture(); lobby(f, startingPlayerId ? { startingPlayerId } : {});
    await f.raw("p0", "START_MATCH");
    expect(f.room().status).toBe("PLAYING");
    expect(f.state().players[0]!.id).toBe(startingPlayerId === "p1" ? "p1" : "p0");
    expect(f.state().core.position.nextSeat).toBe(0); await f.drain();
  });

  it("uses server randomness again on rematch and preserves designated settings", async () => {
    const f = fixture(); lobby(f, { turnOrderMode: "random" });
    await f.raw("p0", "START_MATCH");
    expect(f.state().players.map(p => p.id)).toEqual(["p1", "p0"]);
    const oldId = f.state().matchId;
    f.data.set("room", { ...f.room(), status: "FINISHED", gameState: { ...f.state(), core: { ...f.state().core, phase: "FINISHED" } } });
    await f.raw("p0", "REMATCH");
    expect(f.state().matchId).not.toBe(oldId);
    expect(f.state().players.map(p => p.id)).toEqual(["p1", "p0"]);
    expect(f.state().core.history).toHaveLength(1);
    lobby(f, { startingPlayerId: "p1" }); await f.raw("p0", "START_MATCH");
    f.data.set("room", { ...f.room(), status: "FINISHED" });
    await f.raw("p0", "REMATCH");
    expect(f.state().players[0]!.id).toBe("p1"); await f.drain();
  });

  it("rejects guest config/start, invalid config, in-game config and NPC seats", async () => {
    const f = fixture(); lobby(f);
    await f.raw("p1", "UPDATE_GAME_CONFIG", { gameConfig: { startingPlayerId: "p1" } });
    await f.raw("p1", "START_MATCH");
    await f.raw("p0", "UPDATE_GAME_CONFIG", { gameConfig: { turnOrderMode: "forged" } });
    await f.raw("p0", "ADD_NPC", { npcType: "standard" });
    expect(f.room().gameConfig).toEqual({ turnOrderMode: "host-select" });
    expect(f.messages.filter(m => m.type === "ERROR")).toHaveLength(4);
    await f.raw("p0", "START_MATCH");
    await f.raw("p0", "UPDATE_GAME_CONFIG", { gameConfig: { turnOrderMode: "random" } });
    expect(f.room().gameConfig).toEqual({ turnOrderMode: "host-select" }); await f.drain();
  });

  it("binds actions to the socket, rejects illegal/out-of-turn/stale actions and unknown players", async () => {
    const f = fixture();
    await f.send("p1", { type: "PLACE", size: "large", to: 0, playerId: "p0", seat: 0 });
    await f.send("p0", { type: "PLACE", size: "small", to: 0 });
    expect(f.state().core.ply).toBe(0);
    await f.send("p0", { type: "PLACE", size: "large", to: 0, playerId: "p1" });
    expect(f.state().core.position.board[0]).toEqual([{ owner: 0, size: "large" }]);
    await f.send("p1", { type: "PLACE", size: "medium", to: 0 }, "stale", 1);
    expect(f.state().core.ply).toBe(1);
    expect(() => module.handleAction(f.state(), { type: "PLACE", size: "large", to: 1, playerId: "outsider" }, {} as never)).toThrow("参加者");
    await f.drain();
  });

  it("serializes concurrent actions, dedupes retries after object restore, and retains older request IDs", async () => {
    const f = fixture();
    await Promise.all([f.send("p0", { type: "PLACE", size: "large", to: 0 }, "same"), f.send("p0", { type: "PLACE", size: "large", to: 1 }, "same")]);
    expect(f.state().core.ply).toBe(1);
    f.restore();
    await f.send("p0", { type: "PLACE", size: "large", to: 2 }, "same");
    expect(f.state().core.ply).toBe(1);
    await f.send("p1", { type: "PLACE", size: "large", to: 15 });
    for (let index = 0; index < 45; index++) await f.raw("p0", "HEARTBEAT");
    await f.send("p0", { type: "PLACE", size: "large", to: 1 }, "same");
    expect(f.state().core.ply).toBe(2);
    expect(f.messages.filter(m => m.type === "ACTION_ACCEPTED" && m.requestId === "same")).toHaveLength(4);
    await f.drain();
  });

  it("persists repetition across restores, finishes once and rejects further actions", async () => {
    const f = fixture();
    await f.send("p0", { type: "PLACE", size: "large", to: 0 });
    await f.send("p1", { type: "PLACE", size: "large", to: 15 });
    for (let round = 0; round < 2; round++) {
      for (const [actor, from, to] of [["p0", 0, 1], ["p1", 15, 14], ["p0", 1, 0], ["p1", 14, 15]] as const) {
        f.restore(); await f.send(actor, { type: "MOVE", from, layer: 0, to });
      }
    }
    expect(f.room().status).toBe("FINISHED");
    expect(f.state().core.result).toEqual({ kind: "DRAW", reason: "THREEFOLD_REPETITION" });
    const state = f.state(); await f.send("p0", { type: "PLACE", size: "large", to: 2 });
    expect(f.state()).toEqual(state); await f.drain();
  });

  it("chunks long repetition histories and restores them without sending them to clients", async () => {
    const f = fixture();
    const state = f.state();
    const history = [...Array.from({ length: 1200 }, (_, i) => "x".repeat(160) + i), ...state.core.history];
    f.data.set("room", { ...f.room(), gameState: { ...state, core: { ...state.core, history } } });
    await f.send("p0", { type: "PLACE", size: "large", to: 0 }); f.restore();
    expect(f.state().core.history.slice(0, -1)).toEqual(history);
    expect(JSON.stringify(f.data.get("room")).length).toBeLessThan(8192);
    expect(f.data.get("line-history:line-room")).toBeGreaterThan(1);
    await f.send("p1", { type: "PLACE", size: "large", to: 15 });
    expect(f.state().core.history).toHaveLength(history.length + 2);
    expect(f.messages.filter(m => m.type === "GAME_VIEW").every(m => !("history" in m.gameView.state))).toBe(true);
    await f.drain();
  });

  it("keeps human seats and Core intact on disconnect", async () => {
    const f = fixture(); await f.send("p0", { type: "PLACE", size: "large", to: 0 });
    const core = f.state().core; await f.disconnect("p1"); f.restore();
    expect(f.state().core).toEqual(core);
    expect(f.room().players).toHaveLength(2);
    expect(f.room().players[1]).toMatchObject({ playerId: "p1", connectionStatus: "DISCONNECTED" });
    expect(f.room().players.some(p => p.npcType)).toBe(false); await f.drain();
  });
});
