import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { saveRoomCredentials } from "../lib/session";

export function CreateRoomPage() {
  const [displayName, setDisplayName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [gameCount, setGameCount] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const result = await api.createRoom({
        gameId: "pon-inai",
        displayName: displayName.trim(),
        roomName: roomName.trim(),
        password,
        gameConfig: { gameCount }
      });
      saveRoomCredentials(result);
      navigate(`/room/${result.roomCode}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "部屋を作成できませんでした");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel narrow">
      <button className="text-button" onClick={() => navigate("/")}>← TOPへ</button>
      <div className="eyebrow">CREATE ROOM</div>
      <h1>部屋を作る</h1>
      <form onSubmit={submit} className="form-stack">
        <label>ゲーム
          <div className="game-choice selected">
            <strong>ポンはいない</strong>
            <span>3〜4人・オンライン専用</span>
          </div>
        </label>
        <label>あなたの名前
          <input required maxLength={20} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：ヒロキ" />
        </label>
        <label>部屋名
          <input required maxLength={30} value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="例：今夜の宇宙旅行" />
        </label>
        <label>ゲーム数
          <div className="stepper">
            <button type="button" disabled={gameCount === 1} onClick={() => setGameCount((gameCount - 1) as 1 | 2 | 3 | 4 | 5)}>−</button>
            <strong>{gameCount}</strong>
            <button type="button" disabled={gameCount === 5} onClick={() => setGameCount((gameCount + 1) as 1 | 2 | 3 | 4 | 5)}>＋</button>
          </div>
          <small>標準は3ゲームです</small>
        </label>
        <label>部屋パスワード
          <input type="password" maxLength={64} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="空欄ならパスワードなし" />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button" disabled={submitting}>{submitting ? "作成中…" : "部屋を作る"}</button>
      </form>
    </section>
  );
}
