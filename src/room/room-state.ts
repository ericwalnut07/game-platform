import type { RoomStatus } from "../shared/room-protocol";

export interface RoomPlayer {
  playerId: string;
  displayName: string;
  joinedOrder: number;
  isReady: boolean;
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  disconnectedAt?: number;
}

export interface RoomState<GameState = unknown> {
  roomId: string;
  roomCode: string;
  roomName: string;
  gameId: string;
  hostPlayerId: string;
  passwordHash: string;
  minPlayers: number;
  maxPlayers: number;
  status: RoomStatus;
  players: readonly RoomPlayer[];
  gameConfig: unknown;
  gameState?: GameState;
  createdAt: number;
  lastActivityAt: number;
  startedAt?: number;
  finishedAt?: number;
}
