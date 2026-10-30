import type { RobotPosition } from "../../../games/robot-tactics/movement";

export interface RobotBattleCamera { readonly mode: "focus" | "overview"; readonly center: RobotPosition; readonly span: number }
export function robotBattleCameraBox(camera: RobotBattleCamera, board: { readonly width: number; readonly height: number }) {
  if (camera.mode === "overview") return { x: 0, y: 0, width: board.width, height: board.height };
  const width = Math.min(board.width, camera.span), height = Math.min(board.height, camera.span);
  return { x: Math.max(0, Math.min(board.width - width, camera.center.x + 0.5 - width / 2)), y: Math.max(0, Math.min(board.height - height, camera.center.y + 0.5 - height / 2)), width, height };
}
export function focusRobotBattleCamera(camera: RobotBattleCamera, cell: RobotPosition, board: { readonly width: number; readonly height: number }): RobotBattleCamera {
  return { ...camera, mode: "focus", center: { x: Math.max(0, Math.min(board.width - 1, cell.x)), y: Math.max(0, Math.min(board.height - 1, cell.y)) } };
}
export function zoomRobotBattleCamera(camera: RobotBattleCamera, factor: number): RobotBattleCamera {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error("Invalid camera zoom");
  return { ...camera, mode: "focus", span: Math.max(5, Math.min(19, camera.span * factor)) };
}
