import type { CityCondition, MarketId, Opportunity, OpportunityId } from "./data";
import type { MarketAction } from "./resources";
import type { Access, Building, BuildingSuit, Card, Company, DistrictId, PlayedCard, PublicProject, Resources, Route, TransportCharge, ValueBreakdown } from "./types";
export type HubPhase = "ROUND_START" | "TRICK" | "REWARD" | "TRICK_RESULT" | "PROCUREMENT" | "PRODUCTION" | "INVESTMENT" | "ROUND_END" | "FINISHED";
export interface TradeTerms { give: Resources; receive: Resources }
export interface Negotiation extends TradeTerms { id: string; proposer: string; counterpart: string; status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" }
export interface RoundBenefits { promotion: number; production: number; bulk: number; development: number; project: ("FREE" | "REBATE")[] }
export interface RoundUsage { purchases: number; disposals: number; discounts: Record<string, number>; buildings: string[]; proposed: boolean }
export interface HubEvent { seq: number; round: number; type: string; playerId: string | null; data: Record<string, unknown> }
export interface TrickResult { round: number; index: number; opportunity: Opportunity; played: PlayedCard[]; ranking: string[]; rewardRanking: string[] }
export interface RewardChoice { playerId: string; kind: "SALE" | "PROCESS" | "PURCHASE"; maximum: number; cash: number; goods: number }
export interface RankedCompany { playerId: string; value: ValueBreakdown; cash: number; deficit: boolean; rank: number; tieBreak: "DEFICIT" | "VALUE" | "ASSETS" | "BUILDINGS" | "PROJECTS" | "TIED" }
export interface HubResult { reason: "CITY_LV4_FINAL_ROUND" | "ROUND_10"; round: number; ranking: RankedCompany[]; winners: string[] }
export interface Development { buildings: number; upgrades: number; routes: number; projects: number }
export interface Settlement { round: number; cashBefore: Record<string, number>; cashAfter: Record<string, number>; charges: TransportCharge[]; development: Development; developmentBefore: number; developmentAfter: number; levelBefore: number; levelAfter: number }
export interface PlayerConnection { connected: boolean; disconnectedAt: number | null; bot: boolean }
export interface HubState {
  gameId: "commercial-hub"; rulesVersion: "0.2"; matchId: string; phase: HubPhase; revision: number;
  players: string[]; startingPlayer: string; round: number; cityCondition: CityCondition;
  marketBag: MarketId[]; marketUsed: MarketId[]; opportunityCounts: Record<OpportunityId, number>;
  opportunities: Opportunity[]; trump: Card["suit"] | null; playerHands: Record<string, Card[]>;
  trickIndex: number; trickLeader: string; playedCards: PlayedCard[]; trickResults: TrickResult[]; rewardChoices: RewardChoice[];
  roundReady: string[]; procurementDone: string[]; productionDone: string[];
  investmentStarter: string; currentInvestmentPass: 1 | 2; investmentTurnIndex: number; currentInvestmentPlayer: string | null;
  companies: Company[]; buildings: Building[]; nextBuildingId: number; routes: Route[];
  benefits: Record<string, RoundBenefits>; usage: Record<string, RoundUsage>; negotiations: Negotiation[]; nextNegotiationId: number;
  transportCharges: TransportCharge[]; settlement: Settlement | null;
  cityDevelopment: number; roundDevelopment: Development; cityLevel: 1 | 2 | 3 | 4;
  publicProjects: PublicProject[]; companyValues: Record<string, ValueBreakdown>;
  specialBoomRound: number | null; specialBoomPlayed: boolean; finalRound: number; cityLevel4Round: number | null;
  connections: Record<string, PlayerConnection>; result: HubResult | null; eventSeq: number; events: HubEvent[];
}
export type InvestmentAction =
  | { type: "BUILD"; district: DistrictId; suit: BuildingSuit; access: Access }
  | { type: "UPGRADE"; buildingId: string; access: Access }
  | { type: "ROUTE"; district: DistrictId }
  | { type: "CONTRIBUTE"; projectId: string; slot: number; benefit: "NONE" | "FREE" | "REBATE" };
export type HubClientAction = InvestmentAction
  | { type: "ROUND_READY" } | { type: "ROUND_END_READY" }
  | { type: "PLAY_CARD"; card: Card } | { type: "CLAIM_REWARD"; amount: number }
  | { type: "OFFER_TRADE"; counterpart: string; terms: TradeTerms }
  | { type: "ANSWER_TRADE"; negotiationId: string; accept: boolean }
  | { type: "MARKET"; action: MarketAction } | { type: "PROCUREMENT_DONE" }
  | { type: "USE_BUILDING"; buildingId: string; amount: number; access: Access }
  | { type: "PRODUCTION_DONE" } | { type: "PASS_INVESTMENT" };
export type HubAction = (HubClientAction & { playerId: string }) | { type: "ADVANCE" } | { type: "BOT_TICK" };
export function companyOf(state: Pick<HubState, "companies">, playerId: string): Company {
  const c = state.companies.find((entry) => entry.playerId === playerId); if (!c) throw new Error("Unknown player"); return c;
}
export function setResources(state: HubState, playerId: string, resources: Resources): void { companyOf(state, playerId).resources = resources; }
export function addEvent(state: HubState, type: string, playerId: string | null, data: Record<string, unknown> = {}): void {
  state.events.push({ seq: ++state.eventSeq, round: state.round, type, playerId, data });
}
export function emptyBenefits(): RoundBenefits { return { promotion: 0, production: 0, bulk: 0, development: 0, project: [] }; }
export function emptyUsage(): RoundUsage { return { purchases: 0, disposals: 0, discounts: {}, buildings: [], proposed: false }; }
