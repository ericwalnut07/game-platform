import { getRobotBattleFacilities, isRobotBattleHostileObject, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import type { RobotPosition } from "./movement";

/** Relative AI utilities only: no damage, mitigation, aggro lock, or save changes. */
export const ROBOT_NPC_DEFENSIVE_TARGET_BONUS = 220;
export const ROBOT_NPC_FRONT_SCREEN_BONUS = 520;
export const ROBOT_NPC_MISSION_TARGET_BONUS = 450;

export function robotNpcHasActiveDefense(target: RobotBattleUnit): boolean {
  return !!(target.defended || target.shielded || target.formationDefense?.some(effect => effect.kind === "protection"));
}

/** The unit must lie on the enemy-to-objective corridor, not merely near the objective.
 * All occupied cells of multi-tile facilities and the convoy's current cells are considered.
 */
export function robotNpcScreensObjective(source: RobotPosition, target: RobotPosition, occupied: readonly RobotPosition[]): boolean {
  return occupied.some(cell => {
    const dx = cell.x - source.x, dy = cell.y - source.y;
    const squared = dx * dx + dy * dy;
    if (!squared) return false;
    const t = ((target.x - source.x) * dx + (target.y - source.y) * dy) / squared;
    if (t <= 0 || t >= 1) return false;
    const perpendicular = Math.abs((target.x - source.x) * dy - (target.y - source.y) * dx) / Math.sqrt(squared);
    return perpendicular <= 0.75;
  });
}

/** Only hostile NPCs gain a bonus for attacking actively defending allied units.
 * Stacking defensive effects still gives a single basic bonus; screening adds once.
 */
export function getRobotNpcDefensiveTargetBonus(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit): number {
  if (robotBattleIsAlly(source) || !robotBattleIsAlly(target) || source.hp <= 0 || target.hp <= 0 || !source.position || !target.position || !robotNpcHasActiveDefense(target)) return 0;
  const objectiveCells = getRobotBattleFacilities(s).filter(o => o.hp > 0 && isRobotBattleHostileObject(s, source.id, o.id)).flatMap(o => o.cells);
  return ROBOT_NPC_DEFENSIVE_TARGET_BONUS + (robotNpcScreensObjective(source.position, target.position, objectiveCells) ? ROBOT_NPC_FRONT_SCREEN_BONUS : 0);
}
