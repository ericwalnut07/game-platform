import { DurableObject } from "cloudflare:workers";
import type { GameStateInfo } from "../../games/core/GameModule";
import { gameRegistry } from "../../games/registry";
import { createRoom, disconnectRoomPlayer, joinRoom, leaveRoom, markRoomFinished, markRoomPlaying, publicRoomState, reconnectRoomPlayer, restartRoomMatch, setPlayerReady, transferDisconnectedHostAfterGrace, updateRoomGameConfig } from "../../room/room-lobby";
import type { RoomState } from "../../room/room-state";
import type { ClientRoomMessage, ServerRoomMessage } from "../../shared/room-protocol";
import type { Env } from "../env";
import { derivePassword, randomToken, sha256 } from "../lib/crypto";
import { syncRoomDirectory } from "../lib/directory";
import { persistAbandonedMatch, persistMatchStartForGame, persistPlaytestFeedback, persistStateTransitionForGame, recordPlaytestEvent } from "../lib/playtest-log";
import { isRoomExpired, roomExpiryDueAt } from "../lib/room-lifecycle";
import { recordOperationalError } from "../lib/operations";
import { cryptoRandom } from "../lib/random";

interface SecurityState {
  passwordSalt: string;
  passwordVerifier: string;
  sessionTokenHashes: Record<string, string>;
  processedRequestIds: Record<string, readonly string[]>;
  hasPassword: boolean;
}

interface PhaseReadyState {
  key: string;
  playerIds: readonly string[];
}

interface InitializePayload {
  roomId: string;
  roomCode: string;
  roomName: string;
  gameId: string;
  hostPlayerId: string;
  hostDisplayName: string;
  hostSessionToken: string;
  password: string;
  gameConfig: unknown;
}


interface ScheduledCoreAction {
  version: number;
  dueAt: number;
  action: unknown;
}

interface ScheduledHostTransfer {
  playerId: string;
  dueAt: number;
}

interface ScheduledHostLease {
  playerId: string;
  dueAt: number;
}

interface ScheduledRoomExpiry {
  dueAt: number;
}

interface JoinPayload {
  playerId: string;
  displayName: string;
  sessionToken: string;
  password: string;
}

const ROOM_KEY = "room";
const SECURITY_KEY = "security";
const PHASE_VERSION_KEY = "phaseVersion";
const PHASE_READY_KEY = "phaseReady";
const SCHEDULED_ACTION_KEY = "scheduledAction";
const HOST_TRANSFER_KEY = "scheduledHostTransfer";
const HOST_LEASE_KEY = "scheduledHostLease";
const ROOM_EXPIRY_KEY = "scheduledRoomExpiry";
const HOST_DISCONNECT_GRACE_MS = 10_000;
const HOST_HEARTBEAT_TIMEOUT_MS = 10_000;

function json(message: unknown, status = 200): Response {
  return Response.json(message, { status });
}

function stateInfo(gameId: string, state: unknown): GameStateInfo {
  const module = gameRegistry.get(gameId);
  if (!module.getStateInfo) throw new Error(`Game module does not expose state info: ${gameId}`);
  return module.getStateInfo(state);
}

function eventGameFields(info: GameStateInfo): { gameId?: string; gameIndex?: number } {
  if (!info.currentGameId) return {};
  return info.currentGameIndex === undefined
    ? { gameId: info.currentGameId }
    : { gameId: info.currentGameId, gameIndex: info.currentGameIndex };
}


function validatePlaytestFeedback(value: unknown, validPlayerIds: readonly string[]) {
  if (!value || typeof value !== "object") throw new Error("アンケート形式が不正です");
  const input = value as Record<string, unknown>;
  const suspectedSelf = input.suspectedSelf;
  const selfSuspicionRound = input.selfSuspicionRound;
  const trialSuspectPlayerIds = input.trialSuspectPlayerIds;
  const singleObviousSuspect = input.singleObviousSuspect;
  const summaryUsefulness = input.summaryUsefulness;
  const funRating = input.funRating;
  const rulesClarity = input.rulesClarity;
  const comment = input.comment;
  if (typeof suspectedSelf !== "boolean" || typeof singleObviousSuspect !== "boolean") throw new Error("アンケート形式が不正です");
  if (!(selfSuspicionRound === null || [1, 2, 3, 4].includes(selfSuspicionRound as number))) throw new Error("疑い始めたラウンドが不正です");
  if (!Array.isArray(trialSuspectPlayerIds) || trialSuspectPlayerIds.length > 2 || trialSuspectPlayerIds.some((id) => typeof id !== "string" || !validPlayerIds.includes(id))) throw new Error("ポン候補が不正です");
  if (![1, 2, 3, 4, 5].includes(summaryUsefulness as number) || ![1, 2, 3, 4, 5].includes(funRating as number) || ![1, 2, 3, 4, 5].includes(rulesClarity as number)) throw new Error("評価値が不正です");
  if (typeof comment !== "string" || comment.length > 800) throw new Error("自由記述は800文字以内で入力してください");
  if (!suspectedSelf && selfSuspicionRound !== null) throw new Error("自己疑念なしの場合、ラウンド指定はできません");
  return {
    suspectedSelf,
    selfSuspicionRound: selfSuspicionRound as 1 | 2 | 3 | 4 | null,
    trialSuspectPlayerIds: [...new Set(trialSuspectPlayerIds as string[])],
    singleObviousSuspect,
    summaryUsefulness: summaryUsefulness as 1 | 2 | 3 | 4 | 5,
    funRating: funRating as 1 | 2 | 3 | 4 | 5,
    rulesClarity: rulesClarity as 1 | 2 | 3 | 4 | 5,
    comment: comment.trim()
  };
}


function parseClientRoomMessage(value: unknown): ClientRoomMessage {
  if (!value || typeof value !== "object") throw new Error("メッセージ形式が不正です");
  const input = value as Record<string, unknown>;
  const type = input.type;
  const requestId = input.requestId;
  if (typeof type !== "string") throw new Error("メッセージ種別が不正です");
  if (typeof requestId !== "string" || requestId.length < 1 || requestId.length > 100) throw new Error("requestIdが不正です");

  switch (type) {
    case "SET_READY":
      if (typeof input.ready !== "boolean") throw new Error("準備状態が不正です");
      return { type, ready: input.ready, requestId };
    case "UPDATE_GAME_CONFIG":
      if ("gameConfig" in input) return { type, gameConfig: input.gameConfig, requestId };
      // v0.9.0 clients sent gameCount at the room-message top level.
      if (Number.isInteger(input.gameCount) && (input.gameCount as number) >= 1 && (input.gameCount as number) <= 5) {
        return { type, gameConfig: { gameCount: input.gameCount as 1 | 2 | 3 | 4 | 5 }, requestId };
      }
      throw new Error("ゲーム設定が不正です");
    case "START_MATCH":
    case "REMATCH":
    case "HEARTBEAT":
    case "NEXT_GAME_READY":
    case "LEAVE_ROOM":
      return { type, requestId };
    case "GAME_ACTION":
      if (!Number.isInteger(input.phaseVersion) || (input.phaseVersion as number) < 0 || !("action" in input)) throw new Error("ゲーム操作が不正です");
      return { type, action: input.action, requestId, phaseVersion: input.phaseVersion as number };
    case "GAME_PHASE_READY":
      if (!Number.isInteger(input.phaseVersion) || (input.phaseVersion as number) < 0) throw new Error("phaseVersionが不正です");
      return { type, requestId, phaseVersion: input.phaseVersion as number };
    case "SUBMIT_PLAYTEST_FEEDBACK":
      if (!("feedback" in input)) throw new Error("アンケート形式が不正です");
      return { type, feedback: input.feedback as never, requestId };
    default:
      throw new Error("許可されていないメッセージです");
  }
}
export class RoomObject extends DurableObject<Env> {
  private async loadRoom(): Promise<RoomState<unknown> | null> {
    return (await this.ctx.storage.get<RoomState<unknown>>(ROOM_KEY)) ?? null;
  }

  private async saveRoom(room: RoomState<unknown>): Promise<void> {
    await this.ctx.storage.put(ROOM_KEY, room);
    const security = await this.loadSecurity();
    const activeIds = new Set(room.players.map((player) => player.playerId));
    const sessionTokenHashes = Object.fromEntries(Object.entries(security.sessionTokenHashes).filter(([playerId]) => activeIds.has(playerId)));
    const processedRequestIds = Object.fromEntries(Object.entries(security.processedRequestIds).filter(([playerId]) => activeIds.has(playerId)));
    if (Object.keys(sessionTokenHashes).length !== Object.keys(security.sessionTokenHashes).length
      || Object.keys(processedRequestIds).length !== Object.keys(security.processedRequestIds).length) {
      await this.ctx.storage.put(SECURITY_KEY, { ...security, sessionTokenHashes, processedRequestIds } satisfies SecurityState);
    }
    await syncRoomDirectory(this.env.DB, publicRoomState(room), security.hasPassword, room.createdAt);
    await this.ctx.storage.put(ROOM_EXPIRY_KEY, { dueAt: roomExpiryDueAt(room) } satisfies ScheduledRoomExpiry);
    await this.rescheduleAlarm();
  }

  private async rescheduleAlarm(): Promise<void> {
    const [hostTransfer, hostLease, coreAction, roomExpiry] = await Promise.all([
      this.ctx.storage.get<ScheduledHostTransfer>(HOST_TRANSFER_KEY),
      this.ctx.storage.get<ScheduledHostLease>(HOST_LEASE_KEY),
      this.ctx.storage.get<ScheduledCoreAction>(SCHEDULED_ACTION_KEY),
      this.ctx.storage.get<ScheduledRoomExpiry>(ROOM_EXPIRY_KEY)
    ]);
    const dueTimes = [hostTransfer?.dueAt, hostLease?.dueAt, coreAction?.dueAt, roomExpiry?.dueAt]
      .filter((value): value is number => typeof value === "number");
    if (dueTimes.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...dueTimes));
  }

  private async loadSecurity(): Promise<SecurityState> {
    const security = await this.ctx.storage.get<SecurityState>(SECURITY_KEY);
    if (!security) throw new Error("Room security state is missing");
    return security;
  }

  private async phaseVersion(): Promise<number> {
    return (await this.ctx.storage.get<number>(PHASE_VERSION_KEY)) ?? 0;
  }

  private async bumpPhaseVersion(): Promise<number> {
    const version = (await this.phaseVersion()) + 1;
    await this.ctx.storage.put(PHASE_VERSION_KEY, version);
    await this.ctx.storage.delete(PHASE_READY_KEY);
    await this.ctx.storage.delete(SCHEDULED_ACTION_KEY);
    await this.rescheduleAlarm();
    return version;
  }

  private async isSessionValid(playerId: string, token: string): Promise<boolean> {
    const security = await this.loadSecurity();
    const expected = security.sessionTokenHashes[playerId];
    return Boolean(expected) && expected === await sha256(token);
  }

  private async issueSession(security: SecurityState, playerId: string, rawToken: string): Promise<SecurityState> {
    return {
      ...security,
      sessionTokenHashes: { ...security.sessionTokenHashes, [playerId]: await sha256(rawToken) }
    };
  }

  private async rememberRequest(playerId: string, requestId: string): Promise<boolean> {
    const security = await this.loadSecurity();
    const previous = security.processedRequestIds[playerId] ?? [];
    if (previous.includes(requestId)) return false;
    const updated = [...previous, requestId].slice(-40);
    await this.ctx.storage.put(SECURITY_KEY, {
      ...security,
      processedRequestIds: { ...security.processedRequestIds, [playerId]: updated }
    } satisfies SecurityState);
    return true;
  }

  private send(ws: WebSocket, message: ServerRoomMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  private async broadcastViews(room: RoomState<unknown>): Promise<void> {
    const phaseVersion = await this.phaseVersion();
    const publicState = publicRoomState(room);
    const module = gameRegistry.get(room.gameId);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
      this.send(ws, { type: "ROOM_STATE", room: publicState });
      if ((room.status === "PLAYING" || room.status === "FINISHED") && room.gameState && attachment?.playerId) {
        try {
          const gameView = module.buildPlayerView(room.gameState, attachment.playerId);
          this.send(ws, { type: "GAME_VIEW", gameView, phaseVersion });
        } catch {
          // Unknown/revoked session sockets receive no game view.
        }
      }
    }
  }

  private async scheduleHostTransfer(playerId: string, dueAt: number): Promise<void> {
    await this.ctx.storage.put(HOST_TRANSFER_KEY, { playerId, dueAt } satisfies ScheduledHostTransfer);
    await this.rescheduleAlarm();
  }

  private async scheduleHostLease(playerId: string, dueAt = Date.now() + HOST_HEARTBEAT_TIMEOUT_MS): Promise<void> {
    await this.ctx.storage.put(HOST_LEASE_KEY, { playerId, dueAt } satisfies ScheduledHostLease);
    await this.rescheduleAlarm();
  }

  private async cancelHostTransferIfRestored(room: RoomState<unknown>, playerId: string): Promise<void> {
    if (room.status !== "OPEN" && room.status !== "READY") return;
    const scheduled = await this.ctx.storage.get<ScheduledHostTransfer>(HOST_TRANSFER_KEY);
    if (!scheduled || scheduled.playerId !== playerId) return;
    await this.ctx.storage.delete(HOST_TRANSFER_KEY);
    await this.rescheduleAlarm();
  }

  private async applyModuleAction(room: RoomState<unknown>, action: unknown): Promise<RoomState<unknown>> {
    if (!room.gameState) throw new Error("ゲームが開始されていません");
    const module = gameRegistry.get(room.gameId);
    const beforeState = room.gameState;
    const before = stateInfo(room.gameId, beforeState);
    const gameState = module.handleAction(beforeState, action, { rng: cryptoRandom });
    const after = stateInfo(room.gameId, gameState);
    let next: RoomState<unknown> = { ...room, gameState, lastActivityAt: Date.now() };
    if (module.isFinished(gameState)) next = markRoomFinished(next, gameState, Date.now());

    if (before.phase !== after.phase) {
      await this.bumpPhaseVersion();
      this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
        matchId: after.matchId,
        roomCode: room.roomCode,
        eventType: "PHASE_CHANGED",
        ...eventGameFields(after.currentGameId ? after : before),
        phase: after.phase,
        payload: { from: before.phase, to: after.phase }
      }));
    }

    if (before.currentGameId !== after.currentGameId && after.currentGameId) {
      this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
        matchId: after.matchId,
        roomCode: room.roomCode,
        eventType: "GAME_STARTED",
        ...eventGameFields(after),
        phase: after.phase
      }));
    }

    this.ctx.waitUntil(persistStateTransitionForGame(this.env.DB, room.gameId, beforeState, gameState, Date.now()));
    await this.saveRoom(next);
    await this.broadcastViews(next);
    await this.scheduleAutomaticProgress(next, await this.phaseVersion());
    return next;
  }

  private async scheduleAutomaticProgress(room: RoomState<unknown>, version: number): Promise<void> {
    if (room.status !== "PLAYING" || !room.gameState) return;
    const module = gameRegistry.get(room.gameId);
    const progress = module.getAutomaticProgress?.(room.gameState);
    if (!progress) return;
    await this.scheduleModuleAdvance(version, progress.delayMs, progress.action);
  }

  private async scheduleModuleAdvance(version: number, delayMs: number, action: unknown): Promise<void> {
    const scheduled: ScheduledCoreAction = { version, dueAt: Date.now() + delayMs, action };
    await this.ctx.storage.put(SCHEDULED_ACTION_KEY, scheduled);
    await this.rescheduleAlarm();
  }

  private async registerPhaseReady(room: RoomState<unknown>, playerId: string, clientVersion: number): Promise<void> {
    const version = await this.phaseVersion();
    if (clientVersion !== version) throw new Error("画面が更新されています。最新状態で操作してください");
    if (!room.gameState) throw new Error("ゲームが開始されていません");
    const module = gameRegistry.get(room.gameId);
    const info = stateInfo(room.gameId, room.gameState);
    const key = `${info.currentGameIndex ?? 0}:${info.phase}:${version}`;
    const current = await this.ctx.storage.get<PhaseReadyState>(PHASE_READY_KEY);
    const ready = current?.key === key ? [...current.playerIds] : [];
    if (!ready.includes(playerId)) ready.push(playerId);
    await this.ctx.storage.put(PHASE_READY_KEY, { key, playerIds: ready } satisfies PhaseReadyState);
    if (ready.length < room.players.length) return;
    await this.ctx.storage.delete(PHASE_READY_KEY);
    const action = module.getPhaseReadyAction?.(room.gameState) ?? null;
    if (!action) throw new Error("この画面では準備完了操作を使用しません");
    await this.applyModuleAction(room, action);
  }

  private async startNewMatch(room: RoomState<unknown>, playerId: string, rematch: boolean): Promise<RoomState<unknown>> {
    if (playerId !== room.hostPlayerId) throw new Error("ホストのみゲームを開始できます");
    const module = gameRegistry.get(room.gameId);
    const players = room.players.map((player) => ({ id: player.playerId, displayName: player.displayName }));
    const gameState = module.createInitialState({
      matchId: crypto.randomUUID(),
      gameIndex: 1,
      players,
      config: room.gameConfig,
      rng: cryptoRandom
    });
    const startedAt = Date.now();
    const next = rematch
      ? restartRoomMatch(room, playerId, gameState, startedAt)
      : markRoomPlaying(room, playerId, gameState, startedAt);

    await this.ctx.storage.delete(HOST_LEASE_KEY);
    await this.ctx.storage.delete(HOST_TRANSFER_KEY);
    await this.bumpPhaseVersion();
    const info = stateInfo(room.gameId, gameState);
    this.ctx.waitUntil(persistMatchStartForGame(this.env.DB, room.roomCode, room.gameId, gameState, startedAt));
    this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
      matchId: info.matchId,
      roomCode: room.roomCode,
      eventType: rematch ? "MATCH_REMATCH_STARTED" : "MATCH_STARTED",
      ...eventGameFields(info),
      phase: info.phase,
      playerId
    }));
    await this.saveRoom(next);
    await this.broadcastViews(next);
    await this.scheduleAutomaticProgress(next, await this.phaseVersion());
    return next;
  }

  private async handleInitialize(request: Request): Promise<Response> {
    if (await this.loadRoom()) return json({ error: "ROOM_EXISTS" }, 409);
    const payload = await request.json() as InitializePayload;
    let module;
    let gameConfig: unknown;
    try {
      module = gameRegistry.get(payload.gameId);
      gameConfig = module.parseConfig(payload.gameConfig);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "GAME_CONFIG_INVALID" }, 400);
    }
    const passwordSalt = randomToken(16);
    const passwordVerifier = await derivePassword(payload.password, passwordSalt);
    let security: SecurityState = {
      passwordSalt,
      passwordVerifier,
      sessionTokenHashes: {},
      processedRequestIds: {},
      hasPassword: payload.password.length > 0
    };
    security = await this.issueSession(security, payload.hostPlayerId, payload.hostSessionToken);
    await this.ctx.storage.put(SECURITY_KEY, security);
    await this.ctx.storage.put(PHASE_VERSION_KEY, 0);
    const room = createRoom({
      roomId: payload.roomId,
      roomCode: payload.roomCode,
      roomName: payload.roomName,
      gameId: payload.gameId,
      hostPlayerId: payload.hostPlayerId,
      hostDisplayName: payload.hostDisplayName,
      passwordHash: passwordVerifier,
      minPlayers: module.minPlayers,
      maxPlayers: module.maxPlayers,
      gameConfig,
      now: Date.now()
    }) as RoomState<unknown>;
    await this.saveRoom(room);
    return json({ room: publicRoomState(room) }, 201);
  }

  private async handleJoin(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return json({ error: "ROOM_NOT_FOUND" }, 404);
    const payload = await request.json() as JoinPayload;
    const security = await this.loadSecurity();
    const verifier = await derivePassword(payload.password, security.passwordSalt);
    if (verifier !== security.passwordVerifier) return json({ error: "PASSWORD_INVALID" }, 403);
    let next: RoomState<unknown>;
    try { next = joinRoom(room, payload.playerId, payload.displayName); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "JOIN_FAILED" }, 409); }
    await this.ctx.storage.put(SECURITY_KEY, await this.issueSession(security, payload.playerId, payload.sessionToken));
    await this.saveRoom(next);
    await this.broadcastViews(next);
    return json({ room: publicRoomState(next) });
  }

  private async handleState(): Promise<Response> {
    const room = await this.loadRoom();
    return room ? json(publicRoomState(room)) : json({ error: "ROOM_NOT_FOUND" }, 404);
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const room = await this.loadRoom();
    if (!room) return new Response("Room not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const requestedProtocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const authProtocol = requestedProtocols.find((value) => value.startsWith("auth."));
    const token = authProtocol?.slice("auth.".length) ?? "";
    if (!requestedProtocols.includes("room-v1") || !room.players.some((player) => player.playerId === playerId) || !(await this.isSessionValid(playerId, token))) {
      return new Response("Unauthorized", { status: 401 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.serializeAttachment({ playerId });
    this.ctx.acceptWebSocket(server, [`player:${playerId}`]);
    const next = reconnectRoomPlayer(room, playerId);
    await this.cancelHostTransferIfRestored(next, playerId);
    await this.saveRoom(next);
    if ((next.status === "OPEN" || next.status === "READY") && playerId === next.hostPlayerId) {
      await this.scheduleHostLease(playerId);
    }
    this.send(server, { type: "ROOM_STATE", room: publicRoomState(next) });
    if ((next.status === "PLAYING" || next.status === "FINISHED") && next.gameState) {
      this.send(server, { type: "GAME_VIEW", gameView: gameRegistry.get(next.gameId).buildPlayerView(next.gameState, playerId), phaseVersion: await this.phaseVersion() });
    }
    await this.broadcastViews(next);
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": "room-v1" } });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/internal/initialize" && request.method === "POST") return this.handleInitialize(request);
    if (path === "/internal/join" && request.method === "POST") return this.handleJoin(request);
    if (path === "/internal/state" && request.method === "GET") return this.handleState();
    if (path === "/internal/ws" && request.method === "GET") return this.handleWebSocket(request);
    return new Response("Not found", { status: 404 });
  }

  private async expireRoom(room: RoomState<unknown>): Promise<void> {
    if (room.gameState) {
      const info = stateInfo(room.gameId, room.gameState);
      if (!info.matchFinished) {
        this.ctx.waitUntil(persistAbandonedMatch(this.env.DB, info.matchId, Date.now(), "ROOM_EXPIRED"));
      }
      this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
        matchId: info.matchId,
        roomCode: room.roomCode,
        eventType: "ROOM_EXPIRED",
        ...eventGameFields(info),
        phase: info.phase,
        payload: { status: room.status, lastActivityAt: room.lastActivityAt }
      }));
    }
    await syncRoomDirectory(this.env.DB, publicRoomState({ ...room, status: "CLOSED" }), false, room.createdAt);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(1001, "Room expired"); } catch { /* already closed */ }
    }
    await this.ctx.storage.deleteAll();
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    let room = await this.loadRoom();
    if (!room) return;

    const expiry = await this.ctx.storage.get<ScheduledRoomExpiry>(ROOM_EXPIRY_KEY);
    if ((expiry && now >= expiry.dueAt) || isRoomExpired(room, now)) {
      await this.expireRoom(room);
      return;
    }

    const hostTransfer = await this.ctx.storage.get<ScheduledHostTransfer>(HOST_TRANSFER_KEY);
    if (hostTransfer && now >= hostTransfer.dueAt) {
      await this.ctx.storage.delete(HOST_TRANSFER_KEY);
      if (room.status === "OPEN" || room.status === "READY") {
        const next = transferDisconnectedHostAfterGrace(room, now, HOST_DISCONNECT_GRACE_MS);
        if (next.hostPlayerId !== room.hostPlayerId || next.players.length !== room.players.length) {
          room = next;
          await this.saveRoom(next);
          await this.broadcastViews(next);
          if (next.status === "OPEN" || next.status === "READY") {
            await this.scheduleHostLease(next.hostPlayerId, now + HOST_HEARTBEAT_TIMEOUT_MS);
          }
        }
      }
    }

    const hostLease = await this.ctx.storage.get<ScheduledHostLease>(HOST_LEASE_KEY);
    if (hostLease && now >= hostLease.dueAt) {
      await this.ctx.storage.delete(HOST_LEASE_KEY);
      if ((room.status === "OPEN" || room.status === "READY") && room.hostPlayerId === hostLease.playerId) {
        const host = room.players.find((player) => player.playerId === hostLease.playerId);
        if (host) {
          const disconnected = host.connectionStatus === "DISCONNECTED"
            ? room
            : disconnectRoomPlayer(room, host.playerId, hostLease.dueAt - HOST_HEARTBEAT_TIMEOUT_MS);
          const next = transferDisconnectedHostAfterGrace(disconnected, now, HOST_DISCONNECT_GRACE_MS);
          if (next.hostPlayerId !== room.hostPlayerId || next.players.length !== room.players.length) {
            room = next;
            await this.ctx.storage.delete(HOST_TRANSFER_KEY);
            await this.saveRoom(next);
            await this.broadcastViews(next);
            if (next.status === "OPEN" || next.status === "READY") {
              await this.scheduleHostLease(next.hostPlayerId, now + HOST_HEARTBEAT_TIMEOUT_MS);
            }
          }
        }
      }
    }

    const scheduled = await this.ctx.storage.get<ScheduledCoreAction>(SCHEDULED_ACTION_KEY);
    if (scheduled && now >= scheduled.dueAt) {
      await this.ctx.storage.delete(SCHEDULED_ACTION_KEY);
      if ((await this.phaseVersion()) === scheduled.version) {
        room = (await this.loadRoom()) ?? room;
        if (room.status === "PLAYING" && room.gameState) {
          try {
            await this.applyModuleAction(room, scheduled.action);
            return;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
              matchId: stateInfo(room.gameId, room.gameState).matchId, roomCode: room.roomCode, eventType: "ALARM_ACTION_FAILED",
              ...eventGameFields(stateInfo(room.gameId, room.gameState)),
              phase: stateInfo(room.gameId, room.gameState).phase, payload: { message }
            }));
            this.ctx.waitUntil(recordOperationalError(this.env.DB, {
              source: "RoomObject.alarm", message, roomCode: room.roomCode,
              ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
              details: { action: scheduled.action, phase: stateInfo(room.gameId, room.gameState).phase }
            }));
          }
        }
      }
    }
    await this.rescheduleAlarm();
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
    const playerId = attachment?.playerId;
    if (!playerId) return;
    let message: ClientRoomMessage;
    try {
      const decoded = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      if (decoded.length > 32_768) throw new Error("メッセージが大きすぎます");
      message = parseClientRoomMessage(JSON.parse(decoded));
    } catch (error) {
      this.send(ws, { type: "ERROR", code: "BAD_MESSAGE", message: error instanceof Error ? error.message : "メッセージ形式が不正です" });
      return;
    }

    if (!(await this.rememberRequest(playerId, message.requestId))) {
      this.send(ws, { type: "ACTION_ACCEPTED", requestId: message.requestId });
      return;
    }
    const room = await this.loadRoom();
    if (!room) return;
    try {
      let next = room;
      switch (message.type) {
        case "SET_READY": next = setPlayerReady(room, playerId, message.ready); await this.saveRoom(next); await this.broadcastViews(next); break;
        case "UPDATE_GAME_CONFIG": {
          const gameConfig = gameRegistry.get(room.gameId).parseConfig(message.gameConfig);
          next = updateRoomGameConfig(room, playerId, gameConfig);
          await this.saveRoom(next); await this.broadcastViews(next); break;
        }
        case "HEARTBEAT": {
          if ((room.status === "OPEN" || room.status === "READY") && playerId === room.hostPlayerId) {
            await this.scheduleHostLease(playerId);
          }
          break;
        }
        case "START_MATCH": next = await this.startNewMatch(room, playerId, false); break;
        case "REMATCH": next = await this.startNewMatch(room, playerId, true); break;
        case "LEAVE_ROOM": {
          next = leaveRoom(room, playerId);
          await this.saveRoom(next);
          await this.broadcastViews(next);
          if ((next.status === "OPEN" || next.status === "READY") && next.hostPlayerId !== room.hostPlayerId) {
            await this.scheduleHostLease(next.hostPlayerId);
          }
          break;
        }
        case "GAME_ACTION": {
          if ((await this.phaseVersion()) !== message.phaseVersion) throw new Error("画面が更新されています。最新状態で操作してください");
          const module = gameRegistry.get(room.gameId);
          if (!module.parseClientAction) throw new Error("このゲームはオンライン操作に対応していません");
          const action = module.parseClientAction(message.action, playerId);
          next = await this.applyModuleAction(room, action); break;
        }
        case "GAME_PHASE_READY": await this.registerPhaseReady(room, playerId, message.phaseVersion); break;
        case "NEXT_GAME_READY": await this.registerPhaseReady(room, playerId, await this.phaseVersion()); break;
        case "SUBMIT_PLAYTEST_FEEDBACK": {
          if (!room.gameState) throw new Error("アンケートはゲーム終了後に回答してください");
          const info = stateInfo(room.gameId, room.gameState);
          if (!info.currentGameFinished || !info.currentGameId) throw new Error("アンケートはゲーム終了後に回答してください");
          const feedback = validatePlaytestFeedback(message.feedback, room.players.map((player) => player.playerId));
          await persistPlaytestFeedback(this.env.DB, {
            matchId: info.matchId, gameId: info.currentGameId, playerId, feedback
          });
          break;
        }
      }
      const latest = await this.loadRoom();
      if (latest?.gameState) {
        const info = stateInfo(latest.gameId, latest.gameState);
        this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
          matchId: info.matchId, roomCode: latest.roomCode, eventType: `CLIENT_${message.type}`,
          ...eventGameFields(info),
          phase: info.phase, playerId,
          ...(message.type === "GAME_ACTION" ? { payload: message.action } : {})
        }));
      }
      this.send(ws, { type: "ACTION_ACCEPTED", requestId: message.requestId });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "操作を処理できませんでした";
      this.send(ws, { type: "ERROR", code: "ACTION_REJECTED", message: messageText, requestId: message.requestId });
    }
  }

  private async handleWebSocketDisconnect(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
    if (!attachment?.playerId) return;
    const room = await this.loadRoom();
    if (!room) return;
    const stillConnected = this.ctx.getWebSockets(`player:${attachment.playerId}`).some((socket) => socket !== ws && socket.readyState === WebSocket.OPEN);
    if (stillConnected) return;
    const disconnectedAt = Date.now();
    const next = disconnectRoomPlayer(room, attachment.playerId, disconnectedAt);
    await this.saveRoom(next);
    if ((next.status === "OPEN" || next.status === "READY") && attachment.playerId === next.hostPlayerId) {
      await this.scheduleHostTransfer(attachment.playerId, disconnectedAt + HOST_DISCONNECT_GRACE_MS);
    }
    await this.broadcastViews(next);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleWebSocketDisconnect(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.handleWebSocketDisconnect(ws);
  }
}
