import { getRobotExpansionEnemyWeapons, type RobotExpansionEnemyModel } from "./expansionEnemyWeapons";
import rules from "../../../docs/design/robot-tactics/rules.json";
import { getRobotSoloEnemyPlan } from "./enemyPresets";
import { getRobotLightEnemyPlan } from "./lightEnemyPresets";
import { resolveRobotBasicPart } from "./equipment";
import { createRobotEnergyState } from "./energy";
import { getRobotStagePlan } from "./stageCatalog";
import { interpolateRobotValue, type RobotStat, type RobotStatValues } from "./growth";

export interface RobotExpansionEnemyKey {
  readonly difficulty: "hardest" | "inferno";
  readonly missionNumber: number;
}

const stats = ["hp", "melee", "ranged", "def", "spd", "en", "mov"] as const;
// [entry multiplier, entry addition, subsequent growth per mission]
const hardest = {
  hp: [1.08, 0, 1.012], melee: [1.08, 0, 1.008], ranged: [1.08, 0, 1.008],
  def: [1, 2, 1.0015], spd: [1, 2, 1.003], en: [1.05, 0, 1.005], mov: [1, 0, 1],
} as const;
// Adopted medium HP checkpoints from the expansion design record.
const mediumHpLevels = [1, 5, 11, 21, 31, 41] as const;
const mediumHp: Readonly<Record<string, readonly number[]>> = {
  melee: [76, 90, 110, 137, 162, 183],
  ranged: [58, 64, 75, 98, 118, 135],
  defense: [87, 99, 119, 147, 167, 183],
  mobile: [70, 82, 97, 120, 145, 165],
};
const inferno = {
  hp: [1.08, 0, 1.007], melee: [1.05, 0, 1.005], ranged: [1.05, 0, 1.005],
  def: [1, 1, 1.0008], spd: [1, 2, 1.002], en: [1.03, 0, 1.003], mov: [1, 0, 1],
} as const;

export function getRobotExpansionEnemyWeaponLevel(key: RobotExpansionEnemyKey): number {
  if (!Number.isInteger(key.missionNumber) || key.missionNumber < 1 || key.missionNumber > 30 ||
      (key.difficulty !== "hardest" && key.difficulty !== "inferno")) throw new Error("Invalid expansion enemy stage");
  return (key.difficulty === "hardest" ? 9 : 14) + Math.floor((key.missionNumber - 1) / 6);
}

function grow(value: number, [multiplier, addition, perMission]: readonly [number, number, number], steps: number) {
  return (value * multiplier + addition) * perMission ** steps;
}

/** The roster supplies its approved weapon IDs. Apply the selected equipment's
 * modifiers to the grown Hard M29 chassis once, using the shared weapon catalog.
 */
export function getRobotExpansionEnemyPlan(key: RobotExpansionEnemyKey, model: RobotExpansionEnemyModel, weaponIds = getRobotExpansionEnemyWeapons(model)) {
  const weaponLevel = getRobotExpansionEnemyWeaponLevel(key);
  const light = model.kind === "light";
  if (weaponIds.length !== (light ? 1 : 2) || new Set(weaponIds).size !== weaponIds.length ||
      weaponIds.some(id => id === "double-edged-sword" || id === "superheavy-railgun")) throw new Error("Invalid expansion enemy weapons");
  const weapons = weaponIds.map(id => resolveRobotBasicPart(id, weaponLevel));
  if (weapons.some(w => w.slot !== "weapon" || w.weaponPower === null || w.blockingIssues.length)) throw new Error("Unresolved expansion enemy weapon");

  const referenceCoreLevel = getRobotStagePlan({ difficulty: "hard", missionNumber: 29 }).referenceEnemyCoreLevel;
  if (referenceCoreLevel === null) throw new Error("Unresolved Hard M29 reference level");
  const solo = model.kind === "solo" ? getRobotSoloEnemyPlan(model.modelId, referenceCoreLevel) : undefined;
  const lightStats = model.kind === "light" ? getRobotLightEnemyPlan(model.chassis, model.model, referenceCoreLevel).baseStats : null;
  const reference: RobotStatValues | null | undefined = lightStats ? { ...lightStats, en: 0 } : solo?.baseStats;
  const hpCheckpoints = solo?.weightClass === "medium" ? mediumHp[solo.archetype]! : undefined;
  const mediumReferenceHp = hpCheckpoints && interpolateRobotValue(
    mediumHpLevels.map((level, i) => ({ level, value: hpCheckpoints[i]! })), referenceCoreLevel,
  );

  const growth = {} as Record<RobotStat, number>;
  const equipped = {} as Record<RobotStat, number>;
  for (const stat of stats) {
    const value = stat === "hp" && mediumReferenceHp !== undefined ? mediumReferenceHp : reference?.[stat];
    if (value === undefined || value === null) throw new Error("Unresolved Hard M29 enemy stat: " + stat);
    const hardestValue = grow(value, hardest[stat], key.difficulty === "hardest" ? key.missionNumber - 1 : 29);
    const grown = key.difficulty === "hardest" ? hardestValue : grow(hardestValue, inferno[stat], key.missionNumber - 1);
    const modifier = weapons.reduce((sum, weapon) => {
      const amount = weapon.statModifiers[stat];
      if (amount === null) throw new Error("Unresolved expansion enemy weapon modifier: " + stat);
      return sum + (amount ?? 0);
    }, 0);
    growth[stat] = Math.round(grown);
    const total = Math.round(grown + modifier);
    equipped[stat] = stat === "mov" ? Math.max(rules.stats.minFinalMovement, total) : stat === "en" && light ? 0 : total;
  }
  return { referenceCoreLevel, weaponLevel, weapons, baseStats: growth, stats: equipped,
    initialEn: createRobotEnergyState(equipped.en).en };
}
