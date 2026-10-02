import type { RoomState, RoomPlayer } from "./room-state";
import { HUB_NPC_LABELS, isHubNpcType, type HubNpcType } from "../shared/commercial-hub-npc";

export function createRoom<GameState = unknown>(args: {
  roomId: string;
  roomCode: string;
  roomName: string;
  gameId: string;
  hostPlayerId: string;
  hostDisplayName: string;
  passwordHash: string;
  minPlayers: number;
  maxPlayers: number;
  gameConfig: unknown;
  now: number;
}): RoomState<GameState> {
  if (args.minPlayers < 1 || args.maxPlayers < args.minPlayers) throw new Error("Invalid player limits");
  return {
    roomId: args.roomId,
    roomCode: args.roomCode,
    roomName: args.roomName,
    gameId: args.gameId,
    hostPlayerId: args.hostPlayerId,
    passwordHash: args.passwordHash,
    minPlayers: args.minPlayers,
    maxPlayers: args.maxPlayers,
    status: "OPEN",
    players: [{
      playerId: args.hostPlayerId,
      displayName: args.hostDisplayName,
      joinedOrder: 0,
      isReady: true,
      connectionStatus: "CONNECTED"
    }],
    gameConfig: args.gameConfig,
    createdAt: args.now,
    lastActivityAt: args.now
  };
}

function touchRoom<T>(room: RoomState<T>, now = Date.now()): RoomState<T> {
  return { ...room, lastActivityAt: now };
}

function refreshLobbyStatus<T>(room: RoomState<T>): RoomState<T> {
  if (room.status === "PLAYING" || room.status === "FINISHED" || room.status === "CLOSED") return room;
  const guests = room.players.filter((p) => p.playerId !== room.hostPlayerId);
  const startable = room.players.length >= room.minPlayers
    && room.players.length <= room.maxPlayers
    && guests.every((p) => p.isReady && p.connectionStatus === "CONNECTED");
  return { ...room, status: startable ? "READY" : "OPEN" };
}

export function joinRoom<T>(room: RoomState<T>, playerId: string, displayName: string): RoomState<T> {
  if (room.status !== "OPEN" && room.status !== "READY") throw new Error("Room is not accepting players");
  if (room.players.some((p) => p.playerId === playerId)) {
    return reconnectRoomPlayer(room, playerId);
  }
  if (room.players.length >= room.maxPlayers) throw new Error("Room is full");
  const joinedOrder = room.players.reduce((max, p) => Math.max(max, p.joinedOrder), -1) + 1;
  return touchRoom(refreshLobbyStatus({
    ...room,
    players: [...room.players, { playerId, displayName, joinedOrder, isReady: false, connectionStatus: "CONNECTED" }]
  }));
}

export function setPlayerReady<T>(room: RoomState<T>, playerId: string, ready: boolean): RoomState<T> {
  if (room.status !== "OPEN" && room.status !== "READY") throw new Error("Ready state cannot change after start");
  if (!room.players.some((p) => p.playerId === playerId)) throw new Error("Unknown player");
  if (playerId === room.hostPlayerId) return room;
  return touchRoom(refreshLobbyStatus({
    ...room,
    players: room.players.map((p) => p.playerId === playerId ? { ...p, isReady: ready } : p)
  }));
}

export function updateRoomGameConfig<T>(room: RoomState<T>, actorPlayerId: string, gameConfig: unknown): RoomState<T> {
  if (actorPlayerId !== room.hostPlayerId) throw new Error("Only host can update room config");
  if (room.status !== "OPEN" && room.status !== "READY") throw new Error("Config cannot change after match start");
  return touchRoom({ ...room, gameConfig });
}

export function markRoomPlaying<T>(room: RoomState<T>, actorPlayerId: string, gameState: T, now: number): RoomState<T> {
  if (actorPlayerId !== room.hostPlayerId) throw new Error("Only host can start the match");
  if (room.status !== "READY") throw new Error("Room is not ready");
  return touchRoom({ ...room, status: "PLAYING", gameState, startedAt: now }, now);
}

export function restartRoomMatch<T>(room: RoomState<T>, actorPlayerId: string, gameState: T, now: number): RoomState<T> {
  if (actorPlayerId !== room.hostPlayerId) throw new Error("Only host can restart the match");
  if (room.status !== "FINISHED") throw new Error("Room match is not finished");
  if (room.players.some((player) => player.connectionStatus !== "CONNECTED")) {
    throw new Error("全員が接続してから、もう1回遊んでください");
  }
  const { finishedAt: _finishedAt, ...base } = room;
  return touchRoom({ ...base, status: "PLAYING", gameState, startedAt: now }, now);
}

export function disconnectRoomPlayer<T>(room: RoomState<T>, playerId: string, now = Date.now()): RoomState<T> {
  if (!room.players.some((p) => p.playerId === playerId)) return room;
  return touchRoom(refreshLobbyStatus({
    ...room,
    players: room.players.map((p) => p.playerId === playerId
      ? { ...p, connectionStatus: "DISCONNECTED" as const, disconnectedAt: now }
      : p)
  }), now);
}

export function transferDisconnectedHostAfterGrace<T>(room: RoomState<T>, now: number, graceMs: number): RoomState<T> {
  if (room.status !== "OPEN" && room.status !== "READY") return room;
  const host = room.players.find((p) => p.playerId === room.hostPlayerId);
  if (!host || host.connectionStatus !== "DISCONNECTED" || host.disconnectedAt === undefined) return room;
  if (now - host.disconnectedAt < graceMs) return room;
  const remaining = room.players.filter((p) => p.playerId !== host.playerId);
  const successor = remaining
    .filter((p) => !p.npcType && p.connectionStatus === "CONNECTED")
    .sort((a, b) => a.joinedOrder - b.joinedOrder)[0];
  return successor ? touchRoom(refreshLobbyStatus({ ...room, players: remaining, hostPlayerId: successor.playerId }), now) : room;
}

export function reconnectRoomPlayer<T>(room: RoomState<T>, playerId: string): RoomState<T> {
  if (!room.players.some((p) => p.playerId === playerId)) throw new Error("Unknown player");
  return touchRoom(refreshLobbyStatus({
    ...room,
    players: room.players.map((p) => {
      if (p.playerId !== playerId) return p;
      const { disconnectedAt: _disconnectedAt, ...rest } = p;
      return { ...rest, connectionStatus: "CONNECTED" as const };
    })
  }));
}

export function leaveRoom<T>(room: RoomState<T>, playerId: string): RoomState<T> {
  if (room.status === "PLAYING") throw new Error("Playing players cannot leave; disconnect/reconnect flow is used instead");
  const players = room.players.filter((p) => p.playerId !== playerId);
  if (!players.some((p) => !p.npcType)) return touchRoom({ ...room, players: [], status: "CLOSED" });
  let hostPlayerId = room.hostPlayerId;
  if (playerId === room.hostPlayerId) {
    hostPlayerId = players.filter((p) => !p.npcType).sort((a, b) => a.joinedOrder - b.joinedOrder)[0]!.playerId;
  }
  return touchRoom(refreshLobbyStatus({ ...room, players, hostPlayerId }));
}

export function publicRoomState<T>(room: RoomState<T>) {
  return {
    roomCode: room.roomCode,
    roomName: room.roomName,
    gameId: room.gameId,
    status: room.status,
    minPlayers: room.minPlayers,
    maxPlayers: room.maxPlayers,
    players: room.players.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      isHost: p.playerId === room.hostPlayerId,
      isReady: p.playerId === room.hostPlayerId ? true : p.isReady,
      connectionStatus: p.connectionStatus
      , ...(p.npcType ? { npcType: p.npcType } : {})
    })),
    gameConfig: room.gameConfig
  };
}

function assertNpcLobby(room: RoomState, actor: string): void {
  if (room.gameId !== "commercial-hub") throw new Error("常設NPCは商都開発で使用できます");
  if (actor !== room.hostPlayerId) throw new Error("NPCの変更はホストだけが行えます");
  if (room.status !== "OPEN" && room.status !== "READY") throw new Error("ゲーム開始後はNPCを変更できません");
}
export function addRoomNpc<T>(room: RoomState<T>, actor: string, playerId: string, npcType: HubNpcType): RoomState<T> {
  assertNpcLobby(room, actor);
  if (!isHubNpcType(npcType)) throw new Error("NPCの種類が不正です");
  if (room.players.length >= room.maxPlayers || room.players.some((p) => p.playerId === playerId)) throw new Error("空席がありません");
  const joinedOrder = room.players.reduce((max, p) => Math.max(max, p.joinedOrder), -1) + 1;
  return touchRoom(refreshLobbyStatus({ ...room, players: [...room.players, { playerId, npcType, joinedOrder,
    displayName: `NPC ${HUB_NPC_LABELS[npcType]}`, isReady: true, connectionStatus: "CONNECTED" }] }));
}
export function changeRoomNpc<T>(room: RoomState<T>, actor: string, playerId: string, npcType: HubNpcType | null): RoomState<T> {
  assertNpcLobby(room, actor);
  if (!room.players.some((p) => p.playerId === playerId && p.npcType)) throw new Error("対象のNPCがありません");
  if (npcType !== null && !isHubNpcType(npcType)) throw new Error("NPCの種類が不正です");
  const players = npcType === null ? room.players.filter((p) => p.playerId !== playerId) : room.players.map((p) => p.playerId === playerId ? { ...p, npcType, displayName: `NPC ${HUB_NPC_LABELS[npcType]}` } : p);
  return touchRoom(refreshLobbyStatus({ ...room, players }));
}
export function setLearningConsent<T>(room: RoomState<T>, actor: string, consent: boolean): RoomState<T> {
  if (room.gameId !== "commercial-hub" || !room.players.some((p) => p.playerId === actor && !p.npcType)) throw new Error("同意設定の対象がありません");
  if (consent && room.status !== "OPEN" && room.status !== "READY") throw new Error("収集への参加はゲーム開始前に選択してください");
  return { ...room, players: room.players.map((p) => p.playerId === actor ? { ...p, learningConsent: consent } : p) };
}

export function markRoomFinished<T>(room: RoomState<T>, gameState: T, now: number): RoomState<T> {
  if (room.status !== "PLAYING") throw new Error("Room is not playing");
  return touchRoom({ ...room, status: "FINISHED", gameState, finishedAt: now }, now);
}

/** Keeps room/session identities for another selected stage; only finished matches may return. */
export function returnToLobby<T>(room: RoomState<T>, actorPlayerId: string): RoomState<T> {
  if (actorPlayerId !== room.hostPlayerId || room.status !== "FINISHED") throw new Error("終了後にホストがステージを選択できます");
  const { gameState: _gameState, finishedAt: _finishedAt, startedAt: _startedAt, ...base } = room;
  return touchRoom(refreshLobbyStatus({ ...base, status: "OPEN", players: room.players.map((p) => ({ ...p, isReady: p.playerId === room.hostPlayerId })) }));
}
