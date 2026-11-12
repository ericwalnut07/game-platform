import { finalizeRobotDamage, floorRobotDamageProduct } from "./combatMath";
import { resolveRobotFacilityDamage } from "./facilityDefense";
import { getRobotHostileFacilities } from "./specialFacilityTargets";
import { moveRobotThroughHazards } from "./hazards";
import { getRobotBattleStructures, getRobotBattleUnit, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleDamageEvent } from "./battleState";
import { getRobotLegalMoves, type RobotPosition } from "./movement";
import { applyRobotPhaseDamage, getRobotDamageFactors, hasRobotAddon } from "./battleEffects";
export interface RobotDisplacement { readonly sourceId: string; readonly targetId: string; readonly distance: number; readonly normalBlunt?: true; readonly pull?: boolean; readonly splash?: number; readonly impactCell?: RobotPosition }
/** Stepwise forced motion reuses MOV1's blocker/corner legality, never the target's movement type. */
export function applyRobotDisplacement(s: RobotBattleCoreState, input: RobotDisplacement, prefix: string) {
  const source = getRobotBattleUnit(s, input.sourceId), target = s.units.find(u => u.id === input.targetId);
  const facilities = getRobotHostileFacilities(s, source.id);
  const fixed = target ? undefined : facilities.find(o => o.id === input.targetId);
  const position = target?.position ?? input.impactCell;
  if (!Number.isSafeInteger(input.distance) || input.distance < 0 || !source.position) throw new Error("Invalid displacement");
  if (!position || target?.hp === 0) return { state: s, events: [] as RobotBattleDamageEvent[] };
  if (!target && (!fixed || !fixed.cells.some(c => sameRobotCoreCell(c, position)) || input.distance !== 0 || !input.splash)) throw new Error("Invalid stationary epicenter");
  let next = s, cell = position, collision: "terrain" | "unit" | null = null, otherId: string | null = null;
  const direction = { x: Math.sign(cell.x - source.position.x) * (input.pull ? -1 : 1), y: Math.sign(cell.y - source.position.y) * (input.pull ? -1 : 1) };
  if (!direction.x && !direction.y) throw new Error("Distinct displacement origin required");
  const events: RobotBattleDamageEvent[] = [];
  const impact = (id: string, cells: readonly RobotPosition[], raw: number, effectKind: "special:collision" | "special:echo") => {
    events.push({ sourceId: source.id, targetId: id, cells, damage: resolveRobotFacilityDamage(s, id, raw),
      attackId: prefix + ":facility:" + events.length, effectKind });
  };
  let hitWall = false;
  let collidedFacility: (typeof facilities)[number] | undefined;
  for (let step = 0; step < input.distance; step++) {
    const destination: RobotPosition = { x: cell.x + direction.x, y: cell.y + direction.y };
    const occupant = next.units.find(u => u.id !== input.targetId && u.hp > 0 && u.position && sameRobotCoreCell(u.position, destination));
    const moves = getRobotLegalMoves({ board: s.board, origin: cell, mov: 1, types: ["omni"], facing: "north", occupied: next.units.filter(u => u.id !== input.targetId && u.hp > 0 && u.position).map(u => u.position!), structures: getRobotBattleStructures(s) });
    if (!moves.some(m => sameRobotCoreCell(m.destination, destination))) { collision = occupant ? "unit" : "terrain"; otherId = occupant?.id ?? null;
      hitWall = s.board.walls.some(w => sameRobotCoreCell(w, destination));
      collidedFacility = facilities.find(o => o.cells.some(c => sameRobotCoreCell(c, destination)));
      break; }
    cell = destination; const moved=moveRobotThroughHazards(next,input.targetId,[cell],prefix+":step:"+step); next=moved.state;events.push(...moved.events);
    if(getRobotBattleUnit(next,input.targetId).hp===0)break;
  }
  const other = otherId ? getRobotBattleUnit(next, otherId) : null;
  const breaker = hasRobotAddon(source, "wall-collision-breaker");
  const hostileOccupant = other && robotBattleIsAlly(other) !== robotBattleIsAlly(source) ? other : null;
  if (input.normalBlunt && !input.pull && (hitWall || hostileOccupant)) {
    const raw = breaker ? 20 : 10;
    const victims = breaker && hostileOccupant ? [input.targetId, hostileOccupant.id] : [input.targetId];
    for (const id of victims) {
      const damage = finalizeRobotDamage({ attackLegal: true, dealsDamage: true,
        damageAfterModifiers: floorRobotDamageProduct(raw, getRobotDamageFactors(getRobotBattleUnit(next, id))) });
      const result = applyRobotPhaseDamage(next, source.id, id, damage, prefix + ":collision:" + events.length, "special:collision");
      next = result.state; events.push(result.event);
    }
  } else if (!input.normalBlunt && !input.pull && collision && breaker) {
    // Specials retain their existing displacement and collision behavior.
    if (!other || hostileOccupant) {
      for (const id of [input.targetId, ...(hostileOccupant ? [hostileOccupant.id] : [])]) {
        const result = applyRobotPhaseDamage(next, source.id, id, 20, prefix + ":collision:" + events.length, "special:collision");
        next = result.state; events.push(result.event);
      }
    }
    if (collidedFacility) impact(collidedFacility.id, collidedFacility.cells, 20, "special:collision");
  }
  if (input.splash) for (const facility of facilities.filter(o => o.id !== input.targetId)) {
    const cells = facility.cells.filter(c => Math.max(Math.abs(c.x - cell.x), Math.abs(c.y - cell.y)) === 1);
    if (cells.length) impact(facility.id, cells, input.splash, "special:echo");
  }
  if (input.splash) for (const enemy of next.units.filter(u => u.id !== input.targetId && u.hp > 0 && u.position && robotBattleIsAlly(u) !== robotBattleIsAlly(source) && Math.max(Math.abs(u.position.x - cell.x), Math.abs(u.position.y - cell.y)) === 1)) {
    const result = applyRobotPhaseDamage(next, source.id, enemy.id, input.splash, prefix + ":echo:" + events.length, "special:echo"); next = result.state; events.push(result.event);
  }
  return { state: next, events };
}
