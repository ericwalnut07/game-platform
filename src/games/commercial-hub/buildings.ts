import { DISTRICTS } from "./data";
import { NO_COST, gain, pay } from "./resources";
import { SUITS, type Building, type DistrictId, type PlayerId, type Resources, type Suit } from "./types";

export const UPGRADE_COST: Resources = Object.freeze({ ...NO_COST, materials: 1, cash: 2 });
export function remainingBuildingCapacity(buildings: readonly Building[], playerId: PlayerId) {
  const owned = buildings.filter((building) => building.playerId === playerId);
  return {
    total: Math.max(0, 6 - owned.length),
    bySuit: Object.fromEntries(SUITS.map((suit) => [suit, Math.max(0, 3 - owned.filter((building) => building.suit === suit).length)])) as Record<Suit, number>
  };
}
export function buildingPlacementError(buildings: readonly Building[], playerId: PlayerId, districtId: DistrictId, suit: Suit, cityLevel: number): string | null {
  const district = DISTRICTS.find((entry) => entry.id === districtId);
  if (!district || district.slots === 0) return "建設できない地区です";
  if (!SUITS.includes(suit)) return "建物系統が不正です";
  if (district.outer && cityLevel < 2) return "外周はCity Lv2から建設できます";
  const inDistrict = buildings.filter((building) => building.district === districtId);
  if (inDistrict.length >= district.slots) return "この地区の建物枠は満杯です";
  if (inDistrict.some((building) => building.playerId === playerId)) return "同じ地区は1商会1建物までです";
  const capacity = remainingBuildingCapacity(buildings, playerId);
  if (capacity.total === 0) return "建物は合計6軒までです";
  if (capacity.bySuit[suit] === 0) return "同じ系統の建物は3軒までです";
  return null;
}
/** Base build cost, before transport or building discounts. */
export function baseBuildingCost(buildings: readonly Building[], playerId: PlayerId, districtId: DistrictId, suit: Suit): Resources {
  const district = DISTRICTS.find((entry) => entry.id === districtId);
  if (!district || !district.slots || !SUITS.includes(suit)) throw new Error("建設対象が不正です");
  const firstWorkshop = suit === "industry" && !buildings.some((building) => building.playerId === playerId && building.suit === "industry");
  return { ...NO_COST, materials: 1, cash: firstWorkshop ? 1 : 2, influence: district.outer ? 1 : 0 };
}
export function upgradeBuilding(buildings: readonly Building[], playerId: PlayerId, buildingId: string, resources: Resources) {
  const building = buildings.find((entry) => entry.id === buildingId);
  if (!building || building.playerId !== playerId) throw new Error("自社の建物を選んでください");
  if (building.upgraded) throw new Error("既に上位化されています");
  return {
    resources: pay(resources, UPGRADE_COST),
    buildings: buildings.map((entry) => entry.id === buildingId ? { ...entry, upgraded: true } : entry)
  };
}

export interface AbilityUse { readonly round: number; readonly buildingId: string; readonly ability: "production" | "sales" | "income" }
function recordUse(building: Building, round: number, used: readonly AbilityUse[], ability: AbilityUse["ability"]): AbilityUse[] {
  if (!Number.isSafeInteger(round) || round < 1) throw new Error("ラウンドが不正です");
  if (used.some((entry) => entry.round === round && entry.buildingId === building.id && entry.ability === ability)) {
    throw new Error("この建物の能力はこのラウンドで使用済みです");
  }
  return [...used, { round, buildingId: building.id, ability }];
}
/** Executes one selected production. The round controller owns selection and order. */
export function produce(building: Building, resources: Resources, round: number, used: readonly AbilityUse[]) {
  if (building.suit !== "industry") throw new Error("工業建物ではありません");
  const paid = pay(resources, { ...NO_COST, materials: 1 });
  return {
    resources: gain(paid, { ...NO_COST, goods: building.upgraded ? 3 : 2, cash: building.upgraded ? 1 : 0 }),
    used: recordUse(building, round, used, "production")
  };
}
export function sell(building: Building, resources: Resources, goods: number, round: number, used: readonly AbilityUse[]) {
  if (building.suit !== "commerce") throw new Error("商業建物ではありません");
  if (!Number.isInteger(goods) || goods < 1 || goods > (building.upgraded ? 2 : 1)) throw new Error("販売する商品数が不正です");
  return {
    resources: gain(pay(resources, { ...NO_COST, goods }), { ...NO_COST, cash: goods * 2 }),
    used: recordUse(building, round, used, "sales")
  };
}
export function civicIncome(building: Building, resources: Resources, round: number, used: readonly AbilityUse[]) {
  if (building.suit !== "civic") throw new Error("市政建物ではありません");
  return { resources: gain(resources, { ...NO_COST, influence: 1 }), used: recordUse(building, round, used, "income") };
}
/** Per-building capacities, not a stacking/payment-order policy. */
export function discountCapacity(building: Building) {
  return {
    transport: building.suit === "logistics" ? 1 : 0,
    firstRouteCash: building.suit === "logistics" && building.upgraded ? 1 : 0,
    firstInfluencePayment: building.suit === "civic" && building.upgraded ? 1 : 0
  };
}
