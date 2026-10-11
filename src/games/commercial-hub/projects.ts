import type { PublicProject, Resources } from "./types";
import { NO_COST } from "./resources";
export const PROJECT_DEVELOPMENT = 5;
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
export function contributionValue(count: number): number { return count === 0 ? 0 : count * 2 - 1; }
export function projectValue(project: PublicProject, playerId: string): number {
  return projectComplete(project) ? contributionValue(project.slots.filter((s) => s.playerId === playerId).length) : 0;
}

