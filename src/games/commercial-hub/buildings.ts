import { districtOf } from "./data";
import { BUILDING_SUITS, type Building, type BuildingSuit, type DistrictId } from "./types";
export function remainingBuildingCapacity(buildings: readonly Building[], playerId: string) {
  const own = buildings.filter((b) => b.playerId === playerId);
  return { total: Math.max(0, 6 - own.length), bySuit: Object.fromEntries(BUILDING_SUITS.map((s) => [s, Math.max(0, 3 - own.filter((b) => b.suit === s).length)])) as Record<BuildingSuit, number> };
}
export function assertCanBuild(buildings: readonly Building[], playerId: string, district: DistrictId, suit: BuildingSuit, level: number): void {
  const d = districtOf(district), cap = remainingBuildingCapacity(buildings, playerId);
  if (!BUILDING_SUITS.includes(suit) || cap.total === 0 || cap.bySuit[suit] === 0) throw new Error("建物数の上限です");
  if (d.outer && level < 2) throw new Error("外周地区はLv2の翌ラウンドからです");
  if (d.suit && d.suit !== suit) throw new Error("地区の系統に対応する建物を選んでください");
  if (buildings.filter((b) => b.district === district).length >= d.slots || buildings.some((b) => b.district === district && b.playerId === playerId)) throw new Error("この地区には建設できません");
}
export function discountCapacity(b: Building): number { return b.suit === "procurement" ? b.upgraded ? 2 : 1 : 0; }
