import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientRoomMessage, ClientRoomMessageInput, RoomPublicState, ServerRoomMessage } from "../../shared/room-protocol";
import type { PonInaiMatchPlayerView } from "../../games/pon-inai/module";
import { navigate } from "../lib/router";
import { clearRoomCredentials, loadRoomCredentials } from "../lib/session";
import { requestId, RoomSocket, type RoomConnectionState } from "../lib/room-socket";
import { CommercialHubScreen } from "../games/commercial-hub/CommercialHubScreen";
import type { HubView } from "../../games/commercial-hub/view";
import { PonInaiGameScreen } from "../games/pon-inai/PonInaiGameScreen";

function gameCountOf(room: RoomPublicState): number {
  const config = room.gameConfig as { gameCount?: number } | null;
  return config?.gameCount ?? 3;
}


export function RoomLobbyPage({ roomCode }: { roomCode: string }) {
  const credentials = useMemo(() => loadRoomCredentials(roomCode), [roomCode]);
  const [room, setRoom] = useState<RoomPublicState | null>(null);
  const [gameView, setGameView] = useState<unknown>(null);
  const [phaseVersion, setPhaseVersion] = useState(0);
  const [connectionState, setConnectionState] = useState<RoomConnectionState>("CONNECTING");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingId = useRef<string | null>(null);
  const socket = useMemo(() => new RoomSocket(), []);

  useEffect(() => {
    if (!credentials) return;
    socket.connect(credentials, (message: ServerRoomMessage) => {
      if (message.type === "ROOM_STATE") setRoom(message.room);
      if (message.type === "GAME_VIEW") { setGameView(message.gameView); setPhaseVersion(message.phaseVersion); }
      if (message.type === "ERROR") setError(message.message);
      if ((message.type === "ACTION_ACCEPTED" || message.type === "ERROR") && message.requestId === pendingId.current) { pendingId.current = null; setPending(false); }
    }, (state) => { setConnectionState(state); if (state !== "CONNECTED") { pendingId.current = null; setPending(false); } if (state === "CONNECTED") setError(null); });
    return () => socket.close();
  }, [credentials, socket]);



  const me = room?.players.find((p) => p.playerId === credentials?.playerId);
  const isHost = me?.isHost ?? false;

  useEffect(() => {
    if (!isHost || !room || (room.status !== "OPEN" && room.status !== "READY") || connectionState !== "CONNECTED") return;
    const beat = () => {
      if (!socket.isConnected()) return;
      try { socket.send({ type: "HEARTBEAT", requestId: requestId() }); } catch { /* reconnect flow handles transport loss */ }
    };
    beat();
    const timer = window.setInterval(beat, 3_000);
    return () => window.clearInterval(timer);
  }, [isHost, room?.status, connectionState, socket]);

  if (!credentials) {
    return <section className="panel narrow"><h1>入室情報がありません</h1><p>部屋コードから入り直してください。</p><button className="primary-button" onClick={() => navigate("/join")}>部屋に入る</button></section>;
  }
  function sendMessage(message: ClientRoomMessage): boolean {
    if (!socket.isConnected()) {
      setError("接続が戻るまで操作できません");
      return false;
    }
    try { socket.send(message); return true; }
    catch { setError("通信が切れました。自動で再接続します"); return false; }
  }

  function sendReady() {
    if (!me || isHost) return;
    sendMessage({ type: "SET_READY", ready: !me.isReady, requestId: requestId() });
  }

  function start() {
    sendMessage({ type: "START_MATCH", requestId: requestId() });
  }

  function changeGameCount(delta: -1 | 1) {
    if (!room || !isHost || (room.status !== "OPEN" && room.status !== "READY")) return;
    const current = gameCountOf(room);
    const gameCount = Math.max(1, Math.min(5, current + delta)) as 1 | 2 | 3 | 4 | 5;
    if (gameCount === current) return;
    sendMessage({ type: "UPDATE_GAME_CONFIG", gameConfig: { gameCount }, requestId: requestId() });
  }

  function leave() {
    if (socket.isConnected()) sendMessage({ type: "LEAVE_ROOM", requestId: requestId() });
    clearRoomCredentials();
    navigate("/");
  }

  if ((room?.status === "PLAYING" || room?.status === "FINISHED") && gameView) {
    const send = (message: ClientRoomMessageInput) => {
      if (room.gameId === "commercial-hub" && pendingId.current) return;
      const id = requestId();
      if (room.gameId === "commercial-hub") { pendingId.current = id; setPending(true); setError(null); }
      if (!sendMessage({ ...message, requestId: id } as ClientRoomMessage)) { pendingId.current = null; setPending(false); }
    };
    if (room.gameId === "commercial-hub") return <CommercialHubScreen room={room} view={gameView as HubView} phaseVersion={phaseVersion} send={send} connectionState={connectionState} pending={pending} error={error}/>;
    return <PonInaiGameScreen room={room} view={gameView as PonInaiMatchPlayerView} phaseVersion={phaseVersion} send={send} connectionState={connectionState} onReenter={() => { clearRoomCredentials(); navigate("/join"); }} />;
  }

  return (
    <section className="panel wide">
      <div className="room-heading">
        <div><div className="eyebrow">ROOM {roomCode}</div><h1>{room?.roomName ?? "部屋に接続中…"}</h1></div>
        <div className={`connection-pill connection-${connectionState.toLowerCase()}`} role="status" aria-live="polite">{connectionState === "CONNECTED" ? "● 接続中" : connectionState === "OFFLINE" ? "○ オフライン" : connectionState === "RECONNECTING" ? "↻ 再接続中" : connectionState === "CLOSED" ? "○ 切断" : "○ 接続中…"}</div>
      </div>
      {error && <div className="error-box" role="alert">{error}</div>}
      {room && <>
        <div className="room-summary">
          <div><span>ゲーム</span><strong>{room.gameId === "commercial-hub" ? "商都開発" : "ポンはいない"}</strong></div>
          <div><span>ゲーム数</span>{room.gameId === "commercial-hub" ? <strong>1</strong> : isHost && (room.status === "OPEN" || room.status === "READY") ? <div className="lobby-stepper" aria-label="ゲーム数"><button type="button" disabled={gameCountOf(room)<=1 || connectionState !== "CONNECTED"} onClick={()=>changeGameCount(-1)}>−</button><strong>{gameCountOf(room)}</strong><button type="button" disabled={gameCountOf(room)>=5 || connectionState !== "CONNECTED"} onClick={()=>changeGameCount(1)}>＋</button></div> : <strong>{gameCountOf(room)}</strong>}</div>
          <div><span>人数</span><strong>{room.players.length} / {room.maxPlayers}</strong></div>
        </div>
        <div className="lobby-help"><strong>初プレイの人がいる場合</strong><span>{room.gameId === "commercial-hub" ? "4人で最後まで遊ぶ試作版です。自分の手札は他の人に見せません。" : "開始前にルールを確認してください。ミッションと秘密の性格は他の人に見せません。"}</span><a href={room.gameId === "commercial-hub" ? "/#/rules/commercial-hub" : "/#/rules"} target="_blank" rel="noreferrer">ルールを別タブで見る</a></div>
        <div className="player-list">
          {room.players.map((player) => (
            <div className="player-row" key={player.playerId}>
              <span><strong>{player.displayName}</strong>{player.isHost && <em>HOST</em>}</span>
              <span>{player.connectionStatus === "DISCONNECTED" ? "切断中" : player.isHost ? "準備済み" : player.isReady ? "準備OK" : "待機中"}</span>
            </div>
          ))}
          {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }, (_, i) => <div className="player-row empty" key={i}>空き</div>)}
        </div>
        <div className="lobby-actions">
          {!isHost && <button className="primary-button" disabled={connectionState !== "CONNECTED"} onClick={sendReady}>{me?.isReady ? "準備を解除" : "準備OK"}</button>}
          {isHost && <button className="primary-button" disabled={room.status !== "READY" || connectionState !== "CONNECTED"} onClick={start}>ゲーム開始</button>}
          <button className="secondary-button" onClick={leave}>部屋を出る</button>
        </div>
        {isHost && room.status !== "READY" && <p className="muted-copy">{room.minPlayers}人以上参加し、全ゲストが準備OKになると開始できます。</p>}
      </>}
    </section>
  );
}
