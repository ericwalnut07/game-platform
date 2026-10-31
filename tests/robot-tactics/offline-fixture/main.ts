import { mountRobotOfflineApp } from "../../../src/client/games/robot-tactics/OfflineApp";
import { openRobotOfflineStorage } from "../../../src/client/games/robot-tactics/OfflineStorage";
import { offlineAddonFixtureProgress } from "../offlineAddonFixture";
import { createRobotOfflineSave, RobotOfflineSession } from "../../../src/games/robot-tactics/offlineSession";
import { offlineFixtureRuntime } from "../offlineFixtureRuntime";
import "../../../apps/robot-tactics/style.css";

const storage = await openRobotOfflineStorage(), profile = new URLSearchParams(location.search).get("profile");
if ((profile === "addons" || profile === "addons-low-cap") && await storage.read() === null) {
  await storage.replace(null, JSON.stringify({ ...createRobotOfflineSave(), progress: offlineAddonFixtureProgress(profile === "addons-low-cap") }));
}
const session = new RobotOfflineSession(storage, offlineFixtureRuntime, () => crypto.randomUUID());
await mountRobotOfflineApp(document.getElementById("app")!, { session, mountBattle(root, battle, _changed, run) {
  const title = document.createElement("h2"); title.textContent = "保存接続の検証用画面";
  const checkpoint = document.createElement("p"); checkpoint.textContent = `確定済み行動 ${battle.sequence}件`;
  const summary = document.createElement("p"); summary.textContent = battle.latestSummary;
  root.append(title, checkpoint, summary);
  for (const [label, action] of [["次の確定行動を検証", {}], ["勝利リザルトを検証", { finish: true }], ["敗北リザルトを検証", { lose: true }]] as const) {
    const button = document.createElement("button"); button.textContent = label; button.type = "button";
    button.onclick = () => { void run(() => session.act({ battleId: battle.departure.battleId, expectedSequence: battle.sequence, actionId: `${battle.departure.battleId}:${battle.sequence}`, action })); };
    root.append(button);
  }
  return () => {};
} });
