import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { createRobotBattleMount } from "../../src/client/games/robot-tactics/BattleSessionBridge";
import { mountRobotOfflineApp } from "../../src/client/games/robot-tactics/OfflineApp";
import { openRobotOfflineStorage } from "../../src/client/games/robot-tactics/OfflineStorage";
import { RobotOfflineSession } from "../../src/games/robot-tactics/offlineSession";
import "./style.css";

const root = document.getElementById("app")!;
// Production Core, adopted stage factory, persisted initiative and actual NPC planner.
void openRobotOfflineStorage().then(storage => {
  const session = new RobotOfflineSession(storage, robotFormalRuntime, () => crypto.randomUUID());
  return mountRobotOfflineApp(root, { session, mountBattle: createRobotBattleMount(session, robotFormalBattleAdapter) });
}).catch(() => {
  root.textContent = "端末内の保存領域を開けませんでした。保存を許可した環境で再度起動してください。";
});
