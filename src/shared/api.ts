import type { RoomPublicState } from "./room-protocol";

export interface GameCatalogItem {
  id: string;
  title: string;
  description: string;
  supportedModes: readonly ("SOLO" | "ONLINE")[];
  minPlayers: number;
  maxPlayers: number;
}

export interface CreateRoomRequest {
  gameId: string;
  roomName: string;
  displayName: string;
  password: string;
  gameConfig: unknown;
}

export interface JoinRoomRequest {
  displayName: string;
  password: string;
}

export interface RoomCredentials {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface CreateRoomResponse extends RoomCredentials {
  room: RoomPublicState;
}

export interface JoinRoomResponse extends RoomCredentials {
  room: RoomPublicState;
}

export interface RoomListItem {
  roomCode: string;
  roomName: string;
  gameId: string;
  status: "OPEN" | "READY";
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
}
