/// <reference types="vite/client" />
import type { RobotVfxId } from "./RobotVfx";

// Explicitly inline every lossless atlas: the standalone HTML also works on file://.
const atlases = import.meta.glob<string>("./vfx-v1/*.png", { eager: true, query: "?inline", import: "default" });
export function robotVfxAtlas(id: RobotVfxId): string {
  const atlas = atlases[`./vfx-v1/${id}.png`];
  if (!atlas?.startsWith("data:image/png;base64,")) throw new Error("Missing inline VFX atlas: " + id);
  return atlas;
}
