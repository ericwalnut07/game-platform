import groupRules from "../../../docs/design/robot-tactics/current-group-combat.json";
import modelCatalog from "../../../docs/design/robot-tactics/medium-heavy-models.json";
import rules from "../../../docs/design/robot-tactics/rules.json";
import { resolveRobotBasicPart, type RobotResolvedPart } from "./equipment";
import { createRobotEnergyState } from "./energy";
import { getRobotEncounterPartLevel, interpolateRobotValue, type RobotStat, type RobotStatValues } from "./growth";
import type { RobotStagePlan } from "./types";

export type RobotSoloEnemyWeight = "medium" | "heavy";
const STATS: readonly RobotStat[] = ["hp", "melee", "ranged", "def", "mov", "spd", "en"];

export interface RobotSoloEnemyPlan {
  readonly modelId: string;
  readonly weightClass: RobotSoloEnemyWeight;
  readonly archetype: string;
  readonly model: "A" | "B" | "C";
  readonly referenceCoreLevel: number | null;
  readonly weaponLevel: number | null;
  readonly weapons: readonly RobotResolvedPart[] | null;
  readonly baseStats: RobotStatValues | null;
  readonly stats: RobotStatValues | null;
  readonly initialEn: number | null;
  /** Numeric stats only: no movement type, AI, range metric or full action legality. */
  readonly readyForStatUse: boolean;
  readonly blockingIssues: readonly string[];
}

export function listRobotSoloEnemyModelIds(): readonly string[] { return modelCatalog.models.map(m => m.id); }

/** Adopted seven-chassis curves; never substitute the player's HP/frame growth. */
export function getRobotSoloEnemyBaseStats(weight: RobotSoloEnemyWeight, archetype: string, referenceCoreLevel: number): RobotStatValues {
  getRobotEncounterPartLevel(referenceCoreLevel); // validate the shared adopted level domain
  if (weight !== "medium" && weight !== "heavy") throw new Error("Only medium/heavy enemy chassis are supported");
  const growth = groupRules.enemies.soloEnemies[weight].statGrowth;
  const tables: Readonly<Record<string, readonly (readonly number[])[]>> = growth.statsByChassis;
  if (!Object.hasOwn(tables, archetype)) throw new Error("Unknown enemy chassis: " + archetype);
  const rows = tables[archetype]!;
  const stats = {} as Record<RobotStat, number | null>;
  for (const stat of STATS) {
    const index = growth.columns.indexOf(stat);
    if (index < 1) throw new Error("Missing enemy stat column: " + stat);
    if (stat === "mov") {
      const level = weight === "medium" && referenceCoreLevel >= 21 ? 21 : 1;
      const row = rows.find(r => r[0] === level);
      if (row === undefined || row[index] === undefined) throw new Error("Missing enemy MOV checkpoint");
      stats.mov = row[index];
    } else {
      stats[stat] = interpolateRobotValue(rows.map(r => {
        if (r[0] === undefined || r[index] === undefined) throw new Error("Missing enemy numeric checkpoint");
        return { level: r[0], value: r[index] };
      }), referenceCoreLevel);
    }
  }
  return stats;
}

/** Fixed enemy models may use reward-locked weapons; no player CAP/unlock/core-ID rules. */
export function getRobotSoloEnemyPlan(modelId: string, referenceCoreLevel: number | null): RobotSoloEnemyPlan {
  const model = modelCatalog.models.find(m => m.id === modelId);
  if (!model) throw new Error("Unknown medium/heavy enemy model: " + modelId);
  if (model.weightClass !== "medium" && model.weightClass !== "heavy") throw new Error("Invalid solo enemy weight class");
  if (model.model !== "A" && model.model !== "B" && model.model !== "C") throw new Error("Invalid solo enemy model");
  const common: Pick<RobotSoloEnemyPlan, "modelId" | "weightClass" | "archetype" | "model" | "referenceCoreLevel"> = {
    modelId: model.id, weightClass: model.weightClass, archetype: model.archetype, model: model.model, referenceCoreLevel
  };
  if (referenceCoreLevel === null) return {
    ...common, weaponLevel: null, weapons: null, baseStats: null, stats: null, initialEn: null,
    readyForStatUse: false, blockingIssues: ["Enemy reference core level is unresolved"]
  };
  if (model.weaponIds.length !== 2 || new Set(model.weaponIds).size !== 2) throw new Error("Solo enemy must have exactly two different weapons");
  const weaponLevel = getRobotEncounterPartLevel(referenceCoreLevel);
  const weapons = model.weaponIds.map(id => resolveRobotBasicPart(id, weaponLevel));
  if (weapons.some(w => w.slot !== "weapon")) throw new Error("Enemy model contains a non-weapon part");
  const baseStats = getRobotSoloEnemyBaseStats(model.weightClass, model.archetype, referenceCoreLevel);
  const stats: Record<RobotStat, number | null> = { ...baseStats };
  const blockingIssues = weapons.flatMap(w => w.blockingIssues);
  for (const stat of STATS) for (const weapon of weapons) {
    if (weapon.statModifiers[stat] === null) { stats[stat] = null; blockingIssues.push("Unresolved enemy weapon modifier: " + stat); }
    else if (stats[stat] !== null) stats[stat] += weapon.statModifiers[stat] ?? 0;
  }
  if (stats.mov !== null) stats.mov = Math.max(rules.stats.minFinalMovement, stats.mov);
  const readyForStatUse = blockingIssues.length === 0 && STATS.every(stat => stats[stat] !== null);
  return {
    ...common, weaponLevel, weapons, baseStats, stats: readyForStatUse ? stats : null,
    initialEn: readyForStatUse && stats.en !== null ? createRobotEnergyState(stats.en).en : null,
    readyForStatUse, blockingIssues
  };
}

/** Only solo enemies; lightweight squads have a separate, partly unresolved model policy. */
export function getRobotStageSoloEnemyPlans(stage: RobotStagePlan) {
  const enemies = stage.initialEnemies.filter(u => u.kind !== "light-squad").map(unit => {
    if (unit.kind === "boss") return { unit, plan: null, blockingIssues: ["Unique boss stats and equipment are unresolved"] };
    if (unit.model === null || unit.model === "boss-pending") return { unit, plan: null, blockingIssues: ["Enemy model is unresolved: " + unit.id] };
    const model = modelCatalog.models.find(m => m.weightClass === unit.kind && m.archetype === unit.chassisOrArchetype && m.model === unit.model);
    if (!model) return { unit, plan: null, blockingIssues: ["No adopted solo enemy model: " + unit.id] };
    const plan = getRobotSoloEnemyPlan(model.id, unit.enemyCoreLevel);
    if (unit.weaponLevel !== null && plan.weaponLevel !== null && unit.weaponLevel !== plan.weaponLevel) throw new Error("Stage enemy weapon band mismatch: " + unit.id);
    return { unit, plan, blockingIssues: plan.blockingIssues };
  });
  return { enemies, blockingIssues: [...stage.blockingIssues, ...enemies.flatMap(e => e.blockingIssues)], isReadyForFormalPlay: stage.isReadyForFormalPlay && enemies.every(e => e.plan?.readyForStatUse === true) };
}
