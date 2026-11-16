import type { RobotBattleCoreState, RobotBattleUnit } from "./battleState";
import { getRobotLegalMoves, robotCellToPosition, type RobotPosition } from "./movement";

export const ROBOT_M30_GIANT_ID = "m30-giant-boss";
export const ROBOT_M30_GIANT_SECOND_ACTOR = "m30-giant-boss:second";
export const ROBOT_M30_GIANT_ROUND_LIMIT = 12;
export const ROBOT_M30_GIANT_LANDING = robotCellToPosition("J7");
export const ROBOT_M30_GIANT_COLLAPSED_WALLS = ["G11", "M11", "H9", "L9", "K7", "H5", "L5"].map(robotCellToPosition);
const same = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;

export interface RobotM30GiantState {
  readonly firstPhaseRound: number;
  readonly result: "ongoing" | "won" | "lost";
  readonly resultReason: "giant-defeated" | "same-round-controlled-wipe" | "final-annihilation-cannon" | null;
}
export function getRobotM30GiantProfile(difficulty: NonNullable<RobotBattleCoreState["expansionDifficulty"]>) {
  return difficulty === "hardest"
    ? { hp: 5000, def: 65, spd: 110, secondSpd: 55, mov: 2 }
    : { hp: 7000, def: 70, spd: 130, secondSpd: 65, mov: 2 };
}

export function getRobotM30GiantWalls(walls: readonly RobotPosition[]) {
  return walls.filter(wall => !ROBOT_M30_GIANT_COLLAPSED_WALLS.some(cell => same(cell, wall)));
}

export function getRobotM30GiantCells(anchor: RobotPosition): readonly RobotPosition[] {
  return [anchor, { x: anchor.x + 1, y: anchor.y }, { x: anchor.x, y: anchor.y + 1 }, { x: anchor.x + 1, y: anchor.y + 1 }];
}

export function isRobotM30GiantAnchor(cell: RobotPosition): boolean {
  return cell.x >= 6 && cell.x <= 12 && cell.y >= 4 && cell.y <= 9;
}

export function getRobotM30GiantMoves(s: RobotBattleCoreState, giant: RobotBattleUnit, mov: number, structures: readonly RobotPosition[]) {
  const blockers = [...s.board.walls, ...structures, ...s.units.flatMap(u => u.id !== giant.id && u.hp > 0 && u.position ? [u.position] : [])];
  // Translate every fixed blocker into the four anchors at which the footprint
  // would cover it, then apply the common distance and diagonal-corner rules.
  const walls = Array.from({ length: s.board.width * s.board.height }, (_, index) =>
    ({ x: index % s.board.width, y: Math.floor(index / s.board.width) }))
    .filter(anchor => !isRobotM30GiantAnchor(anchor) || getRobotM30GiantCells(anchor).some(cell => blockers.some(p => same(p, cell))));
  return getRobotLegalMoves({ mov, types: ["omni"], facing: "south", origin: giant.position!,
    board: { ...s.board, walls }, occupied: [], structures: [] });
}

export function getRobotM30GiantResult(hp: number, wiped: boolean, deadline: boolean): Pick<RobotM30GiantState, "result" | "resultReason"> {
  if (wiped) return { result: "lost", resultReason: "same-round-controlled-wipe" };
  if (hp === 0) return { result: "won", resultReason: "giant-defeated" };
  if (deadline) return { result: "lost", resultReason: "final-annihilation-cannon" };
  return { result: "ongoing", resultReason: null };
}
