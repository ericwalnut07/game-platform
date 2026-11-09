import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "./attackResolution";
import { getRobotCombatWeapon } from "./combatAddons";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate, type RobotWeaponDamageMode } from "./combatMath";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotLegalMoves, type RobotPosition } from "./movement";
import { getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleFacilities, getRobotBattleStructures, getRobotBattleUnit, isRobotBattleHostileObject, sameRobotCoreCell, type RobotBattleCoreState } from "./battleState";
import type { RobotBattleResolvedAttack } from "./battleBatch";

type Range = { readonly min: number; readonly max: number };
const distance = (a: RobotPosition, b: RobotPosition) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Special commands target the existing shared-HP facility, never a pseudo unit.
 * A hostile footprint cell must pass the SAME range/LOS checks as a robot.
 * The client selects an object ID; the server chooses a valid footprint cell. */
export function getRobotSpecialFacilityCell(s: RobotBattleCoreState, sourceId: string, weaponId: string, targetId: string, range: Range, origin?: RobotPosition): RobotPosition | null {
  const source = getRobotBattleUnit(s, sourceId), position = origin ?? source.position;
  const selection = source.parts.find(p => p.partId === weaponId);
  if (!position || !selection) return null;
  const weapon = getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level), source.addons);
  if (weapon.slot !== "weapon" || !weapon.range) return null;
  const object = getRobotBattleFacilities(s).find(o => o.id === targetId);
  if (!object || object.hp <= 0 || !isRobotBattleHostileObject(s, sourceId, targetId)) return null;
  return object.cells.find(cell => checkRobotAttackSpatial({
    kind: "normal",
    range: checkRobotAttackRange({ origin: position, target: cell, min: range.min, max: range.max }),
    sight: { board: s.board, origin: position, target: cell }
  }).canReach) ?? null;
}

export function getRobotSpecialFacilityTargetIds(s: RobotBattleCoreState, sourceId: string, weaponId: string, range: Range): string[] {
  return getRobotBattleFacilities(s).filter(o => getRobotSpecialFacilityCell(s, sourceId, weaponId, o.id, range) !== null).map(o => o.id);
}

/** Special attacks damage facility HP but cannot impose robot-only statuses,
 * debuffs, displacement, burning, immobilization or EN effects on objects. */
export function getRobotSpecialFacilityPacket(
  s: RobotBattleCoreState, sourceId: string, weaponId: string, targetId: string,
  attackId: string, range: Range, multiplier: number,
  mode: RobotWeaponDamageMode = "normal", defenseMultiplier = 1, exactCell?: RobotPosition
): RobotBattleResolvedAttack {
  const source = getRobotBattleUnit(s, sourceId), selection = source.parts.find(p => p.partId === weaponId);
  if (!selection || source.hp <= 0 || !source.position || !Number.isFinite(multiplier) || multiplier < 0 || !Number.isFinite(defenseMultiplier) || defenseMultiplier < 0) throw new Error("Invalid special facility attacker");
  const weapon = getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level), source.addons);
  const cell = getRobotSpecialFacilityCell(s, sourceId, weaponId, targetId, range);
  const target = getRobotBattleFacilities(s).find(o => o.id === targetId);
  if (!target || !cell) throw new Error("Illegal hostile special facility target");
  const chosen = exactCell ?? cell;
  if (!target || !chosen || !target.cells.some(c => sameRobotCoreCell(c, chosen)) ||
    !checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position, target: chosen, ...range }), sight: { board: s.board, origin: source.position, target: chosen } }).canReach) throw new Error("Illegal special facility footprint cell");
  const stats = getRobotBattleEffectiveStats(source), bonus = getRobotBattleCommandBonus(s, source.id, target.id);
  const base = getRobotWeaponDamageEstimate({
    weaponId: weapon.id, weaponLevel: weapon.level,
    attackStats: { melee: stats.melee + bonus.melee, ranged: stats.ranged + bonus.ranged },
    targetDef: target.def * defenseMultiplier, mode
  }).baseDamage;
  return {
    id: attackId, sourceId, effectKind: weapon.weaponFamily!,
    targets: [{ entityId: target.id, cells: [{ ...chosen }], resolution: resolveRobotTargetDamage({
      attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null },
      effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base, [multiplier]) }
    }) }]
  };
}

/** Charge stops before, never inside, any occupied facility cell. */
export function getRobotChargeFacilityLanding(s: RobotBattleCoreState, sourceId: string, targetId: string, advance: number, requiredDistance: number, weaponId: string): { landing: RobotPosition; cell: RobotPosition } | null {
  const source = getRobotBattleUnit(s, sourceId), target = getRobotBattleFacilities(s).find(o => o.id === targetId);
  if (!source.position || !target || target.hp <= 0 || !isRobotBattleHostileObject(s, sourceId, targetId)) return null;
  for (const cell of target.cells) {
    if (distance(source.position, cell) !== requiredDistance) continue;
    let position = source.position, legalPath = true;
    for (let i = 0; i < advance; i++) {
      const next = { x: position.x + Math.sign(cell.x - position.x), y: position.y + Math.sign(cell.y - position.y) };
      const legal = getRobotLegalMoves({ board: s.board, origin: position, mov: 1, types: ["omni"], facing: "north", occupied: s.units.filter(v => v.id !== sourceId && v.hp > 0).map(v => v.position!), structures: getRobotBattleStructures(s) });
      if (!legal.some(m => sameRobotCoreCell(m.destination, next))) { legalPath = false; break; }
      position = next;
    }
    if (legalPath && getRobotSpecialFacilityCell(s, sourceId, weaponId, targetId, { min: 1, max: 1 }, position)) return { landing: position, cell };
  }
  return null;
}
