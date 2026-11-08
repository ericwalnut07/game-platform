/// <reference types="vite/client" />
import type { RobotPosition } from "../../../games/robot-tactics/movement";

/** Presentation only. None of these variants affect collision, LOS, movement or saves. */
export type RobotTerrainArt = "floor-metal" | "floor-warning" | "wall-x" | "wall-y" |
  "wall-corner" | "container" | "barricade" | "utility";
export const ROBOT_TERRAIN_ATLAS_CELL = 80;
export const ROBOT_TERRAIN_ATLAS_COLUMNS = 4;

// The transparent image is bundled directly in the standalone file:// HTML.
const atlases = import.meta.glob<string>("./terrain-v2/terrain-atlas.webp", {
  eager: true, query: "?inline", import: "default",
});

/** Never downloads map graphics over the network. */
export function robotTerrainAtlasUrl(): string | null {
  const source = atlases["./terrain-v2/terrain-atlas.webp"];
  return source?.startsWith("data:image/webp;base64,") ? source : null;
}

export const ROBOT_TERRAIN_ATLAS_INDEX: Readonly<Record<RobotTerrainArt, number>> = {
  "floor-metal": 0, "floor-warning": 1, "wall-x": 2, "wall-y": 3,
  "wall-corner": 4, container: 5, barricade: 6, utility: 7,
};

export function robotTerrainFloor(x: number, y: number): RobotTerrainArt {
  // No gameplay meaning; use one accent tile sparingly for navigational texture.
  return (x * 7 + y * 11) % 13 === 0 ? "floor-warning" : "floor-metal";
}

/** Every existing blocked wall tile uses the approved low, one-cell box art.
 * This is cosmetic: the Core's collision/LOS layout remains unchanged. */
export function robotTerrainWall(cell: RobotPosition, wallCells: ReadonlySet<string>): RobotTerrainArt | null {
  return wallCells.has(cell.x + "," + cell.y) ? "container" : null;
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
