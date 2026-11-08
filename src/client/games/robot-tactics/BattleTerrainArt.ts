/// <reference types="vite/client" />
import type { RobotPosition } from "../../../games/robot-tactics/movement";

/** Presentation only. None of these variants affect collision, LOS, movement or saves. */
export type RobotTerrainArt = "floor-metal" | "floor-warning" | "wall-x" | "wall-y" |
  "wall-corner" | "container" | "barricade" | "utility";
export const ROBOT_TERRAIN_ATLAS_CELL = 96;
export const ROBOT_TERRAIN_ATLAS_COLUMNS = 4;

const atlasImages = import.meta.glob<string>("./terrain-v2/terrain-atlas.webp", {
  eager: true, query: "?inline", import: "default",
});

/** Embedded in the standalone offline HTML, never loaded over the network. */
export function robotTerrainAtlasUrl(): string | null {
  const src = atlasImages["./terrain-v2/terrain-atlas.webp"];
  return src?.startsWith("data:image/webp;base64,") ? src : null;
}

export const ROBOT_TERRAIN_ATLAS_INDEX: Readonly<Record<RobotTerrainArt, number>> = {
  "floor-metal": 0, "floor-warning": 1, "wall-x": 2, "wall-y": 3,
  "wall-corner": 4, container: 5, barricade: 6, utility: 7,
};

export function robotTerrainFloor(x: number, y: number): RobotTerrainArt {
  // No gameplay meaning; use one accent tile sparingly for navigational texture.
  return (x * 7 + y * 11) % 13 === 0 ? "floor-warning" : "floor-metal";
}

export function robotTerrainWall(cell: RobotPosition, wallCells: ReadonlySet<string>): RobotTerrainArt | null {
  if (!wallCells.has(cell.x + "," + cell.y)) return null;
  const adjacentX = Number(wallCells.has((cell.x - 1) + "," + cell.y)) +
    Number(wallCells.has((cell.x + 1) + "," + cell.y));
  const adjacentY = Number(wallCells.has(cell.x + "," + (cell.y - 1))) +
    Number(wallCells.has(cell.x + "," + (cell.y + 1)));
  if (adjacentX && adjacentY && adjacentX + adjacentY === 2) return "wall-corner";
  if (adjacentX >= adjacentY && adjacentX) return "wall-x";
  if (adjacentY) return "wall-y";
  // An isolated *existing* wall tile can be represented by equipment or cover.
  // Never generate obstacles on previously open tiles.
  const isolatedStyle = (cell.x * 3 + cell.y * 5) % 3;
  return isolatedStyle === 0 ? "container" : isolatedStyle === 1 ? "barricade" : "utility";
}

/** Screen-oriented art around a logical cell center, before the world's iso transform. */
export function robotTerrainPlacement(kind: RobotTerrainArt): {
  readonly width: number; readonly height: number; readonly top: number;
} {
  if (kind === "floor-metal" || kind === "floor-warning") return { width: 1.08, height: .79, top: .38 };
  if (kind === "container" || kind === "utility") return { width: .84, height: .82, top: .67 };
  if (kind === "barricade") return { width: .9, height: .67, top: .54 };
  return { width: .91, height: .7, top: .59 };
}
