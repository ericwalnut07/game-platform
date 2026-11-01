import data from "../../../docs/design/robot-tactics/basic-parts.json";
import { resolveRobotBasicPart, type RobotPartSelection } from "./equipment";
import type { RobotPosition } from "./movement";

export interface RobotBlastPlan {
  readonly centerMultiplier: number; readonly neighborMultiplier: number;
  readonly neighborTargetCap: number; readonly geometry: "orthogonal-4" | "8-neighborhood";
}
/** Adopted weapon parameters only. This does not select targets, approve LOS,
 * damage a facility or implement an area attack/extra-part ability.
 */
export function getRobotBlastPlan(selection: RobotPartSelection): RobotBlastPlan {
  const weapon = resolveRobotBasicPart(selection.partId, selection.level);
  if (weapon.weaponFamily !== "blast") throw new Error("Blast weapon required");
  const effect = data.parts.find(p => p.id === weapon.id)!.builtInEffect as unknown as Record<string, unknown>;
  if (effect.kind !== "blast" || (effect.geometry !== "orthogonal-4" && effect.geometry !== "8-neighborhood") || !Number.isSafeInteger(effect.maxNeighbors) || (effect.maxNeighbors as number) < 0 || [effect.center, effect.neighbors].some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0)) throw new Error("Unconnected blast parameters");
  return { centerMultiplier: effect.center as number, neighborMultiplier: effect.neighbors as number, neighborTargetCap: effect.maxNeighbors as number, geometry: effect.geometry };
}
/** Geometry only: walls/units do not disappear, and these cells are NOT marked
 * legal attack targets. Only board bounds trim the four/eight candidate cells.
 */
export function getRobotBlastFootprint(input: {
  readonly weapon: RobotPartSelection; readonly center: RobotPosition;
  readonly board: { readonly width: number; readonly height: number };
}) {
  const { board, center } = input, plan = getRobotBlastPlan(input.weapon);
  return { plan, center: { ...center }, neighborCells: getRobotAreaNeighborCells(board, center, plan.geometry) };
}
/** Shared adopted four/eight-cell geometry, independent of weapon targeting. */
export function getRobotAreaNeighborCells(board: { readonly width: number; readonly height: number }, center: RobotPosition, geometry: RobotBlastPlan["geometry"]): readonly RobotPosition[] {
  if (geometry !== "orthogonal-4" && geometry !== "8-neighborhood") throw new Error("Invalid blast geometry");
  if (![board.width, board.height].every(n => Number.isSafeInteger(n) && n > 0) || ![center.x, center.y].every(Number.isSafeInteger) || center.x < 0 || center.y < 0 || center.x >= board.width || center.y >= board.height) throw new Error("Invalid blast footprint board/center");
  const neighborCells: RobotPosition[] = [];
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    if ((!x && !y) || (geometry === "orthogonal-4" && Math.abs(x) + Math.abs(y) !== 1)) continue;
    const cell = { x: center.x + x, y: center.y + y };
    if (cell.x >= 0 && cell.y >= 0 && cell.x < board.width && cell.y < board.height) neighborCells.push(cell);
  }
  return neighborCells;
}
