import type { PlaytestFeedback } from "./playtest";
import type { HubNpcType } from "./commercial-hub-npc";

export type RoomStatus = "OPEN" | "READY" | "PLAYING" | "FINISHED" | "CLOSED";

export interface RoomPlayerView {
  playerId: string;
  displayName: string;
  isHost: boolean;
  isReady: boolean;
  connectionStatus: "CONNECTED" | "DISCONNECTED";
  npcType?: HubNpcType;
}

export interface RoomPublicState {
  roomCode: string;
  roomName: string;
  gameId: string;
  status: RoomStatus;
  minPlayers: number;
  maxPlayers: number;
  players: readonly RoomPlayerView[];
  gameConfig: unknown;
}

export type ClientRoomMessage =
  | { type: "ADD_NPC"; npcType: HubNpcType; requestId: string }
  | { type: "UPDATE_NPC"; playerId: string; npcType: HubNpcType; requestId: string }
  | { type: "REMOVE_NPC"; playerId: string; requestId: string }
  | { type: "SET_LEARNING_CONSENT"; consent: boolean; requestId: string }
  | { type: "SET_READY"; ready: boolean; requestId: string }
  | { type: "UPDATE_GAME_CONFIG"; gameConfig: unknown; requestId: string }
  | { type: "START_MATCH"; requestId: string }
  | { type: "RETURN_TO_LOBBY"; requestId: string }
  | { type: "REMATCH"; requestId: string }
  | { type: "HEARTBEAT"; requestId: string }
  | { type: "GAME_ACTION"; action: unknown; requestId: string; phaseVersion: number }
  | { type: "GAME_PHASE_READY"; requestId: string; phaseVersion: number }
  | { type: "NEXT_GAME_READY"; requestId: string }
  | { type: "SUBMIT_PLAYTEST_FEEDBACK"; feedback: PlaytestFeedback; requestId: string }
  | { type: "LEAVE_ROOM"; requestId: string };

type WithoutRequestId<T> = T extends unknown ? Omit<T, "requestId"> : never;
export type ClientRoomMessageInput = WithoutRequestId<ClientRoomMessage>;

export type ServerRoomMessage =
  | { type: "LEARNING_CONSENT"; consent: boolean; matchId?: string }
  | { type: "ROOM_STATE"; room: RoomPublicState }
  | { type: "GAME_VIEW"; gameView: unknown; phaseVersion: number }
  | { type: "ACTION_ACCEPTED"; requestId: string }
  | { type: "ERROR"; code: string; message: string; requestId?: string };
