import type { CityCondition, MarketId, Opportunity } from "./data";
import type { MarketAction } from "./resources";
import type { HubNpcType } from "../../shared/commercial-hub-npc";
import type { NpcDecision } from "./npc";
import type { HubConfig } from "./config";
import type { AuditorSelection, AuditorTarget } from "./auditor";
import type { Access, Building, BuildingSuit, Card, Company, DistrictId, PlayedCard, PublicProject, Resources, Route, TransportCharge, ValueBreakdown } from "./types";
import type { MajorState, MajorAction } from "./next-rules";
export type HubPhase = "MAJOR_SELECTION" | "ROUND_START" | "BID" | "TRICK" | "REWARD" | "TRICK_RESULT" | "BID_RESULT" | "AUDITOR_PLACEMENT" | "PROCUREMENT" | "PRODUCTION" | "INVESTMENT" | "ROUND_END" | "FINISHED";
export interface BidResult { playerId: string; declared: number; wins: number; hit: boolean; points: number }
export interface BidRoundResult { round: number; results: BidResult[] }
export interface TradeTerms { give: Resources; receive: Resources }
export interface Negotiation extends TradeTerms { id: string; proposer: string; counterpart: string; status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED"; createdAt?: number; deadlineAt?: number; resolvedAt?: number; resolution?: "ANSWER" | "TIMEOUT" | "PHASE_END" }
export interface RoundBenefits { promotion: number; production: number; bulk: number; development: number; project: ("DISCOUNT" | "REBATE")[] }
export interface RoundUsage { purchases: number; disposals: number; buildings: string[]; proposed: boolean }
export interface HubEvent { seq: number; round: number; type: string; playerId: string | null; data: Record<string, unknown> }
export interface TrickResult { round: number; index: number; opportunity: Opportunity; played: PlayedCard[]; ranking: string[]; rewardRanking: string[] }
export interface RewardChoice { playerId: string; kind: "SALE" | "PROCESS" | "PURCHASE"; maximum: number; cash: number; goods: number; materials?: number }
export interface RankedCompany { playerId: string; value: ValueBreakdown; cash: number; deficit: boolean; rank: number; tieBreak: "DEFICIT" | "VALUE" | "ASSETS" | "BUILDINGS" | "PROJECTS" | "TIED" }
export interface HubResult { reason: "CITY_LV4_FINAL_ROUND" | "ROUND_12" | "TRIAL_HORIZON"; round: number; ranking: RankedCompany[]; winners: string[] }
export interface FinalRoundDecision { round: number; finalRound: number; reason: "LV4_BY_R8" | "LV4_R9" | "LV4_R10_OR_LATER" | "NO_LV4_BY_R12" }
export interface RoundStatistics { round: number; companies: { playerId: string; resources: Resources; lowerBuildings: number; upperBuildings: number; routes: number; value: ValueBreakdown; contributions: Record<string, number> }[] }
export interface Development { buildings: number; upgrades: number; routes: number; projects: number }
export interface Settlement { round: number; cashBefore: Record<string, number>; cashAfter: Record<string, number>; charges: TransportCharge[]; development: Development; developmentBefore: number; developmentAfter: number; levelBefore: number; levelAfter: number }
export interface PlayerConnection { connected: boolean; disconnectedAt: number | null; bot: boolean }
export interface HubState {
  npcPlayers?: Record<string, HubNpcType>;
  negotiationTimeoutMs?: number | null;
  npcCursor?: number;
  /** Server-only, one accepted decision; never copied into a player view. */
  npcDecision?: { playerId: string; revision: number; decision: NpcDecision };
  gameId: "commercial-hub"; rulesVersion: "0.5" | "next-trial-1"; next?: MajorState; matchId: string; phase: HubPhase; revision: number;
  config: HubConfig;
  /** Server-only until all four declarations are locked. */
  bids: Record<string, number>; bidsRevealed: boolean; trickWins: Record<string, number>;
  predictionPoints: Record<string, number>; bidResults: BidRoundResult[];
  auditor: { target: AuditorTarget | null; placementPlayer: string | null };
  roundTrickStarter: string; auditorSelection: AuditorSelection | null;
  players: string[]; startingPlayer: string; round: number; cityCondition: CityCondition;
  marketBag: MarketId[]; marketUsed: MarketId[]; opportunityCounts: Record<string, number>;
  opportunities: Opportunity[]; trump: Card["suit"] | null; playerHands: Record<string, Card[]>;
  trickIndex: number; trickLeader: string; playedCards: PlayedCard[]; trickResults: TrickResult[]; rewardChoices: RewardChoice[];
  roundReady: string[]; procurementDone: string[]; productionDone: string[];
  investmentStarter: string; currentInvestmentPass: 1 | 2; investmentTurnIndex: number; currentInvestmentPlayer: string | null;
  companies: Company[]; buildings: Building[]; nextBuildingId: number; routes: Route[];
  benefits: Record<string, RoundBenefits>; usage: Record<string, RoundUsage>; negotiations: Negotiation[]; nextNegotiationId: number;
  transportCharges: TransportCharge[]; settlement: Settlement | null;
  cityDevelopment: number; roundDevelopment: Development; cityLevel: 1 | 2 | 3 | 4;
  publicProjects: PublicProject[]; companyValues: Record<string, ValueBreakdown>;
  /** Aggregate round economics are server-only; never projected to clients. */
  roundStatistics: RoundStatistics[]; cityReachedRounds: Record<"2" | "3" | "4", number | null>; finalRoundDecision: FinalRoundDecision | null;
  specialBoomRound: number | null; specialBoomPlayed: boolean; finalRound: number; cityLevel4Round: number | null;
  connections: Record<string, PlayerConnection>; result: HubResult | null; eventSeq: number; events: HubEvent[];
}
export type InvestmentAction =
  | { type: "BUILD"; district: DistrictId; suit: BuildingSuit; access?: Access }
  | { type: "UPGRADE"; buildingId: string; access: Access }
  | { type: "ROUTE"; district: DistrictId }
  | { type: "CONTRIBUTE"; projectId: string; slot: number; benefit: "NONE" | "DISCOUNT" | "REBATE" };
export type HubClientAction = MajorAction | InvestmentAction
  | { type: "ROUND_READY" } | { type: "ROUND_END_READY" }
  | { type: "SUBMIT_BID"; wins: number } | { type: "PLACE_AUDITOR"; target: AuditorTarget }
  | { type: "PLAY_CARD"; card: Card } | { type: "CLAIM_REWARD"; amount: number }
  | { type: "OFFER_TRADE"; counterpart: string; terms: TradeTerms }
  | { type: "ANSWER_TRADE"; negotiationId: string; accept: boolean }
  | { type: "MARKET"; action: MarketAction } | { type: "PROCUREMENT_DONE" }
  | { type: "USE_BUILDING"; buildingId: string; amount: number; access: Access; bonus?: number }
  | { type: "PRODUCTION_DONE" } | { type: "PASS_INVESTMENT" };
export type HubAction = (HubClientAction & { playerId: string }) | { type: "ADVANCE" } | { type: "BOT_TICK" } | { type: "NPC_TICK" } | { type: "EXPIRE_TRADES" };
export function companyOf(state: Pick<HubState, "companies">, playerId: string): Company {
  const c = state.companies.find((entry) => entry.playerId === playerId); if (!c) throw new Error("Unknown player"); return c;
}
export function setResources(state: HubState, playerId: string, resources: Resources): void { companyOf(state, playerId).resources = resources; }
export function addEvent(state: HubState, type: string, playerId: string | null, data: Record<string, unknown> = {}): void {
  state.events.push({ seq: ++state.eventSeq, round: state.round, type, playerId, data });
}
export function emptyBenefits(): RoundBenefits { return { promotion: 0, production: 0, bulk: 0, development: 0, project: [] }; }
export function emptyUsage(): RoundUsage { return { purchases: 0, disposals: 0, buildings: [], proposed: false }; }

