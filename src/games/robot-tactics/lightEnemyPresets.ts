import group from "../../../docs/design/robot-tactics/current-group-combat.json";
import rules from "../../../docs/design/robot-tactics/rules.json";
import { getRobotEncounterPartLevel, interpolateRobotValue } from "./growth";
import { resolveRobotBasicPart } from "./equipment";
import type { RobotStagePlan } from "./types";

export type RobotLightChassis = "melee" | "ranged" | "defense" | "mobile";
export type RobotLightModel = "A" | "B" | "C";
const light = group.enemies.lightSquads;
const statNames = ["hp", "melee", "ranged", "def", "mov", "spd"] as const;
type Stats = Readonly<Record<typeof statNames[number], number>>;
export interface RobotLightEnemyPlan {
  readonly chassis: RobotLightChassis; readonly model: RobotLightModel;
  readonly weaponId: string; readonly referenceCoreLevel: number | null; readonly weaponLevel: number | null;
  readonly weapon: ReturnType<typeof resolveRobotBasicPart> | null;
  readonly baseStats: Stats | null; readonly stats: Stats | null;
  readonly readyForStatUse: boolean; readonly blockingIssues: readonly string[];
}

/** Numeric/preset adapter, independent of unresolved light EN and movement type.
 * Chassis tables stay intact; selected weapon modifiers are added exactly once.
 */
export function getRobotLightEnemyPlan(chassis: RobotLightChassis, model: RobotLightModel, referenceCoreLevel: number | null): RobotLightEnemyPlan {
  if (!light.chassisTypes.includes(chassis) || !["A", "B", "C"].includes(model)) throw new Error("Unknown light enemy chassis/model");
  const weaponId = light.confirmedModelExamples[chassis][model];
  const common = { chassis, model, weaponId, referenceCoreLevel };
  if (referenceCoreLevel === null) return { ...common, weaponLevel: null, weapon: null, baseStats: null, stats: null, readyForStatUse: false, blockingIssues: ["Light encounter reference core level is unresolved"] };
  const weaponLevel = getRobotEncounterPartLevel(referenceCoreLevel), weapon = resolveRobotBasicPart(weaponId, weaponLevel);
  const rows = light.statsByChassis[chassis];
  const base = {} as Record<typeof statNames[number], number>, stats = {} as Record<typeof statNames[number], number>;
  for (const stat of statNames) {
    const col = light.columns.indexOf(stat);
    base[stat] = stat === "mov" ? light.baseMovByChassis[chassis] : interpolateRobotValue(rows.map(r => ({ level: r[0]!, value: r[col]! })), referenceCoreLevel)!;
    const modifier = weapon.statModifiers[stat];
    if (modifier === null) throw new Error("Unresolved light weapon modifier");
    stats[stat] = base[stat] + (modifier ?? 0);
  }
  stats.mov = Math.max(rules.stats.minFinalMovement, stats.mov);
  return { ...common, weaponLevel, weapon, baseStats: base, stats, readyForStatUse: weapon.blockingIssues.length === 0, blockingIssues: weapon.blockingIssues };
}

export function getRobotStageLightEnemyPlans(stage: RobotStagePlan) {
  const units = [...stage.initialEnemies, ...stage.reinforcements.map(w => w.squad)].filter(u => u.kind === "light-squad");
  return units.map(unit => {
    if (unit.model !== "A" && unit.model !== "B" && unit.model !== "C") return { unit, plan: null, blockingIssues: ["Light enemy model is unresolved"] };
    if (stage.key.difficulty === "hard" && stage.key.missionNumber <= 7 && unit.model !== "B" || unit.model === "B" && stage.key.difficulty === "easy" || unit.model === "C" && (stage.key.difficulty !== "hard" || stage.key.missionNumber < 8)) throw new Error("Light enemy model not allowed in this mission/difficulty");
    const plan = getRobotLightEnemyPlan(unit.chassisOrArchetype as RobotLightChassis, unit.model, unit.enemyCoreLevel);
    if (plan.weaponLevel !== null && unit.weaponLevel !== null && plan.weaponLevel !== unit.weaponLevel) throw new Error("Light weapon level band mismatch");
    return { unit, plan, blockingIssues: plan.blockingIssues };
  });
}
