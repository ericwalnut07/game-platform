import { getRobotFacilitySide } from "../../../games/robot-tactics/facilityDefense";
import { getRobotBattleFacilities, type RobotBattleCoreState, type RobotBattleUnit } from "../../../games/robot-tactics/battleState";
import type { RobotBattleActionLogView, RobotBattleUnitView } from "./BattleViewModel";

const presentationKind = (unit: RobotBattleUnit): RobotBattleUnitView["kind"] =>
  unit.kind === "controlled" || unit.kind === "friendly-ai" ? unit.kind : "enemy";

/** Build a visual-only receipt from already committed Core results. Movement and waiting
 * never displace the last three combat/support entries. No save schema change. */
export function projectRobotBattleActionLog(state: RobotBattleCoreState): RobotBattleActionLogView | null {
  const latest = state.latest;
  if (!latest) return null;
  const separator = latest.summary.indexOf("：");
  const prefix = separator >= 0 ? latest.summary.slice(0, separator) : "";
  let action = separator >= 0 ? latest.summary.slice(separator + 1) : latest.summary;
  // A squad may attack after moving. Only its attack should appear in the log.
  if (action.startsWith("移動／")) action = action.slice("移動／".length);
  if (/^(?:通常移動|追加移動|移動後の反応解決|移動|待機)(?:$|／)/.test(action)) return null;
  const actor = [...state.units]
    .sort((a, b) => b.name.length - a.name.length)
    .find(unit => prefix === unit.name || prefix === unit.id)
    ?? state.units.find(unit => unit.id === latest.damage[0]?.sourceId);
  const squad = state.actors.find(group => group.id === prefix);
  const leader = actor ?? (squad ? state.units.find(unit => groupHasUnit(squad.unitIds, unit.id)) : undefined);
  if (!leader) return null;
  const facilities = getRobotBattleFacilities(state);
  const results = new Map<string, { targetId: string; name: string; kind: RobotBattleUnitView["kind"] | "facility"; amount: number; destroyed: boolean }>();
  for (const receipt of latest.damage) {
    if (receipt.damage === null) continue;
    const unit = state.units.find(candidate => candidate.id === receipt.targetId);
    const facility = facilities.find(candidate => candidate.id === receipt.targetId);
    const decoy = latest.decoyTargets?.find(candidate => candidate.id === receipt.targetId);
    const previous = results.get(receipt.targetId);
    const amount = (previous?.amount ?? 0) + receipt.damage;
    results.set(receipt.targetId, {
      targetId: receipt.targetId,
      name: unit?.name ?? (facility ? (getRobotFacilitySide(facility.id) ? (getRobotFacilitySide(facility.id) === "left" ? "左補給拠点" : "右補給拠点") : "kind" in facility && facility.kind === "transport" ? "輸送車" : "防衛施設") : decoy ? "戦術デコイ" : receipt.targetId),
      kind: unit ? presentationKind(unit) : "facility",
      amount,
      destroyed: (unit?.hp ?? facility?.hp ?? decoy?.hp) === 0,
    });
  }
  // Core summaries include numeric damage; use resolved receipts instead, once per target.
  if (results.size && action.includes(" → ")) action = action.split(" → ")[0]! + (action.includes("／") ? "／" + action.split("／").slice(1).join("／") : "");
  return {
    id: latest.id,
    actorId: leader.id,
    actorName: squad && !actor ? squad.id : leader.name,
    actorKind: presentationKind(leader),
    action: action.trim(),
    results: [...results.values()],
  };
}

function groupHasUnit(unitIds: readonly string[], unitId: string): boolean {
  return unitIds.includes(unitId);
}

/** Bound the presentation queue to the last three unique resolved actions. */
export function appendRobotBattleActionHistory(
  history: readonly RobotBattleActionLogView[], entry: RobotBattleActionLogView | null | undefined,
): RobotBattleActionLogView[] {
  if (!entry || history.some(previous => previous.id === entry.id)) return [...history];
  return [entry, ...history].slice(0, 3);
}
