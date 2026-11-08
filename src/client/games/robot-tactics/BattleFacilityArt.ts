/// <reference types="vite/client" />
import type { RobotPosition } from "../../../games/robot-tactics/movement";

/** Visual-only keys from the six individual sprites in the adopted second sheet. */
export type RobotFacilitySprite = "turret" | "console" | "antenna" | "beacon" | "crate" | "radar";
export const ROBOT_FACILITY_ATLAS_CELL = 96;
export const ROBOT_FACILITY_ATLAS_COLUMNS = 3;

const atlases = import.meta.glob<string>("./facility-v1/facility-atlas.webp", {
  eager: true, query: "?inline", import: "default",
});

/** One inline texture for the independent file:// application, never a remote image. */
export function robotFacilityAtlasUrl(): string | null {
  const url = atlases["./facility-v1/facility-atlas.webp"];
  return url?.startsWith("data:image/webp;base64,") ? url : null;
}

export const ROBOT_FACILITY_ATLAS_INDEX: Readonly<Record<RobotFacilitySprite, number>> = {
  turret: 0, console: 1, antenna: 2, beacon: 3, crate: 4, radar: 5,
};

/** Do not decorate unsupported entities (convoys/decoys are not pictured). */
export function robotFacilitySpriteForStructure(id: string, missionNumber: number): RobotFacilitySprite | null {
  if (id === "allied-final-relay" || id === "relay") return "antenna";
  if (id === "facility") return missionNumber === 8 ? "radar" : missionNumber === 1 ? "turret" : null;
  if (missionNumber === 4 || missionNumber === 11) {
    if (["depot-left", "depot-right", "depot-west", "depot-east"].includes(id)) return "crate";
  }
  return null;
}

/** Markers already exist in the projected Core, or are M30's adopted data points. */
export function robotFacilitySpriteForMarker(id: string): RobotFacilitySprite | null {
  if (id === "data-upload" || id === "m30-data-upload") return "console";
  if (id === "data-floor" || id === "m30-data-floor") return "crate";
  if (id.startsWith("base:") || id === "convoy-goal" || id === "m12-convoy-goal") return "beacon";
  // Seven adjacent breakthrough cells are one goal zone, not seven facilities.
  // Show a single beacon at its adopted central I2 tile; keep all seven legal
  // goal highlights and taps unchanged.
  if (id === "breakthrough:3" || id === "m10-breakthrough:3") return "beacon";
  return null; // A target enemy / depot overlay / other marker is not a facility.
}

/** Foot contact belongs to the actual Core footprint, not the last tile's
 * bottom edge. Sprite height only grows upward from this contact point.
 * Returning the frontmost depth preserves PR #135's unit/wall ordering.
 */
export function robotFacilityPlacement(
  cells: readonly RobotPosition[], kind: RobotFacilitySprite, marker = false,
): {
  readonly anchor: RobotPosition;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
} {
  if (!cells.length) throw new Error("A display facility needs an existing footprint");
  const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  // A multi-cell object has ONE image and ONE shared ground contact.
  const anchor = { x: (minX + maxX + 1) / 2, y: (minY + maxY + 1) / 2 };
  const span = Math.max(maxX - minX, maxY - minY);
  const width = marker ? .82 : Math.min(1.52, .9 + .56 * span);
  // Low roofs leave sightlines visible; tall antennas remain identifiable.
  const baseHeight = kind === "antenna" ? 1.38 : kind === "beacon" ? 1.08 : kind === "radar" ? 1.1 : 1.02;
  const height = marker ? Math.min(baseHeight, .92) : baseHeight;
  return { anchor, width, height, depth: Math.max(...cells.map(c => c.x + c.y)) };
}

