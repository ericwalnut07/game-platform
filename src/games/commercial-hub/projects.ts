import type { PublicProject, Resources } from "./types";
import { NO_COST } from "./resources";
export const PROJECT_BENEFITS = ["DISCOUNT", "REBATE", "DISCOUNT_REBATE"] as const;
export type ProjectBenefit = typeof PROJECT_BENEFITS[number];
export const projectBenefitDiscount = (benefit: ProjectBenefit | "NONE") => benefit === "DISCOUNT" || benefit === "DISCOUNT_REBATE";
export const projectBenefitRebate = (benefit: ProjectBenefit | "NONE") => benefit === "REBATE" || benefit === "DISCOUNT_REBATE" ? 1 : 0;
export const PROJECT_DEVELOPMENT = 5;
export const FORMAL_PROJECT_SCORING = "v1-two-points-per-slot" as const;
export type ProjectScoringRule = typeof FORMAL_PROJECT_SCORING;
export interface ProjectScoringRules { rulesVersion?: string; projectScoringRule?: ProjectScoringRule; completionRewardExperiment?: "cash" | "both" | "half" | "simple" }
/** Missing markers belong to already-started games and keep their original scoring. */
export function linearProjectScoring(rules?: ProjectScoringRules): boolean {
  return rules?.rulesVersion === "1.0" && rules.projectScoringRule === FORMAL_PROJECT_SCORING;
}
/** Persisted compatibility marker: simple is adopted B; absent means no payout. */
export function completionCashPerSlot(rules?: ProjectScoringRules): number {
  if (rules?.rulesVersion !== "1.0") return 0;
  return (rules?.completionRewardExperiment === "half" || rules?.completionRewardExperiment === "simple") ? 1 : rules?.completionRewardExperiment ? 2 : 0;
}
export function completionFinisherPoints(rules?: ProjectScoringRules): number {
  if (rules?.rulesVersion !== "1.0") return 0;
  return rules?.completionRewardExperiment === "half" ? 1 : rules?.completionRewardExperiment === "both" ? 2 : 0;
}
export function projectScoringLabel(rules?: ProjectScoringRules): string {
  return linearProjectScoring(rules) ? "完成事業：自社拠出1枠につき2点（0/2/4/6/8/10/12点）。未完成は0点。"
    : "完成事業：自社拠出0〜6枠＝0/1/3/5/7/9/11点。未完成は0点。";
}
export function projectComplete(project: PublicProject): boolean { return project.slots.every((s) => s.playerId !== null); }
export function projectSlotCost(project: PublicProject, slot: number): Resources {
  const target = project.slots[slot]; if (!target || target.playerId !== null) throw new Error("空いている公共事業枠を選んでください");
  return target.cost ? { ...target.cost } : { ...NO_COST, [target.resource]: target.amount };
}
export function contributionValue(count: number, rules?: ProjectScoringRules): number { return linearProjectScoring(rules) ? count * 2 : count === 0 ? 0 : count * 2 - 1; }
export function projectValue(project: PublicProject, playerId: string, rules?: ProjectScoringRules): number {
  return projectComplete(project) ? contributionValue(project.slots.filter((s) => s.playerId === playerId).length, rules)
    + (project.completedBy === playerId ? completionFinisherPoints(rules) : 0) : 0;
}




export function projectCompletionLabel(rules?: ProjectScoringRules): string {
  const cash = completionCashPerSlot(rules), bonus = completionFinisherPoints(rules);
  return cash ? `完成時、全拠出者へ自社拠出1枠につき資金${cash}を自動還元。未完成は還元なし。${bonus ? `完成者追加${bonus}点（保存済み試験対局）。` : "完成者追加点なし。"}` : "この対局は完成時の資金還元なし。";
}
