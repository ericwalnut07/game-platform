import { buildHandView, clockwisePlayer, legalCards } from "./cards";
import { incomeTasks, type IncomeContext } from "./income";
import { legalInvestments } from "./investment";
import { usePublicMarket, type MarketAction } from "./resources";
import { companyOf, type HubState } from "./state";

/** Explicit public projection: never spread HubState or playerHands into a response. */
export function buildHubView(state: HubState, playerId: string) {
  const hand = buildHandView(state.players, state.playerHands, playerId);
  const currentPlayer = state.phase === "TRICK" ? clockwisePlayer(state.players, state.trickLeader, state.playedCards.length)
    : state.phase === "REWARD" ? state.rewardChoices[0]?.playerId ?? null
    : state.phase === "INVESTMENT" ? state.investmentTurn?.playerId ?? null : null;
  const marketChoices = (["buy-material", "buy-good", "sell-material", "sell-good"] as MarketAction[]).filter((action) => {
    try { usePublicMarket(companyOf(state, playerId).resources, state.publicMarketUsedByPlayer.includes(playerId), action); return true; } catch { return false; }
  });
  const incomeContext: IncomeContext = {
    buildings: state.buildings.filter((b) => b.playerId === playerId), credits: { [playerId]: state.credits[playerId]! },
    companies: [companyOf(state, playerId)], abilityUses: state.abilityUses, round: state.round, eventSeq: 0, events: []
  };
  return structuredClone({
    gameId: state.gameId, rulesVersion: state.rulesVersion, matchId: state.matchId, phase: state.phase, revision: state.revision,
    ...hand, players: state.players, round: state.round, cityCondition: state.cityCondition, trump: state.trump,
    opportunities: state.opportunities, trickIndex: state.trickIndex, trickLeader: state.trickLeader,
    playedCards: state.playedCards, trickResults: state.trickResults, currentPlayer,
    legalCards: state.phase === "TRICK" && currentPlayer === playerId ? legalCards(hand.hand, state.playedCards[0]?.card.suit ?? null) : [],
    rewardChoice: state.rewardChoices[0] ?? null, roundReady: state.roundReady,
    investmentStarter: state.investmentStarter, currentInvestmentPass: state.currentInvestmentPass, investmentTurn: state.investmentTurn,
    investments: state.phase === "INVESTMENT" && state.investmentTurn?.playerId === playerId && state.investmentTurn.step === "INVESTMENT" ? legalInvestments(state, playerId) : [],
    marketChoices, publicMarketUsedByPlayer: state.publicMarketUsedByPlayer,
    companies: state.companies, buildings: state.buildings, routeOwnership: state.routeOwnership,
    credits: state.credits, discountUses: state.discountUses, districtBonuses: state.districtBonuses,
    incomeTasks: incomeTasks(state, playerId), incomeContext, incomeDone: state.incomeDone,
    cityDevelopment: state.cityDevelopment, cityLevel: state.cityLevel,
    activePublicProject: state.activePublicProject, completedPublicProjects: state.completedPublicProjects,
    companyValues: state.companyValues, finalRound: state.finalRound, cityLevel4Round: state.cityLevel4Round, result: state.result,
    recentEvents: state.events.slice(-12)
  });
}
export type HubView = ReturnType<typeof buildHubView>;
