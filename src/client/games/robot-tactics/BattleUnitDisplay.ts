/**
 * Cosmetic-only ground anchoring for unit sprites on the isometric map.
 * Approved front/rear cutouts align their boots at 243/256 and 91/96,
 * respectively, and robotArtPlacement currently puts that point at y=0.81.
 * The lower offset obscures which diamond belongs to a crowded mech.
 * Center the boots a little behind the tile centre (y=0.60) instead.
 *
 * Do NOT apply this to hit boxes, targeting, movement paths, camera or saves.
 */
export const ROBOT_BATTLE_ART_ORIGINAL_FOOT_Y = 0.81;
export const ROBOT_BATTLE_ART_TARGET_FOOT_Y = 0.60;
export const ROBOT_BATTLE_ART_OFFSET_Y = ROBOT_BATTLE_ART_TARGET_FOOT_Y - ROBOT_BATTLE_ART_ORIGINAL_FOOT_Y;

/** Used only by SVG image/fallback translation; logical cell is unchanged. */
export function robotBattleArtTranslation(x: number, y: number): string {
  return `translate(${x} ${y + ROBOT_BATTLE_ART_OFFSET_Y})`;
}

import type { RobotBattleUnitView } from "./BattleViewModel";

/** UI list membership is derived from the current trusted view each render. */
export function robotBattleLiveUnits(
  units: readonly RobotBattleUnitView[], side: "ally" | "enemy",
): readonly RobotBattleUnitView[] {
  return units.filter(u => u.hp > 0 && (side === "enemy" ? u.kind === "enemy" : u.kind !== "enemy"));
}

/** Never carry an unavailable or defeated ID across a checkpoint. */
export function robotBattleHighlightedUnit(
  units: readonly RobotBattleUnitView[], selectedId: string | null,
): RobotBattleUnitView | null {
  return selectedId ? units.find(u => u.id === selectedId && u.hp > 0) ?? null : null;
}
