import { getRobotAreaNeighborCells, getRobotBlastPlan } from "./blast";
import { calculateRobotBaseDamage, floorRobotDamageProduct } from "./combatMath";
import { resolveRobotTargetDamage } from "./attackResolution";
import { resolveRobotBasicPart } from "./equipment";
import { applyRobotPhaseDamage, getRobotBattleDefense, getRobotDamageFactors } from "./battleEffects";
import { getRobotBattleUnit, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleDamageEvent } from "./battleState";
import type { RobotFuseBomb, RobotFuseExplosion } from "./fuseTypes";

export interface RobotFuseTrigger { readonly directHits?: readonly { readonly sourceId: string; readonly targetId: string }[]; readonly endUnitIds?: readonly string[] }
/** A finite work list of armed IDs, ordered by placement. Mark before damage;
 * explosion hits may enqueue other bombs but never dispatch reaction attacks.
 */
export function resolveRobotFuses(s: RobotBattleCoreState, trigger: RobotFuseTrigger) {
  if (!s.fuses?.bombs.some(b => b.state === "armed")) return { state: s, events: [] as RobotBattleDamageEvent[] };
  let next: RobotBattleCoreState = { ...s, fuses: { ...s.fuses, bombs: s.fuses.bombs.map(b => { const p = getRobotBattleUnit(s, b.targetId).position; return b.state === "armed" && p ? { ...b, lastPosition: { ...p } } : b; }) } };
  const pending = new Set<string>(), events: RobotBattleDamageEvent[] = [], explosions: RobotFuseExplosion[] = [];
  function enqueue(b: RobotFuseBomb, blastHits: ReadonlySet<string> = new Set()) {
    if (b.state !== "armed") return;
    const target = getRobotBattleUnit(next, b.targetId), owner = getRobotBattleUnit(next, b.sourceId);
    if (target.hp === 0 || blastHits.has(b.targetId) || trigger.endUnitIds?.includes(target.id) && target.energy.ownTurn >= b.dueOwnTurn || trigger.directHits?.some(h => h.targetId === b.targetId && h.sourceId !== b.sourceId && robotBattleIsAlly(getRobotBattleUnit(next, h.sourceId)) === robotBattleIsAlly(owner))) pending.add(b.id);
  }
  next.fuses!.bombs.forEach(b => enqueue(b));
  while (pending.size) {
    const bomb = next.fuses!.bombs.find(b => b.state === "armed" && pending.has(b.id));
    if (!bomb) break;
    pending.delete(bomb.id);
    next = { ...next, fuses: { ...next.fuses!, bombs: next.fuses!.bombs.map(b => b.id === bomb.id ? { ...b, state: "detonated" as const } : b) } };
    const center = getRobotBattleUnit(next, bomb.targetId).position ?? bomb.lastPosition, owner = getRobotBattleUnit(next, bomb.sourceId), weapon = resolveRobotBasicPart(bomb.weapon.partId, bomb.weapon.level), shape = getRobotBlastPlan(bomb.weapon);
    const cells = getRobotAreaNeighborCells(next.board, center, shape.geometry), attackId = bomb.id + ":detonate";
    if (next.attackIds.includes(attackId)) throw new Error("Duplicate bomb detonation receipt");
    const targets = next.units.filter(u => u.hp > 0 && u.position && robotBattleIsAlly(u) !== robotBattleIsAlly(owner) && (sameRobotCoreCell(center, u.position) || cells.some(c => sameRobotCoreCell(c, u.position!))));
    const packets = targets.map(target => {
      const attackStat = bomb.attack.ranged + (bomb.attack.targetBonuses.find(b => b.targetId === target.id)?.ranged ?? 0);
      const base = calculateRobotBaseDamage({ attackStat, weaponPower: weapon.weaponPower!, targetDef: getRobotBattleDefense(next, target), actionMultiplier: 1, areaMultiplier: sameRobotCoreCell(center, target.position!) ? 1 : .4 });
      const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null }, effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base, getRobotDamageFactors(target)) } });
      return { targetId: target.id, damage: resolution.damage };
    });
    for (const packet of packets) { const hit = applyRobotPhaseDamage(next, bomb.sourceId, packet.targetId, packet.damage, attackId, "special:delayed-fuse", "fuse"); next = hit.state; events.push(hit.event); }
    next = { ...next, attackIds: [...next.attackIds, attackId] };
    explosions.push({ bombId: bomb.id, attackId, cell: { ...center } });
    const hitIds = new Set(packets.map(p => p.targetId));
    next.fuses!.bombs.forEach(b => enqueue(b, hitIds));
  }
  return { state: { ...next, ...(explosions.length ? { pendingFuseExplosions: [...(s.pendingFuseExplosions ?? []), ...explosions] } : {}) }, events };
}
