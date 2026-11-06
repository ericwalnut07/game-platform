/// <reference types="vite/client" />
import parts from "../../../../docs/design/robot-tactics/basic-parts.json";

export type RobotWeaponArtFamily = "slash" | "blunt" | "thrust" | "assault" | "sniper" | "blast";
export type RobotFrameArtShape = "attack" | "defense" | "reactor" | "mobile" | "all-rounder" | "friendly-ai";
export type RobotEnemyArtShape = "light" | "medium" | "heavy" | "boss";
export type RobotArtPalette = "base" | "alternate-a" | "alternate-b" | "boss-09" | "boss-16" | "boss-22" | "boss-27" | "boss-30";
/** One approved silhouette per unit family; frame/model variations are only palette treatments. */
export function robotArtPalette(frameId: string, enemyModel?: "A" | "B" | "C", missionNumber?: number): RobotArtPalette {
  if (frameId === "enemy-boss") {
    const suffix = missionNumber === 9 || missionNumber === 16 || missionNumber === 22 || missionNumber === 27 || missionNumber === 30
      ? missionNumber : null;
    return suffix ? `boss-${String(suffix).padStart(2, "0")}` as RobotArtPalette : "base";
  }
  if (frameId.startsWith("enemy-")) return enemyModel === "B" ? "alternate-a" : enemyModel === "C" ? "alternate-b" : "base";
  return frameId === "attack-2-a" || frameId === "defense-2" || frameId === "reactor-2" || frameId === "mobile-2" ? "alternate-a"
    : frameId === "attack-2-b" ? "alternate-b" : "base";
}
export interface RobotFrameArt {
  readonly shape: RobotFrameArtShape;
  /** Same-shape frames share base art; optional palette variants only replace colors. */
  readonly variant: string;
}

const FRAME_ART: Readonly<Record<string, RobotFrameArt>> = {
  "attack-1": { shape: "attack", variant: "attack-1" },
  "attack-2-a": { shape: "attack", variant: "attack-2-a" },
  "attack-2-b": { shape: "attack", variant: "attack-2-b" },
  "defense-1": { shape: "defense", variant: "defense-1" },
  "defense-2": { shape: "defense", variant: "defense-2" },
  "reactor-1": { shape: "reactor", variant: "reactor-1" },
  "reactor-2": { shape: "reactor", variant: "reactor-2" },
  "mobile-1": { shape: "mobile", variant: "mobile-1" },
  "mobile-2": { shape: "mobile", variant: "mobile-2" },
  "all-rounder": { shape: "all-rounder", variant: "all-rounder" }
};

export const ROBOT_WEAPON_ART_FAMILIES: readonly RobotWeaponArtFamily[] =
  ["slash", "blunt", "thrust", "assault", "sniper", "blast"];
export function robotFrameArt(frameId: string): RobotFrameArt | null {
  return FRAME_ART[frameId] ?? null;
}
export function robotFriendlyArt(): RobotFrameArt {
  return { shape: "friendly-ai", variant: "friendly-ai" };
}
export function robotWeaponArtFamily(partId: string): RobotWeaponArtFamily | null {
  const definition = parts.parts.find(p => p.id === partId);
  const family = definition && "weaponFamily" in definition ? definition.weaponFamily : null;
  return ROBOT_WEAPON_ART_FAMILIES.find(x => x === family) ?? null;
}
export function robotWeaponArtFamilyByName(name: string): RobotWeaponArtFamily | null {
  const definition = parts.parts.find(p => p.name === name && "weaponFamily" in p);
  return definition ? robotWeaponArtFamily(definition.id) : null;
}

/** All art is bundled into one offline HTML. Missing/new art falls back to the
 * existing SVG units; a missing image must never make combat unclickable. */
const images = import.meta.glob<string>("./art-v1/**/*.png", { eager: true, query: "?inline", import: "default" });
function inlineImage(path: string): string | null {
  const url = images[`./art-v1/${path}.png`];
  return url?.startsWith("data:image/png;base64,") ? url : null;
}
export function robotFrameArtUrl(frameId: string): string | null {
  const frame = robotFrameArt(frameId);
  return frame ? (inlineImage(`frames/${frame.variant}`) ?? inlineImage(`frames/${frame.shape}`)) : null;
}
export function robotFriendlyArtUrl(): string | null {
  return inlineImage("frames/friendly-ai");
}
export function robotEnemyArtUrl(shape: RobotEnemyArtShape): string | null {
  return inlineImage(`enemies/${shape}`);
}
/** Called only by presentation: default is slot 1; slot 2 appears solely
 * while the player has selected a command using that exact second part ID. */
export function robotDisplayedWeaponFamily(
  equippedWeaponIds: readonly string[], selectedWeaponId: string | null
): RobotWeaponArtFamily | null {
  const selectedSlot = equippedWeaponIds.length > 1 && selectedWeaponId !== null
    && selectedWeaponId === equippedWeaponIds[1] ? 1 : 0;
  return robotWeaponArtFamily(equippedWeaponIds[selectedSlot] ?? "");
}
export function robotWeaponArtUrl(family: RobotWeaponArtFamily): string | null {
  return inlineImage(`weapons/${family}`);
}

/** Does not alter save data, loadouts, combat events or attack legality. */
export interface RobotVisualLoadout {
  readonly frameId: string;
  readonly weaponIds: readonly string[];
}
export function robotVisualLoadout(frameId: string, weaponIds: readonly string[]): RobotVisualLoadout {
  return { frameId, weaponIds };
}
