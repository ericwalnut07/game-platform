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

/** Purely visual palette variants. The same base silhouette is used for
 * every model; subtle tint changes keep the red/blue/green team identity. */
export function robotArtPaletteFilter(palette: RobotArtPalette): string {
  const filters: Record<RobotArtPalette, string> = {
    "base": "none",
    "alternate-a": "hue-rotate(-18deg) saturate(1.12)",
    "alternate-b": "hue-rotate(20deg) saturate(1.08)",
    "boss-09": "hue-rotate(-12deg) brightness(1.08)",
    "boss-16": "hue-rotate(12deg) saturate(1.12)",
    "boss-22": "hue-rotate(-24deg) saturate(.9)",
    "boss-27": "hue-rotate(25deg) saturate(1.2)",
    "boss-30": "brightness(.9) saturate(1.25)"
  };
  return filters[palette];
}

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

/** Runtime-ready sprites are bundled into the single offline HTML. The approved
 * 1024px portrait masters are excluded from the standard runtime bundle;
 * the explicit portrait profile below includes the five customization shapes.
 * A missing weapon image must never make combat unclickable. */
const images = import.meta.glob<string>(
  ["./art-v1/frames/*.png", "./art-v1/enemies/*.png", "./art-v1/weapons/*.png"],
  { eager: true, query: "?inline", import: "default" }
);
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

export type RobotArtKey = RobotFrameArtShape | RobotEnemyArtShape;
/** The registered PNG canvas encodes relative chassis heights and shares y=243 feet. */
export const ROBOT_ART_CANVAS = { size: 256, centerX: 128, feetY: 243 } as const;
export const ROBOT_ART_KEYS: readonly RobotArtKey[] = ["attack","defense","reactor","mobile","all-rounder","friendly-ai","light","medium","heavy","boss"];
export function robotArtKey(frameId: string): RobotArtKey | null {
  if(frameId==="friendly-ai")return "friendly-ai";
  if(frameId.startsWith("enemy-"))return (["light","medium","heavy","boss"] as const).find(k=>frameId==="enemy-"+k)??null;
  return robotFrameArt(frameId)?.shape??null;
}
/** Cosmetic anchor coordinates on the existing 256px canvas; no art is rescaled per model. */
const RIGHT_HAND: Readonly<Record<RobotArtKey, readonly [number,number]>> = {
  attack:[91,166],defense:[82,168],reactor:[83,170],mobile:[81,169],"all-rounder":[85,170],"friendly-ai":[84,170],
  light:[104,191],medium:[96,181],heavy:[80,166],boss:[71,157]
};
/** Screen coordinates of the right fist in the accepted right-rear artwork.
 * The weapon still follows the equipped slot; no weapon is baked into a frame.
 * Enemy keys deliberately retain their original front-side grip positions. */
const RIGHT_HAND_REAR: Readonly<Record<RobotFrameArtShape, readonly [number, number]>> = {
  attack: [184, 151], defense: [183, 151], reactor: [188, 150],
  mobile: [184, 151], "all-rounder": [188, 151], "friendly-ai": [185, 152],
};
const WEAPON_POSE: Readonly<Record<RobotArtKey,{readonly width:number;readonly height:number;readonly angle:number}>> = {
  attack:{width:.42,height:.5,angle:0},defense:{width:.42,height:.5,angle:0},reactor:{width:.42,height:.5,angle:0},mobile:{width:.42,height:.5,angle:0},"all-rounder":{width:.42,height:.5,angle:0},"friendly-ai":{width:.42,height:.5,angle:0},
  light:{width:.32,height:.38,angle:0},medium:{width:.38,height:.45,angle:0},heavy:{width:.46,height:.54,angle:0},boss:{width:.5,height:.58,angle:0}
};
export type RobotArtFacing = "front" | "right-rear";
export function robotArtPlacement(frameId: string, facing: RobotArtFacing = "front") {
  const key=robotArtKey(frameId),scale=.84,y=.81-scale*ROBOT_ART_CANVAS.feetY/ROBOT_ART_CANVAS.size;
  const rearHand = facing === "right-rear" && key && key in RIGHT_HAND_REAR
    ? RIGHT_HAND_REAR[key as RobotFrameArtShape] : null;
  const hand=rearHand ?? RIGHT_HAND[key??"attack"];
  return {key,body:{x:(1-scale)/2,y,width:scale,height:scale},hand:{x:(1-scale)/2+scale*hand[0]/256,y:y+scale*hand[1]/256},weapon:{...WEAPON_POSE[key??"attack"],gripX:.5,gripY:.65}};
}
export function robotUnitArtUrl(frameId:string):string|null {
  const key=robotArtKey(frameId);return key==="friendly-ai"?robotFriendlyArtUrl():key&&["light","medium","heavy","boss"].includes(key)?robotEnemyArtUrl(key as RobotEnemyArtShape):robotFrameArtUrl(frameId);
}
/** Explicit opt-in PC/high-resolution profile; standard offline builds keep only map sprites. */
const portraitImages = import.meta.env.VITE_ROBOT_ART_PORTRAITS === "true" ? import.meta.glob<string>(
  ["./art-v1/portraits/frames/attack.png","./art-v1/portraits/frames/defense.png","./art-v1/portraits/frames/reactor.png","./art-v1/portraits/frames/mobile.png","./art-v1/portraits/frames/all-rounder.png"],
  { eager:true,query:"?inline",import:"default" }
) : {};
export function robotPortraitArtUrl(frameId:string):string|null {
  const key=robotArtKey(frameId);if(!key)return null;
  const folder=["light","medium","heavy","boss"].includes(key)?"enemies":"frames";
  const value=portraitImages[`./art-v1/portraits/${folder}/${key}.png`];
  return value?.startsWith("data:image/png;base64,")?value:null;
}
export function robotBodyArtSources(frameId:string,portrait=false):readonly string[] {
  const map=robotUnitArtUrl(frameId),master=portrait?robotPortraitArtUrl(frameId):null;
  return [...new Set([master,map].filter((s):s is string=>s!==null))];
}
