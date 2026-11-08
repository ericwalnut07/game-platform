/// <reference types="vite/client" />
import { robotArtKey, type RobotFrameArtShape } from "./RobotVisualArt";

export const ROBOT_REAR_ART_SHAPES = [
  "attack", "defense", "reactor", "mobile", "all-rounder", "friendly-ai",
] as const satisfies readonly RobotFrameArtShape[];

/**
 * Six formally adopted right-rear (camera-facing away, 45-degree) allied
 * turnarounds. Runtime thumbnails are 96px WebP cutouts with a shared
 * foot baseline of pixel 91. Original 1254px approved PNGs are retained in
 * the separate Stage 5-4 master asset pack, not embedded in every offline run.
 *
 * Raw Base64 text is source-controlled instead of duplicating image URLs:
 * Vite embeds it in the standalone file:// HTML, with zero network requests.
 * Enemy art is deliberately excluded. This is presentation-only.
 */
const sprites = import.meta.glob<string>("./art-v1/rear/*.b64.txt", {
  eager: true, query: "?raw", import: "default",
});

export const ROBOT_REAR_ART_CANVAS = { size: 96, centerX: 48, feetY: 91 } as const;

export function robotRearArtUrl(frameId: string): string | null {
  const key = robotArtKey(frameId);
  if (!key || !ROBOT_REAR_ART_SHAPES.some(shape => shape === key)) return null;
  const payload = sprites[`./art-v1/rear/${key}.b64.txt`]?.trim();
  return payload?.startsWith("UklG") ? "data:image/webp;base64," + payload : null;
}
