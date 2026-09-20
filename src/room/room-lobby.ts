import type { RoomState, RoomPlayer } from "./room-state";

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
    .filter((p) => p.connectionStatus === "CONNECTED")
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
  if (players.length === 0) return touchRoom({ ...room, players: [], status: "CLOSED" });
  let hostPlayerId = room.hostPlayerId;
  if (playerId === room.hostPlayerId) {
    hostPlayerId = [...players].sort((a, b) => a.joinedOrder - b.joinedOrder)[0]!.playerId;
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
    })),
    gameConfig: room.gameConfig
  };
}

export function markRoomFinished<T>(room: RoomState<T>, gameState: T, now: number): RoomState<T> {
  if (room.status !== "PLAYING") throw new Error("Room is not playing");
  return touchRoom({ ...room, status: "FINISHED", gameState, finishedAt: now }, now);
}
