/// <reference types="vite/client" />
import parts from "../../../../docs/design/robot-tactics/basic-parts.json";

export type RobotWeaponArtFamily = "slash" | "blunt" | "thrust" | "assault" | "sniper" | "blast";
export type RobotFrameArtShape = "attack" | "defense" | "reactor" | "mobile" | "all-rounder" | "friendly-ai";
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
