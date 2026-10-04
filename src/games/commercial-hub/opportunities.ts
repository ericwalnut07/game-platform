import type { GameRandomSource } from "../core/GameModule";
import { CITY_CONDITIONS, OPENING, OPPORTUNITIES, SPECIAL_BOOM, SUIT_NAMES, opportunitiesAtLevel, opportunityCountKey, type Opportunity } from "./data";
import { canPay, gain, NO_COST } from "./resources";
import { addEvent, companyOf, setResources, type HubState } from "./state";
import { SUITS, type Resources, type Suit } from "./types";
export function drawRound(state: HubState, rng: GameRandomSource): void {
  if (state.round === 1) state.cityCondition = { ...OPENING };
  else if (state.specialBoomRound === state.round && !state.specialBoomPlayed) { state.cityCondition = { ...SPECIAL_BOOM }; state.specialBoomPlayed = true; }
  else {
    if (!state.marketBag.length) { state.marketBag = rng.shuffle(CITY_CONDITIONS.map((c) => c.id)); state.marketUsed = []; }
    const id = state.marketBag.shift()!; state.marketUsed.push(id); state.cityCondition = { ...CITY_CONDITIONS.find((c) => c.id === id)! };
  }
  const selected: Opportunity[] = [];
  const choose = (suit: Suit, count: number): void => {
    const types = opportunitiesAtLevel(suit, state.cityLevel);
    const chosen = count === 2 ? types : [state.opportunityCounts[opportunityCountKey(types[0]!)]! < state.opportunityCounts[opportunityCountKey(types[1]!)]! ? types[0]! : state.opportunityCounts[opportunityCountKey(types[1]!)]! < state.opportunityCounts[opportunityCountKey(types[0]!)]! ? types[1]! : types[rng.integer(0, 1)]!];
    for (const o of chosen) { selected.push({ id: o.id, name: o.name, suit: o.suit, trump: state.cityCondition.trump }); state.opportunityCounts[opportunityCountKey(o)]!++; }
  };
  for (let i = 0; i < SUITS.length; i++) {
    const suit = SUITS[i]!, count = state.cityCondition.counts[i]!;
    if (state.round === 1) for (let j = 0; j < count; j++) selected.push({ id: "opening", suit, name: `開業・${SUIT_NAMES[suit]}`, trump: suit });
    else if (state.cityCondition.id === "special-boom" && suit === "procurement") { choose(suit, 1); selected.push({ id: "special-materials", suit, name: "特別資材", trump: "commerce" }); }
    else choose(suit, count);
  }
  state.opportunities = rng.shuffle(selected);
  if (state.round === 1) state.opportunities[rng.integer(0, 5)]!.trump = null;
  state.trump = state.opportunities[0]!.trump;
}
export function initialOpportunityCounts(): Record<string, number> { return Object.fromEntries(OPPORTUNITIES.map((o) => [opportunityCountKey(o), 0])) as Record<string, number>; }
export function openingReward(suit: Suit, place: number): Resources {
  if (place === 4) return { ...NO_COST }; if (place === 3) return { ...NO_COST, cash: 1 };
  if (suit === "commerce") return { ...NO_COST, cash: place === 1 ? 2 : 1, goods: 1 };
  if (suit === "industry") return { ...NO_COST, cash: 1, materials: place === 1 ? 2 : 1 };
  if (suit === "procurement") return { cash: 1, materials: 1, goods: place === 1 ? 1 : 0 };
  return { ...NO_COST, cash: place === 1 ? 3 : 2 };
}
export function awardOpportunity(state: HubState, opportunity: Opportunity, rewardRanking: string[]): void {
  for (let i = 0; i < 4; i++) {
    const p = rewardRanking[i]!, place = i + 1, r = companyOf(state, p).resources, benefit = state.benefits[p]!;
    let resources = { ...NO_COST };
    if (opportunity.id === "opening") resources = openingReward(opportunity.suit, place);
    else if (opportunity.id === "special-materials") resources.materials = [2, 1, 1, 0][i]!;
    else if (place <= 2) {
      switch (opportunity.id) {
        case "cash-support": resources.cash = place === 1 ? 2 : 1; break;
        case "materials-support": resources.materials = 1; break;
        case "goods-support": resources.goods = 1; break;
        case "sales": { const maximum = Math.min(r.goods, place === 1 ? 2 : 1); if (maximum) state.rewardChoices.push({ playerId: p, kind: "SALE", maximum, cash: 3, goods: 0 }); break; }
        case "processing": if (r.materials > 0) state.rewardChoices.push({ playerId: p, kind: "PROCESS", maximum: 1, cash: 0, goods: place === 1 ? 3 : 2 }); break;
        case "purchase": { const cash = place === 1 ? 1 : 2; if (canPay(r, { ...NO_COST, cash })) state.rewardChoices.push({ playerId: p, kind: "PURCHASE", maximum: 1, cash, goods: 0 }); break; }
        case "promotion": benefit.promotion += place === 1 ? 2 : 1; break;
        case "expansion": benefit.production += place === 1 ? 2 : 1; break;
        case "bulk": benefit.bulk += place === 1 ? 2 : 1; break;
        case "development": benefit.development = place === 1 ? 2 : 1; break;
        case "public-project": benefit.project.push(place === 1 ? "FREE" : "REBATE"); break;
      }
    }
    setResources(state, p, gain(r, resources));
    addEvent(state, "OPPORTUNITY_REWARD", p, { opportunity: opportunity.id, rewardPlace: place, resources });
  }
}
