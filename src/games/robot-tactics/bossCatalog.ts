import catalog from "../../../docs/design/robot-tactics/bosses.json";
import { resolveRobotBasicPart } from "./equipment";
import { createRobotEnergyState } from "./energy";
import type { RobotStat, RobotStatValues } from "./growth";
import type { RobotDifficulty, RobotStagePlan } from "./types";

export function getRobotBossDefinition(missionNumber: number) {
  const definition = catalog.missions.find(b => b.missionNumber === missionNumber);
  if (!definition) throw new Error("No adopted boss definition for M" + missionNumber);
  return definition;
}

export function hasRobotBossDefinition(missionNumber: number): boolean {
  return catalog.missions.some(b => b.missionNumber === missionNumber);
}

export function getRobotBossPlan(missionNumber: number, difficulty: RobotDifficulty) {
  if (!["easy", "normal", "hard"].includes(difficulty)) throw new Error("Unknown boss difficulty");
  const definition = getRobotBossDefinition(missionNumber), raw = definition.baseByDifficulty[difficulty];
  const baseStats: Record<RobotStat, number> = { hp: raw.hp, melee: raw.melee, ranged: raw.ranged, def: raw.def, mov: raw.mov, spd: raw.spd, en: raw.en };
  const stats = { ...baseStats };
  const weapons = definition.weaponIds.map(id => resolveRobotBasicPart(id, raw.weaponLevel));
  if (weapons.length !== 2 || new Set(weapons.map(w => w.id)).size !== 2) throw new Error("Boss must equip two distinct weapons");
  for (const weapon of weapons) {
    if (weapon.blockingIssues.length || weapon.slot !== "weapon") throw new Error("Unresolved boss weapon");
    for (const stat of Object.keys(stats) as RobotStat[]) {
      const modifier = weapon.statModifiers[stat];
      if (modifier === null) throw new Error("Unresolved boss weapon modifier");
      stats[stat] += modifier ?? 0;
    }
  }
  stats.mov = Math.max(1, stats.mov);
  return { missionNumber, difficulty, definition, baseStats: baseStats as RobotStatValues, stats, weapons, weaponLevel: raw.weaponLevel, initialEn: createRobotEnergyState(stats.en).en };
}

export type RobotBossPlan = ReturnType<typeof getRobotBossPlan>;

export function getRobotStageBossPlans(stage: RobotStagePlan) {
  return stage.initialEnemies.filter(u => u.kind === "boss").map(unit => {
    const plan = getRobotBossPlan(stage.key.missionNumber, stage.key.difficulty);
    if (unit.id !== plan.definition.unitId) throw new Error("Stage boss identity differs from adopted definition");
    return { unit, plan };
  });
}
