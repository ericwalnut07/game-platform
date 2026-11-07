/// <reference types="vite/client" />
/** Original SF military SVG image assets, loaded into the standalone offline HTML. */
const art = import.meta.glob<string>("./terrain-v1/*.svg", { eager: true, query: "?raw", import: "default" });
export type RobotTerrainAsset = "floor-metal" | "floor-concrete" | "floor-stripe" | "wall-low" | "wall-corner" |
  "facility-defense" | "facility-depot" | "facility-transport" | "facility-terminal" | "facility-uplink" | "facility-decoy";
const resolved = new Map<RobotTerrainAsset, string>();
export function robotTerrainArtUrl(name: RobotTerrainAsset): string {
  const cached = resolved.get(name); if (cached) return cached;
  const source = art["./terrain-v1/" + name + ".svg"];
  if (!source) throw new Error("Missing bundled robot terrain image: " + name);
  const uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
  resolved.set(name, uri); return uri;
}
export function robotFloorArt(x: number, y: number): RobotTerrainAsset {
  const seed = (x * 19 + y * 31 + x * y * 7) % 17;
  return seed === 1 || seed === 11 ? "floor-stripe" : seed < 8 ? "floor-concrete" : "floor-metal";
}
export function robotWallArt(x: number, y: number, wallCells: ReadonlySet<string>): RobotTerrainAsset {
  const has = (a: number, b: number) => wallCells.has(a + "," + b);
  const vertical = has(x, y - 1) || has(x, y + 1);
  const horizontal = has(x - 1, y) || has(x + 1, y);
  return vertical && horizontal ? "wall-corner" : "wall-low";
}
export function robotStructureArt(name: string, id: string): RobotTerrainAsset {
  if (/輸送|convoy|transport/i.test(name + id)) return "facility-transport";
  if (/補給|depot|supply/i.test(name + id)) return "facility-depot";
  if (/デコイ|decoy/i.test(name + id)) return "facility-decoy";
  if (/端末|data|terminal|機密/i.test(name + id)) return "facility-terminal";
  if (/送信|upload|relay|通信/i.test(name + id)) return "facility-uplink";
  return "facility-defense";
}
export function robotObjectiveArt(id: string, label: string): RobotTerrainAsset {
  if (/data-floor|data:pickup|データ取得|落下データ/i.test(id + label)) return "facility-terminal";
  if (/data-upload|データ送信/i.test(id + label)) return "facility-uplink";
  return "facility-defense";
}
