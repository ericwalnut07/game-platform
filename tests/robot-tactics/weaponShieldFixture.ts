/** Fixed legal enemy attack for shield integration tests; no production AI. */
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { beginRobotBattleTurn, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleNormalAttack } from "../../src/games/robot-tactics/battleWeaponActions";
import { offlineAddonFixtureProgress } from "./offlineAddonFixture";
import { weaponCoreFixture } from "./weaponCoreFixture";

export function weaponShieldFixtureProgress(amplified = true) {
  let p = offlineAddonFixtureProgress();
  p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot: "special", partId: "shield-support" });
  for (let i = 0; i < 2; i++) p = applyRobotCustomization(p, { kind: "part-upgrade", coreId: "core-a", partId: "shield-support" });
  if (amplified) p = applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-a", partId: "shield-amplifier" });
  return p;
}
export function weaponShieldCoreFixture(amplified = true, id = "shield-core-fixture") {
  const s = weaponCoreFixture({ id, mission: 2, progress: weaponShieldFixtureProgress(amplified), sourceHp: 150, targetIds: ["commander"], offsets: [{ x: -1, y: 0 }], openTurn: false });
  return beginRobotBattleTurn(s, "p1");
}
export function commitWeaponShieldFixtureEnemyAttack(s: RobotBattleCoreState, identity: { actionId: string; turnId: string }) {
  if (s.turn.actorId !== "commander") throw new Error("Fixed shield fixture enemy turn required");
  return commitRobotBattleNormalAttack(s, { ...identity, weaponId: "assault-rifle", targetId: "p1" });
}
