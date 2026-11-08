/// <reference types="vite/client" />
import type { RobotPosition } from "../../../games/robot-tactics/movement";

/** Visual-only keys from the six individual sprites in the adopted second sheet. */
export type RobotAtlasFacilitySprite = "turret" | "console" | "antenna" | "beacon" | "crate" | "radar";
export type RobotMissionObjectSprite = "depot" | "depot-wreck" | "convoy";
export type RobotFacilitySprite = RobotAtlasFacilitySprite | RobotMissionObjectSprite;
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

export const ROBOT_FACILITY_ATLAS_INDEX: Readonly<Record<RobotAtlasFacilitySprite, number>> = {
  turret: 0, console: 1, antenna: 2, beacon: 3, crate: 4, radar: 5,
};

/** The three approved sprites are processed to transparent, tightly aligned
 * WebP files. They must remain embedded in the independent offline HTML.
 */
const missionTextures = import.meta.glob<string>("./facility-v2/*.webp", {
  eager: true, query: "?inline", import: "default",
});
export const ROBOT_MISSION_ART_DIMENSIONS: Readonly<Record<RobotMissionObjectSprite, { readonly width: number; readonly height: number }>> = {
  depot: { width: 208, height: 144 },
  "depot-wreck": { width: 208, height: 144 },
  convoy: { width: 152, height: 152 },
};
const missionArtFiles: Readonly<Record<RobotMissionObjectSprite, string>> = {
  depot: "./facility-v2/depot-intact.webp",
  "depot-wreck": "./facility-v2/depot-destroyed.webp",
  convoy: "./facility-v2/convoy.webp",
};
export function robotIsMissionObjectSprite(kind: RobotFacilitySprite): kind is RobotMissionObjectSprite {
  return kind === "depot" || kind === "depot-wreck" || kind === "convoy";
}
export function robotMissionArtUrl(kind: RobotMissionObjectSprite): string | null {
  const url = missionTextures[missionArtFiles[kind]];
  return url?.startsWith("data:image/webp;base64,") ? url : null;
}

/** Core-owned object identity and HP choose the visual only. No gameplay changes. */
export function robotFacilitySpriteForStructure(id: string, missionNumber: number, hp?: number): RobotFacilitySprite | null {
  if (id === "allied-final-relay" || id === "relay") return "antenna";
  if (id === "facility") return missionNumber === 8 ? "radar" : missionNumber === 1 ? "turret" : null;
  if (missionNumber === 4 || missionNumber === 11) {
    if (["depot-left", "depot-right", "depot-west", "depot-east"].includes(id)) return hp === 0 ? "depot-wreck" : "depot";
  }
  if ([5, 12].includes(missionNumber) && id === "convoy") return "convoy";
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
  const width = marker ? .82 : kind === "depot" || kind === "depot-wreck" ? 1.58
    : kind === "convoy" ? .98 : Math.min(1.52, .9 + .56 * span);
  // Mission sprites have low silhouettes: their bases stay inside Core cells.
  const baseHeight = kind === "depot" || kind === "depot-wreck" ? 1.07 : kind === "convoy" ? .90
    : kind === "antenna" ? 1.38 : kind === "beacon" ? 1.08 : kind === "radar" ? 1.1 : 1.02;
  const height = marker ? Math.min(baseHeight, .92) : baseHeight;
  return { anchor, width, height, depth: Math.max(...cells.map(c => c.x + c.y)) };
}

