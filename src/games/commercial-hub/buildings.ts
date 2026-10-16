import { districtOf } from "./data";
import { BUILDING_SUITS, type Building, type BuildingSuit, type DistrictId } from "./types";
export function remainingBuildingCapacity(buildings: readonly Building[], playerId: string, maximum = 6) {
  const own = buildings.filter((b) => b.playerId === playerId);
  return { total: Math.max(0, maximum - own.length), bySuit: Object.fromEntries(BUILDING_SUITS.map((s) => [s, Math.max(0, 3 - own.filter((b) => b.suit === s).length)])) as Record<BuildingSuit, number> };
}
export function districtBuildingSlots(district: DistrictId): number {
  const d = districtOf(district);
  return d.slots + (["REDEVELOPMENT", "BUSINESS", "INDUSTRIAL", "PORT"].includes(d.id) ? 1 : 0);
}
export function assertCanBuild(buildings: readonly Building[], playerId: string, district: DistrictId, suit: BuildingSuit, level: number, maximum = 6, distinctSuits = false): void {
  const d = districtOf(district), cap = remainingBuildingCapacity(buildings, playerId, maximum);
  if (!BUILDING_SUITS.includes(suit) || cap.total === 0 || cap.bySuit[suit] === 0) throw new Error("建物数の上限です");
  if (district === "PRIVATE") { if (buildings.some(b=>b.playerId===playerId&&b.district==="PRIVATE")) throw Error("専用地区は1棟までです"); return; }
  if (d.outer && level < 2) throw new Error("外周地区はLv2の翌ラウンドからです");
  if (buildings.filter((b) => b.district === district).length >= districtBuildingSlots(district)) throw new Error(distinctSuits ? "この地区の建設枠は満杯です" : "この地区には建設できません");
  const ownLocal = buildings.filter((b) => b.district === district && b.playerId === playerId);
  if (distinctSuits ? ownLocal.some(b => b.suit === suit) : district !== "REDEVELOPMENT" && ownLocal.length > 0) {
    throw new Error(distinctSuits ? "この地区には自社の同系統建物があります" : "この地区には建設できません");
  }
}


