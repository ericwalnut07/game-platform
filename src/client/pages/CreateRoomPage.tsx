import { FormEvent, useEffect, useState } from "react";
import type { GameCatalogItem } from "../../shared/api";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { saveRoomCredentials } from "../lib/session";
import { TerritorySettings } from "../games/ooishi-territory/TerritorySettings";
import { TERRITORY_PRESETS, type TerritoryConfig } from "../../games/ooishi-territory/engine";

export function CreateRoomPage({ initialGameId = "pon-inai" }: { initialGameId?: string }) {
  const [gameId, setGameId] = useState(initialGameId);
  const [games, setGames] = useState<readonly GameCatalogItem[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [password, setPassword] = useState("");
  const [gameCount, setGameCount] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [territoryConfig, setTerritoryConfig] = useState<TerritoryConfig>({ ...TERRITORY_PRESETS[3] });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.games().then(setGames).catch(() => setError("ゲーム一覧を取得できませんでした")); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const result = await api.createRoom({
        gameId,
        displayName: displayName.trim(),
        roomName: roomName.trim(),
        password,
        gameConfig: gameId === "commercial-hub" ? {} : gameId === "ooishi-territory" ? territoryConfig : { gameCount }
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
          <select aria-label="ゲーム" className="game-select" value={gameId} onChange={(e) => setGameId(e.target.value)}>{games.map((game) => <option key={game.id} value={game.id}>{game.title}（{game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}〜${game.maxPlayers}`}人）</option>)}</select>
          <small>{games.find((game) => game.id === gameId)?.description}</small>
        </label>
        <label>あなたの名前
          <input required maxLength={20} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例：ヒロキ" />
        </label>
        <label>部屋名
          <input required maxLength={30} value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="例：今夜の宇宙旅行" />
        </label>
        {gameId === "pon-inai" && <label>ゲーム数
          <div className="stepper">
            <button type="button" disabled={gameCount === 1} onClick={() => setGameCount((gameCount - 1) as 1 | 2 | 3 | 4 | 5)}>−</button>
            <strong>{gameCount}</strong>
            <button type="button" disabled={gameCount === 5} onClick={() => setGameCount((gameCount + 1) as 1 | 2 | 3 | 4 | 5)}>＋</button>
          </div>
          <small>標準は3ゲームです</small>
        </label>}
        {gameId === "commercial-hub" && <p>4人・1ゲームの試作版です。目安60〜90分（実地検証前）。</p>}
        {gameId === "ooishi-territory" && <div className="ooishi" style={{ width: "100%" }}><p>人数とルールを選択してください。部屋作成後、全員が揃うと開始できます。</p><TerritorySettings value={territoryConfig} onChange={setTerritoryConfig}/></div>}
        <label>部屋パスワード
          <input type="password" maxLength={64} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="空欄ならパスワードなし" />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button" disabled={submitting || !games.some((game) => game.id === gameId)}>{submitting ? "作成中…" : "部屋を作る"}</button>
      </form>
    </section>
  );
}
