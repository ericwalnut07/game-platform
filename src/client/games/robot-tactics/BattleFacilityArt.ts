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
  if (({
    4: ["depot-left", "depot-right"], 11: ["depot-west", "depot-east"],
    15: ["uplink-facility"], 18: ["western-hub", "eastern-hub"], 22: ["relay-hub"],
    23: ["west-supply", "east-supply"], 25: ["western-hub", "eastern-hub"], 28: ["central-relay"],
    29: ["west-cache", "east-cache"],
  } as Readonly<Record<number, readonly string[]>>)[missionNumber]?.includes(id)) {
    return hp === 0 ? "depot-wreck" : "depot";
  }
  if (["convoy", "supply-convoy", "armored-carrier", "supplies"].includes(id)) return "convoy";
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

/** The opaque lower edge of the adopted sprites, measured from their alpha
 * channel (>40/255), as exclusive source-pixel Y. This deliberately includes
 * the atlas tiles' differing lower transparent margins. No bitmap edits.
 */
export const ROBOT_FACILITY_VISIBLE_BOTTOM_PX: Readonly<Record<RobotFacilitySprite, number>> = {
  turret: 88, console: 88, antenna: 89, beacon: 75, crate: 76, radar: 80,
  depot: 136, "depot-wreck": 136, convoy: 144,
};

/** Vertical distance from the SVG viewport's bottom to the visible art's
 * actual foot. Include aspect-ratio letterboxing AND transparent pixels.
 * The 2-cell legacy atlas artwork can be stretched, as before; approved
 * depot/vehicle art always retains its original proportions.
 */
export function robotFacilityVisibleBottomInset(
  kind: RobotFacilitySprite, width: number, height: number, preserveAspectRatio = true,
): number {
  const dimensions = robotIsMissionObjectSprite(kind)
    ? ROBOT_MISSION_ART_DIMENSIONS[kind]
    : { width: ROBOT_FACILITY_ATLAS_CELL, height: ROBOT_FACILITY_ATLAS_CELL };
  const scale = preserveAspectRatio
    ? Math.min(width / dimensions.width, height / dimensions.height)
    : height / dimensions.height;
  const renderedHeight = preserveAspectRatio ? dimensions.height * scale : height;
  return (height - renderedHeight) / 2 +
    (dimensions.height - ROBOT_FACILITY_VISIBLE_BOTTOM_PX[kind]) * scale;
}

/** Anchor text/status at the footprint center, but place the artwork's
 * visible bottom at the FRONT edge of the projected footprint. Because
 * projected X depends on (x-y), the contact shifts x/y equally: it moves
 * DOWN the isometric screen without drifting left/right.
 *
 * All coordinates are visual only; game cells, LOS, hit areas and depth
 * sorting remain the authoritative Core coordinates.
 */
export function robotFacilityPlacement(
  cells: readonly RobotPosition[], kind: RobotFacilitySprite, marker = false,
): {
  readonly anchor: RobotPosition;
  readonly contact: RobotPosition;
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
  const footprintWidth = maxX - minX + 1, footprintHeight = maxY - minY + 1;
  // The frontmost visible diamond corner has projected Y at
  // (maxX + 1 + maxY + 1) * ROBOT_ISO_HALF_HEIGHT. Keep the footprint's
  // projected horizontal center fixed while aligning to that Y.
  const scale = !marker && cells.length === 2 && ["depot", "depot-wreck", "turret", "radar", "antenna"].includes(kind) ? .82 : 1;
  const frontShift = (footprintWidth + footprintHeight) / 4 * scale;
  const contact = { x: anchor.x + frontShift, y: anchor.y + frontShift };
  const span = Math.max(maxX - minX, maxY - minY);
  const width = marker ? .82 : kind === "depot" || kind === "depot-wreck" ? 1.58
    : kind === "convoy" ? .98 : Math.min(1.52, .9 + .56 * span);
  // Mission sprites have low silhouettes: their bases stay inside Core cells.
  const baseHeight = kind === "depot" || kind === "depot-wreck" ? 1.07 : kind === "convoy" ? .90
    : kind === "antenna" ? 1.38 : kind === "beacon" ? 1.08 : kind === "radar" ? 1.1 : 1.02;
  const height = marker ? Math.min(baseHeight, .92) : baseHeight;
  return { anchor, contact, width: width * scale, height: height * scale, depth: Math.max(...cells.map(c => c.x + c.y)) };
}

