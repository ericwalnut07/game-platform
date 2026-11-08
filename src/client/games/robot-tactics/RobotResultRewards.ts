import { getRobotSubobjectiveText } from "../../../games/robot-tactics/subobjectives";
import { getRobotOfflineEquipmentName, robotMissionRow, type RobotOfflineProgress } from "../../../games/robot-tactics/offlineProgress";
import type { RobotOfflineResult } from "../../../games/robot-tactics/offlineSession";

/** Read-only reconciliation of an ALREADY committed outcome.
 * Never awards EXP, changes progression, or assumes the completion is a first clear.
 * Previous v2 results lack a receipt, so enumerate the exact four official
 * combinations and match them against the actual durable expGained.
 */
export interface RobotResultRewardBreakdown {
  readonly condition: string | null;
  readonly achieved: boolean;
  readonly subobjectiveStatus: "missed" | "earned" | "previously-received";
  readonly mainExp: number | null;
  readonly subobjectiveExp: number | null;
  readonly totalExp: number;
  readonly firstClear: boolean | null;
  readonly mainNewEquipment: readonly string[];
  readonly subobjectiveNewEquipment: readonly string[];
}

export function robotResultRewardBreakdown(
  result: RobotOfflineResult, progress: Pick<RobotOfflineProgress, "cleared" | "subobjectives">,
): RobotResultRewardBreakdown {
  const row = robotMissionRow(result.departure.key), key = result.departure.key;
  const condition = getRobotSubobjectiveText(key.missionNumber, key.difficulty === "easy");
  const achieved = result.subobjectiveAchieved;
  const subobjectiveNewEquipment = row.firstSubobjective.addonId && result.equipmentUnlocked.includes(row.firstSubobjective.addonId)
    ? [getRobotOfflineEquipmentName(row.firstSubobjective.addonId)] : [];
  const mainNewEquipment = result.equipmentUnlocked
    .filter(id => id !== row.firstSubobjective.addonId).map(getRobotOfflineEquipmentName);
  const shared = { condition, achieved, totalExp: result.expGained, mainNewEquipment, subobjectiveNewEquipment };
  if (result.result === "lost") {
    return { ...shared, subobjectiveStatus: "missed", firstClear: null, mainExp: 0, subobjectiveExp: 0 };
  }
  const alternatives = [true, false].flatMap(firstClear =>
    [false, true].filter(earned => !earned || achieved).map(earned => ({
      firstClear, earned, mainExp: firstClear ? row.firstClear.exp : row.repeatClear.exp,
      subobjectiveExp: earned ? row.firstSubobjective.exp : 0,
    })),
  ).filter(candidate => candidate.mainExp + candidate.subobjectiveExp === result.expGained);
  // easy-20 has exactly one EXP collision: 1st clear without subobjective
  // versus repeat clear with first subobjective. Its first-clear equipment
  // unlock disambiguates without inventing a reward or changing save v2.
  const evidence = row.firstClear.unlock;
  const hasFirstClearEquipment = !!evidence && (
    evidence.type === "frame-group"
      ? result.equipmentUnlocked.length > subobjectiveNewEquipment.length
      : result.equipmentUnlocked.includes(evidence.id)
  );
  const candidates = alternatives.length > 1 && evidence
    ? alternatives.filter(candidate => candidate.firstClear === hasFirstClearEquipment)
    : alternatives;
  const match = candidates.length === 1 ? candidates[0]! : null;
  // Never display fabricated amounts for a legacy/inconsistent receipt.
  if (!match) {
    return {
      ...shared, firstClear: null, mainExp: null, subobjectiveExp: null,
      subobjectiveStatus: achieved && progress.subobjectives.includes(row.id) ? "previously-received" : achieved ? "earned" : "missed",
    };
  }
  return {
    ...shared, firstClear: match.firstClear, mainExp: match.mainExp,
    subobjectiveExp: match.subobjectiveExp,
    subobjectiveStatus: !achieved ? "missed" : match.earned ? "earned" : "previously-received",
  };
}
