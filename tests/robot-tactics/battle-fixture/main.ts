import { openRobotOfflineStorage } from "../../../src/client/games/robot-tactics/OfflineStorage";
import { mountRobotOfflineApp } from "../../../src/client/games/robot-tactics/OfflineApp";
import { createRobotBattleMount } from "../../../src/client/games/robot-tactics/BattleSessionBridge";
import { RobotOfflineSession } from "../../../src/games/robot-tactics/offlineSession";
import { battleFixtureAdapter, createBattleFixtureRuntime } from "./runtime";
import "../../../apps/robot-tactics/style.css";

const query = new URLSearchParams(location.search);
const session = new RobotOfflineSession(await openRobotOfflineStorage(), createBattleFixtureRuntime(query.get("family") ?? "assault", query.get("sweep") === "3" ? 3 : 2), () => crypto.randomUUID());
await mountRobotOfflineApp(document.getElementById("app")!, { session, mountBattle: createRobotBattleMount(session, battleFixtureAdapter) });
