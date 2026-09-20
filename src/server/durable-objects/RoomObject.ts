import { DurableObject } from "cloudflare:workers";
import { ponInaiGameModule, type PonInaiModuleAction, type PonInaiModuleConfig } from "../../games/pon-inai/module";
import type { MatchState } from "../../games/pon-inai/match";
import type { CoreAction } from "../../games/pon-inai/state-machine";
import type { PonInaiClientAction } from "../../games/pon-inai/web-actions";
import { createRoom, disconnectRoomPlayer, joinRoom, leaveRoom, markRoomFinished, markRoomPlaying, publicRoomState, reconnectRoomPlayer, setPlayerReady, transferDisconnectedHostAfterGrace, updateRoomGameConfig } from "../../room/room-lobby";
import type { RoomState } from "../../room/room-state";
import type { ClientRoomMessage, ServerRoomMessage } from "../../shared/room-protocol";
import type { Env } from "../env";
import { derivePassword, randomToken, sha256 } from "../lib/crypto";
import { syncRoomDirectory } from "../lib/directory";
import { persistAbandonedMatch, persistFinishedGame, persistFinishedMatch, persistMatchStart, persistPlaytestFeedback, recordPlaytestEvent } from "../lib/playtest-log";
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
  gameId: "pon-inai";
  hostPlayerId: string;
  hostDisplayName: string;
  hostSessionToken: string;
  password: string;
  gameConfig: PonInaiModuleConfig;
}


interface ScheduledCoreAction {
  version: number;
  dueAt: number;
  action: CoreAction;
}

interface ScheduledHostTransfer {
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
const ROOM_EXPIRY_KEY = "scheduledRoomExpiry";
const HOST_DISCONNECT_GRACE_MS = 10_000;

function json(message: unknown, status = 200): Response {
  return Response.json(message, { status });
}

function currentPhase(match: MatchState | undefined): string {
  if (!match) return "NO_GAME";
  if (match.status === "FINISHED") return "MATCH_FINISHED";
  return match.currentGame?.phase ?? "NO_GAME";
}

function bindPlayerAction(playerId: string, action: PonInaiClientAction): PonInaiModuleAction {
  let core: CoreAction;
  switch (action.type) {
    case "ACK_PRIVATE_INFO": core = { type: "ACK_PRIVATE_INFO", playerId }; break;
    case "LOCK_ROUND_ACTION": core = { type: "LOCK_ROUND_ACTION", playerId, action: action.action }; break;
    case "LOCK_INITIAL_VOTES": core = { type: "LOCK_INITIAL_VOTES", playerId, votes: action.votes }; break;
    case "LOCK_RUNOFF_VOTE": core = { type: "LOCK_RUNOFF_VOTE", playerId, vote: action.vote }; break;
  }
  return { type: "GAME_ACTION", action: core };
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
      if (!Number.isInteger(input.gameCount) || (input.gameCount as number) < 1 || (input.gameCount as number) > 5) throw new Error("ゲーム数が不正です");
      return { type, gameCount: input.gameCount as 1 | 2 | 3 | 4 | 5, requestId };
    case "START_MATCH":
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
function parseClientGameAction(value: unknown): PonInaiClientAction {
  if (!value || typeof value !== "object" || !("type" in value) || typeof (value as { type?: unknown }).type !== "string") {
    throw new Error("ゲーム操作形式が不正です");
  }
  const type = (value as { type: string }).type;
  if (!["ACK_PRIVATE_INFO", "LOCK_ROUND_ACTION", "LOCK_INITIAL_VOTES", "LOCK_RUNOFF_VOTE"].includes(type)) {
    throw new Error("許可されていないゲーム操作です");
  }
  return value as PonInaiClientAction;
}

export class RoomObject extends DurableObject<Env> {
  private async loadRoom(): Promise<RoomState<MatchState> | null> {
    return (await this.ctx.storage.get<RoomState<MatchState>>(ROOM_KEY)) ?? null;
  }

  private async saveRoom(room: RoomState<MatchState>): Promise<void> {
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
    const [hostTransfer, coreAction, roomExpiry] = await Promise.all([
      this.ctx.storage.get<ScheduledHostTransfer>(HOST_TRANSFER_KEY),
      this.ctx.storage.get<ScheduledCoreAction>(SCHEDULED_ACTION_KEY),
      this.ctx.storage.get<ScheduledRoomExpiry>(ROOM_EXPIRY_KEY)
    ]);
    const dueTimes = [hostTransfer?.dueAt, coreAction?.dueAt, roomExpiry?.dueAt]
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

  private async broadcastViews(room: RoomState<MatchState>): Promise<void> {
    const phaseVersion = await this.phaseVersion();
    const publicState = publicRoomState(room);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as { playerId?: string } | null;
      this.send(ws, { type: "ROOM_STATE", room: publicState });
      if ((room.status === "PLAYING" || room.status === "FINISHED") && room.gameState && attachment?.playerId) {
        try {
          const gameView = ponInaiGameModule.buildPlayerView(room.gameState, attachment.playerId);
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

  private async cancelHostTransferIfRestored(room: RoomState<MatchState>, playerId: string): Promise<void> {
    if (room.status !== "OPEN" && room.status !== "READY") return;
    const scheduled = await this.ctx.storage.get<ScheduledHostTransfer>(HOST_TRANSFER_KEY);
    if (!scheduled || scheduled.playerId !== playerId) return;
    await this.ctx.storage.delete(HOST_TRANSFER_KEY);
    await this.rescheduleAlarm();
  }

  private async applyModuleAction(room: RoomState<MatchState>, action: PonInaiModuleAction): Promise<RoomState<MatchState>> {
    if (!room.gameState) throw new Error("ゲームが開始されていません");
    const before = currentPhase(room.gameState);
    const beforeGame = room.gameState.currentGame;
    const beforeMatchStatus = room.gameState.status;
    const gameState = ponInaiGameModule.handleAction(room.gameState, action, { rng: cryptoRandom });
    const after = currentPhase(gameState);
    let next: RoomState<MatchState> = { ...room, gameState, lastActivityAt: Date.now() };
    if (gameState.status === "FINISHED") next = markRoomFinished(next, gameState, Date.now());

    if (before !== after) {
      await this.bumpPhaseVersion();
      const eventGame = gameState.currentGame ?? beforeGame;
      this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
        matchId: gameState.matchId,
        roomCode: room.roomCode,
        eventType: "PHASE_CHANGED",
        ...(eventGame ? { gameId: eventGame.gameId, gameIndex: eventGame.gameIndex } : {}),
        phase: after,
        payload: { from: before, to: after }
      }));
    }

    if (beforeGame?.gameId !== gameState.currentGame?.gameId && gameState.currentGame) {
      this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
        matchId: gameState.matchId,
        roomCode: room.roomCode,
        eventType: "GAME_STARTED",
        gameId: gameState.currentGame.gameId,
        gameIndex: gameState.currentGame.gameIndex,
        phase: gameState.currentGame.phase
      }));
    }

    if (beforeGame?.phase !== "FINISHED" && gameState.currentGame?.phase === "FINISHED") {
      this.ctx.waitUntil(persistFinishedGame(this.env.DB, gameState, gameState.currentGame));
    }
    if (beforeMatchStatus !== "FINISHED" && gameState.status === "FINISHED") {
      this.ctx.waitUntil(persistFinishedMatch(this.env.DB, gameState, Date.now()));
    }

    await this.saveRoom(next);
    await this.broadcastViews(next);
    await this.scheduleAutomaticProgress(next, await this.phaseVersion());
    return next;
  }

  private async scheduleAutomaticProgress(room: RoomState<MatchState>, version: number): Promise<void> {
    if (room.status !== "PLAYING" || !room.gameState?.currentGame) return;
    const phase = room.gameState.currentGame.phase;
    if (phase === "CONFIDENCE_REVEAL") return this.scheduleCoreAdvance(version, 1200, { type: "ADVANCE_REVEAL" });
    if (phase === "CARD_REVEAL") return this.scheduleCoreAdvance(version, 1600, { type: "ADVANCE_REVEAL" });
    if (phase === "ROUND_TALK") return this.scheduleCoreAdvance(version, 30_000, { type: "END_ROUND_TALK" });
    if (phase === "RETURN") return this.scheduleCoreAdvance(version, 1800, { type: "ADVANCE_RETURN" });
    if (phase === "RUNOFF_DISCUSSION") return this.scheduleCoreAdvance(version, 30_000, { type: "END_RUNOFF_DISCUSSION" });
  }

  private async scheduleCoreAdvance(version: number, delayMs: number, action: CoreAction): Promise<void> {
    const scheduled: ScheduledCoreAction = { version, dueAt: Date.now() + delayMs, action };
    await this.ctx.storage.put(SCHEDULED_ACTION_KEY, scheduled);
    await this.rescheduleAlarm();
  }

  private phaseReadyAction(match: MatchState): PonInaiModuleAction | null {
    if (match.status === "FINISHED") return null;
    const phase = match.currentGame?.phase;
    if (!phase) return null;
    if (phase === "ROUND_TALK") return { type: "GAME_ACTION", action: { type: "END_ROUND_TALK" } };
    if (phase === "RETURN") return { type: "GAME_ACTION", action: { type: "ADVANCE_RETURN" } };
    if (phase === "FINAL_DISCUSSION") return { type: "GAME_ACTION", action: { type: "END_FINAL_DISCUSSION" } };
    if (phase === "RUNOFF_DISCUSSION") return { type: "GAME_ACTION", action: { type: "END_RUNOFF_DISCUSSION" } };
    if ([
      "VERDICT_REVEAL", "MISSION_RESULT_REVEAL", "TRUE_MISSION_REVEAL", "DISPLAYED_MISSIONS_REVEAL",
      "PON_REVEAL", "PERSONALITIES_REVEAL", "PERSONALITY_RESULTS_REVEAL", "SPADARI_RESULT_REVEAL",
      "SCORE_REVEAL", "ENDING"
    ].includes(phase)) return { type: "GAME_ACTION", action: { type: "ADVANCE_TRUTH_REVEAL" } };
    if (phase === "FINISHED") return { type: "NEXT_GAME" };
    return null;
  }

  private async registerPhaseReady(room: RoomState<MatchState>, playerId: string, clientVersion: number): Promise<void> {
    const version = await this.phaseVersion();
    if (clientVersion !== version) throw new Error("画面が更新されています。最新状態で操作してください");
    if (!room.gameState) throw new Error("ゲームが開始されていません");
    const phase = currentPhase(room.gameState);
    const key = `${room.gameState.currentGameIndex}:${phase}:${version}`;
    const current = await this.ctx.storage.get<PhaseReadyState>(PHASE_READY_KEY);
    const ready = current?.key === key ? [...current.playerIds] : [];
    if (!ready.includes(playerId)) ready.push(playerId);
    await this.ctx.storage.put(PHASE_READY_KEY, { key, playerIds: ready } satisfies PhaseReadyState);
    if (ready.length < room.players.length) return;
    await this.ctx.storage.delete(PHASE_READY_KEY);
    const action = this.phaseReadyAction(room.gameState);
    if (!action) throw new Error("この画面では準備完了操作を使用しません");
    await this.applyModuleAction(room, action);
  }

  private async handleInitialize(request: Request): Promise<Response> {
    if (await this.loadRoom()) return json({ error: "ROOM_EXISTS" }, 409);
    const payload = await request.json() as InitializePayload;
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
      minPlayers: ponInaiGameModule.minPlayers,
      maxPlayers: ponInaiGameModule.maxPlayers,
      gameConfig: payload.gameConfig,
      now: Date.now()
    }) as RoomState<MatchState>;
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
    let next: RoomState<MatchState>;
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
    this.send(server, { type: "ROOM_STATE", room: publicRoomState(next) });
    if ((next.status === "PLAYING" || next.status === "FINISHED") && next.gameState) {
      this.send(server, { type: "GAME_VIEW", gameView: ponInaiGameModule.buildPlayerView(next.gameState, playerId), phaseVersion: await this.phaseVersion() });
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

  private async expireRoom(room: RoomState<MatchState>): Promise<void> {
    if (room.gameState) {
      if (room.gameState.status !== "FINISHED") {
        this.ctx.waitUntil(persistAbandonedMatch(this.env.DB, room.gameState.matchId, Date.now(), "ROOM_EXPIRED"));
      }
      this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
        matchId: room.gameState.matchId,
        roomCode: room.roomCode,
        eventType: "ROOM_EXPIRED",
        ...(room.gameState.currentGame ? { gameId: room.gameState.currentGame.gameId, gameIndex: room.gameState.currentGame.gameIndex } : {}),
        phase: currentPhase(room.gameState),
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
            await this.applyModuleAction(room, { type: "GAME_ACTION", action: scheduled.action });
            return;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
              matchId: room.gameState.matchId, roomCode: room.roomCode, eventType: "ALARM_ACTION_FAILED",
              ...(room.gameState.currentGame ? { gameId: room.gameState.currentGame.gameId, gameIndex: room.gameState.currentGame.gameIndex } : {}),
              phase: currentPhase(room.gameState), payload: { message }
            }));
            this.ctx.waitUntil(recordOperationalError(this.env.DB, {
              source: "RoomObject.alarm", message, roomCode: room.roomCode,
              ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
              details: { action: scheduled.action, phase: currentPhase(room.gameState) }
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
          if (!Number.isInteger(message.gameCount) || message.gameCount < 1 || message.gameCount > 5) throw new Error("ゲーム数は1〜5で指定してください");
          next = updateRoomGameConfig(room, playerId, { gameCount: message.gameCount });
          await this.saveRoom(next); await this.broadcastViews(next); break;
        }
        case "START_MATCH": {
          if (playerId !== room.hostPlayerId) throw new Error("ホストのみゲームを開始できます");
          const players = room.players.map((player) => ({ id: player.playerId, displayName: player.displayName }));
          const gameState = ponInaiGameModule.createInitialState({ matchId: crypto.randomUUID(), gameIndex: 1, players, config: room.gameConfig as PonInaiModuleConfig, rng: cryptoRandom });
          const startedAt = Date.now();
          next = markRoomPlaying(room, playerId, gameState, startedAt);
          await this.bumpPhaseVersion();
          this.ctx.waitUntil(persistMatchStart(this.env.DB, room.roomCode, gameState, startedAt));
          this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
            matchId: gameState.matchId, roomCode: room.roomCode, eventType: "MATCH_STARTED",
            ...(gameState.currentGame ? { gameId: gameState.currentGame.gameId, gameIndex: gameState.currentGame.gameIndex } : {}),
            phase: currentPhase(gameState), playerId
          }));
          await this.saveRoom(next); await this.broadcastViews(next); break;
        }
        case "LEAVE_ROOM": next = leaveRoom(room, playerId); await this.saveRoom(next); await this.broadcastViews(next); break;
        case "GAME_ACTION": {
          if ((await this.phaseVersion()) !== message.phaseVersion) throw new Error("画面が更新されています。最新状態で操作してください");
          const action = bindPlayerAction(playerId, parseClientGameAction(message.action));
          next = await this.applyModuleAction(room, action); break;
        }
        case "GAME_PHASE_READY": await this.registerPhaseReady(room, playerId, message.phaseVersion); break;
        case "NEXT_GAME_READY": await this.registerPhaseReady(room, playerId, await this.phaseVersion()); break;
        case "SUBMIT_PLAYTEST_FEEDBACK": {
          const currentGame = room.gameState?.currentGame;
          if (!room.gameState || !currentGame || currentGame.phase !== "FINISHED") throw new Error("アンケートはゲーム終了後に回答してください");
          const feedback = validatePlaytestFeedback(message.feedback, currentGame.players);
          await persistPlaytestFeedback(this.env.DB, {
            matchId: room.gameState.matchId, gameId: currentGame.gameId, playerId, feedback
          });
          break;
        }
      }
      const latest = await this.loadRoom();
      if (latest?.gameState) {
        this.ctx.waitUntil(recordPlaytestEvent(this.env.DB, {
          matchId: latest.gameState.matchId, roomCode: latest.roomCode, eventType: `CLIENT_${message.type}`,
          ...(latest.gameState.currentGame ? { gameId: latest.gameState.currentGame.gameId, gameIndex: latest.gameState.currentGame.gameIndex } : {}),
          phase: currentPhase(latest.gameState), playerId,
          ...(message.type === "GAME_ACTION" ? { payload: message.action } : {})
        }));
      }
      this.send(ws, { type: "ACTION_ACCEPTED", requestId: message.requestId });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "操作を処理できませんでした";
      this.send(ws, { type: "ERROR", code: "ACTION_REJECTED", message: messageText, requestId: message.requestId });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
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
}
