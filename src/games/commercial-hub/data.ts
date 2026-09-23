import type { District, RouteEdge, Suit } from "./types";

export const SUIT_NAMES: Readonly<Record<Suit, string>> = {
  commerce: "商業", industry: "工業", logistics: "物流", civic: "市政"
};
export const BUILDING_NAMES: Readonly<Record<Suit, readonly [string, string]>> = {
  commerce: ["店舗", "商館"], industry: ["工房", "工場"],
  logistics: ["倉庫", "物流センター"], civic: ["支店", "本社"]
};
export const CITY_CONDITIONS = [
  { id: "steady-growth", name: "安定成長", tricks: 5, trump: null, favoredSuit: null },
  { id: "construction-demand", name: "建設特需", tricks: 6, trump: "industry", favoredSuit: "industry" },
  { id: "credit-crunch", name: "信用収縮", tricks: 4, trump: null, favoredSuit: null },
  { id: "transport-revolution", name: "交通革命", tricks: 5, trump: "logistics", favoredSuit: "logistics" },
  { id: "consumer-boom", name: "消費ブーム", tricks: 6, trump: "commerce", favoredSuit: "commerce" }
] as const;
export const OPPORTUNITIES = [
  { id: "sales", name: "販売商機", suit: "commerce" },
  { id: "funding", name: "資金商機", suit: "commerce" },
  { id: "materials", name: "資材商機", suit: "industry" },
  { id: "production", name: "生産商機", suit: "industry" },
  { id: "transport", name: "輸送商機", suit: "logistics" },
  { id: "routes", name: "敷設商機", suit: "logistics" },
  { id: "development", name: "開発商機", suit: "civic" },
  { id: "public-project", name: "公共事業商機", suit: "civic" }
] as const;
export type OpportunityId = typeof OPPORTUNITIES[number]["id"];

export const DISTRICTS: readonly District[] = [
  { id: "OLD_TOWN", name: "旧市街", suit: null, outer: false, slots: 0 },
  { id: "MARKET", name: "市場地区", suit: "commerce", outer: false, slots: 2 },
  { id: "WORKSHOP", name: "工房地区", suit: "industry", outer: false, slots: 2 },
  { id: "WAREHOUSE", name: "倉庫地区", suit: "logistics", outer: false, slots: 2 },
  { id: "GOV", name: "官庁地区", suit: "civic", outer: false, slots: 2 },
  { id: "BUSINESS", name: "ビジネス街", suit: "commerce", outer: true, slots: 2 },
  { id: "INDUSTRIAL", name: "工業団地", suit: "industry", outer: true, slots: 2 },
  { id: "PORT", name: "港湾地区", suit: "logistics", outer: true, slots: 2 },
  { id: "NEW_TOWN", name: "新市街", suit: "civic", outer: true, slots: 3 }
];

export const ROUTE_EDGES: readonly RouteEdge[] = [
  { id: "E01", from: "OLD_TOWN", to: "MARKET" },
  { id: "E02", from: "OLD_TOWN", to: "WORKSHOP" },
  { id: "E03", from: "OLD_TOWN", to: "WAREHOUSE" },
  { id: "E04", from: "OLD_TOWN", to: "GOV" },
  { id: "E05", from: "MARKET", to: "WORKSHOP" },
  { id: "E06", from: "WORKSHOP", to: "WAREHOUSE" },
  { id: "E07", from: "WAREHOUSE", to: "GOV" },
  { id: "E08", from: "GOV", to: "MARKET" },
  { id: "E09", from: "MARKET", to: "BUSINESS" },
  { id: "E10", from: "WORKSHOP", to: "INDUSTRIAL" },
  { id: "E11", from: "WAREHOUSE", to: "PORT" },
  { id: "E12", from: "GOV", to: "NEW_TOWN" },
  { id: "E13", from: "BUSINESS", to: "INDUSTRIAL" },
  { id: "E14", from: "INDUSTRIAL", to: "PORT" },
  { id: "E15", from: "PORT", to: "NEW_TOWN" },
  { id: "E16", from: "NEW_TOWN", to: "BUSINESS" }
];
