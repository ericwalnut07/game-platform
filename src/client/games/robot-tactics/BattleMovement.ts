import { getRobotLegalMoves, type RobotPosition } from "../../../games/robot-tactics/movement";
import type { RobotBattleUnitView, RobotBattleViewModel } from "./BattleViewModel";
import type { RobotBattlePlaybackSpeed } from "./BattlePresentation";

export interface RobotBattleMotion {
  readonly unitId: string;
  readonly kind: RobotBattleUnitView["kind"];
  readonly route: readonly RobotPosition[]; // first=origin, last=committed destination
  readonly durationMs: number;
}
export interface RobotBattleMovementPlan {
  readonly movers: readonly RobotBattleMotion[];
  readonly durationMs: number;
}
export const robotMovementDurationMs = (steps: number, speed: RobotBattlePlaybackSpeed = "standard"): number => {
  if (speed === "skip" || steps < 1) return 0;
  const duration = steps === 1 ? 400 : steps === 2 ? 650 : steps === 3 ? 850 : steps === 4 ? 1000 : 1100;
  return Math.round(duration * (speed === "fast" ? .55 : 1));
};
const same = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;

/**
 * Rebuilds paths only for units whose committed cell actually changed, using
 * the SAME canonical move solver and movement footprints as the Core. The AI's
 * squad members move in fixed unit-ID order, so previously moved members are
 * moved in the transient occupancy snapshot before the next route is rebuilt.
 *
 * Pure display data: does not commit an action, change HP/EN or touch storage.
 * If the exact legal route cannot be reconstructed, do not draw a guessed
 * straight-line path through a wall.
 */
export function planRobotBattleMovement(
  before: RobotBattleViewModel,
  after: RobotBattleViewModel,
  speed: RobotBattlePlaybackSpeed = "standard",
): RobotBattleMovementPlan {
  const empty: RobotBattleMovementPlan = { movers: [], durationMs: 0 };
  if (before.checkpoint.battleId !== after.checkpoint.battleId || after.checkpoint.sequence <= before.checkpoint.sequence || !after.latestAction) return empty;
  const actor = before.queue[0];
  if (!actor) return empty;
  const isOrdinary = actor.kind === "controlled"
    ? /：通常移動(?:$|／)/.test(after.latestSummary)
    : /：移動／|：移動後の反応解決/.test(after.latestSummary);
  if (!isOrdinary) return empty;

  const occupied = new Map(before.units.map(unit => [unit.id, { ...unit.cell }]));
  const wallsAndFacilities = before.structures.flatMap(structure => structure.cells);
  const movers: RobotBattleMotion[] = [];
  for (const id of actor.unitIds) {
    const unit = before.units.find(candidate => candidate.id === id);
    const completed = after.units.find(candidate => candidate.id === id);
    if (!unit || !completed || !unit.movement || same(unit.cell, completed.cell)) continue;
    const origin = occupied.get(id)!;
    const route = getRobotLegalMoves({
      ...unit.movement, board: before.board, origin,
      occupied: [...occupied.entries()].filter(([otherId]) => otherId !== id).map(([, cell]) => cell),
      structures: wallsAndFacilities,
    }).find(move => same(move.destination, completed.cell));
    if (!route || !route.path.length) continue;
    movers.push({
      unitId: id, kind: unit.kind,
      route: [origin, ...route.path],
      durationMs: robotMovementDurationMs(route.path.length, speed),
    });
    occupied.set(id, { ...completed.cell });
  }
  return { movers, durationMs: Math.max(0, ...movers.map(mover => mover.durationMs)) };
}

/** Eased interpolation through every adjacent canonical waypoint, never a teleport. */
export function robotBattleMotionPosition(motion: RobotBattleMotion, elapsedMs: number): RobotPosition {
  const route = motion.route;
  const final = route[route.length - 1]!;
  if (motion.durationMs <= 0 || elapsedMs >= motion.durationMs) return final;
  if (elapsedMs <= 0) return route[0]!;
  const t = Math.min(1, Math.max(0, elapsedMs / motion.durationMs));
  const eased = t * t * (3 - 2 * t);
  const distance = eased * (route.length - 1);
  const index = Math.min(route.length - 2, Math.floor(distance));
  const partial = distance - index, from = route[index]!, to = route[index + 1]!;
  return { x: from.x + (to.x - from.x) * partial, y: from.y + (to.y - from.y) * partial };
}
