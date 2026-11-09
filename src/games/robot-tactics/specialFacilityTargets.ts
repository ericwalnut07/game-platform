import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "./attackResolution";
import { getRobotCombatWeapon } from "./combatAddons";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate, type RobotWeaponDamageMode } from "./combatMath";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleFacilities, getRobotBattleUnit, isRobotBattleHostileObject, sameRobotCoreCell, type RobotBattleCoreState } from "./battleState";
import type { RobotBattleResolvedAttack } from "./battleBatch";
import type { RobotPosition } from "./movement";

/** Only damage-bearing special actions may use this target adapter. It does not
 * grant a facility unit statuses, recoil, movement or unit-only effects.
 */
export function getRobotSpecialFacilityTargets(
  s: RobotBattleCoreState, sourceId: string, weaponId: string, range: { min: number; max: number },
): readonly { objectId: string; cell: RobotPosition }[] {
  const source = getRobotBattleUnit(s, sourceId), selected = source.parts.find(p => p.partId === weaponId);
  if (!source.position || !selected) throw new Error("Current equipped special weapon required");
  const weapon = getRobotCombatWeapon(resolveRobotBasicPart(selected.partId, selected.level), source.addons);
  if (weapon.slot !== "weapon") throw new Error("Equipped weapon required");
  return getRobotBattleFacilities(s).filter(f => f.hp > 0 && isRobotBattleHostileObject(s, sourceId, f.id)).flatMap(f =>
    f.cells.filter(cell => checkRobotAttackSpatial({
      kind: "normal",
      range: checkRobotAttackRange({ origin: source.position!, target: cell, min: range.min, max: range.max }),
      sight: { board: s.board, origin: source.position!, target: cell },
    }).canReach).map(cell => ({ objectId: f.id, cell: { ...cell } })));
}

export function getRobotSpecialFacilityPacket(
  s: RobotBattleCoreState, sourceId: string, weaponId: string, objectId: string,
  cell: RobotPosition, attackId: string, range: { min: number; max: number },
  multiplier: number, mode: RobotWeaponDamageMode = "normal", defenseMultiplier = 1,
): RobotBattleResolvedAttack {
  const source = getRobotBattleUnit(s, sourceId), selection = source.parts.find(p => p.partId === weaponId);
  const object = getRobotBattleFacilities(s).find(f => f.id === objectId);
  if (!selection || !object || !getRobotSpecialFacilityTargets(s, sourceId, weaponId, range).some(t =>
    t.objectId === objectId && sameRobotCoreCell(t.cell, cell))) throw new Error("Illegal hostile special facility target");
  const weapon = getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level), source.addons);
  const bonus = getRobotBattleCommandBonus(s, source.id, objectId), stats = getRobotBattleEffectiveStats(source);
  const base = getRobotWeaponDamageEstimate({
    weaponId: weapon.id, weaponLevel: weapon.level,
    attackStats: { melee: stats.melee + bonus.melee, ranged: stats.ranged + bonus.ranged },
    targetDef: object.def * defenseMultiplier, mode,
  }).baseDamage;
  return { id: attackId, sourceId, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"],
    targets: [{ entityId: objectId, cells: [{ ...cell }],
      resolution: resolveRobotTargetDamage({ attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null },
        effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base, [multiplier]) } }) }] };
}
