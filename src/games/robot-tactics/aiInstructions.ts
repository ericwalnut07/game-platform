import type { RobotPosition } from "./movement";

export const ROBOT_AI_TACTICS = [
  { id: "free-action", name: "自由行動" },
  { id: "focus-attack", name: "集中攻撃" },
  { id: "escort-specific-ally", name: "味方護衛" },
  { id: "defend-location", name: "地点防衛" },
  { id: "advance-to-location", name: "地点前進" }
] as const;
export type RobotAiMode = "auto" | "manual";
export type RobotAiInstruction =
  | { readonly tacticId: "free-action" }
  | { readonly tacticId: "focus-attack" | "escort-specific-ally"; readonly targetUnitId: string }
  | { readonly tacticId: "defend-location" | "advance-to-location"; readonly cell: RobotPosition };
export type RobotAiConfiguration =
  | { readonly kind: "mode"; readonly mode: RobotAiMode }
  | { readonly kind: "instruction"; readonly unitId: string; readonly instruction: RobotAiInstruction };

/** Shape only. The trusted runtime also validates living units, teams and board cells. */
export function assertRobotAiConfiguration(change: RobotAiConfiguration): void {
  if (change.kind === "mode") {
    if (change.mode !== "auto" && change.mode !== "manual") throw new Error("Invalid friendly AI mode");
    return;
  }
  if (change.kind !== "instruction" || !change.unitId || change.unitId.length > 512) throw new Error("Invalid friendly AI configuration");
  const order = change.instruction;
  if (!order || !ROBOT_AI_TACTICS.some(t => t.id === order.tacticId)) throw new Error("Invalid friendly AI tactic");
  if (order.tacticId === "focus-attack" || order.tacticId === "escort-specific-ally") {
    if (!order.targetUnitId || order.targetUnitId.length > 512) throw new Error("AI target is required");
  } else if (order.tacticId === "defend-location" || order.tacticId === "advance-to-location") {
    if (![order.cell?.x, order.cell?.y].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("AI location is required");
  }
}
