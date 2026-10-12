import type { MajorCard } from "./next-rules";
export const V1_CONSTRUCTION_RULE = "v1-distinct-suits" as const;
export const V1_OPPORTUNITY_RULE = "v1-work-2" as const;
type Rules = { rulesVersion?: string; constructionRule?: typeof V1_CONSTRUCTION_RULE; opportunityRule?: typeof V1_OPPORTUNITY_RULE; next?: { changes?: { major: boolean; operations: boolean } | undefined } | null };
/** Separate persisted marker: Work 1 states retain their six-trick boom. */
export function v1Opportunities(s: Rules): boolean { return (s.rulesVersion === "next-trial-4" || s.rulesVersion === "1.0") && s.opportunityRule === V1_OPPORTUNITY_RULE; }
/** Server-created Work 1 state only; absent in all existing saved matches. */
export function distinctDistrictSuits(s: Rules): boolean { return (s.rulesVersion === "next-trial-4" || s.rulesVersion === "1.0") && s.constructionRule === V1_CONSTRUCTION_RULE; }
/** Overrides are populated only by the offline factorial experiment, never by client input. */
export function majorV4(s: Rules): boolean { return (s.rulesVersion === "next-trial-4" || s.rulesVersion === "1.0") && (s.next?.changes?.major ?? true); }
export function unifiedOperations(s: Rules): boolean { return (s.rulesVersion === "next-trial-4" || s.rulesVersion === "1.0") && (s.next?.changes?.operations ?? true); }
export function flexibleBuildings(s: Rules): boolean { return s.rulesVersion === "next-trial-3" || s.rulesVersion === "next-trial-4" || s.rulesVersion === "1.0"; }
export function privateDistrictOwned(s: Rules & { round: number; next?: {cards:MajorCard[]} | null }, playerId: string): boolean {
  return majorV4(s) && !!s.next?.cards.some(c => c.id === "business-expansion" && c.owner === playerId && c.status === "ACTIVE" && c.activeRound <= s.round);
}
