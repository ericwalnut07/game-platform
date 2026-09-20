import { describe, expect, it } from "vitest";
import { createRoom, disconnectRoomPlayer, joinRoom, leaveRoom, setPlayerReady, transferDisconnectedHostAfterGrace, updateRoomGameConfig } from "../../src/room/room-lobby";

describe("room lobby", () => {
  it("becomes ready when minimum players are present and every guest is ready", () => {
    let room = createRoom({
      roomId: "r1", roomCode: "ABC123", roomName: "test", gameId: "pon-inai",
      hostPlayerId: "A", hostDisplayName: "A", passwordHash: "hash",
      minPlayers: 3, maxPlayers: 4, gameConfig: { gameCount: 3 }, now: 0
    });
    room = joinRoom(room, "B", "B");
    room = joinRoom(room, "C", "C");
    expect(room.status).toBe("OPEN");
    room = setPlayerReady(room, "B", true);
    room = setPlayerReady(room, "C", true);
    expect(room.status).toBe("READY");
  });

  it("transfers host to earliest remaining player before the match", () => {
    let room = createRoom({
      roomId: "r1", roomCode: "ABC123", roomName: "test", gameId: "pon-inai",
      hostPlayerId: "A", hostDisplayName: "A", passwordHash: "hash",
      minPlayers: 3, maxPlayers: 4, gameConfig: { gameCount: 3 }, now: 0
    });
    room = joinRoom(room, "B", "B");
    room = joinRoom(room, "C", "C");
    room = leaveRoom(room, "A");
    expect(room.hostPlayerId).toBe("B");
  });

  it("allows only the host to change the game config", () => {
    const room = createRoom({
      roomId: "r1", roomCode: "ABC123", roomName: "test", gameId: "pon-inai",
      hostPlayerId: "A", hostDisplayName: "A", passwordHash: "hash",
      minPlayers: 3, maxPlayers: 4, gameConfig: { gameCount: 3 }, now: 0
    });
    expect(() => updateRoomGameConfig(room, "B", { gameCount: 5 })).toThrow();
    expect(updateRoomGameConfig(room, "A", { gameCount: 5 }).gameConfig).toEqual({ gameCount: 5 });
  });
  it("gives a disconnected host a grace period before transfer", () => {
    let room = createRoom({
      roomId: "r1", roomCode: "ABC123", roomName: "test", gameId: "pon-inai",
      hostPlayerId: "A", hostDisplayName: "A", passwordHash: "hash",
      minPlayers: 3, maxPlayers: 4, gameConfig: { gameCount: 3 }, now: 0
    });
    room = joinRoom(room, "B", "B");
    room = joinRoom(room, "C", "C");
    room = disconnectRoomPlayer(room, "A", 1_000);
    expect(room.hostPlayerId).toBe("A");
    room = transferDisconnectedHostAfterGrace(room, 10_999, 10_000);
    expect(room.hostPlayerId).toBe("A");
    room = transferDisconnectedHostAfterGrace(room, 11_000, 10_000);
    expect(room.hostPlayerId).toBe("B");
    expect(room.players.some((p) => p.playerId === "A")).toBe(false);
  });

  it("cancels host loss naturally when the host reconnects during grace", () => {
    let room = createRoom({
      roomId: "r1", roomCode: "ABC123", roomName: "test", gameId: "pon-inai",
      hostPlayerId: "A", hostDisplayName: "A", passwordHash: "hash",
      minPlayers: 3, maxPlayers: 4, gameConfig: { gameCount: 3 }, now: 0
    });
    room = joinRoom(room, "B", "B");
    room = disconnectRoomPlayer(room, "A", 1_000);
    room = joinRoom(room, "A", "A");
    room = transferDisconnectedHostAfterGrace(room, 20_000, 10_000);
    expect(room.hostPlayerId).toBe("A");
    expect(room.players.find((p) => p.playerId === "A")?.connectionStatus).toBe("CONNECTED");
  });

});
