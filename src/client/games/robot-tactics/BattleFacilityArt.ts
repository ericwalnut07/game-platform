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
  if (id.startsWith("breakthrough:") || id.startsWith("m10-breakthrough:")) return "beacon";
  return null; // A target enemy / depot overlay / other marker is not a facility.
}

export function robotFacilityPlacement(
  cells: readonly RobotPosition[], kind: RobotFacilitySprite, marker = false,
): { readonly anchor: { readonly x: number; readonly y: number }; readonly width: number; readonly height: number } {
  if (!cells.length) throw new Error("A display facility needs an existing footprint");
  const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
  const anchor = {
    x: (Math.min(...xs) + Math.max(...xs) + 1) / 2,
    y: Math.max(...ys) + (marker ? .76 : .86),
  };
  const footprintWidth = Math.max(...xs) - Math.min(...xs) + 1;
  const width = marker ? .88 : Math.min(1.64, 1.03 + .29 * (footprintWidth - 1));
  const baseHeight = kind === "antenna" ? 1.53 : kind === "beacon" ? 1.28 : kind === "radar" ? 1.22 : 1.12;
  return { anchor, width, height: marker ? Math.min(baseHeight, 1.02) : baseHeight };
}
