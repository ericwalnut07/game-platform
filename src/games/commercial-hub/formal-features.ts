import type { MajorCard } from "./major-investments";
export const V1_CONSTRUCTION_RULE = "v1-distinct-suits" as const;
export const V1_OPPORTUNITY_RULE = "v1-work-2" as const;
type Rules = { rulesVersion?: string; constructionRule?: typeof V1_CONSTRUCTION_RULE; opportunityRule?: typeof V1_OPPORTUNITY_RULE };
export function v1Opportunities(s: Rules): boolean { return s.opportunityRule === V1_OPPORTUNITY_RULE; }
export function distinctDistrictSuits(s: Rules): boolean { return s.constructionRule === V1_CONSTRUCTION_RULE; }
export function earlySupport(s: { cityLevel: number }): boolean { return s.cityLevel <= 2; }
export function privateDistrictOwned(s: { round: number; next?: {cards:MajorCard[]} | null }, playerId: string): boolean {
  return !!s.next?.cards.some(c => c.id === "business-expansion" && c.owner === playerId && c.status === "ACTIVE" && c.activeRound <= s.round);
}
