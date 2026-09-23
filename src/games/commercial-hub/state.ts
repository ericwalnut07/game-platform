import type { AbilityUse } from "./buildings";
import type { CITY_CONDITIONS, OpportunityId } from "./data";
import type { InvestmentTurn, TradeTerms } from "./negotiation";
import type { MarketAction } from "./resources";
import type { roundEndResult } from "./scoring";
import type { Building, Card, Company, DistrictId, PlayedCard, PublicProject, RouteOwnership, Suit, ValueBreakdown } from "./types";

export type CityCondition = typeof CITY_CONDITIONS[number];
export type HubPhase = "ROUND_START" | "TRICK" | "REWARD" | "TRICK_RESULT" | "INVESTMENT" | "INCOME" | "ROUND_END" | "FINISHED";
export interface Credits { route: number; transport: number; businessSale: number; productionBoost: number; constructionCash: number }
export interface DiscountUses { transport: string[]; route: string[]; influence: string[] }
export interface DistrictBonus { playerId: string; district: DistrictId; availableRound: number; activated: boolean }
export interface HubEvent { seq: number; round: number; type: string; playerId: string | null; data: Record<string, unknown> }
export interface TrickResult { round: number; index: number; opportunity: OpportunityId; played: PlayedCard[]; ranking: string[] }
export type RewardChoice = { playerId: string; kind: "SALE"; maximum: number } | { playerId: string; kind: "PROJECT" };
export type HubResult = NonNullable<ReturnType<typeof roundEndResult>["result"]>;
export interface HubState {
  gameId: "commercial-hub";
  rulesVersion: "0.1";
  matchId: string;
  phase: HubPhase;
  revision: number;
  players: string[];
  round: number;
  cityCondition: CityCondition;
  trump: Suit | null;
  opportunities: OpportunityId[];
  playerHands: Record<string, Card[]>;
  trickIndex: number;
  trickLeader: string;
  playedCards: PlayedCard[];
  trickResults: TrickResult[];
  rewardChoices: RewardChoice[];
  roundReady: string[];
  investmentStarter: string;
  currentInvestmentPass: 1 | 2;
  investmentTurnIndex: number;
  investmentTurn: InvestmentTurn | null;
  publicMarketUsedByPlayer: string[];
  companies: Company[];
  buildings: Building[];
  nextBuildingId: number;
  routeOwnership: RouteOwnership;
  credits: Record<string, Credits>;
  discountUses: DiscountUses;
  districtBonuses: DistrictBonus[];
  abilityUses: AbilityUse[];
  incomeDone: string[];
  cityDevelopment: number;
  cityLevel: 1 | 2 | 3 | 4;
  activePublicProject: PublicProject | null;
  completedPublicProjects: PublicProject[];
  companyValues: Record<string, ValueBreakdown>;
  finalRound: number | null;
  cityLevel4Round: number | null;
  result: HubResult | null;
  eventSeq: number;
  events: HubEvent[];
}
export type InvestmentAction =
  | { type: "BUILD"; district: DistrictId; suit: Suit; access: string }
  | { type: "UPGRADE"; buildingId: string }
  | { type: "ROUTE"; edgeId: string }
  | { type: "CONTRIBUTE"; slot: number };
export type HubClientAction = InvestmentAction
  | { type: "ROUND_READY" }
  | { type: "PLAY_CARD"; card: Card }
  | { type: "CLAIM_REWARD"; amount: number }
  | { type: "OFFER_TRADE"; counterpart: string; terms: TradeTerms }
  | { type: "COUNTER_TRADE"; terms: TradeTerms }
  | { type: "ANSWER_TRADE"; accept: boolean }
  | { type: "SKIP_NEGOTIATION" }
  | { type: "MARKET"; action: MarketAction | null }
  | { type: "PASS_INVESTMENT" }
  | { type: "INCOME"; selections: Record<string, number> };
export type HubAction = (HubClientAction & { playerId: string }) | { type: "ADVANCE" };

export function emptyCredits(): Credits { return { route: 0, transport: 0, businessSale: 0, productionBoost: 0, constructionCash: 0 }; }
export function addEvent(state: Pick<HubState, "eventSeq" | "events" | "round">, type: string, playerId: string | null, data: Record<string, unknown> = {}): void {
  state.eventSeq += 1;
  state.events.push({ seq: state.eventSeq, round: state.round, type, playerId, data });
  // The complete history is in D1. Keep DO messages/storage bounded during long games.
  state.events = state.events.slice(-80);
}
export function companyOf(state: Pick<HubState, "companies">, playerId: string): Company {
  const company = state.companies.find((entry) => entry.playerId === playerId);
  if (!company) throw new Error("Unknown player");
  return company;
}
