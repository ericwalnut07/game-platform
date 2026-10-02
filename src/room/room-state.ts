import type { RoomStatus } from "../shared/room-protocol";
import type { HubNpcType } from "../shared/commercial-hub-npc";

export interface RoomPlayer {
  playerId: string;
  displayName: string;
  joinedOrder: number;
  isReady: boolean;
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  disconnectedAt?: number;
  npcType?: HubNpcType;
  /** Private consent, sent only to this player's authenticated socket. */
  learningConsent?: boolean;
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
