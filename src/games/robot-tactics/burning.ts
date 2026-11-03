import addons from "../../../docs/design/robot-tactics/addons.json";
/** DOT ledger only. HP settlement/kill credit/repair ordering requires adoption. */
export interface RobotBurning { readonly sourceId: string; readonly sourceCoreLevel: number; readonly ticksRemaining: number; readonly lastTargetOwnTurn: number }
const burn = (addons.parts.find(p => p.id === "burning-round")!.effect as unknown as { burn: { ticks: number; timing: string; onReapply: string } }).burn;
export function assertRobotBurning(v: RobotBurning): void {
  if (!v || typeof v.sourceId !== "string" || !v.sourceId || !Number.isSafeInteger(v.sourceCoreLevel) || v.sourceCoreLevel < 1 || v.sourceCoreLevel > 41 || !Number.isSafeInteger(v.ticksRemaining) || v.ticksRemaining < 1 || v.ticksRemaining > burn.ticks || !Number.isSafeInteger(v.lastTargetOwnTurn) || v.lastTargetOwnTurn < 0 || Object.keys(v).some(k => !["sourceId", "sourceCoreLevel", "ticksRemaining", "lastTargetOwnTurn"].includes(k))) throw new Error("Invalid burning ledger");
}
export function applyRobotBurning(current: RobotBurning | null, sourceId: string, sourceCoreLevel: number, targetOwnTurn: number): RobotBurning {
  if (burn.timing !== "target-own-turn-end" || burn.onReapply !== "refresh-duration-no-stack") throw new Error("Unconnected burning policy");
  if (current) {
    assertRobotBurning(current);
    if (current.sourceId !== sourceId || current.sourceCoreLevel !== sourceCoreLevel) throw new Error("複数発動者の燃焼再付与で採用する威力・撃破帰属は未確定です");
    if (targetOwnTurn < current.lastTargetOwnTurn) throw new Error("Stale burn application");
  }
  const next = { sourceId, sourceCoreLevel, ticksRemaining: burn.ticks, lastTargetOwnTurn: targetOwnTurn };
  assertRobotBurning(next); return next;
}
export function tickRobotBurning(current: RobotBurning | null, hp: number, targetOwnTurn: number) {
  if (!Number.isSafeInteger(hp) || hp < 0 || !Number.isSafeInteger(targetOwnTurn) || targetOwnTurn < 0) throw new Error("Invalid burn tick input");
  if (!current || hp === 0) return { burning: null, damage: 0, hp, defeated: false };
  assertRobotBurning(current);
  if (targetOwnTurn < current.lastTargetOwnTurn || targetOwnTurn > current.lastTargetOwnTurn + 1) throw new Error("Stale or skipped target own-turn tick");
  if (targetOwnTurn === current.lastTargetOwnTurn) return { burning: current, damage: 0, hp, defeated: false };
  const damage = Math.min(hp, 5 + Math.floor((current.sourceCoreLevel - 1) / 3)), remaining = current.ticksRemaining - 1;
  return { damage, hp: hp - damage, defeated: damage === hp, burning: remaining && damage < hp ? { ...current, ticksRemaining: remaining, lastTargetOwnTurn: targetOwnTurn } : null };
}
