import equipment from "../../../docs/design/robot-tactics/hardest-first-clear-equipment.json";
import { listRobotStageKeys } from "./stageCatalog";
import { getRobotExpansionEnemyWeaponLevel, type RobotExpansionEnemyKey } from "./expansionEnemyPresets";

const requiredClears = listRobotStageKeys().map(key =>
  key.difficulty + "-" + String(key.missionNumber).padStart(2, "0"));

export function areRobotExpansionMissionsUnlocked(progress: { readonly cleared: readonly string[] }): boolean {
  const cleared = new Set(progress.cleared);
  return requiredClears.every(id => cleared.has(id));
}

export function getRobotExpansionFirstClearEquipment(key: RobotExpansionEnemyKey): readonly string[] {
  getRobotExpansionEnemyWeaponLevel(key);
  if (key.difficulty === "inferno") return [];
  const missionId = "M" + String(key.missionNumber).padStart(2, "0") as keyof typeof equipment;
  return equipment[missionId];
}

export function robotExpansionMissionId(key: RobotExpansionEnemyKey): string {
  getRobotExpansionEnemyWeaponLevel(key);
  return `${key.difficulty}-${String(key.missionNumber).padStart(2, "0")}`;
}

export function readRobotExpansionMissionId(id: string): RobotExpansionEnemyKey {
  const match = /^(hardest|inferno)-(0[1-9]|[12][0-9]|30)$/.exec(id);
  if (!match) throw new Error("Invalid expansion mission reference");
  return { difficulty: match[1] === "hardest" ? "hardest" : "inferno", missionNumber: Number(match[2]) };
}
