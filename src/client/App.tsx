import { Layout } from "./components/Layout";
import { useHashRoute } from "./lib/router";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { RoomLobbyPage } from "./pages/RoomLobbyPage";
import { TopPage } from "./pages/TopPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { OperationsPage } from "./pages/OperationsPage";
import { CommercialHubRules } from "./games/commercial-hub/CommercialHubRules";
import { RulesPage } from "./pages/RulesPage";

export default function App() {
  const route = useHashRoute();
  let content = <TopPage />;
  if (route.parts[0] === "create") content = <CreateRoomPage initialGameId={route.parts[1] ?? "pon-inai"} />;
  if (route.parts[0] === "join") content = <JoinRoomPage />;
  if (route.parts[0] === "room" && route.parts[1]) content = <RoomLobbyPage roomCode={route.parts[1]} />;
  if (route.parts[0] === "analytics") content = <AnalyticsPage />;
  if (route.parts[0] === "operations") content = <OperationsPage />;
  if (route.parts[0] === "rules") content = route.parts[1] === "commercial-hub" ? <CommercialHubRules /> : <RulesPage />;
  return <Layout>{content}</Layout>;
}
