import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "./attackResolution";
import { getRobotCombatWeapon } from "./combatAddons";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate, type RobotWeaponDamageMode } from "./combatMath";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleFacilities, getRobotBattleUnit, isRobotBattleHostileObject, sameRobotCoreCell, type RobotBattleCoreState } from "./battleState";
import type { RobotBattleResolvedAttack } from "./battleBatch";
import type { RobotPosition } from "./movement";

export interface RobotSpecialFacilityCell {
  readonly objectId: string;
  readonly cell: RobotPosition;
}

/** Damage-only attack eligibility. No dummy robot, EN, status or movement is
 * created for objects. Every footprint cell has its own existing range/LOS.
 * The Core object ID still owns exactly one HP pool.
 */
export function getRobotSpecialFacilityCells(
  s: RobotBattleCoreState, sourceId: string, weaponId: string,
  range: { readonly min: number; readonly max: number },
  origin?: RobotPosition,
): readonly RobotSpecialFacilityCell[] {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, sourceId);
  if (!actor.unitIds.includes(sourceId) || source.hp <= 0 || !source.position || source.statuses.length) return [];
  const selection = source.parts.find(p => p.partId === weaponId);
  if (!selection) return [];
  const weapon = getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level), source.addons);
  if (weapon.slot !== "weapon" || !weapon.weaponFamily) return [];
  const from = origin ?? source.position;
  return getRobotBattleFacilities(s).filter(o => o.hp > 0 && isRobotBattleHostileObject(s,source.id,o.id))
    .flatMap(object => object.cells.filter(cell => checkRobotAttackSpatial({
      kind: "normal",
      range: checkRobotAttackRange({ origin: from, target: cell, ...range }),
      sight: { board: s.board, origin: from, target: cell },
    }).canReach).map(cell => ({ objectId: object.id, cell: { ...cell } })));
}

/** Common special packet: same base attack, DEF, single minimum-1 floor and
 * objective settlement as other resolved attacks; special multipliers only.
 * The caller validates mode, cost, multi-target geometry and optional effects.
 */
export function getRobotSpecialFacilityPacket(
  s: RobotBattleCoreState,
  sourceId: string,
  weaponId: string,
  targetId: string,
  attackId: string,
  range: { readonly min: number; readonly max: number },
  multiplier: number,
  options: {
    readonly mode?: RobotWeaponDamageMode;
    readonly defenseMultiplier?: number;
    readonly preferredCell?: RobotPosition;
    /** Secondary area damage is bound to this already legal impact location,
     * not to a new wall/range ray from the firing robot. */
    readonly splashCenter?: RobotPosition;
  } = {},
): RobotBattleResolvedAttack {
  const source = getRobotBattleUnit(s, sourceId), selection = source.parts.find(p => p.partId === weaponId);
  if (!selection) throw new Error("Equipped special weapon required");
  const weapon = getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level),source.addons);
  if (!weapon.weaponFamily) throw new Error("Special weapon family required");
  const facility = getRobotBattleFacilities(s).find(o => o.id === targetId);
  if (!facility || facility.hp <= 0 || !isRobotBattleHostileObject(s,source.id,targetId)) throw new Error("Living hostile facility required");
  const cells = options.splashCenter
    ? facility.cells.filter(c => Math.max(Math.abs(c.x-options.splashCenter!.x),Math.abs(c.y-options.splashCenter!.y)) === 1)
        .map(c => ({ objectId: targetId, cell: c }))
    : getRobotSpecialFacilityCells(s, sourceId, weaponId, range).filter(c => c.objectId === targetId);
  const hit = options.preferredCell
    ? cells.find(c => sameRobotCoreCell(c.cell, options.preferredCell!))
    : cells[0];
  if (!hit) throw new Error("Illegal special facility footprint (range/LOS or splash)");
  const stats = getRobotBattleEffectiveStats(source), bonus = getRobotBattleCommandBonus(s,sourceId,targetId);
  const base = getRobotWeaponDamageEstimate({
    weaponId: weapon.id, weaponLevel: weapon.level,
    attackStats: { melee: stats.melee+bonus.melee, ranged: stats.ranged+bonus.ranged },
    targetDef: facility.def * (options.defenseMultiplier ?? 1),
    mode: options.mode ?? "normal",
  }).baseDamage;
  const resolution = resolveRobotTargetDamage({
    attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null },
    effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base,[multiplier]) },
  });
  return {
    id: attackId, sourceId, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"],
    targets: [{ entityId: targetId, cells: [{ ...hit.cell }], resolution }],
  };
}

/** Geometry for effects based on a target square; unit and object share the
 * same target-ID selection UI but never share unit-only status handling. */
export function getRobotSpecialTargetCells(s: RobotBattleCoreState, id: string): readonly RobotPosition[] {
  const unit = s.units.find(u => u.id===id&&u.hp>0&&u.position);
  if (unit) return [unit.position!];
  return getRobotBattleFacilities(s).find(o => o.id===id&&o.hp>0)?.cells ?? [];
}
