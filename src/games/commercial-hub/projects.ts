import type { PublicProject, Resources } from "./types";
import { NO_COST } from "./resources";
export const PROJECT_DEVELOPMENT = 5;
export function createPublicProjects(): PublicProject[] {
  return [
    { id: "market", name: "中央市場", resources: ["goods", "goods", "goods", "cash", "cash", "materials"] as const },
    { id: "station", name: "中央駅", resources: ["materials", "materials", "goods", "goods", "cash", "cash"] as const },
    { id: "city-hall", name: "市庁舎", resources: ["cash", "cash", "cash", "goods", "goods", "materials"] as const }
  ].map((p) => ({ id: p.id, name: p.name, slots: p.resources.map((resource) => ({ resource, playerId: null })) }));
}
export function projectComplete(project: PublicProject): boolean { return project.slots.every((s) => s.playerId !== null); }
export function projectSlotCost(project: PublicProject, slot: number): Resources {
  const target = project.slots[slot]; if (!target || target.playerId !== null) throw new Error("空いている公共事業枠を選んでください");
  return { ...NO_COST, [target.resource]: target.resource === "cash" ? 2 : 1 };
}
export function projectValue(project: PublicProject, playerId: string): number {
  if (!projectComplete(project)) return 0;
  const counts: Record<string, number> = {};
  for (const slot of project.slots) counts[slot.playerId!] = (counts[slot.playerId!] ?? 0) + 1;
  const own = counts[playerId] ?? 0, max = Math.max(...Object.values(counts));
  return own + (own === max && Object.values(counts).filter((n) => n === max).length === 1 ? 1 : 0);
}
