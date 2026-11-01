import { openRobotOfflineStorage } from "../../../src/client/games/robot-tactics/OfflineStorage";
import { mountRobotOfflineApp } from "../../../src/client/games/robot-tactics/OfflineApp";
import { createRobotBattleMount } from "../../../src/client/games/robot-tactics/BattleSessionBridge";
import { createRobotOfflineSave, RobotOfflineSession } from "../../../src/games/robot-tactics/offlineSession";
import { createWeaponFixtureRuntime, weaponFixtureAdapter, weaponProgressForCase } from "../weaponFixtureRuntime";
import { isWeaponNormalFixtureCase } from "../weaponNormalFixture";
import { isWeaponAreaFixtureCase } from "../weaponAreaFixture";
import "../../../apps/robot-tactics/style.css";

const value = new URLSearchParams(location.search).get("case");
const kind = isWeaponAreaFixtureCase(value) || isWeaponNormalFixtureCase(value) || value === "binding-movement" || value === "lethal" || value === "win" || value === "addon-energy" || value === "shield" || value === "shield-base" || value === "sweep" || value === "sweep-expanded" ? value : "two-hit";
const storage = await openRobotOfflineStorage();
if (await storage.read() === null) await storage.replace(null, JSON.stringify({ ...createRobotOfflineSave(), progress: weaponProgressForCase(kind) }));
const session = new RobotOfflineSession(storage, createWeaponFixtureRuntime(kind), () => crypto.randomUUID());
await session.load();
if (!session.state.battle && !session.state.result) await session.start({ missionNumber: kind === "win" || kind === "shield" || kind === "shield-base" ? 2 : 30, difficulty: "normal" });
await mountRobotOfflineApp(document.getElementById("app")!, { session, mountBattle: createRobotBattleMount(session, weaponFixtureAdapter) });
