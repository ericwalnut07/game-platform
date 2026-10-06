export const GAME_ID = "commercial-hub" as const;
export const RULES_VERSION = "0.5" as const;
export const SUITS = ["commerce", "industry", "procurement", "administration"] as const;
export const BUILDING_SUITS = ["commerce", "industry", "procurement"] as const;
export type Suit = typeof SUITS[number];
export type BuildingSuit = typeof BUILDING_SUITS[number];
export type PlayerId = string;
export interface Card { readonly suit: Suit; readonly rank: number }
export interface PlayedCard { readonly playerId: PlayerId; readonly card: Card }
export type TradableResource = "materials" | "goods" | "cash";
export interface Resources { materials: number; goods: number; cash: number }
export type TradeBundle = Resources;
export const DISTRICT_IDS = ["MARKET", "WORKSHOP", "WAREHOUSE", "REDEVELOPMENT", "BUSINESS", "INDUSTRIAL", "PORT", "NEW_TOWN"] as const;
export type DistrictId = typeof DISTRICT_IDS[number];
export interface District { id: DistrictId; name: string; suit: BuildingSuit | null; outer: boolean; slots: number }
export interface Building { id: string; playerId: string; district: DistrictId; suit: BuildingSuit; upgraded: boolean }
export interface Route { playerId: string; district: DistrictId }
export interface Company { playerId: string; resources: Resources }
export interface ProjectSlot { resource: TradableResource; amount: number; playerId: string | null }
export interface PublicProject { id: string; name: string; slots: ProjectSlot[] }
export interface ValueBreakdown { buildings: number; routes: number; projects: number; cash: number; inventory: number; prediction?: number; assets: number; total: number }
export type Access = "OWN" | "PUBLIC" | string;
export interface TransportCharge { payer: string; payee: string | null; amount: number; district: DistrictId; reason: "UPGRADE" | "PRODUCTION" | "SALE" | "PROCUREMENT" }
