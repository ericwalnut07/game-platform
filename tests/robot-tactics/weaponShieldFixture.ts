/** Fixed legal enemy attack for shield integration tests; no production AI. */
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { beginRobotBattleTurn, getRobotBattleUnit, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { getRobotBattlePostBaseModifiers } from "../../src/games/robot-tactics/battleWeaponActions";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { checkRobotAttackRange } from "../../src/games/robot-tactics/attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
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
  const source = getRobotBattleUnit(s, "commander"), target = getRobotBattleUnit(s, "p1"), weapon = resolveRobotBasicPart("assault-rifle", source.parts.find(p => p.partId === "assault-rifle")!.level);
  const spatial = checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: target.position!, min: weapon.range!.min, max: weapon.range!.max }), sight: { board: s.board, origin: source.position!, target: target.position! } });
  const base = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: source.stats, targetDef: target.stats.def, mode: "normal" }).baseDamage;
  const factors = getRobotBattlePostBaseModifiers(s, source, target);
  const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base, factors) } });
  if (resolution.reason !== "hit") throw new Error("Shield fixture attack must be legal");
  return commitRobotBattleBatch(s, { ...identity, summary: `指揮機：射撃 → p1、${resolution.damage}ダメージ`, members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: 0 } }], attacks: [{ id: identity.actionId + ":hit", sourceId: source.id, effectKind: "assault", targets: [{ entityId: target.id, cells: [target.position!], resolution }] }] });
}
