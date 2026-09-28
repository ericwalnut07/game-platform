import { useEffect, useState } from "react";
import type { LabyrinthView } from "../../../games/two-sided-labyrinth/view";
import { STAGES } from "../../../games/two-sided-labyrinth/catalog";
import type { ClientRoomMessageInput, RoomPublicState } from "../../../shared/room-protocol";
import type { RoomConnectionState } from "../../lib/room-socket";
import { Board } from "./Board";
import { Controls } from "./Controls";
import "./labyrinth.css";
export function formatTime(ms: number) { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }
export function LabyrinthScreen({ view, room, phaseVersion, send, connectionState, pending, error }: {
  view: LabyrinthView; room: RoomPublicState; phaseVersion: number; send: (message: ClientRoomMessageInput) => void;
  connectionState: RoomConnectionState; pending: boolean; error: string | null;
}) {
  const [clock, setClock] = useState({ receivedAt: Date.now(), now: Date.now() });
  useEffect(() => { const now = Date.now(); setClock({ receivedAt: now, now }); }, [view]);
  useEffect(() => { const timer = setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), 200); return () => clearInterval(timer); }, []);
  const elapsed = view.startedAt === null ? 0 : (view.finishedAt ?? view.serverNow + clock.now - clock.receivedAt) - view.startedAt;
  const connected = connectionState === "CONNECTED", disabled = pending || !connected;
  const isHost = room.players.find((p) => p.playerId === view.playerId)?.isHost;
  return <div className="maze" data-phase={view.phase} data-revision={view.revision}>
    <header className="maze-heading"><div><span className="eyebrow">表裏一体迷宮 · ROOM {room.roomCode}</span><h1>{STAGES.find((s) => s.stageId === view.stageId)?.title}</h1>
      <p>あなたは<strong>{view.face === "front" ? "表 · A" : "裏 · B"}</strong>。声をかけ合い、両方のゴールを目指しましょう。</p></div>
      <div className="maze-clock"><time aria-label="経過時間">{formatTime(elapsed)}</time><small>{view.stageId.startsWith("challenge-") ? "オンライン・正式記録対象" : "チュートリアル・参考タイム"}</small></div>
    </header>
    <div className="maze-status"><span className={view.goals.front ? "maze-goal-done" : ""}>表 {view.goals.front ? "✓ 到達済み" : "ゴール未到達"}</span><span className={view.goals.back ? "maze-goal-done" : ""}>裏 {view.goals.back ? "✓ 到達済み" : "ゴール未到達"}</span><span>{view.actions}操作</span></div>
    {!connected && <p role="status" className="maze-notice">再接続中です。操作を停止しています。タイマーは継続します。</p>}
    {room.players.some((p) => p.playerId !== view.playerId && p.connectionStatus === "DISCONNECTED") && <p className="maze-notice">相方が切断中です。復帰を待つ間もタイマーは継続します。</p>}
    {error && <p className="maze-error" role="alert">× {error}</p>}
    {view.phase === "PREPARING" && <section className="maze-card"><h2>準備ができたら開始</h2><p>両者が準備完了を押すと計時が始まります。キーボードの矢印 / WASD、または画面の移動ボタンで操作できます。</p>
      <button type="button" className="primary-button" disabled={disabled || view.ready.includes(view.playerId)} onClick={() => send({ type: "GAME_ACTION", action: { type: "READY" }, phaseVersion })}>{view.ready.includes(view.playerId) ? "相方の準備を待っています" : "この面の準備完了"}</button></section>}
    {view.result && <section className="maze-card maze-result" aria-label="クリア結果"><h2>ふたりでクリア！</h2><strong>{formatTime(view.result.elapsedMs)}</strong><p>{view.result.actions}操作 · {view.result.official ? "オンライン・正式記録" : "チュートリアルの参考タイム"}</p>
      <p>先にゴールした側の到達履歴も保持しています。</p>{isHost ? <div className="maze-buttons"><button type="button" disabled={disabled} onClick={() => send({ type: "REMATCH" })}>同じ面に再挑戦</button><button type="button" disabled={disabled} onClick={() => send({ type: "RETURN_TO_LOBBY" })}>ステージ選択へ</button></div> : <p>次のステージはホストが選択します。</p>}</section>}
    <div className="maze-online-layout"><Board board={view.board}/><div><Controls board={view.board} disabled={disabled || view.phase !== "PLAYING"} send={(action) => send({ type: "GAME_ACTION", action, phaseVersion })}/>
      <p className="maze-hint">赤いGがゴール。到達すると緑になり、戻って相方を助けられます。斜線の装置は進入できません。</p><a href="/#/rules/two-sided-labyrinth" target="_blank" rel="noreferrer">操作とギミックの説明 ↗</a></div></div>
  </div>;
}
