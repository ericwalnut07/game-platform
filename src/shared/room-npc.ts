import { HUB_NPC_LABELS, isHubNpcType, type HubNpcType } from "./commercial-hub-npc";
import { TERRITORY2_NPC_LABELS, isTerritory2Difficulty, type Territory2Difficulty } from "./territory2-npc";
export type RoomNpcType = HubNpcType | Territory2Difficulty;
export function isRoomNpcType(value: unknown): value is RoomNpcType {
  return isHubNpcType(value) || isTerritory2Difficulty(value);
}
export function isNpcTypeForGame(gameId: string, value: unknown): value is RoomNpcType {
  return gameId === "commercial-hub" ? isHubNpcType(value) : gameId === "ooishi-territory-2" && isTerritory2Difficulty(value);
}
export function roomNpcLabel(profile: RoomNpcType): string {
  return isHubNpcType(profile) ? HUB_NPC_LABELS[profile] : TERRITORY2_NPC_LABELS[profile];
}
