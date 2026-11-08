import type { RobotPosition } from "../../../games/robot-tactics/movement";

/**
 * View-only 2.5D projection. A logical unit square becomes a diamond.
 * Keep the battle Core, collision, line-of-sight, saved cells and pathfinding
 * entirely in original grid coordinates.
 */
export const ROBOT_ISO_HALF_WIDTH = 0.5;
export const ROBOT_ISO_HALF_HEIGHT = 0.28;

export interface RobotIsoPoint { readonly x: number; readonly y: number }
export interface RobotIsoBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export function projectRobotIsoPoint(point: RobotIsoPoint, boardHeight: number): RobotIsoPoint {
  return {
    x: (point.x - point.y + boardHeight) * ROBOT_ISO_HALF_WIDTH,
    y: (point.x + point.y) * ROBOT_ISO_HALF_HEIGHT,
  };
}

export function unprojectRobotIsoPoint(point: RobotIsoPoint, boardHeight: number): RobotIsoPoint {
  const difference = point.x / ROBOT_ISO_HALF_WIDTH - boardHeight;
  const sum = point.y / ROBOT_ISO_HALF_HEIGHT;
  return { x: (sum + difference) / 2, y: (sum - difference) / 2 };
}

/** Rect hit regions are projected by this SVG group matrix, not approximated by bounding boxes. */
export function robotIsoWorldMatrix(boardHeight: number): string {
  return `matrix(${ROBOT_ISO_HALF_WIDTH} ${ROBOT_ISO_HALF_HEIGHT} ${-ROBOT_ISO_HALF_WIDTH} ${ROBOT_ISO_HALF_HEIGHT} ${boardHeight * ROBOT_ISO_HALF_WIDTH} 0)`;
}

/**
 * Cancel only the linear shear for sprites/text while leaving their anchor
 * on the projected grid. The outer movement animation remains in logical
 * grid deltas, so P * translate(dx,dy) correctly travels in screen diamonds.
 */
export function robotIsoBillboardTransform(anchor: RobotIsoPoint): string {
  const verticalInverse = 1 / (2 * ROBOT_ISO_HALF_HEIGHT);
  return `translate(${anchor.x} ${anchor.y}) matrix(1 -1 ${verticalInverse} ${verticalInverse} 0 0) translate(${-anchor.x} ${-anchor.y})`;
}

/** Project a focused logical camera rectangle, allowing head/weapon overhang. */
export function robotIsoViewBox(
  logical: RobotIsoBox, boardHeight: number, viewportAspect: number,
): RobotIsoBox {
  const corners = [
    { x: logical.x, y: logical.y },
    { x: logical.x + logical.width, y: logical.y },
    { x: logical.x, y: logical.y + logical.height },
    { x: logical.x + logical.width, y: logical.y + logical.height },
  ].map(corner => projectRobotIsoPoint(corner, boardHeight));
  const minX = Math.min(...corners.map(p => p.x)) - 0.48;
  const maxX = Math.max(...corners.map(p => p.x)) + 0.48;
  const minY = Math.min(...corners.map(p => p.y)) - 0.65;
  const maxY = Math.max(...corners.map(p => p.y)) + 0.35;
  let width = maxX - minX, height = maxY - minY;
  let x = minX, y = minY;
  const aspect = Number.isFinite(viewportAspect) && viewportAspect > 0 ? viewportAspect : 1;
  if (width / height < aspect) {
    const expansion = height * aspect - width;
    width += expansion;
    x -= expansion / 2;
  } else {
    const expansion = width / aspect - height;
    height += expansion;
    y -= expansion / 2;
  }
  return { x, y, width, height };
}

/** Converts a projected pointer position to exactly one logical cell. */
export function robotIsoHitCell(point: RobotIsoPoint, board: { readonly width: number; readonly height: number }): RobotPosition | null {
  const logical = unprojectRobotIsoPoint(point, board.height);
  // Floating point epsilon only at grid extrema. Never map off-board padding to a tile.
  if (logical.x < 0 || logical.y < 0 || logical.x >= board.width || logical.y >= board.height) return null;
  return { x: Math.floor(logical.x), y: Math.floor(logical.y) };
}
