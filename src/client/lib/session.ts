import type { RoomCredentials } from "../../shared/api";

const KEY = "game-platform-room-session";

export function saveRoomCredentials(credentials: RoomCredentials): void {
  localStorage.setItem(KEY, JSON.stringify(credentials));
}

export function loadRoomCredentials(roomCode?: string): RoomCredentials | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RoomCredentials;
    if (roomCode && parsed.roomCode !== roomCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearRoomCredentials(): void {
  localStorage.removeItem(KEY);
}
