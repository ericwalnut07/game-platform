import { resolveRobotFacilityDamage } from "./facilityDefense";
import { getRobotHostileFacilities } from "./specialFacilityTargets";
import { moveRobotThroughHazards } from "./hazards";
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
  const events: RobotBattleDamageEvent[] = [];
  const facilities = getRobotHostileFacilities(s, source.id);
  const impact = (id: string, cells: readonly RobotPosition[], raw: number, effectKind: "special:collision" | "special:echo") => {
    events.push({ sourceId: source.id, targetId: id, cells, damage: resolveRobotFacilityDamage(s, id, raw),
      attackId: prefix + ":facility:" + events.length, effectKind });
  };
  let collidedFacility: (typeof facilities)[number] | undefined;
  for (let step = 0; step < input.distance; step++) {
    const destination: RobotPosition = { x: cell.x + direction.x, y: cell.y + direction.y };
    const occupant = next.units.find(u => u.id !== target.id && u.hp > 0 && u.position && sameRobotCoreCell(u.position, destination));
    const moves = getRobotLegalMoves({ board: s.board, origin: cell, mov: 1, types: ["omni"], facing: "north", occupied: next.units.filter(u => u.id !== target.id && u.hp > 0 && u.position).map(u => u.position!), structures: getRobotBattleStructures(s) });
    if (!moves.some(m => sameRobotCoreCell(m.destination, destination))) { collision = occupant ? "unit" : "terrain"; otherId = occupant?.id ?? null;
      collidedFacility = facilities.find(o => o.cells.some(c => sameRobotCoreCell(c, destination)));
      break; }
    cell = destination; const moved=moveRobotThroughHazards(next,target.id,[cell],prefix+":step:"+step); next=moved.state;events.push(...moved.events);
    if(getRobotBattleUnit(next,target.id).hp===0)break;
  }
  const other = otherId ? getRobotBattleUnit(next, otherId) : null;
  if (!input.pull && collision && hasRobotAddon(source, "wall-collision-breaker") && (!other || robotBattleIsAlly(other) !== robotBattleIsAlly(source))) {
    for (const id of [target.id, ...(other ? [other.id] : [])]) {
      const result = applyRobotPhaseDamage(next, source.id, id, 20, prefix + ":collision:" + events.length, "special:collision"); next = result.state; events.push(result.event);
    }
  }
  if (!input.pull && collidedFacility && hasRobotAddon(source, "wall-collision-breaker")) {
    impact(collidedFacility.id, collidedFacility.cells, 20, "special:collision");
  }
  if (input.splash) for (const facility of facilities) {
    const cells = facility.cells.filter(c => Math.max(Math.abs(c.x - cell.x), Math.abs(c.y - cell.y)) === 1);
    if (cells.length) impact(facility.id, cells, input.splash, "special:echo");
  }
  if (input.splash) for (const enemy of next.units.filter(u => u.id !== target.id && u.hp > 0 && u.position && robotBattleIsAlly(u) !== robotBattleIsAlly(source) && Math.max(Math.abs(u.position.x - cell.x), Math.abs(u.position.y - cell.y)) === 1)) {
    const result = applyRobotPhaseDamage(next, source.id, enemy.id, input.splash, prefix + ":echo:" + events.length, "special:echo"); next = result.state; events.push(result.event);
  }
  return { state: next, events };
}
