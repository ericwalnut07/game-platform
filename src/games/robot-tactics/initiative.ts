import type { RobotBattleCoreState } from "./battleState";
import { applyRobotWeaponDebuffStats } from "./weaponHitEffects";

export interface RobotBattleRoundInitiative {
  readonly round: number;
  readonly entries: readonly { readonly actorId: string; readonly spd: number; readonly side: "controlled" | "friendly-ai" | "enemy" }[];
}
const priority = { controlled: 0, "friendly-ai": 1, enemy: 2 };
function compare(a: RobotBattleRoundInitiative["entries"][number], b: RobotBattleRoundInitiative["entries"][number]) {
  return b.spd - a.spd || priority[a.side] - priority[b.side] || (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0);
}
/** Evaluate once after start-of-round respawn/reinforcements, before any turn. */
export function createRobotRoundInitiative(s: RobotBattleCoreState): RobotBattleRoundInitiative {
  if (s.turn.actorId !== null || s.turn.actedActorIds.length) throw new Error("Initiative snapshot requires a fresh full round");
  const entries = s.actors.flatMap(actor => {
    const members = actor.unitIds.map(id => s.units.find(u => u.id === id)!).filter(u => u.hp > 0);
    if (!members.length) return [];
    if (members.some(u => u.statuses.length)) throw new Error("Unknown status SPD resolver required");
    const first = members[0]!, side = first.kind === "controlled" || first.kind === "friendly-ai" ? first.kind : "enemy" as const;
    const spd = Math.floor(members.reduce((sum, u) => sum + applyRobotWeaponDebuffStats(u.stats, u.weaponDebuffs).spd, 0) / members.length);
    return [{ actorId: actor.id, spd, side }];
  }).sort(compare);
  return { round: s.allied.round, entries };
}
export function getRobotInitiativeQueue(s: RobotBattleCoreState): readonly string[] {
  if (!s.initiative || s.initiative.round !== s.allied.round) throw new Error("Saved round initiative required");
  return s.initiative.entries.filter(e => !s.turn.actedActorIds.includes(e.actorId) && s.actors.find(a => a.id === e.actorId)!.unitIds.some(id => s.units.find(u => u.id === id)!.hp > 0)).map(e => e.actorId);
}
export function assertRobotRoundInitiative(s: RobotBattleCoreState): void {
  const saved = s.initiative;
  if (!saved) return; // Existing component checkpoints use trusted explicit ordering.
  if (saved.round !== s.allied.round || !Array.isArray(saved.entries) || new Set(saved.entries.map(e => e.actorId)).size !== saved.entries.length) throw new Error("Invalid round initiative snapshot");
  for (const entry of saved.entries) {
    const actor = s.actors.find(a => a.id === entry.actorId), unit = actor && s.units.find(u => u.id === actor.unitIds[0]);
    if (!unit || !Number.isSafeInteger(entry.spd) || entry.side !== (unit.kind === "controlled" || unit.kind === "friendly-ai" ? unit.kind : "enemy")) throw new Error("Invalid initiative entry");
  }
  if (saved.entries.some((entry, i) => i > 0 && compare(saved.entries[i - 1]!, entry) > 0) || s.actors.some(a => a.unitIds.some(id => s.units.find(u => u.id === id)!.hp > 0) && !saved.entries.some(e => e.actorId === a.id))) throw new Error("Incomplete/unsorted initiative snapshot");
  if (s.turn.actorId !== null && getRobotInitiativeQueue(s)[0] !== s.turn.actorId) throw new Error("Current actor differs from round initiative");
}
