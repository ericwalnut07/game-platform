import type { RoomPublicState } from "../../shared/room-protocol";
import type { RoomListItem } from "../../shared/api";

export async function syncRoomDirectory(db: D1Database | undefined, room: RoomPublicState, hasPassword: boolean, createdAt: number): Promise<void> {
  if (!db) return;
  if (room.status === "CLOSED" || room.status === "FINISHED" || room.status === "PLAYING") {
    await db.prepare("DELETE FROM rooms WHERE room_code = ?").bind(room.roomCode).run();
    return;
  }
  await db.prepare(`
    INSERT INTO rooms(room_code, room_name, game_id, status, player_count, max_players, has_password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_code) DO UPDATE SET
      room_name = excluded.room_name,
      status = excluded.status,
      player_count = excluded.player_count,
      max_players = excluded.max_players,
      has_password = excluded.has_password,
      updated_at = excluded.updated_at
  `).bind(
    room.roomCode,
    room.roomName,
    room.gameId,
    room.status,
    room.players.length,
    room.maxPlayers,
    hasPassword ? 1 : 0,
    createdAt,
    Date.now()
  ).run();
}

export async function listOpenRooms(db: D1Database | undefined, staleRoomHours = 24): Promise<readonly RoomListItem[]> {
  if (!db) return [];
  const rows = await db.prepare(`
    SELECT room_code, room_name, game_id, status, player_count, max_players, has_password
    FROM rooms
    WHERE status IN ('OPEN', 'READY') AND updated_at >= ?
    ORDER BY updated_at DESC
    LIMIT 100
  `).bind(Date.now() - staleRoomHours * 60 * 60 * 1000).all<{
    room_code: string; room_name: string; game_id: string; status: "OPEN" | "READY";
    player_count: number; max_players: number; has_password: number;
  }>();
  return rows.results.map((row) => ({
    roomCode: row.room_code,
    roomName: row.room_name,
    gameId: row.game_id,
    status: row.status,
    playerCount: row.player_count,
    maxPlayers: row.max_players,
    hasPassword: row.has_password === 1
  }));
}
