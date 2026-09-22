export const GAME_ID = "commercial-hub" as const;
export const RULES_VERSION = "0.1" as const;
export const SUITS = ["commerce", "industry", "logistics", "civic"] as const;
export type Suit = typeof SUITS[number];
export type PlayerId = string;
export interface Card { readonly suit: Suit; readonly rank: number }
export interface PlayedCard { readonly playerId: PlayerId; readonly card: Card }
export type TradableResource = "materials" | "goods" | "cash";
export interface TradeBundle { readonly materials: number; readonly goods: number; readonly cash: number }
export interface Resources extends TradeBundle { readonly influence: number }
export type DistrictId = "OLD_TOWN" | "MARKET" | "WORKSHOP" | "WAREHOUSE" | "GOV"
  | "BUSINESS" | "INDUSTRIAL" | "PORT" | "NEW_TOWN";
export interface District {
  readonly id: DistrictId;
  readonly name: string;
  readonly suit: Suit | null;
  readonly outer: boolean;
  readonly slots: number;
}
export interface RouteEdge { readonly id: string; readonly from: DistrictId; readonly to: DistrictId }
export type RouteOwnership = Readonly<Partial<Record<string, PlayerId>>>;
export interface Building {
  readonly id: string;
  readonly playerId: PlayerId;
  readonly district: DistrictId;
  readonly suit: Suit;
  readonly upgraded: boolean;
}
export interface Company {
  readonly playerId: PlayerId;
  readonly resources: Resources;
}
export type ProjectResource = "materials" | "cash" | "influence";
export interface ProjectSlot {
  readonly resource: ProjectResource;
  readonly playerId: PlayerId | null;
}
export interface PublicProject {
  readonly id: string;
  readonly name: string;
  readonly slots: readonly ProjectSlot[];
}
export interface ValueBreakdown {
  readonly buildings: number;
  readonly upgrades: number;
  readonly routes: number;
  readonly projects: number;
  readonly cash: number;
  readonly inventory: number;
  readonly total: number;
}
