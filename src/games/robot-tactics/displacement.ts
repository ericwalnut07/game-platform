import { getRobotBattleStructures, getRobotBattleUnit, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleDamageEvent } from "./battleState";
import { getRobotLegalMoves, type RobotPosition } from "./movement";
import { applyRobotPhaseDamage, hasRobotAddon } from "./battleEffects";
export interface RobotDisplacement { readonly sourceId: string; readonly targetId: string; readonly distance: number; readonly pull?: boolean; readonly splash?: number }
/** Stepwise forced motion reuses MOV1's blocker/corner legality, never the target's movement type. */
export function applyRobotDisplacement(s: RobotBattleCoreState, input: RobotDisplacement, prefix: string) {
  const source = getRobotBattleUnit(s, input.sourceId), target = getRobotBattleUnit(s, input.targetId);
  if (!Number.isSafeInteger(input.distance) || input.distance < 0 || !source.position) throw new Error("Invalid displacement");
  if (target.hp === 0 || !target.position) return { state: s, events: [] as RobotBattleDamageEvent[] };
  let next = s, cell = target.position, collision: "terrain" | "unit" | null = null, otherId: string | null = null;
  const direction = { x: Math.sign(cell.x - source.position.x) * (input.pull ? -1 : 1), y: Math.sign(cell.y - source.position.y) * (input.pull ? -1 : 1) };
  if (!direction.x && !direction.y) throw new Error("Distinct displacement origin required");
  for (let step = 0; step < input.distance; step++) {
    const destination: RobotPosition = { x: cell.x + direction.x, y: cell.y + direction.y };
    const occupant = next.units.find(u => u.id !== target.id && u.hp > 0 && u.position && sameRobotCoreCell(u.position, destination));
    const moves = getRobotLegalMoves({ board: s.board, origin: cell, mov: 1, types: ["omni"], facing: "north", occupied: next.units.filter(u => u.id !== target.id && u.hp > 0).map(u => u.position!), structures: getRobotBattleStructures(s) });
    if (!moves.some(m => sameRobotCoreCell(m.destination, destination))) { collision = occupant ? "unit" : "terrain"; otherId = occupant?.id ?? null; break; }
    cell = destination; next = { ...next, units: next.units.map(u => u.id === target.id ? { ...u, position: cell } : u) };
  }
  const events: RobotBattleDamageEvent[] = [];
  const other = otherId ? getRobotBattleUnit(next, otherId) : null;
  if (!input.pull && collision && hasRobotAddon(source, "wall-collision-breaker") && (!other || robotBattleIsAlly(other) !== robotBattleIsAlly(source))) {
    for (const id of [target.id, ...(other ? [other.id] : [])]) {
      const result = applyRobotPhaseDamage(next, source.id, id, 20, prefix + ":collision:" + events.length, "special:collision"); next = result.state; events.push(result.event);
    }
  }
  if (input.splash) for (const enemy of next.units.filter(u => u.id !== target.id && u.hp > 0 && u.position && robotBattleIsAlly(u) !== robotBattleIsAlly(source) && Math.max(Math.abs(u.position.x - cell.x), Math.abs(u.position.y - cell.y)) === 1)) {
    const result = applyRobotPhaseDamage(next, source.id, enemy.id, input.splash, prefix + ":echo:" + events.length, "special:echo"); next = result.state; events.push(result.event);
  }
  return { state: next, events };
}
