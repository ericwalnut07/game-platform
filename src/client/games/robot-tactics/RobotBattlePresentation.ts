import type { RobotPosition } from "../../../games/robot-tactics/movement";
import type { RobotBattleViewModel } from "./BattleViewModel";

export type RobotBattleSide = "controlled" | "friendly-ai" | "enemy";
export interface RobotBattleLogResult {
  readonly targetName: string;
  readonly targetSide: RobotBattleSide | null;
  readonly damage: number;
  readonly destroyed: boolean;
}
export interface RobotBattleLogEntry {
  readonly id: string;
  readonly actorName: string;
  readonly actorSide: RobotBattleSide;
  readonly action: string;
  readonly results: readonly RobotBattleLogResult[];
}
export interface RobotBattleMovePresentation {
  readonly id: string;
  /** Includes the departure cell and the authoritative route's arrival cell. */
  readonly path: readonly RobotPosition[];
}

export function robotMovePresentationMs(steps: number): number {
  return steps <= 1 ? 400 : steps === 2 ? 650 : steps === 3 ? 850 : 1050;
}
export function robotBattleLogFromTransition(before: RobotBattleViewModel, after: RobotBattleViewModel): RobotBattleLogEntry | null {
  const action = after.latestAction;
  if (!action || action.id === before.latestAction?.id) return null;
  const summary = after.latestSummary;
  const description = summary.includes("：") ? summary.slice(summary.indexOf("：") + 1) : summary;
  const receipts = action.receipts ?? [];
  const results: RobotBattleLogResult[] = receipts.filter(e => e.damage !== null).map(e => ({
    targetName: e.targetName, targetSide: e.targetSide, damage: e.damage!, destroyed: e.destroyed
  }));
  // Movement and idle are conveyed directly on the map, never evict a combat log.
  // Movement-triggered counterfire/damage is still a meaningful combat result.
  if (!results.length && /^(?:通常移動|追加移動|移動|.*隊移動|待機|行動なし)(?:／.*)?$/.test(description)) return null;
  const actor = before.queue[0];
  const fallback = receipts[0]?.source;
  const fallbackSide = receipts[0]?.sourceSide;
  return {
    id: action.id,
    actorName: actor?.name ?? fallback ?? summary.split("：")[0] ?? "行動機",
    actorSide: actor?.kind ?? fallbackSide ?? "controlled",
    action: results.length && /移動/.test(description) ? "移動中の攻撃・反撃" : description,
    results
  };
}
export function robotBattleLogNext(history: readonly RobotBattleLogEntry[], before: RobotBattleViewModel, after: RobotBattleViewModel): RobotBattleLogEntry[] {
  const entry = robotBattleLogFromTransition(before, after);
  if (!entry || history.some(e => e.id === entry.id)) return [...history];
  return [entry, ...history].slice(0, 3);
}
export function interpolateRobotMove(path: readonly RobotPosition[], progress: number): RobotPosition {
  if (!path.length) throw new Error("An animation route requires a start cell");
  if (path.length === 1) return path[0]!;
  const p = Math.min(1, Math.max(0, progress)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(p));
  const from = path[i]!, to = path[i + 1]!, t = p - i;
  const eased = t * t * (3 - 2 * t);
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}
