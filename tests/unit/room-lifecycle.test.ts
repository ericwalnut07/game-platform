import { describe, expect, it } from "vitest";
import type { RoomState } from "../../src/room/room-state";
import { isRoomExpired, roomExpiryDueAt, ROOM_TTL_MS } from "../../src/server/lib/room-lifecycle";

function room(status: RoomState["status"], lastActivityAt = 1_000): RoomState {
  return {
    roomId: "r", roomCode: "ABC123", roomName: "room", gameId: "pon-inai", hostPlayerId: "A",
    passwordHash: "x", minPlayers: 3, maxPlayers: 4, status, players: [], gameConfig: { gameCount: 3 },
    createdAt: 1_000, lastActivityAt,
    ...(status === "PLAYING" ? { startedAt: 1_000 } : {}),
    ...(status === "FINISHED" ? { startedAt: 1_000, finishedAt: 2_000 } : {})
  };
}

describe("room lifecycle", () => {
  it("expires lobby rooms after two inactive hours", () => {
    const value = room("OPEN");
    expect(roomExpiryDueAt(value)).toBe(1_000 + ROOM_TTL_MS.LOBBY);
    expect(isRoomExpired(value, 1_000 + ROOM_TTL_MS.LOBBY - 1)).toBe(false);
    expect(isRoomExpired(value, 1_000 + ROOM_TTL_MS.LOBBY)).toBe(true);
  });

  it("allows a longer inactivity window while playing", () => {
    const value = room("PLAYING", 5_000);
    expect(roomExpiryDueAt(value)).toBe(5_000 + ROOM_TTL_MS.PLAYING);
  });

  it("does not extend a finished room from later activity timestamps", () => {
    const value = { ...room("FINISHED", 999_999), finishedAt: 2_000 };
    expect(roomExpiryDueAt(value)).toBe(2_000 + ROOM_TTL_MS.FINISHED);
  });
});
