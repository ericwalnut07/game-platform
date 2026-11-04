import manifest from "./vfx-v1/manifest.json";
import type { RobotBattleHitView, RobotBattleViewModel } from "./BattleViewModel";

export type RobotVfxId = keyof typeof manifest.effects;
export type RobotVfxCue = { readonly id: string; readonly effect: RobotVfxId; readonly cell: { readonly x: number; readonly y: number } };
export const ROBOT_VFX = manifest.effects;
export const robotVfxDuration = (id: RobotVfxId) => ROBOT_VFX[id].frames * ROBOT_VFX[id].frameDurationMs;
export function robotVfxFrame(id: RobotVfxId, elapsed: number, loop = false): number {
  const frame = Math.max(0, Math.floor(elapsed / ROBOT_VFX[id].frameDurationMs));
  return loop ? frame % ROBOT_VFX[id].frames : Math.min(frame, ROBOT_VFX[id].frames - 1);
}
function attackVfx(kind: RobotBattleHitView["kind"]): RobotVfxId | null {
  if (["slash", "blunt", "thrust", "assault", "sniper", "blast"].includes(kind)) return kind as RobotVfxId;
  if (["line", "delta", "pincer"].includes(kind)) return "link_attack";
  if (["pair-defense", "protection"].includes(kind)) return "defense_up";
  if (kind === "special:dot") return "dot";
  if (kind === "special:collision" || kind === "special:echo") return "blunt";
  if (kind === "special:spread-shot") return "blast";
  if (kind === "special:delayed-fuse") return "blast";
  return null;
}
export interface RobotVfxEvent {
  readonly hit: RobotBattleHitView; readonly effect: RobotVfxId | null;
  readonly delayMs: number; readonly durationMs: number; readonly announceHit: boolean;
}
/** Resolved receipt in, disposable presentation out. Never changes Core or saves. */
export function planRobotVfx(hits: readonly RobotBattleHitView[], cues: readonly RobotVfxCue[] = []): RobotVfxEvent[] {
  const pulses = [...new Set(hits.map(h => h.pulse))].sort((a, b) => a - b);
  const starts = new Map<number, number>(); let time = 0;
  for (const pulse of pulses) { starts.set(pulse, time); time += hits.some(h => h.pulse === pulse && h.kind === "special:delayed-fuse") ? robotVfxDuration("blast") + 60 : 160; }
  const events: RobotVfxEvent[] = [];
  for (const hit of hits) {
    const effect = attackVfx(hit.kind), delayMs = starts.get(hit.pulse)!;
    events.push({ hit, effect, delayMs, durationMs: effect ? robotVfxDuration(effect) : 480, announceHit: !hit.presentationOnly });
    if (hit.damage !== null && hit.damage > 0) {
      const impact = hit.impact === "heavy" ? "hit_heavy" : "hit_light";
      const impactDelay = delayMs + (effect ? ROBOT_VFX[effect].frameDurationMs * 2 : 0);
      events.push({ hit: { ...hit, damage: null }, effect: impact, delayMs: impactDelay, durationMs: robotVfxDuration(impact), announceHit: false });
      if (hit.destroyed) {
        const destruction = hit.destroyed === "small" ? "destroy_small" : "destroy_large";
        events.push({ hit: { ...hit, damage: null }, effect: destruction, delayMs: impactDelay + 240, durationMs: robotVfxDuration(destruction), announceHit: false });
      }
    }
  }
  for (const cue of cues) events.push({ hit: { cell: cue.cell, kind: `special:${cue.effect}`, damage: null, pulse: 0 }, effect: cue.effect, delayMs: 0, durationMs: robotVfxDuration(cue.effect), announceHit: false });
  return events;
}
export function robotVfxPresentationMs(hits: readonly RobotBattleHitView[]): number {
  return Math.max(800, ...planRobotVfx(hits).map(e => e.delayMs + e.durationMs));
}
export function changedRobotVfxCues(before: RobotBattleViewModel, after: RobotBattleViewModel): RobotVfxCue[] {
  const oldIds = new Set(before.visualCues?.map(c => c.id));
  const cues = (after.visualCues ?? []).filter(c => !oldIds.has(c.id));
  for (const unit of after.units) {
    const previous = before.units.find(u => u.id === unit.id);
    if (previous && previous.hp > 0 && unit.hp > previous.hp) cues.push({ id: "heal:" + after.checkpoint.sequence + ":" + unit.id, effect: "heal", cell: unit.cell });
  }
  return cues;
}
