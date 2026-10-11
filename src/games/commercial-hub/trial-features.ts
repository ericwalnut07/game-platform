import type { MajorCard } from "./next-rules";
type Rules = { rulesVersion?: string; next?: { changes?: { major: boolean; operations: boolean } | undefined } | null };
/** Overrides are populated only by the offline factorial experiment, never by client input. */
export function majorV4(s: Rules): boolean { return s.rulesVersion === "next-trial-4" && (s.next?.changes?.major ?? true); }
export function unifiedOperations(s: Rules): boolean { return s.rulesVersion === "next-trial-4" && (s.next?.changes?.operations ?? true); }
export function flexibleBuildings(s: Rules): boolean { return s.rulesVersion === "next-trial-3" || s.rulesVersion === "next-trial-4"; }
export function privateDistrictOwned(s: Rules & { round: number; next?: {cards:MajorCard[]} | null }, playerId: string): boolean {
  return majorV4(s) && !!s.next?.cards.some(c => c.id === "business-expansion" && c.owner === playerId && c.status === "ACTIVE" && c.activeRound <= s.round);
}
