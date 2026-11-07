import { planRobotVfx, robotVfxPresentationMs, type RobotVfxCue } from "./RobotVfx";
import type { RobotBattleHitView } from "./BattleViewModel";

export type RobotBattlePlaybackSpeed = "standard" | "fast" | "skip";
export const ROBOT_BATTLE_SPEEDS: readonly RobotBattlePlaybackSpeed[] = ["standard", "fast", "skip"];
export const robotBattleSpeedLabel = (speed: RobotBattlePlaybackSpeed): string =>
  ({ standard: "標準", fast: "高速", skip: "スキップ" })[speed];

/** Pure, cosmetic-only timeline. Never changes the committed Core checkpoint. */
export function planRobotBattlePresentation(
  hits: readonly RobotBattleHitView[],
  cues: readonly RobotVfxCue[] = [],
  hasAction = true,
  speed: RobotBattlePlaybackSpeed = "standard",
) {
  const scale = speed === "fast" ? 0.55 : 1;
  if (speed === "skip") return { scale: 0, actorMs: 0, targetMs: 0, introMs: 0, resultMs: 0, totalMs: 0 };
  // Movement remains governed by its preexisting auto-driver timing until
  // the separately approved movement-animation implementation lands.
  if (!hasAction && !hits.length && !cues.length) {
    return { scale, actorMs: 0, targetMs: 0, introMs: 0, resultMs: 0, totalMs: Math.round(robotVfxPresentationMs([]) * scale) };
  }
  const actorMs = Math.round(200 * scale);
  const targetMs = hits.length ? Math.round(200 * scale) : 0;
  const introMs = actorMs + targetMs;
  const events = planRobotVfx(hits, cues);
  const effectSpan = Math.max(500, ...events.map(e => e.delayMs + e.durationMs));
  const resultMs = introMs + Math.round(effectSpan * scale);
  return {
    scale, actorMs, targetMs, introMs, resultMs,
    totalMs: resultMs + Math.round(400 * scale) + Math.round(180 * scale),
  };
}
