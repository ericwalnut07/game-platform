import type { GameRandomSource } from "../core/GameModule";
import { assertFourPlayers, clockwisePlayer, dealHands, investmentOrder, playCard, trickRanking } from "./cards";
import { CITY_CONDITIONS, DISTRICTS, OPPORTUNITIES, type OpportunityId } from "./data";
import { resolveIncome } from "./income";
import { legalInvestments, networkUseKey, quoteInvestment } from "./investment";
import { connectedDistricts, placeRoute } from "./logistics";
import { answerTrade, beginInvestmentTurn, counterTrade, marketStep, offerTrade, skipNegotiation } from "./negotiation";
import { opportunityReward } from "./opportunities";
import { contributeToProject, createPublicProject, PROJECT_DEVELOPMENT, PROJECT_NAMES } from "./projects";
import { gain, INITIAL_RESOURCES, NO_COST, pay } from "./resources";
import { companyValue, roundEndResult } from "./scoring";
import { addEvent, companyOf, emptyCredits, type CityCondition, type HubAction, type HubState, type InvestmentAction } from "./state";
import { SUITS, type Resources, type Suit } from "./types";

export function drawOpportunities(condition: CityCondition, rng: GameRandomSource): OpportunityId[] {
  const fromSuit = (suit: Suit) => rng.shuffle(OPPORTUNITIES.filter((entry) => entry.suit === suit))[0]!.id;
  const selected = SUITS.map(fromSuit);
  while (selected.length < condition.tricks) {
    const suit = condition.favoredSuit !== null && rng.next() < 0.6 ? condition.favoredSuit : SUITS[rng.integer(0, 3)]!;
    selected.push(fromSuit(suit));
  }
  return rng.shuffle(selected);
}
export function refreshValues(state: HubState): void {
  const projects = [...state.completedPublicProjects, ...(state.activePublicProject ? [state.activePublicProject] : [])];
  state.companyValues = Object.fromEntries(state.companies.map((company) => [company.playerId, companyValue(company, state.buildings, state.routeOwnership, projects)]));
}
function setResources(state: HubState, playerId: string, resources: Resources): void {
  state.companies = state.companies.map((company) => company.playerId === playerId ? { ...company, resources } : company);
}
function award(state: HubState, playerId: string, resources: Resources): void {
  setResources(state, playerId, gain(companyOf(state, playerId).resources, resources));
}
function openProject(state: HubState): void {
  if (state.activePublicProject || state.cityLevel < 2 || state.completedPublicProjects.length >= PROJECT_NAMES.length) return;
  const index = state.completedPublicProjects.length;
  state.activePublicProject = createPublicProject(`${state.matchId}:project:${index + 1}`, PROJECT_NAMES[index]!);
  addEvent(state, "PROJECT_OPENED", null, { projectId: state.activePublicProject.id, name: state.activePublicProject.name });
}
function contribute(state: HubState, playerId: string, slot: number, free: boolean): void {
  if (!state.activePublicProject) throw new Error("公開中の公共事業がありません");
  // Investment cost was already paid (with HQ discount); reward contributions are free.
  const result = contributeToProject(state.activePublicProject, playerId, slot, NO_COST, true);
  state.activePublicProject = result.project;
  addEvent(state, "PROJECT_CONTRIBUTION", playerId, { projectId: result.project.id, slot, resource: result.project.slots[slot]!.resource, free });
  if (result.completedNow) {
    state.completedPublicProjects.push(result.project);
    state.activePublicProject = null;
    state.cityDevelopment += PROJECT_DEVELOPMENT;
    addEvent(state, "PROJECT_COMPLETED", null, { projectId: result.project.id, contributions: result.project.slots, development: PROJECT_DEVELOPMENT });
    openProject(state);
  }
}
function activateBonuses(state: HubState): void {
  for (const bonus of state.districtBonuses) {
    if (bonus.activated || bonus.availableRound > state.round) continue;
    bonus.activated = true;
    const credits = state.credits[bonus.playerId]!;
    let reward: Resources = { ...NO_COST };
    switch (bonus.district) {
      case "MARKET": reward = { ...NO_COST, cash: 1 }; break;
      case "WORKSHOP": reward = { ...NO_COST, goods: 1 }; break;
      case "GOV": reward = { ...NO_COST, influence: 1 }; break;
      case "WAREHOUSE": credits.route++; break;
      case "BUSINESS": credits.businessSale++; break;
      case "INDUSTRIAL": credits.productionBoost++; break;
      case "NEW_TOWN": credits.constructionCash++; break;
      case "PORT":
        if (connectedDistricts(state.routeOwnership, bonus.playerId).has("PORT")) reward = { ...NO_COST, cash: 1 };
        else credits.route++;
        break;
    }
    award(state, bonus.playerId, reward);
    addEvent(state, "DISTRICT_BONUS", bonus.playerId, { district: bonus.district, reward, credits: { ...credits } });
  }
}
function startRound(state: HubState, rng: GameRandomSource): void {
  state.phase = "ROUND_START";
  state.cityCondition = CITY_CONDITIONS[rng.integer(0, CITY_CONDITIONS.length - 1)]!;
  state.trump = state.cityCondition.trump;
  state.opportunities = drawOpportunities(state.cityCondition, rng);
  state.playerHands = dealHands(state.players, state.cityCondition.tricks, rng);
  state.trickIndex = 0; state.playedCards = []; state.trickResults = []; state.rewardChoices = []; state.roundReady = [];
  state.investmentTurn = null; state.currentInvestmentPass = 1; state.investmentTurnIndex = 0;
  state.publicMarketUsedByPlayer = []; state.discountUses = { transport: [], route: [], influence: [] }; state.abilityUses = []; state.incomeDone = [];
  activateBonuses(state); openProject(state);
  addEvent(state, "ROUND_STARTED", null, { condition: state.cityCondition.id, trump: state.trump, opportunities: state.opportunities, cityLevel: state.cityLevel });
}
export function createHubState(matchId: string, players: readonly string[], rng: GameRandomSource): HubState {
  assertFourPlayers(players);
  const state: HubState = {
    gameId: "commercial-hub", rulesVersion: "0.1", matchId, players: [...players], phase: "ROUND_START", revision: 0, round: 1,
    cityCondition: CITY_CONDITIONS[0], trump: null, opportunities: [], playerHands: {}, trickIndex: 0,
    trickLeader: players[0]!, playedCards: [], trickResults: [], rewardChoices: [], roundReady: [],
    investmentStarter: players[0]!, currentInvestmentPass: 1, investmentTurnIndex: 0, investmentTurn: null,
    publicMarketUsedByPlayer: [], companies: players.map((playerId) => ({ playerId, resources: { ...INITIAL_RESOURCES } })),
    buildings: [], nextBuildingId: 1, routeOwnership: {}, credits: Object.fromEntries(players.map((id) => [id, emptyCredits()])),
    discountUses: { transport: [], route: [], influence: [] }, districtBonuses: [], abilityUses: [], incomeDone: [],
    cityDevelopment: 0, cityLevel: 1, activePublicProject: null, completedPublicProjects: [], companyValues: {},
    finalRound: null, cityLevel4Round: null, result: null, eventSeq: 0, events: []
  };
  startRound(state, rng); refreshValues(state);
  return state;
}
function resolveTrick(state: HubState): void {
  const ranking = trickRanking(state.playedCards, state.trump);
  const opportunity = state.opportunities[state.trickIndex]!;
  state.trickResults.push({ round: state.round, index: state.trickIndex, opportunity, played: [...state.playedCards], ranking });
  addEvent(state, "TRICK_RESULT", null, { index: state.trickIndex, opportunity, played: state.playedCards, ranking });
  for (const place of [1, 2] as const) {
    const playerId = ranking[place - 1]!;
    const reward = opportunityReward(opportunity, place);
    switch (reward.kind) {
      case "RESOURCES": award(state, playerId, reward.resources); break;
      case "ROUTE_CREDIT": state.credits[playerId]!.route += reward.amount; break;
      case "TRANSPORT_DISCOUNT": state.credits[playerId]!.transport += reward.amount; break;
      case "SALE": {
        const maximum = Math.min(reward.maximumGoods, companyOf(state, playerId).resources.goods);
        if (maximum > 0) state.rewardChoices.push({ playerId, kind: "SALE", maximum });
        break;
      }
      case "FREE_PROJECT_SLOT":
        if (state.activePublicProject) state.rewardChoices.push({ playerId, kind: "PROJECT" });
        else award(state, playerId, { ...NO_COST, influence: 2 });
        break;
    }
    addEvent(state, "OPPORTUNITY_REWARD", playerId, { opportunity, place, reward, noProject: reward.kind === "FREE_PROJECT_SLOT" && state.activePublicProject === null });
  }
  state.phase = state.rewardChoices.length ? "REWARD" : "TRICK_RESULT";
}
function nextInvestment(state: HubState): void {
  state.investmentTurnIndex++;
  if (state.investmentTurnIndex === 4) {
    if (state.currentInvestmentPass === 2) { state.phase = "INCOME"; state.investmentTurn = null; return; }
    state.currentInvestmentPass = 2; state.investmentTurnIndex = 0;
  }
  state.investmentTurn = beginInvestmentTurn(investmentOrder(state.players, state.investmentStarter, state.currentInvestmentPass)[state.investmentTurnIndex]!);
}
function invest(state: HubState, playerId: string, action: InvestmentAction): void {
  const quote = quoteInvestment(state, playerId, action);
  setResources(state, playerId, pay(companyOf(state, playerId).resources, quote.cost));
  state.discountUses.transport.push(...quote.uses.transport); state.discountUses.route.push(...quote.uses.route); state.discountUses.influence.push(...quote.uses.influence);
  const credits = state.credits[playerId]!;
  credits.route -= quote.uses.routeCredit; credits.transport -= quote.uses.transportCredit; credits.constructionCash -= quote.uses.constructionCash;
  if (quote.transport?.owner) {
    award(state, quote.transport.owner, { ...NO_COST, cash: quote.transport.fee });
    const key = networkUseKey(playerId, quote.transport.owner);
    if (!state.discountUses.transport.includes(key)) state.discountUses.transport.push(key);
  }
  if (quote.transport) addEvent(state, "TRANSPORT_USED", playerId, { ...quote.transport, uses: quote.uses });
  if (action.type === "BUILD") {
    const id = `building-${state.nextBuildingId++}`;
    state.buildings.push({ id, playerId, district: action.district, suit: action.suit, upgraded: false });
    state.cityDevelopment++;
    if (DISTRICTS.find((d) => d.id === action.district)!.suit === action.suit) state.districtBonuses.push({ playerId, district: action.district, availableRound: state.round + 1, activated: false });
    addEvent(state, "BUILD", playerId, { ...action, buildingId: id, cost: quote.cost, uses: quote.uses });
  } else if (action.type === "UPGRADE") {
    state.buildings = state.buildings.map((b) => b.id === action.buildingId ? { ...b, upgraded: true } : b);
    state.cityDevelopment++; addEvent(state, "UPGRADE", playerId, { buildingId: action.buildingId, cost: quote.cost });
  } else if (action.type === "ROUTE") {
    state.routeOwnership = placeRoute(state.routeOwnership, playerId, action.edgeId);
    state.cityDevelopment++; addEvent(state, "ROUTE", playerId, { edgeId: action.edgeId, cost: quote.cost, uses: quote.uses });
  } else {
    addEvent(state, "PROJECT_PAYMENT", playerId, { slot: action.slot, cost: quote.cost, uses: quote.uses });
    contribute(state, playerId, action.slot, false);
  }
  nextInvestment(state);
}
function endRound(state: HubState): void {
  refreshValues(state);
  const ended = roundEndResult(state.round, state.cityDevelopment, state.finalRound, state.companies, Object.fromEntries(state.players.map((id) => [id, state.companyValues[id]!.total])));
  if (ended.cityLevel === 4 && state.cityLevel4Round === null) state.cityLevel4Round = state.round;
  state.cityLevel = ended.cityLevel; state.finalRound = ended.finalRound; state.result = ended.result;
  state.phase = state.result ? "FINISHED" : "ROUND_END";
  addEvent(state, "ROUND_ENDED", null, { companies: state.companies, values: state.companyValues, cityDevelopment: state.cityDevelopment, cityLevel: state.cityLevel, finalRound: state.finalRound });
  if (state.result) addEvent(state, "GAME_FINISHED", null, { result: state.result });
}
export function reduceHubState(previous: HubState, action: HubAction, rng: GameRandomSource): HubState {
  if (previous.phase === "FINISHED") throw new Error("ゲームは終了しています");
  let state = structuredClone(previous);
  const playerId = action.type === "ADVANCE" ? null : action.playerId;
  if (playerId !== null && !state.players.includes(playerId)) throw new Error("Unknown player");
  if (action.type === "ADVANCE") {
    if (state.phase === "TRICK_RESULT") {
      state.trickLeader = clockwisePlayer(state.players, state.trickLeader);
      if (state.trickIndex + 1 === state.opportunities.length) {
        state.phase = "INVESTMENT"; state.investmentTurn = beginInvestmentTurn(state.investmentStarter);
      } else { state.trickIndex++; state.playedCards = []; state.phase = "TRICK"; }
    } else if (state.phase === "ROUND_END") {
      state.round++; state.investmentStarter = clockwisePlayer(state.players, state.investmentStarter); startRound(state, rng);
    } else throw new Error("自動進行できる段階ではありません");
  } else if (action.type === "ROUND_READY" && state.phase === "ROUND_START") {
    if (state.roundReady.includes(action.playerId)) throw new Error("確認済みです");
    state.roundReady.push(action.playerId);
    if (state.roundReady.length === 4) state.phase = "TRICK";
  } else if (action.type === "PLAY_CARD" && state.phase === "TRICK") {
    const actor = clockwisePlayer(state.players, state.trickLeader, state.playedCards.length);
    if (action.playerId !== actor) throw new Error("自分の手番ではありません");
    state.playerHands[actor] = playCard(state.playerHands[actor]!, action.card, state.playedCards[0]?.card.suit ?? null);
    state.playedCards.push({ playerId: actor, card: action.card });
    addEvent(state, "CARD_PLAYED", actor, { trick: state.trickIndex, card: action.card });
    if (state.playedCards.length === 4) resolveTrick(state);
  } else if (action.type === "CLAIM_REWARD" && state.phase === "REWARD") {
    const choice = state.rewardChoices[0]!;
    if (action.playerId !== choice.playerId) throw new Error("商機を獲得した人の選択を待ってください");
    if (!Number.isInteger(action.amount)) throw new Error("選択が不正です");
    if (choice.kind === "PROJECT") contribute(state, action.playerId, action.amount, true);
    else {
      if (action.amount < 0 || action.amount > choice.maximum) throw new Error("販売個数が不正です");
      setResources(state, action.playerId, gain(pay(companyOf(state, action.playerId).resources, { ...NO_COST, goods: action.amount }), { ...NO_COST, cash: action.amount * 2 }));
      addEvent(state, "OPPORTUNITY_SALE", action.playerId, { goods: action.amount, cash: action.amount * 2 });
    }
    state.rewardChoices.shift(); if (state.rewardChoices.length === 0) state.phase = "TRICK_RESULT";
  } else if (state.phase === "INVESTMENT" && state.investmentTurn) {
    const turn = state.investmentTurn;
    if (action.type === "OFFER_TRADE") {
      state.investmentTurn = offerTrade(turn, action.playerId, action.counterpart, action.terms, state.companies);
      addEvent(state, "TRADE_OFFERED", action.playerId, { counterpart: action.counterpart, terms: action.terms });
    } else if (action.type === "COUNTER_TRADE") {
      state.investmentTurn = counterTrade(turn, action.playerId, action.terms, state.companies);
      addEvent(state, "TRADE_COUNTERED", action.playerId, { actor: turn.playerId, terms: action.terms });
    } else if (action.type === "ANSWER_TRADE") {
      const answered = answerTrade(turn, action.playerId, action.accept, state.companies);
      state.investmentTurn = answered.turn; state.companies = [...answered.companies];
      addEvent(state, action.accept ? "TRADE_ACCEPTED" : "TRADE_REJECTED", action.playerId, { actor: turn.playerId, negotiation: answered.turn.negotiation });
    } else if (action.type === "SKIP_NEGOTIATION") state.investmentTurn = skipNegotiation(turn, action.playerId);
    else if (action.type === "MARKET") {
      const market = marketStep(turn, action.playerId, state.companies, state.publicMarketUsedByPlayer, action.action);
      state.investmentTurn = market.turn; state.companies = market.companies; state.publicMarketUsedByPlayer = market.usedBy;
      if (action.action !== null) addEvent(state, "MARKET_USED", action.playerId, { action: action.action });
    } else {
      if (turn.playerId !== action.playerId || turn.step !== "INVESTMENT") throw new Error("交渉・公共市場の後に自分の投資を行ってください");
      if (action.type === "PASS_INVESTMENT") {
        if (legalInvestments(state, action.playerId).length) throw new Error("実行可能な投資を1回行ってください");
        addEvent(state, "INVESTMENT_PASSED", action.playerId); nextInvestment(state);
      } else if (["BUILD", "UPGRADE", "ROUTE", "CONTRIBUTE"].includes(action.type)) invest(state, action.playerId, action as InvestmentAction);
      else throw new Error("この段階では使用できない操作です");
    }
  } else if (action.type === "INCOME" && state.phase === "INCOME") {
    if (state.incomeDone.includes(action.playerId)) throw new Error("収入・生産は確定済みです");
    state = resolveIncome(state, action.playerId, action.selections);
    state.incomeDone.push(action.playerId);
    if (state.incomeDone.length === 4) endRound(state);
  } else throw new Error("この段階では使用できない操作です");
  state.revision++;
  refreshValues(state);
  return state;
}
