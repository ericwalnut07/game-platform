import { Layout } from "../../../src/client/components/Layout";
import "../../../src/client/styles.css";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CommercialHubScreen } from "../../../src/client/games/commercial-hub/CommercialHubScreen";
import type { HubView } from "../../../src/games/commercial-hub/view";
import type { HubClientAction } from "../../../src/games/commercial-hub/state";
import type { RoomPublicState } from "../../../src/shared/room-protocol";
declare global {
  interface Window {
    __projectScoreView: () => Promise<HubView>;
    __projectScoreDispatch: (action: HubClientAction) => Promise<HubView>;
  }
}
function Fixture() {
  const [view, setView] = useState<HubView | null>(null);
  useEffect(() => { void window.__projectScoreView().then(setView); }, []);
  if (!view) return <p>読み込み中</p>;
  const room: RoomPublicState = { roomCode: "SCORE1", roomName: "公共事業の得点", gameId: "commercial-hub", status: view.result ? "FINISHED" : "PLAYING", minPlayers: 4, maxPlayers: 4, gameConfig: view.config,
    players: view.players.map(id => ({ playerId: id, displayName: id, isHost: id === "A", isReady: true, connectionStatus: "CONNECTED" })) };
  return <Layout><CommercialHubScreen room={room} view={view} phaseVersion={view.revision} connectionState="CONNECTED" pending={false} error={null}
    send={message => { if (message.type === "GAME_ACTION") void window.__projectScoreDispatch(message.action as HubClientAction).then(setView); }}/></Layout>
}
createRoot(document.getElementById("root")!).render(<Fixture/>);

