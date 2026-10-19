import { describe, expect, it, vi } from "vitest";
import { createRoom, joinRoom } from "../../../src/room/room-lobby";
import type { RoomState } from "../../../src/room/room-state";
import type { Env } from "../../../src/server/env";
import { ooishiCaravanGameModule as module, type CaravanMatchState } from "../../../src/games/ooishi-caravan/module";

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
import { legalCaravanMoves, type CaravanStone } from "../../../src/games/ooishi-caravan/engine";
import { RoomObject } from "../../../src/server/durable-objects/RoomObject";

function fixture() {
  const count = 2;
  const config = module.parseConfig({});
  const players = Array.from({ length: count }, (_, seat) => ({ id: "p" + seat, displayName: "Seat " + seat }));
  const state = module.createInitialState({ matchId: "caravan-room", gameIndex: 1, players, config, rng: { next: () => 0, integer: min => min, shuffle: items => [...items] } });
  let room = createRoom({ roomId: "room", roomCode: "STONE2", roomName: "Caravan",
    gameId: "ooishi-caravan", hostPlayerId: "p0", hostDisplayName: "Seat 0",
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
    room: () => data.get("room") as RoomState<CaravanMatchState>,
    state: () => (data.get("room") as RoomState<CaravanMatchState>).gameState!,
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

describe("Caravan online Durable Object", () => {
  it.each([undefined, "p0", "p1", "removed"])("starts the chosen human, with host fallback: %s", async startingPlayerId => {
    const f = fixture(); lobby(f, startingPlayerId ? { startingPlayerId } : {});
    await f.raw("p0", "START_MATCH");
    expect(f.room().status).toBe("PLAYING");
    expect(f.state().players[0]!.id).toBe(startingPlayerId === "p1" ? "p1" : "p0");
    expect(f.state().core.currentSeat).toBe(0); expect(f.state().core.board[0]![0]!.owner).toBe(0); await f.drain();
  });
  it("shuffles on the server again for rematch and preserves designated settings", async () => {
    const f = fixture(); lobby(f, { turnOrderMode: "random" }); await f.raw("p0", "START_MATCH");
    expect(f.state().players.map(p => p.id)).toEqual(["p1", "p0"]); const oldId = f.state().matchId;
    f.data.set("room", { ...f.room(), status: "FINISHED" }); await f.raw("p0", "REMATCH");
    expect(f.state().matchId).not.toBe(oldId); expect(f.state().players.map(p => p.id)).toEqual(["p1", "p0"]);
    lobby(f, { startingPlayerId: "p1" }); await f.raw("p0", "START_MATCH");
    f.data.set("room", { ...f.room(), status: "FINISHED" }); await f.raw("p0", "REMATCH");
    expect(f.state().players[0]!.id).toBe("p1"); expect(f.state().revision).toBe(0); await f.drain();
  });
  it("rejects guest settings/start, invalid config, in-game changes and NPC seats", async () => {
    const f = fixture(); lobby(f);
    await f.raw("p1", "UPDATE_GAME_CONFIG", { gameConfig: { startingPlayerId: "p1" } }); await f.raw("p1", "START_MATCH");
    await f.raw("p0", "UPDATE_GAME_CONFIG", { gameConfig: { turnOrderMode: "forged" } });
    await f.raw("p0", "ADD_NPC", { npcType: "standard" });
    expect(f.messages.filter(m => m.type === "ERROR")).toHaveLength(4);
    await f.raw("p0", "START_MATCH"); await f.raw("p0", "UPDATE_GAME_CONFIG", { gameConfig: { turnOrderMode: "random" } });
    expect(f.room().gameConfig).toEqual({ turnOrderMode: "host-select" }); await f.drain();
  });
  it("uses socket identity and rejects illegal, out-of-turn and stale actions", async () => {
    const f = fixture();
    await f.send("p1", { type: "ROLL", playerId: "p0", seat: 0 });
    await f.send("p0", { type: "MOVE", from: 1, layer: 0, die: 0 }); expect(f.state().revision).toBe(0);
    await f.send("p0", { type: "ROLL", playerId: "p1", dice: [6, 6] });
    expect(f.state().core.dice?.map(d => d.value)).toEqual([1, 1]); expect(f.state().revision).toBe(1);
    await f.send("p0", legalCaravanMoves(f.state().core)[0]!, "stale", 1); expect(f.state().revision).toBe(1);
    await f.send("p0", { type: "ROLL" }); expect(f.state().revision).toBe(1); await f.drain();
  });
  it("serializes and dedupes ROLL and MOVE across restores, retaining older IDs", async () => {
    const f = fixture();
    await Promise.all([f.send("p0", { type: "ROLL" }, "roll"), f.send("p0", { type: "ROLL" }, "roll")]);
    expect(f.state().revision).toBe(1); const dice = f.state().core.dice;
    f.restore(); await f.send("p0", { type: "ROLL" }, "roll"); expect(f.state().core.dice).toEqual(dice);
    const move = legalCaravanMoves(f.state().core)[0]!, version = f.data.get("phaseVersion");
    await Promise.all([f.send("p0", move, "move-a", version), f.send("p0", move, "move-b", version)]);
    expect(f.state().revision).toBe(2); expect(f.state().core.moveCount).toBe(1);
    for (let i = 0; i < 45; i++) await f.raw("p0", "HEARTBEAT");
    f.restore(); await f.send("p0", move, "move-a", 1); await f.send("p0", { type: "ROLL" }, "roll", 1);
    expect(f.state().revision).toBe(2); expect(f.messages.filter(m => m.type === "ACTION_ACCEPTED" && m.requestId === "roll")).toHaveLength(4); await f.drain();
  });
  it.each([false, true])("finishes mixed goal (draw=%s), persists and rejects further actions", async draw => {
    const f = fixture(), state = f.state();
    const inventory = (owner: 0 | 1): CaravanStone[] => ["large", "large", "medium", "medium", "medium", "small", "small", "small"].map(size => ({ owner, size: size as CaravanStone["size"] }));
    const own = inventory(0), enemy = inventory(1); own.splice(2, 1); enemy.pop(); if (!draw) enemy.pop();
    const board: CaravanStone[][] = Array.from({ length: 20 }, () => []); board[19] = [{ owner: 0, size: "medium" }, { owner: 1, size: "small" }];
    f.data.set("room", { ...f.room(), gameState: { ...state, core: { ...state.core, board, goaled: [own, enemy] } } });
    await f.send("p0", { type: "ROLL" }); await f.send("p0", { type: "MOVE", from: 20, layer: 0, die: 0 }); f.restore();
    expect(f.room().status).toBe("FINISHED"); expect(f.state().core.result).toEqual(draw ? { kind: "DRAW", reason: "SIMULTANEOUS_GOALS" } : { kind: "WIN", winner: 0 });
    const finished = f.state(); await f.send("p0", { type: "ROLL" }); expect(f.state()).toEqual(finished); await f.drain();
  });
  it("retains rolled dice, both human seats and board across object restore and disconnect", async () => {
    const f = fixture(); await f.send("p0", { type: "ROLL" }); const core = f.state().core;
    await f.disconnect("p1"); f.restore();
    expect(f.state().core).toEqual(core); expect(f.room().players).toHaveLength(2);
    expect(f.room().players[1]).toMatchObject({ playerId: "p1", connectionStatus: "DISCONNECTED" });
    expect(f.room().players.some(p => p.npcType)).toBe(false); await f.drain();
  });
});
