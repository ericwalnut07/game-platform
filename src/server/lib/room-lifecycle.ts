import type { RoomState } from "../../room/room-state";

export const ROOM_TTL_MS = {
  LOBBY: 2 * 60 * 60 * 1000,
  PLAYING: 6 * 60 * 60 * 1000,
  FINISHED: 60 * 60 * 1000,
  CLOSED: 60 * 1000
} as const;

export function roomExpiryDueAt(room: RoomState<unknown>): number {
  const base = room.lastActivityAt ?? room.finishedAt ?? room.startedAt ?? room.createdAt;
  if (room.status === "PLAYING") return base + ROOM_TTL_MS.PLAYING;
  if (room.status === "FINISHED") return (room.finishedAt ?? base) + ROOM_TTL_MS.FINISHED;
  if (room.status === "CLOSED") return base + ROOM_TTL_MS.CLOSED;
  return base + ROOM_TTL_MS.LOBBY;
}

export function isRoomExpired(room: RoomState<unknown>, now = Date.now()): boolean {
  return now >= roomExpiryDueAt(room);
}
