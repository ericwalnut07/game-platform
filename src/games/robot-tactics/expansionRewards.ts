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
