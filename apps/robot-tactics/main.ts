import { mountRobotOfflineApp } from "../../src/client/games/robot-tactics/OfflineApp";
import { openRobotOfflineStorage } from "../../src/client/games/robot-tactics/OfflineStorage";
import { RobotOfflineSession } from "../../src/games/robot-tactics/offlineSession";
import "./style.css";

const root = document.getElementById("app")!;
// No legacy prototype or unapproved battle resolver is registered as a substitute.
void openRobotOfflineStorage().then(storage => mountRobotOfflineApp(root, { session: new RobotOfflineSession(storage, null, () => crypto.randomUUID()) })).catch(() => {
  root.textContent = "端末内の保存領域を開けませんでした。保存を許可した環境で再度起動してください。";
});
