import type { RobotBattleHitView } from "./BattleViewModel";

export const ROBOT_BATTLE_PRESENTATION_MS = 800;
/** Visual events only; never modifies damage, HP, hit counts or simultaneous resolution. */
export function planRobotBattleEffects(hits: readonly RobotBattleHitView[], duration = ROBOT_BATTLE_PRESENTATION_MS) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid visual duration");
  const pulses = [...new Set(hits.map(h => h.pulse))].sort((a, b) => a - b), slot = duration / Math.max(1, pulses.length);
  return hits.map(hit => {
    if (!Number.isSafeInteger(hit.pulse) || hit.pulse < 0 || hit.damage !== null && (!Number.isSafeInteger(hit.damage) || hit.damage < 0)) throw new Error("Invalid resolved visual hit");
    return { hit, delayMs: pulses.indexOf(hit.pulse) * slot, durationMs: slot };
  });
}
