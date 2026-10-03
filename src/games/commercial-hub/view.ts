import { buildHandView, clockwisePlayer, investmentOrder, legalCards } from "./cards";
import { CITY_CONDITIONS } from "./data";
import { quoteMarket } from "./engine";
import { buildingUseOptions } from "./income";
import { legalInvestments } from "./investment";
import { transportBalance } from "./logistics";
import type { MarketAction } from "./resources";
import { companyOf, type HubState } from "./state";
/** Explicit projection. Private hands, pending terms and other company values never leave the server. */
export function buildHubView(state: HubState, playerId: string) {
  const hand = buildHandView(state.players, state.playerHands, playerId);
  const currentPlayer = state.phase === "TRICK" ? clockwisePlayer(state.players, state.trickLeader, state.playedCards.length) : state.phase === "REWARD" ? state.rewardChoices[0]?.playerId ?? null : state.phase === "INVESTMENT" ? state.currentInvestmentPlayer : null;
  const ownBalance = transportBalance(state.transportCharges, playerId);
  const marketChoices = state.phase === "PROCUREMENT" && !state.procurementDone.includes(playerId) ? (["buy-material", "dispose-good"] as MarketAction[]).flatMap((a) => { try { return [quoteMarket(state, playerId, a)]; } catch { return []; } }) : [];
  return structuredClone({
    gameId: state.gameId, rulesVersion: state.rulesVersion, matchId: state.matchId, phase: state.phase, revision: state.revision,
    npcPlayers: state.npcPlayers ?? {}, negotiationTimeoutMs: state.negotiationTimeoutMs ?? null,
    ...hand, players: state.players, startingPlayer: state.startingPlayer, round: state.round, cityCondition: state.cityCondition,
    marketUsed: state.marketUsed, marketRemaining: CITY_CONDITIONS.filter((c) => state.marketBag.length === 0 || state.marketBag.includes(c.id)).map((c) => c.id), opportunityCounts: state.opportunityCounts,
    opportunities: state.opportunities, trump: state.trump, trickIndex: state.trickIndex, trickLeader: state.trickLeader, playedCards: state.playedCards, trickResults: state.trickResults, currentPlayer,
    legalCards: state.phase === "TRICK" && currentPlayer === playerId ? legalCards(hand.hand, state.playedCards[0]?.card.suit ?? null) : [],
    rewardChoice: state.phase === "REWARD" && currentPlayer === playerId ? state.rewardChoices[0] ?? null : null,
    roundReady: state.roundReady, procurementDone: state.procurementDone, productionDone: state.productionDone,
    currentInvestmentPass: state.currentInvestmentPass, investmentOrder: investmentOrder(state.players, state.investmentStarter, state.currentInvestmentPass), currentInvestmentPlayer: state.currentInvestmentPlayer,
    investments: state.phase === "INVESTMENT" && currentPlayer === playerId ? legalInvestments(state, playerId) : [],
    buildingOptions: ((state.phase === "PRODUCTION" && !state.productionDone.includes(playerId)) || (state.phase === "PROCUREMENT" && !state.procurementDone.includes(playerId))) ? buildingUseOptions(state, playerId) : [],
    marketChoices, usage: state.usage[playerId]!, benefits: state.benefits[playerId]!,
    negotiations: state.negotiations.filter((n) => n.proposer === playerId || n.counterpart === playerId),
    companies: state.companies, buildings: state.buildings, routes: state.routes, publicProjects: state.publicProjects,
    ownValue: state.companyValues[playerId]!, ownBalance: { ...ownBalance, projectedCash: companyOf(state, playerId).resources.cash + ownBalance.net },
    cityDevelopment: state.cityDevelopment, cityLevel: state.cityLevel, finalRound: state.finalRound, specialBoomRound: state.specialBoomRound, specialBoomPlayed: state.specialBoomPlayed,
    connections: state.connections, settlement: state.settlement, result: state.result,
    events: state.events
  });
}
export type HubView = ReturnType<typeof buildHubView>;
