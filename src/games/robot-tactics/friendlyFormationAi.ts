import { robotEarlyGoalCells } from "./earlyMissions";
import { getRobotCombatWeapon, getRobotNormalActionCost } from "./combatAddons";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotLegalMoves } from "./movement";
import { getRobotBattleMovementShape, getRobotBattleStructures, getRobotBattleUnit, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { robotSpecialDamage, robotWeaponReaches } from "./battleEffects";
import { getRobotFormationOptions } from "./formations";

/** Conservative exposure, not a prediction of the enemy's selected future action.
 * Each enemy contributes at most its best legal move/weapon hit. No hidden state.
 */
export function getRobotFriendlyIncoming(s: RobotBattleCoreState, targetId: string): number {
  const target = getRobotBattleUnit(s, targetId);
  if (target.hp <= 0 || !target.position) return 0;
  let damage = 0;
  for (const enemy of s.units.filter(u => u.hp > 0 && u.position && !robotBattleIsAlly(u) && !u.statuses.length)) {
    const shape = getRobotBattleMovementShape(enemy, s);
    const moves = shape && enemy.rootedUntilOwnTurn === undefined ? getRobotLegalMoves({ ...shape, board: s.board, origin: enemy.position!, occupied: s.units.filter(u => u.id !== enemy.id && u.hp > 0 && u.position).map(u => u.position!), structures: getRobotBattleStructures(s) }) : [];
    const origins = [enemy.position!, ...moves.map(m => m.destination)];
    let best = 0;
    for (const part of enemy.parts) {
      const weapon = getRobotCombatWeapon(resolveRobotBasicPart(part.partId, part.level), enemy.addons);
      if (weapon.slot !== "weapon" || !weapon.range || weapon.weaponPower === null || getRobotNormalActionCost(part, enemy.addons) > enemy.energy.en || enemy.energy.lockedUntilOwnTurn !== undefined && getRobotNormalActionCost(part, enemy.addons) > 0) continue;
      if (origins.some(position => robotWeaponReaches(s, { ...enemy, position }, target, weapon))) best = Math.max(best, robotSpecialDamage(s, enemy, target, weapon, 1));
    }
    damage += best;
  }
  return damage;
}
const critical = (s: RobotBattleCoreState, u: RobotBattleUnit) => !!u.carriedObjectiveId || s.key.missionNumber === 6 && s.objective.kind === "early" && u.position && robotEarlyGoalCells(s.key).some(c=>c.x===u.position!.x&&c.y===u.position!.y);
/** Compare real defense gains, including existing caps/expiry. Ineffective buffs
 * and unreachable enemies produce zero utility and consume no AI action. */
export function getRobotDefensiveFormationValue(before: RobotBattleCoreState, buffed: RobotBattleCoreState, kind: "pair-defense" | "protection", ids: readonly string[]): number {
  const exposure = ids.map(id => ({ u: getRobotBattleUnit(before, id), incoming: getRobotFriendlyIncoming(before, id), after: getRobotFriendlyIncoming(buffed, id) }));
  if (kind === "pair-defense" ? exposure[0]!.incoming < Math.min(exposure[0]!.u.hp, exposure[0]!.u.maxHp * .25) : exposure.filter(e => e.incoming > 0).length < 2 && !exposure.some(e => e.incoming >= e.u.hp)) return 0;
  return exposure.reduce((sum, e) => {
    const saved = Math.min(e.u.hp, e.incoming) - Math.min(e.u.hp, e.after);
    if (saved <= 0 || getRobotBattleUnit(buffed, e.u.id).hp <= 0) return sum;
    return sum + saved + (e.incoming >= e.u.hp && e.after < e.u.hp ? 1000000 : 0) + (critical(before, e.u) ? 100000 : 0);
  }, 0);
}
/** Legal, presently useful shapes only. Used as a movement tie-break after
 * explicit orders, mission intent and attack value; never invents a move. */
export function getRobotFormationPositionValue(s: RobotBattleCoreState, movingId: string): number {
  if (!s.ai.allowFormations) return 0;
  let value = 0;
  for (const source of s.units.filter(u => robotBattleIsAlly(u) && u.hp > 0 && u.position && !u.energy.action && !u.statuses.length)) {
    const virtual = { ...s, turn: { ...s.turn, actorId: source.id } };
    if (!s.actors.some(a => a.id === source.id && a.unitIds.length === 1)) continue;
    for (const weapon of source.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")) for (const kind of ["line", "delta", "pincer", "pair-defense", "protection"] as const) {
      const options = getRobotFormationOptions(virtual, kind, weapon.partId);
      for (const selection of options.selections) {
        if (source.id !== movingId && !selection.participantIds.includes(movingId)) continue;
        if (kind === "pair-defense" || kind === "protection") {
          const ids = kind === "pair-defense" ? [source.id] : [source.id, ...selection.participantIds];
          const threats = ids.map(id => ({ u: getRobotBattleUnit(s, id), damage: getRobotFriendlyIncoming(s, id) }));
          if (kind === "pair-defense" ? threats[0]!.damage < Math.min(threats[0]!.u.hp, threats[0]!.u.maxHp * .25) : threats.filter(t => t.damage > 0).length < 2 && !threats.some(t => t.damage >= t.u.hp)) continue;
        }
        value = Math.max(value, 1 / (1 + options.energyCost));
      }
    }
  }
  return value;
}
