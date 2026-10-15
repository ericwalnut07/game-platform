import type { PublicProject, Resources } from "./types";
import { NO_COST } from "./resources";
export const PROJECT_BENEFITS = ["DISCOUNT", "REBATE", "DISCOUNT_REBATE"] as const;
export type ProjectBenefit = typeof PROJECT_BENEFITS[number];
export const projectBenefitDiscount = (benefit: ProjectBenefit | "NONE") => benefit === "DISCOUNT" || benefit === "DISCOUNT_REBATE";
export const projectBenefitRebate = (benefit: ProjectBenefit | "NONE") => benefit === "REBATE" || benefit === "DISCOUNT_REBATE" ? 1 : 0;
export const PROJECT_DEVELOPMENT = 5;
export const FORMAL_PROJECT_SCORING = "v1-two-points-per-slot" as const;
export type ProjectScoringRule = typeof FORMAL_PROJECT_SCORING;
export interface ProjectScoringRules { rulesVersion?: string; projectScoringRule?: ProjectScoringRule; completionRewardExperiment?: "cash" | "both" | "half" }
/** Missing markers belong to already-started games and keep their original scoring. */
export function linearProjectScoring(rules?: ProjectScoringRules): boolean {
  return rules?.rulesVersion === "1.0" && rules.projectScoringRule === FORMAL_PROJECT_SCORING;
}
/** Rewards are experimental and never activated through public configuration. */
export function completionCashPerSlot(rules?: ProjectScoringRules): number {
  return rules?.completionRewardExperiment === "half" ? 1 : rules?.completionRewardExperiment ? 2 : 0;
}
export function completionFinisherPoints(rules?: ProjectScoringRules): number {
  return rules?.completionRewardExperiment === "half" ? 1 : rules?.completionRewardExperiment === "both" ? 2 : 0;
}
export function projectScoringLabel(rules?: ProjectScoringRules): string {
  return linearProjectScoring(rules) ? "完成事業：自社拠出1枠につき2点（0/2/4/6/8/10/12点）。未完成は0点。"
    : "完成事業：自社拠出0〜6枠＝0/1/3/5/7/9/11点。未完成は0点。";
}
export const PROJECT_DEFINITIONS = [
  { id: "market", name: "中央市場", level: 1, materials: 1, goods: 2, cash: 2 },
  { id: "station", name: "中央駅", level: 1, materials: 2, goods: 1, cash: 2 },
  { id: "city-hall", name: "市庁舎", level: 2, materials: 2, goods: 2, cash: 3 },
  { id: "logistics-port", name: "物流港", level: 3, materials: 3, goods: 2, cash: 3 },
  { id: "industrial-institute", name: "産業研究所", level: 3, materials: 2, goods: 3, cash: 3 }
] as const;
export function createPublicProjects(level = 1): PublicProject[] {
  return PROJECT_DEFINITIONS.filter((p) => p.level <= level).map((p) => ({ id: p.id, name: p.name,
    slots: (["materials", "goods", "cash"] as const).flatMap((resource) => Array.from({ length: 2 }, () => ({ resource, amount: p[resource], playerId: null }))) }));
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


