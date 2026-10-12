import { OPPORTUNITIES, opportunitiesAtLevel, type Opportunity, type OpportunityId } from "./data";
import { NO_COST } from "./resources";
import type { Resources, Suit } from "./types";
/** Explicit eight business opportunities; independent of early support pools. */
export const V1_BOOM_OPPORTUNITIES = OPPORTUNITIES.filter(o =>
  ["sales", "promotion", "processing", "expansion", "purchase", "bulk", "development", "public-project"].includes(o.id));

export const NEXT_OPPORTUNITIES: readonly { id: OpportunityId; name: string; suit: Suit; from: number; until: number }[] = [...OPPORTUNITIES
  .filter(o => !(o.suit === "commerce" && o.id === "cash-support") && !(o.suit === "procurement" && o.id === "materials-support"))
  .map(o => o.suit === "commerce" && o.id === "sales" ? { ...o, from: 1 } : o.id === "goods-support" ? { ...o, until: 2 } : o)
  , { id: "cash-support", name: "資金支援", suit: "procurement", from: 1, until: 2 }];

export function nextOpportunitiesAtLevel(suit: Suit, level: number) {
  return level <= 2 ? NEXT_OPPORTUNITIES.filter(o => o.suit === suit && level >= o.from && level <= o.until) : opportunitiesAtLevel(suit, level);
}
export function isSupportOpportunity(o: Pick<Opportunity, "id">): boolean {
  return ["cash-support", "materials-support", "goods-support"].includes(o.id);
}
/** Shared by the reward engine and player-view-only NPC evaluation. */
export function supportReward(o: Pick<Opportunity, "id">, place: number, earlyNext: boolean): Resources {
  const r = { ...NO_COST };
  if (place > 2) return r;
  if (o.id === "cash-support") r.cash = earlyNext ? place === 1 ? 3 : 2 : place === 1 ? 2 : 1;
  if (o.id === "materials-support") r.materials = 1;
  if (o.id === "goods-support") r.goods = 1;
  if (earlyNext && place === 1 && ["materials-support", "goods-support"].includes(o.id)) r.cash = 1;
  return r;
}
