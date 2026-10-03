import type { BuildingSuit, District, Suit } from "./types";
export const SUIT_NAMES: Record<Suit, string> = { commerce: "商業", industry: "工業", procurement: "調達", administration: "行政" };
export const BUILDING_NAMES: Record<BuildingSuit, readonly [string, string]> = { commerce: ["店舗", "商館"], industry: ["工房", "工場"], procurement: ["倉庫", "物流センター"] };
export const CITY_CONDITIONS = [
  { id: "steady-growth", name: "安定成長", tricks: 5, trump: null, counts: [1, 1, 2, 1] },
  { id: "construction-demand", name: "建設特需", tricks: 5, trump: "industry", counts: [1, 2, 1, 1] },
  { id: "credit-crunch", name: "信用収縮", tricks: 5, trump: null, counts: [1, 1, 1, 2] },
  { id: "transport-revolution", name: "交通革命", tricks: 5, trump: "procurement", counts: [1, 1, 2, 1] },
  { id: "consumer-boom", name: "消費ブーム", tricks: 5, trump: "commerce", counts: [2, 1, 1, 1] }
] as const;
export type MarketId = typeof CITY_CONDITIONS[number]["id"];
export interface CityCondition { id: MarketId | "opening" | "special-boom"; name: string; tricks: number; trump: Suit | null; counts: readonly number[] }
export const OPENING: CityCondition = { id: "opening", name: "開業商機", tricks: 6, trump: null, counts: [2, 2, 1, 1] };
export const SPECIAL_BOOM: CityCondition = { id: "special-boom", name: "Lv3特別消費ブーム", tricks: 6, trump: "commerce", counts: [2, 1, 2, 1] };
export const OPPORTUNITIES = [
  { id: "sales", name: "販売", suit: "commerce", from: 2, until: 4 }, { id: "promotion", name: "販促", suit: "commerce", from: 3, until: 4 },
  { id: "processing", name: "加工", suit: "industry", from: 1, until: 4 }, { id: "expansion", name: "増産", suit: "industry", from: 3, until: 4 },
  { id: "purchase", name: "仕入れ", suit: "procurement", from: 1, until: 4 }, { id: "bulk", name: "大量仕入れ", suit: "procurement", from: 3, until: 4 },
  { id: "development", name: "開発", suit: "administration", from: 1, until: 4 }, { id: "public-project", name: "公共事業", suit: "administration", from: 2, until: 4 },
  { id: "cash-support", name: "資金支援", suit: "commerce", from: 1, until: 2 },
  { id: "goods-support", name: "商品支援", suit: "commerce", from: 1, until: 1 },
  { id: "materials-support", name: "資材支援", suit: "industry", from: 1, until: 2 },
  { id: "materials-support", name: "資材支援", suit: "procurement", from: 1, until: 2 },
  { id: "cash-support", name: "資金支援", suit: "administration", from: 1, until: 1 }
] as const;
export function opportunitiesAtLevel(suit: Suit, level: number) { return OPPORTUNITIES.filter((o) => o.suit === suit && level >= o.from && level <= o.until); }
export function opportunityCountKey(o: { suit: Suit; id: string }): string { return `${o.suit}:${o.id}`; }
export type OpportunityId = typeof OPPORTUNITIES[number]["id"];
export interface Opportunity { id: OpportunityId | "opening" | "special-materials"; name: string; suit: Suit; trump: Suit | null }
export const DISTRICTS: readonly District[] = [
  { id: "MARKET", name: "市場", suit: "commerce", outer: false, slots: 2 },
  { id: "WORKSHOP", name: "工房地区", suit: "industry", outer: false, slots: 2 },
  { id: "WAREHOUSE", name: "倉庫地区", suit: "procurement", outer: false, slots: 2 },
  { id: "REDEVELOPMENT", name: "再開発地区", suit: null, outer: false, slots: 2 },
  { id: "BUSINESS", name: "ビジネス街", suit: "commerce", outer: true, slots: 2 },
  { id: "INDUSTRIAL", name: "工業団地", suit: "industry", outer: true, slots: 2 },
  { id: "PORT", name: "港湾", suit: "procurement", outer: true, slots: 2 },
  { id: "NEW_TOWN", name: "新市街", suit: null, outer: true, slots: 3 }
];
export function districtOf(id: string): District { const d = DISTRICTS.find((entry) => entry.id === id); if (!d) throw new Error("地区が不正です"); return d; }
