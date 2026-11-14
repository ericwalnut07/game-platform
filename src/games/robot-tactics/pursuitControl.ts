import { robotChebyshevDistance } from "./attackRange";
import type { RobotBattleResolvedAttack } from "./battleBatch";
import { applyRobotPhaseDamage, getRobotDamageFactors, robotWeaponReaches } from "./battleEffects";
import { getRobotBattleUnit, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleDamageEvent } from "./battleState";
import { floorRobotDamageProduct } from "./combatMath";

interface RobotPursuitHit {
  readonly sourceId: string;
  readonly defeatedId: string;
  readonly weapon: NonNullable<RobotBattleResolvedAttack["weapon"]>;
  readonly base: number;
}

/** Only direct hits from the paid action can qualify. Walk the resolved HP
 * events in order so a sweep with multiple defeats still grants one pursuit. */
export function findRobotPursuitHit(
  s: RobotBattleCoreState, attacks: readonly RobotBattleResolvedAttack[], events: readonly RobotBattleDamageEvent[],
): RobotPursuitHit | undefined {
  const remaining = new Map(s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0).map(u => [u.id, u.hp]));
  for (const event of events) {
    const hp = remaining.get(event.targetId);
    if (hp === undefined || hp <= 0 || event.damage === null) continue;
    remaining.set(event.targetId, hp - event.damage);
    if (event.damage < hp) continue;
    const attack = attacks.find(a => a.id === event.attackId);
    const base = attack?.targets.find(t => t.entityId === event.targetId)?.resolution.product?.base;
    if (attack?.weapon && base !== undefined) return { sourceId: event.sourceId, defeatedId: event.targetId, weapon: attack.weapon, base };
  }
  return undefined;
}

export function resolveRobotPursuitControl(s: RobotBattleCoreState, hit: RobotPursuitHit, actionId: string) {
  const source = getRobotBattleUnit(s, hit.sourceId);
  const origin = source.position;
  if (source.kind !== "controlled" || source.hp <= 0 || !origin || getRobotBattleUnit(s, hit.defeatedId).hp > 0) return undefined;
  const target = s.units
    .filter(u => !robotBattleIsAlly(u) && u.hp > 0 && robotWeaponReaches(s, source, u, hit.weapon))
    .sort((a, b) => robotChebyshevDistance(origin, a.position!) - robotChebyshevDistance(origin, b.position!))[0];
  if (!target) return undefined;
  const damage = Math.max(1, floorRobotDamageProduct(hit.base, [.7, ...getRobotDamageFactors(target)]));
  return applyRobotPhaseDamage(s, source.id, target.id, damage, actionId + ":pursuit", hit.weapon.weaponFamily as RobotBattleDamageEvent["effectKind"]);
}
