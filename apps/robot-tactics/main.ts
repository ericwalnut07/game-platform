import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { createRobotBattleMount } from "../../src/client/games/robot-tactics/BattleSessionBridge";
import { mountRobotOfflineApp } from "../../src/client/games/robot-tactics/OfflineApp";
import { openRobotPlayableStorage } from "../../src/client/games/robot-tactics/OfflineStorage";
import { RobotOfflineSession } from "../../src/games/robot-tactics/offlineSession";
import "./style.css";

const root = document.getElementById("app")!;
const makeId = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() :
  Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
// Production Core, adopted stage factory, persisted initiative and actual NPC planner.
void openRobotPlayableStorage().then(({ storage, storageNotice }) => {
  const session = new RobotOfflineSession(storage, robotFormalRuntime, makeId);
  return mountRobotOfflineApp(root, { session, ...(storageNotice ? { storageNotice } : {}),
    mountBattle: createRobotBattleMount(session, robotFormalBattleAdapter, makeId) });
}).catch(() => {
  root.textContent = "端末内の保存領域を開けませんでした。保存を許可した環境で再度起動してください。";
});
