import { districtOf } from "./data";
import type { HubState, TrickResult } from "./state";
import { SUITS, type DistrictId, type Suit } from "./types";
export const AUDITOR_TARGETS = [...SUITS, "PUBLIC_PROJECTS"] as const;
export type AuditorTarget = Suit | "PUBLIC_PROJECTS";
export function districtAuditTarget(district: DistrictId): Suit { return districtOf(district).suit ?? "administration"; }
/** Immediate payment to the bank; quantity and transport do not change this fee. */
export function auditFee(state: Pick<HubState, "config" | "auditor" | "round">, target: AuditorTarget | DistrictId): number {
  const group = AUDITOR_TARGETS.includes(target as AuditorTarget) ? target : districtAuditTarget(target as DistrictId);
  return state.config.auditor && state.round >= 2 && state.auditor.target === group ? 1 : 0;
}
export interface AuditorStanding { playerId: string; missed: number; rankSum: number; averageRank: number; clockwiseDistance: number }
export interface AuditorSelection { playerId: string; starter: string; standings: AuditorStanding[]; tieBreak: "MISSED" | "AVERAGE_RANK" | "CLOCKWISE_SEAT" }
/** Qualification follows reward order, including existing third-place special rewards.
 * Declining an optional purchase/sale does not change the reward qualification. */
export function rewardPlaces(result: Pick<TrickResult, "opportunity">): number { return ["opening", "special-materials"].includes(result.opportunity.id) ? 3 : 2; }
export function selectAuditor(players: readonly string[], starter: string, results: readonly TrickResult[]): AuditorSelection {
  if (!results.length || !players.includes(starter)) throw new Error("監査官の判定にはラウンドのトリック結果が必要です");
  const standings = players.map((playerId, seat) => {
    const rankSum = results.reduce((sum, t) => sum + t.ranking.indexOf(playerId) + 1, 0);
    return { playerId, missed: results.filter((t) => t.rewardRanking.indexOf(playerId) >= rewardPlaces(t)).length,
      rankSum, averageRank: rankSum / results.length, clockwiseDistance: (seat - players.indexOf(starter) + players.length) % players.length };
  }).sort((a, b) => b.missed - a.missed || b.rankSum - a.rankSum || a.clockwiseDistance - b.clockwiseDistance);
  const maxMissed = standings.filter((s) => s.missed === standings[0]!.missed);
  const maxRank = maxMissed.filter((s) => s.rankSum === standings[0]!.rankSum);
  return { playerId: standings[0]!.playerId, starter, standings,
    tieBreak: maxMissed.length === 1 ? "MISSED" : maxRank.length === 1 ? "AVERAGE_RANK" : "CLOCKWISE_SEAT" };
}
