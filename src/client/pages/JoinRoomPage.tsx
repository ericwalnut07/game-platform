import { FormEvent, useEffect, useState } from "react";
import type { RoomListItem } from "../../shared/api";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { saveRoomCredentials } from "../lib/session";

export function JoinRoomPage() {
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [rooms, setRooms] = useState<readonly RoomListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.rooms().then(setRooms).catch(() => undefined); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSubmitting(true);
    try {
      const code = roomCode.trim().toUpperCase();
      const result = await api.joinRoom(code, { displayName: displayName.trim(), password });
      saveRoomCredentials(result);
      navigate(`/room/${result.roomCode}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "入室できませんでした");
    } finally { setSubmitting(false); }
  }

  return (
    <section className="panel wide">
      <button className="text-button" onClick={() => navigate("/")}>← TOPへ</button>
      <div className="eyebrow">JOIN ROOM</div>
      <h1>部屋に入る</h1>
      <div className="join-grid">
        <form onSubmit={submit} className="form-stack">
          <h2>部屋コードで入る</h2>
          <label>部屋コード
            <input required maxLength={8} value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="K7M4Q2" />
          </label>
          <label>あなたの名前
            <input required maxLength={20} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>パスワード
            <input type="password" maxLength={64} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-button" disabled={submitting}>{submitting ? "接続中…" : "入室"}</button>
        </form>
        <div>
          <h2>募集中の部屋</h2>
          <div className="room-list">
            {rooms.length === 0 && <div className="empty-state">現在表示できる公開部屋はありません。</div>}
            {rooms.map((room) => (
              <button key={room.roomCode} className="room-row" onClick={() => setRoomCode(room.roomCode)}>
                <span><strong>{room.roomName}</strong><small>{room.gameId === "commercial-hub" ? "商都開発" : "ポンはいない"} ・ {room.playerCount}/{room.maxPlayers}人</small></span>
                <span>{room.hasPassword ? "🔒" : "○"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
