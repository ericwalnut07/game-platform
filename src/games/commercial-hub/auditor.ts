import type { HubState } from "./state";
import { DISTRICT_IDS, type DistrictId } from "./types";

export const AUDITOR_TARGETS = [...DISTRICT_IDS, "PUBLIC_PROJECTS"] as const;
export type AuditorTarget = DistrictId | "PUBLIC_PROJECTS";
/** Immediate payment to the bank; neither transport nor quantity changes this fee. */
export function auditFee(state: Pick<HubState, "config" | "auditor" | "round">, target: AuditorTarget): number {
  return state.config.auditor && state.round >= 2 && state.auditor.target === target ? 1 : 0;
}
