import type { GameRandomSource } from "../core/GameModule";
import { assertFourPlayers, clockwisePlayer, dealHands, investmentOrder, legalCards, playCard, trickRanking } from "./cards";
import { discountCapacity } from "./buildings";
import { OPENING } from "./data";
import { buildingUseOptions, quoteBuildingUse } from "./income";
import { quoteInvestment } from "./investment";
import { transportBalance } from "./logistics";
import { answerTrade, expireTrades, offerTrade } from "./negotiation";
import { awardOpportunity, drawRound, initialOpportunityCounts } from "./opportunities";
import { createPublicProjects, projectComplete, PROJECT_DEVELOPMENT } from "./projects";
import { gain, INITIAL_RESOURCES, NO_COST, pay, type MarketAction } from "./resources";
import { cityLevel, rankCompanies, refreshValues } from "./scoring";
import { addEvent, companyOf, emptyBenefits, emptyUsage, setResources, type HubAction, type HubClientAction, type HubState, type InvestmentAction, type Settlement } from "./state";
import type { Resources } from "./types";

export const BOT_GRACE_MS = 60_000;
export const BOT_STEP_MS = 450;
const zeroDevelopment = () => ({ buildings: 0, upgrades: 0, routes: 0, projects: 0 });
function award(state: HubState, playerId: string, resources: Resources): void { setResources(state, playerId, gain(companyOf(state, playerId).resources, resources)); }
export function startRound(state: HubState, rng: GameRandomSource): void {
  state.phase = "ROUND_START";
  drawRound(state, rng);
  state.playerHands = dealHands(state.players, state.opportunities.length, rng);
  state.trickIndex = 0; state.playedCards = []; state.trickResults = []; state.rewardChoices = [];
  state.roundReady = []; state.procurementDone = []; state.productionDone = [];
  state.investmentStarter = clockwisePlayer(state.players, state.startingPlayer, (state.round - 1) * 2);
  state.currentInvestmentPass = 1; state.investmentTurnIndex = 0; state.currentInvestmentPlayer = null;
  state.benefits = Object.fromEntries(state.players.map((p) => [p, emptyBenefits()]));
  state.usage = Object.fromEntries(state.players.map((p) => [p, emptyUsage()]));
  state.negotiations = []; state.transportCharges = []; state.roundDevelopment = zeroDevelopment();
  addEvent(state, "ROUND_STARTED", null, { condition: state.cityCondition.id, opportunities: state.opportunities, cityLevel: state.cityLevel, final: state.round === state.finalRound });
}
export function createHubState(matchId: string, players: readonly string[], rng: GameRandomSource): HubState {
  assertFourPlayers(players);
  const starter = players[rng.integer(0, 3)]!;
  const state: HubState = {
    gameId: "commercial-hub", rulesVersion: "0.2", matchId, phase: "ROUND_START", revision: 0,
    players: [...players], startingPlayer: starter, round: 1, cityCondition: { ...OPENING }, marketBag: [], marketUsed: [], opportunityCounts: initialOpportunityCounts(),
    opportunities: [], trump: null, playerHands: {}, trickIndex: 0, trickLeader: starter, playedCards: [], trickResults: [], rewardChoices: [], roundReady: [], procurementDone: [], productionDone: [],
    investmentStarter: starter, currentInvestmentPass: 1, investmentTurnIndex: 0, currentInvestmentPlayer: null,
    companies: players.map((playerId) => ({ playerId, resources: { ...INITIAL_RESOURCES } })), buildings: [], nextBuildingId: 1, routes: [], benefits: {}, usage: {}, negotiations: [], nextNegotiationId: 1,
    transportCharges: [], settlement: null, cityDevelopment: 0, roundDevelopment: zeroDevelopment(), cityLevel: 1,
    publicProjects: createPublicProjects(), companyValues: {}, specialBoomRound: null, specialBoomPlayed: false, finalRound: 10, cityLevel4Round: null,
    connections: Object.fromEntries(players.map((p) => [p, { connected: true, disconnectedAt: null, bot: false }])), result: null, eventSeq: 0, events: []
  };
  startRound(state, rng); refreshValues(state); return state;
}
function resolveTrick(state: HubState): void {
  const ranking = trickRanking(state.playedCards, state.trump), opportunity = state.opportunities[state.trickIndex]!;
  const rewardRanking = state.cityCondition.id === "credit-crunch" ? [...ranking].reverse() : [...ranking];
  state.trickResults.push({ round: state.round, index: state.trickIndex, opportunity, played: [...state.playedCards], ranking, rewardRanking });
  addEvent(state, "TRICK_RESULT", null, { index: state.trickIndex, opportunity, played: state.playedCards, ranking, rewardRanking });
  awardOpportunity(state, opportunity, rewardRanking);
  state.phase = state.rewardChoices.length ? "REWARD" : "TRICK_RESULT";
}
export function quoteMarket(state: HubState, playerId: string, action: MarketAction) {
  const usage = state.usage[playerId]!;
  let discountBuilding: string | null = null, cost: Resources = { ...NO_COST }, reward: Resources = { ...NO_COST };
  if (action === "buy-material") {
    if (usage.purchases >= 2) throw new Error("通常資材購入は1R2回までです");
    discountBuilding = state.buildings.find((b) => b.playerId === playerId && discountCapacity(b) > (usage.discounts[b.id] ?? 0))?.id ?? null;
    cost.cash = discountBuilding ? 2 : 3; reward.materials = 1;
  } else if (action === "bulk-material") {
    if (usage.purchases !== 2 || state.benefits[playerId]!.bulk < 1) throw new Error("大量仕入れは通常購入2回後のみです");
    cost.cash = 2; reward.materials = 1;
  } else if (action === "dispose-good") {
    if (!state.specialBoomPlayed || usage.disposals >= 2) throw new Error("在庫処分はLv3翌Rから1R2回までです");
    cost.goods = 1; reward.cash = 1;
  } else throw new Error("市場の操作が不正です");
  pay(companyOf(state, playerId).resources, cost);
  return { action, cost, reward, discountBuilding };
}
function useMarket(state: HubState, playerId: string, action: MarketAction): void {
  const quote = quoteMarket(state, playerId, action), usage = state.usage[playerId]!;
  setResources(state, playerId, gain(pay(companyOf(state, playerId).resources, quote.cost), quote.reward));
  if (action === "buy-material") { usage.purchases++; if (quote.discountBuilding) usage.discounts[quote.discountBuilding] = (usage.discounts[quote.discountBuilding] ?? 0) + 1; }
  else if (action === "bulk-material") state.benefits[playerId]!.bulk--;
  else usage.disposals++;
  addEvent(state, "MARKET", playerId, quote);
}
function endRound(state: HubState): void {
  const beforeDevelopment = state.cityDevelopment - Object.values(state.roundDevelopment).reduce((a, b) => a + b, 0);
  const settlement: Settlement = { round: state.round, cashBefore: {}, cashAfter: {}, charges: structuredClone(state.transportCharges), development: { ...state.roundDevelopment }, developmentBefore: beforeDevelopment, developmentAfter: state.cityDevelopment, levelBefore: state.cityLevel, levelAfter: state.cityLevel };
  for (const c of state.companies) {
    settlement.cashBefore[c.playerId] = c.resources.cash;
    c.resources.cash += transportBalance(state.transportCharges, c.playerId).net;
    settlement.cashAfter[c.playerId] = c.resources.cash;
  }
  state.transportCharges = [];
  const target = cityLevel(state.cityDevelopment);
  const previousLevel = state.cityLevel;
  state.cityLevel = Math.min(previousLevel + 1, target) as HubState["cityLevel"];
  settlement.levelAfter = state.cityLevel; state.settlement = settlement;
  if (state.cityLevel === 3 && previousLevel === 2 && !state.specialBoomPlayed) state.specialBoomRound = state.round + 1;
  if (state.cityLevel === 4 && previousLevel === 3) { state.cityLevel4Round = state.round; if (state.round <= 9) state.finalRound = Math.min(state.finalRound, state.round + 1); }
  refreshValues(state);
  addEvent(state, "ROUND_SETTLED", null, { ...settlement, finalRound: state.finalRound });
  state.roundReady = []; state.currentInvestmentPlayer = null;
  if (state.round >= state.finalRound) {
    const ranking = rankCompanies(state.companies, state.companyValues);
    state.result = { reason: state.cityLevel4Round !== null && state.cityLevel4Round < state.round ? "CITY_LV4_FINAL_ROUND" : "ROUND_10", round: state.round, ranking, winners: ranking.filter((e) => e.rank === 1).map((e) => e.playerId) };
    state.phase = "FINISHED"; addEvent(state, "GAME_FINISHED", null, { result: state.result });
  } else state.phase = "ROUND_END";
}
function nextInvestment(state: HubState): void {
  state.investmentTurnIndex++;
  if (state.investmentTurnIndex === 4) {
    if (state.currentInvestmentPass === 2) { endRound(state); return; }
    state.currentInvestmentPass = 2; state.investmentTurnIndex = 0;
  }
  state.currentInvestmentPlayer = investmentOrder(state.players, state.investmentStarter, state.currentInvestmentPass)[state.investmentTurnIndex]!;
}
function invest(state: HubState, playerId: string, action: InvestmentAction): void {
  const q = quoteInvestment(state, playerId, action);
  setResources(state, playerId, pay(companyOf(state, playerId).resources, q.cost));
  if (q.developmentDiscount > 0) state.benefits[playerId]!.development = 0;
  if (q.transport) state.transportCharges.push(q.transport);
  if (action.type === "BUILD") {
    const id = `building-${state.nextBuildingId++}`;
    state.buildings.push({ id, playerId, district: action.district, suit: action.suit, upgraded: false });
    state.cityDevelopment += 2; state.roundDevelopment.buildings += 2;
  } else if (action.type === "UPGRADE") {
    state.buildings.find((b) => b.id === action.buildingId)!.upgraded = true;
    state.cityDevelopment++; state.roundDevelopment.upgrades++;
  } else if (action.type === "ROUTE") {
    state.routes.push({ playerId, district: action.district }); state.cityDevelopment++; state.roundDevelopment.routes++;
  } else {
    const p = state.publicProjects.find((p) => p.id === action.projectId)!;
    p.slots[action.slot]!.playerId = playerId;
    if (action.benefit !== "NONE") {
      const benefits = state.benefits[playerId]!.project;
      benefits.splice(benefits.indexOf(action.benefit), 1);
      if (action.benefit === "REBATE") award(state, playerId, { ...NO_COST, cash: 1 });
    }
  }
  addEvent(state, action.type, playerId, { ...action, quote: q });
  if (action.type === "CONTRIBUTE") {
    const p = state.publicProjects.find((p) => p.id === action.projectId)!;
    if (projectComplete(p)) {
      const payouts = Object.fromEntries(state.players.map((id) => [id, p.slots.filter((s) => s.playerId === id).length]));
      for (const id of state.players) award(state, id, { ...NO_COST, cash: payouts[id]! });
      state.cityDevelopment += PROJECT_DEVELOPMENT; state.roundDevelopment.projects += PROJECT_DEVELOPMENT;
      addEvent(state, "PROJECT_COMPLETED", null, { projectId: p.id, payouts, development: PROJECT_DEVELOPMENT });
    }
  }
  nextInvestment(state);
}
export function botAction(state: HubState, playerId: string): HubClientAction | null {
  // Only own cards/resources/options and public state are used; never inspect another hand.
  if (state.phase === "ROUND_START" && !state.roundReady.includes(playerId)) return { type: "ROUND_READY" };
  if (state.phase === "ROUND_END" && !state.roundReady.includes(playerId)) return { type: "ROUND_END_READY" };
  if (state.phase === "TRICK" && clockwisePlayer(state.players, state.trickLeader, state.playedCards.length) === playerId) return { type: "PLAY_CARD", card: [...legalCards(state.playerHands[playerId]!, state.playedCards[0]?.card.suit ?? null)].sort((a, b) => a.rank - b.rank)[0]! };
  if (state.phase === "REWARD" && state.rewardChoices[0]?.playerId === playerId) return { type: "CLAIM_REWARD", amount: state.rewardChoices[0].maximum };
  if (state.phase === "PROCUREMENT") {
    const incoming = state.negotiations.find((n) => n.status === "PENDING" && n.counterpart === playerId);
    if (incoming) return { type: "ANSWER_TRADE", negotiationId: incoming.id, accept: false };
    if (!state.procurementDone.includes(playerId)) return { type: "PROCUREMENT_DONE" };
  }
  if (state.phase === "PRODUCTION" && !state.productionDone.includes(playerId)) {
    const options = buildingUseOptions(state, playerId);
    options.sort((a, b) => a.transport.amount - b.transport.amount || b.reward.goods - a.reward.goods || b.amount - a.amount);
    const q = options[0];
    return q ? { type: "USE_BUILDING", buildingId: q.buildingId, amount: q.amount, access: q.access } : { type: "PRODUCTION_DONE" };
  }
  if (state.phase === "INVESTMENT" && state.currentInvestmentPlayer === playerId) return { type: "PASS_INVESTMENT" };
  return null;
}
export function changeHubConnection(previous: HubState, playerId: string, connected: boolean, now: number): HubState {
  if (previous.npcPlayers?.[playerId]) return previous;
  const previousConnection = previous.connections[playerId];
  if (!previousConnection || previousConnection.connected === connected || previous.phase === "FINISHED") return previous;
  const s = structuredClone(previous), c = s.connections[playerId]!;
  if (connected) { const wasBot = c.bot; c.connected = true; c.disconnectedAt = null; c.bot = false; if (wasBot) addEvent(s, "PLAYER_RETURNED", playerId); }
  else { c.connected = false; c.disconnectedAt = now; }
  s.revision++; return s;
}
export function reduceHubState(previous: HubState, action: HubAction, rng: GameRandomSource, now = 0): HubState {
  if (previous.rulesVersion !== "0.2") throw new Error("旧ルールのゲームです。新しい部屋で開始してください");
  if (previous.phase === "FINISHED") throw new Error("ゲームは終了しています");
  let state = structuredClone(previous);
  if (action.type === "NPC_TICK") throw new Error("NPCの進行はGameModuleで処理します");
  if (action.type === "EXPIRE_TRADES") { expireTrades(state, now); state.revision++; return state; }
  if (action.type === "BOT_TICK") {
    for (const p of state.players) {
      const c = state.connections[p]!;
      if (!c.connected && !c.bot && c.disconnectedAt !== null && now >= c.disconnectedAt + BOT_GRACE_MS) { c.bot = true; addEvent(state, "BOT_STARTED", p); }
    }
    const actor = state.players.find((p) => state.connections[p]!.bot && botAction(state, p));
    if (actor) state = reduceHubState(state, { ...botAction(state, actor)!, playerId: actor }, rng, now);
    else state.revision++;
    return state;
  }
  if (action.type === "ADVANCE") {
    if (state.phase !== "TRICK_RESULT") throw new Error("自動進行できる段階ではありません");
    state.trickLeader = clockwisePlayer(state.players, state.trickLeader);
    if (state.trickIndex + 1 === state.opportunities.length) state.phase = "PROCUREMENT";
    else { state.trickIndex++; state.trump = state.opportunities[state.trickIndex]!.trump; state.playedCards = []; state.phase = "TRICK"; }
  } else {
    const p = action.playerId;
    if (!state.players.includes(p)) throw new Error("Unknown player");
    if (action.type === "ROUND_READY" && state.phase === "ROUND_START") {
      if (state.roundReady.includes(p)) throw new Error("確認済みです"); state.roundReady.push(p);
      if (state.roundReady.length === 4) state.phase = "TRICK";
    } else if (action.type === "ROUND_END_READY" && state.phase === "ROUND_END") {
      if (state.roundReady.includes(p)) throw new Error("確認済みです"); state.roundReady.push(p);
      if (state.roundReady.length === 4) { state.round++; startRound(state, rng); }
    } else if (action.type === "PLAY_CARD" && state.phase === "TRICK") {
      if (clockwisePlayer(state.players, state.trickLeader, state.playedCards.length) !== p) throw new Error("自分の手番ではありません");
      state.playerHands[p] = playCard(state.playerHands[p]!, action.card, state.playedCards[0]?.card.suit ?? null);
      state.playedCards.push({ playerId: p, card: action.card }); addEvent(state, "CARD_PLAYED", p, { trick: state.trickIndex, card: action.card });
      if (state.playedCards.length === 4) resolveTrick(state);
    } else if (action.type === "CLAIM_REWARD" && state.phase === "REWARD") {
      const q = state.rewardChoices[0]!;
      if (q.playerId !== p || !Number.isInteger(action.amount) || action.amount < 0 || action.amount > q.maximum) throw new Error("商機の選択が不正です");
      const n = action.amount, cost = { ...NO_COST }, reward = { ...NO_COST };
      if (q.kind === "SALE") { cost.goods = n; reward.cash = n * q.cash; }
      if (q.kind === "PROCESS") { cost.materials = n; reward.goods = n * q.goods; }
      if (q.kind === "PURCHASE") { cost.cash = n * q.cash; reward.materials = n; }
      setResources(state, p, gain(pay(companyOf(state, p).resources, cost), reward));
      if (n > 0) addEvent(state, "DIRECT_REWARD", p, { kind: q.kind, cost, reward });
      state.rewardChoices.shift(); if (!state.rewardChoices.length) state.phase = "TRICK_RESULT";
    } else if (state.phase === "PROCUREMENT") {
      if (action.type === "OFFER_TRADE") offerTrade(state, p, action.counterpart, action.terms, now);
      else if (action.type === "ANSWER_TRADE") answerTrade(state, p, action.negotiationId, action.accept, now);
      else if (action.type === "MARKET" && !state.procurementDone.includes(p)) useMarket(state, p, action.action);
      else if (action.type === "PROCUREMENT_DONE" && !state.procurementDone.includes(p)) {
        state.procurementDone.push(p);
        if (state.procurementDone.length === 4) { for (const n of state.negotiations) if (n.status === "PENDING") { n.status = "EXPIRED"; n.resolution = "PHASE_END"; n.resolvedAt = now; } state.phase = "PRODUCTION"; }
      } else throw new Error("仕入フェーズの操作は終了しています");
    } else if (state.phase === "PRODUCTION" && !state.productionDone.includes(p)) {
      if (action.type === "USE_BUILDING") {
        const q = quoteBuildingUse(state, p, action.buildingId, action.amount, action.access);
        setResources(state, p, gain(pay(companyOf(state, p).resources, q.cost), q.reward));
        state.usage[p]!.buildings.push(action.buildingId); state.transportCharges.push(q.transport);
        addEvent(state, "BUILDING_USED", p, { ...q });
      } else if (action.type === "PRODUCTION_DONE") {
        state.productionDone.push(p);
        if (state.productionDone.length === 4) { state.phase = "INVESTMENT"; state.currentInvestmentPlayer = state.investmentStarter; }
      } else throw new Error("生産・販売の操作が不正です");
    } else if (state.phase === "INVESTMENT" && state.currentInvestmentPlayer === p) {
      if (action.type === "PASS_INVESTMENT") { addEvent(state, "INVESTMENT_PASSED", p); nextInvestment(state); }
      else if (["BUILD", "UPGRADE", "ROUTE", "CONTRIBUTE"].includes(action.type)) invest(state, p, action as InvestmentAction);
      else throw new Error("投資の操作が不正です");
    } else throw new Error("現在はこの操作を行えません");
  }
  state.revision++; refreshValues(state); return state;
}
