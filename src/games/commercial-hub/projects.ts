import { NO_COST, pay } from "./resources";
import type { PlayerId, ProjectResource, PublicProject, Resources } from "./types";

export const PROJECT_NAMES = ["中央市場", "中央駅", "市庁舎"] as const;
export const PROJECT_DEVELOPMENT = 3;
const SLOT_RESOURCES: readonly ProjectResource[] = ["materials", "materials", "cash", "cash", "influence", "influence"];

/** Creating an available project is separate from deciding when it is revealed. */
export function createPublicProject(id: string, name: string): PublicProject {
  return { id, name, slots: SLOT_RESOURCES.map((resource) => ({ resource, playerId: null })) };
}
export function projectComplete(project: PublicProject): boolean {
  return project.slots.length === 6 && project.slots.every((slot) => slot.playerId !== null);
}
export function projectSlotCost(project: PublicProject, slotIndex: number): Resources {
  const slot = project.slots[slotIndex];
  if (!Number.isInteger(slotIndex) || !slot || slot.playerId !== null) throw new Error("空いている貢献枠を選んでください");
  return { ...NO_COST, [slot.resource]: slot.resource === "influence" ? 1 : 2 };
}
export function contributeToProject(project: PublicProject, playerId: PlayerId, slotIndex: number, resources: Resources, free: boolean) {
  const cost = projectSlotCost(project, slotIndex);
  const next = { ...project, slots: project.slots.map((slot, i) => i === slotIndex ? { ...slot, playerId } : slot) };
  return { project: next, resources: pay(resources, free ? NO_COST : cost), completedNow: projectComplete(next) };
}
export function projectValue(project: PublicProject, playerId: PlayerId): number {
  if (!projectComplete(project)) return 0;
  const counts = new Map<PlayerId, number>();
  for (const slot of project.slots) counts.set(slot.playerId!, (counts.get(slot.playerId!) ?? 0) + 1);
  const own = counts.get(playerId) ?? 0;
  const highest = Math.max(...counts.values());
  const leaders = [...counts.values()].filter((count) => count === highest).length;
  return own + (own > 0 && own === highest ? leaders === 1 ? 2 : 1 : 0);
}
