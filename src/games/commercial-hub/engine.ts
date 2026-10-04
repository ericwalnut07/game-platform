import type { GameRandomSource } from "../core/GameModule";
import { assertFourPlayers, clockwisePlayer, dealHands, investmentOrder, legalCards, playCard, trickRanking } from "./cards";
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
import { DEFAULT_HUB_CONFIG, parseHubConfig, type HubConfig } from "./config";
import { AUDITOR_TARGETS } from "./auditor";
import { auditorCandidates, estimateBid } from "./rule-ai";

export const BOT_GRACE_MS = 60_000;
export const BOT_STEP_MS = 450;
const zeroDevelopment = () => ({ buildings: 0, upgrades: 0, routes: 0, projects: 0 });
function award(state: HubState, playerId: string, resources: Resources): void { setResources(state, playerId, gain(companyOf(state, playerId).resources, resources)); }
export function startRound(state: HubState, rng: GameRandomSource): void {
  state.phase = "ROUND_START";
  drawRound(state, rng);
  state.playerHands = dealHands(state.players, state.opportunities.length, rng);
  state.trickIndex = 0; state.playedCards = []; state.trickResults = []; state.rewardChoices = [];
  state.bids = {}; state.bidsRevealed = false;
  state.trickWins = Object.fromEntries(state.players.map((p) => [p, 0]));
  state.lastAdministrationWinner = null; state.auditor.placementPlayer = null;
  state.roundReady = []; state.procurementDone = []; state.productionDone = [];
  state.investmentStarter = clockwisePlayer(state.players, state.startingPlayer, (state.round - 1) * 2);
  state.currentInvestmentPass = 1; state.investmentTurnIndex = 0; state.currentInvestmentPlayer = null;
  state.benefits = Object.fromEntries(state.players.map((p) => [p, emptyBenefits()]));
  state.usage = Object.fromEntries(state.players.map((p) => [p, emptyUsage()]));
  state.negotiations = []; state.transportCharges = []; state.roundDevelopment = zeroDevelopment();
  addEvent(state, "ROUND_STARTED", null, { condition: state.cityCondition.id, opportunities: state.opportunities, cityLevel: state.cityLevel, final: state.round === state.finalRound, config: state.config });
}
export function createHubState(matchId: string, players: readonly string[], rng: GameRandomSource, config: HubConfig = DEFAULT_HUB_CONFIG): HubState {
  assertFourPlayers(players);
  const starter = players[rng.integer(0, 3)]!;
  const state: HubState = {
    gameId: "commercial-hub", rulesVersion: "0.4", matchId, phase: "ROUND_START", revision: 0,
    config: parseHubConfig(config), bids: {}, bidsRevealed: false, trickWins: {},
    predictionPoints: Object.fromEntries(players.map((p) => [p, 0])), bidResults: [],
    auditor: { target: null, placementPlayer: null }, lastAdministrationWinner: null,
    players: [...players], startingPlayer: starter, round: 1, cityCondition: { ...OPENING }, marketBag: [], marketUsed: [], opportunityCounts: initialOpportunityCounts(),
    opportunities: [], trump: null, playerHands: {}, trickIndex: 0, trickLeader: starter, playedCards: [], trickResults: [], rewardChoices: [], roundReady: [], procurementDone: [], productionDone: [],
    investmentStarter: starter, currentInvestmentPass: 1, investmentTurnIndex: 0, currentInvestmentPlayer: null,
    companies: players.map((playerId) => ({ playerId, resources: { ...INITIAL_RESOURCES } })), buildings: [], nextBuildingId: 1, routes: [], benefits: {}, usage: {}, negotiations: [], nextNegotiationId: 1,
    transportCharges: [], settlement: null, cityDevelopment: 0, roundDevelopment: zeroDevelopment(), cityLevel: 1,
    publicProjects: createPublicProjects(), companyValues: {}, specialBoomRound: null, specialBoomPlayed: false, finalRound: 12, cityLevel4Round: null,
    connections: Object.fromEntries(players.map((p) => [p, { connected: true, disconnectedAt: null, bot: false }])), result: null, eventSeq: 0, events: []
  };
  startRound(state, rng); refreshValues(state); return state;
}
function resolveTrick(state: HubState): void {
  const ranking = trickRanking(state.playedCards, state.trump), opportunity = state.opportunities[state.trickIndex]!;
  const rewardRanking = state.cityCondition.id === "credit-crunch" ? [...ranking].reverse() : [...ranking];
  if (state.config.trickRule === "BID") state.trickWins[ranking[0]!]!++;
  if (state.config.auditor && opportunity.suit === "administration") state.lastAdministrationWinner = ranking[0]!;
  state.trickResults.push({ round: state.round, index: state.trickIndex, opportunity, played: [...state.playedCards], ranking, rewardRanking });
  addEvent(state, "TRICK_RESULT", null, { index: state.trickIndex, opportunity, played: state.playedCards, ranking, rewardRanking });
  awardOpportunity(state, opportunity, rewardRanking);
  state.phase = state.rewardChoices.length ? "REWARD" : "TRICK_RESULT";
}
function beginEconomy(state: HubState): void {
  if (state.config.auditor && state.round >= 2 && state.lastAdministrationWinner) {
    state.auditor.placementPlayer = state.lastAdministrationWinner;
    state.phase = "AUDITOR_PLACEMENT";
    addEvent(state, "AUDITOR_RIGHT", state.lastAdministrationWinner);
  } else state.phase = "PROCUREMENT";
}
function finishTricks(state: HubState): void {
  if (state.config.trickRule !== "BID") { beginEconomy(state); return; }
  const results = state.players.map((playerId) => {
    const declared = state.bids[playerId]!, wins = state.trickWins[playerId]!;
    const hit = declared === wins, points = hit ? 1 : 0;
    state.predictionPoints[playerId]! += points;
    return { playerId, declared, wins, hit, points };
  });
  state.bidResults.push({ round: state.round, results });
  state.phase = "BID_RESULT";
  addEvent(state, "BID_RESULT", null, { results, predictionPoints: { ...state.predictionPoints } });
}
export function quoteMarket(state: HubState, playerId: string, action: MarketAction) {
  const usage = state.usage[playerId]!;
  const cost: Resources = { ...NO_COST }, reward: Resources = { ...NO_COST };
  if (action === "buy-material") {
    if (usage.purchases >= 1) throw new Error("通常資材購入は1R1回までです");
    cost.cash = 3; reward.materials = 1;
  } else if (action === "dispose-good") {
    if (!state.specialBoomPlayed || usage.disposals >= 2) throw new Error("在庫処分はLv3翌Rから1R2回までです");
    cost.goods = 1; reward.cash = 1;
  } else throw new Error("市場の操作が不正です");
  pay(companyOf(state, playerId).resources, cost);
  return { action, cost, reward };
}
function useMarket(state: HubState, playerId: string, action: MarketAction): void {
  const quote = quoteMarket(state, playerId, action), usage = state.usage[playerId]!;
  setResources(state, playerId, gain(pay(companyOf(state, playerId).resources, quote.cost), quote.reward));
  if (action === "buy-material") usage.purchases++;
  else usage.disposals++;
  addEvent(state, "MARKET", playerId, quote);
}
function useBuilding(state: HubState, playerId: string, action: Extract<HubClientAction, { type: "USE_BUILDING" }>): void {
  const q = quoteBuildingUse(state, playerId, action.buildingId, action.amount, action.access, action.bonus ?? 0);
  setResources(state, playerId, gain(pay(companyOf(state, playerId).resources, q.cost), q.reward));
  state.usage[playerId]!.buildings.push(action.buildingId);
  state.transportCharges.push(q.transport);
  if (q.transport.reason === "PROCUREMENT") state.benefits[playerId]!.bulk -= q.bonus;
  addEvent(state, "BUILDING_USED", playerId, { ...q });
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
  if (state.cityLevel === 4 && previousLevel === 3) { state.cityLevel4Round = state.round; state.finalRound = Math.min(12, Math.max(10, state.round + 1)); }
  for (const project of createPublicProjects(state.cityLevel)) {
    if (!state.publicProjects.some((p) => p.id === project.id)) {
      state.publicProjects.push(project);
      addEvent(state, "PROJECT_REVEALED", null, { projectId: project.id, name: project.name });
    }
  }
  refreshValues(state);
  addEvent(state, "ROUND_SETTLED", null, { ...settlement, finalRound: state.finalRound });
  state.roundReady = []; state.currentInvestmentPlayer = null;
  if (state.round >= state.finalRound) {
    const ranking = rankCompanies(state.companies, state.companyValues);
    state.result = { reason: state.cityLevel4Round !== null && state.cityLevel4Round < state.round ? "CITY_LV4_FINAL_ROUND" : "ROUND_12", round: state.round, ranking, winners: ranking.filter((e) => e.rank === 1).map((e) => e.playerId) };
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
  if (state.phase === "BID" && !Object.hasOwn(state.bids, playerId)) return { type: "SUBMIT_BID", wins: estimateBid(state.playerHands[playerId]!, state.opportunities) };
  if (state.phase === "AUDITOR_PLACEMENT" && state.auditor.placementPlayer === playerId) return { type: "PLACE_AUDITOR", target: auditorCandidates({ playerId, players: state.players, companies: state.companies, buildings: state.buildings, routes: state.routes, publicProjects: state.publicProjects, auditor: state.auditor, cityLevel: state.cityLevel })[0]!.target };
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
  if (previous.rulesVersion !== "0.4") throw new Error("旧ルールのゲームです。新しい部屋で開始してください");
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
    if (state.phase === "BID_RESULT") beginEconomy(state);
    else {
      if (state.phase !== "TRICK_RESULT") throw new Error("自動進行できる段階ではありません");
      state.trickLeader = clockwisePlayer(state.players, state.trickLeader);
      if (state.trickIndex + 1 === state.opportunities.length) finishTricks(state);
      else { state.trickIndex++; state.trump = state.opportunities[state.trickIndex]!.trump; state.playedCards = []; state.phase = "TRICK"; }
    }
  } else {
    const p = action.playerId;
    if (!state.players.includes(p)) throw new Error("Unknown player");
    if (action.type === "ROUND_READY" && state.phase === "ROUND_START") {
      if (state.roundReady.includes(p)) throw new Error("確認済みです"); state.roundReady.push(p);
      if (state.roundReady.length === 4) state.phase = state.config.trickRule === "BID" ? "BID" : "TRICK";
    } else if (action.type === "SUBMIT_BID" && state.phase === "BID" && state.config.trickRule === "BID") {
      if (Object.hasOwn(state.bids, p)) throw new Error("ビッドは確定済みです");
      if (!Number.isInteger(action.wins) || action.wins < 0 || action.wins > state.opportunities.length) throw new Error("ビッドの勝利数が不正です");
      state.bids[p] = action.wins;
      addEvent(state, "BID_SUBMITTED", p); // Never put the secret declaration in public events.
      if (state.players.every((id) => Object.hasOwn(state.bids, id))) {
        state.bidsRevealed = true; state.phase = "TRICK";
        addEvent(state, "BIDS_REVEALED", null, { bids: { ...state.bids } });
      }
    } else if (action.type === "PLACE_AUDITOR" && state.phase === "AUDITOR_PLACEMENT" && state.config.auditor) {
      if (state.auditor.placementPlayer !== p) throw new Error("監査官の配置権がありません");
      if (!AUDITOR_TARGETS.includes(action.target)) throw new Error("監査官の配置先が不正です");
      state.auditor.target = action.target; state.auditor.placementPlayer = null;
      addEvent(state, "AUDITOR_PLACED", p, { target: action.target });
      state.phase = "PROCUREMENT";
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
      else if (action.type === "USE_BUILDING" && !state.procurementDone.includes(p)) useBuilding(state, p, action);
      else if (action.type === "PROCUREMENT_DONE" && !state.procurementDone.includes(p)) {
        state.procurementDone.push(p);
        if (state.procurementDone.length === 4) { for (const n of state.negotiations) if (n.status === "PENDING") { n.status = "EXPIRED"; n.resolution = "PHASE_END"; n.resolvedAt = now; } state.phase = "PRODUCTION"; }
      } else throw new Error("仕入フェーズの操作は終了しています");
    } else if (state.phase === "PRODUCTION" && !state.productionDone.includes(p)) {
      if (action.type === "USE_BUILDING") {
        useBuilding(state, p, action);
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
