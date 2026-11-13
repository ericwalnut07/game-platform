import rules from "../../../docs/design/robot-tactics/rules.json";
import frames from "../../../docs/design/robot-tactics/frames.json";
import groupRules from "../../../docs/design/robot-tactics/current-group-combat.json";

export type RobotStat = "hp" | "melee" | "ranged" | "def" | "mov" | "spd" | "en";
export type RobotStatValues = Readonly<Record<RobotStat, number | null>>;
export const ROBOT_CORE_LEVEL_MAX = rules.progression.cores.levelMax;
export const ROBOT_PART_LEVEL_MAX = rules.progression.equipment.basicLevels.max;
export const ROBOT_PRICED_CORE_LEVEL_MAX = rules.progression.cores.upgradeExpByLevel.length + 1;
export const ROBOT_PRICED_PART_LEVEL_MAX = rules.progression.equipment.basicLevels.expCosts.length + 1;

export interface RobotNumericAnchor { readonly level: number; readonly value: number | null }

/** Shared adopted encounter band for friendly parts and ordinary enemy weapons. */
export function getRobotEncounterPartLevel(referenceCoreLevel: number): number {
  if (!Number.isSafeInteger(referenceCoreLevel) || referenceCoreLevel < 1 || referenceCoreLevel > 41) throw new Error("Encounter reference core level must be 1..41");
  const bands = groupRules.enemies.soloEnemies.weaponLevelCommonPolicy.weaponLevelByEnemyReferenceCoreLevel;
  const band = bands.find(b => referenceCoreLevel >= b.core[0]! && referenceCoreLevel <= b.core[1]!);
  if (!band) throw new Error("Unresolved encounter part-level band");
  return band.weapon;
}

/** Null endpoints stay unresolved. Signed integer halves follow Math.round (+infinity). */
export function interpolateRobotValue(anchors: readonly RobotNumericAnchor[], atLevel: number, integer = true): number | null {
  if (!Number.isSafeInteger(atLevel) || anchors.length === 0) throw new Error("Invalid growth level/anchors");
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!;
    if (!Number.isSafeInteger(a.level) || (a.value !== null && !Number.isFinite(a.value)) || (i > 0 && a.level <= anchors[i - 1]!.level)) throw new Error("Invalid or unordered growth anchors");
  }
  const first = anchors[0]!, last = anchors.at(-1)!;
  if (atLevel < first.level || atLevel > last.level) throw new Error("Growth level outside anchor range");
  const exact = anchors.find(a => a.level === atLevel);
  if (exact) return exact.value;
  const lower = anchors.filter(a => a.level < atLevel).at(-1)!, upper = anchors.find(a => a.level > atLevel)!;
  if (lower.value === null || upper.value === null) return null;
  const value = lower.value + (upper.value - lower.value) * (atLevel - lower.level) / (upper.level - lower.level);
  const result = integer ? Math.round(value) : value;
  return Object.is(result, -0) ? 0 : result;
}

const growthBaseLevel = 41;
const growthStartLevel = 21;

/** Apply the adopted fraction of the Lv21–41 slope, rounding the final total once. */
function getExtendedRobotStat(at21: number, at41: number, level: number, stat: RobotStat): number {
  const steps = level - growthBaseLevel;
  const weightedSteps = stat === "en" ? steps :
    3 * Math.min(steps, 20) + 2 * Math.min(Math.max(steps - 20, 0), 20) + Math.max(steps - 40, 0);
  return Math.round(at41 + (at41 - at21) * weightedSteps / (4 * (growthBaseLevel - growthStartLevel)));
}

function resolveRobotCoreGrowth(anchors: readonly { readonly level: number; readonly value: number }[], level: number, stat: RobotStat): number {
  if (!Number.isSafeInteger(level) || level < 1 || level > ROBOT_CORE_LEVEL_MAX) throw new Error("Invalid core growth level");
  if (level <= growthBaseLevel) return interpolateRobotValue(anchors, level)!;
  const at21 = anchors.find(a => a.level === growthStartLevel)!.value;
  const at41 = anchors.find(a => a.level === growthBaseLevel)!.value;
  return getExtendedRobotStat(at21, at41, level, stat);
}

export function getRobotCoreHp(coreLevel: number): number {
  return resolveRobotCoreGrowth(rules.progression.cores.hpGrowth.checkpoints.map(a => ({ level: a.level, value: a.hp })), coreLevel, "hp");
}

export function getRobotCoreBaseStat(stat: RobotStat, coreLevel: number): number {
  if (stat === "hp") return getRobotCoreHp(coreLevel);
  return resolveRobotCoreGrowth(rules.progression.cores.referenceBaseStats.map(a => ({ level: a.level, value: a[stat] })), coreLevel, stat);
}

export interface RobotFrameStatPlan {
  readonly coreHp: number;
  readonly frameHpBonus: number | null;
  readonly stats: RobotStatValues;
  readonly blockingIssues: readonly string[];
}

/** Frame totals already include core stats. HP and MOV keep their separate adopted rules. */
export function getRobotFrameStatPlan(frameId: string, coreLevel: number): RobotFrameStatPlan {
  const f = frames.frames.find(f => f.id === frameId);
  if (!f) throw new Error("Unknown frame ID: " + frameId);
  const coreHp = getRobotCoreHp(coreLevel), issues: string[] = [];
  if (coreLevel > growthBaseLevel) {
    const at21 = f.totalsAtCoreLevel.find(a => a.level === growthStartLevel)!;
    const at41 = f.totalsAtCoreLevel.find(a => a.level === growthBaseLevel)!;
    const stat = (key: Exclude<RobotStat, "mov">) => getExtendedRobotStat(at21[key], at41[key], coreLevel, key);
    const stats: RobotStatValues = { hp: stat("hp"), melee: stat("melee"), ranged: stat("ranged"),
      def: stat("def"), spd: stat("spd"), en: stat("en"),
      mov: frames.movementModifierModel.coreBaseMov + f.movementModifierAtCoreLevel["21"] };
    return { coreHp, frameHpBonus: stats.hp! - coreHp, stats, blockingIssues: issues };
  }
  const hpBonuses = f.totalsAtCoreLevel.map(a => ({ level: a.level, value: a.hp - getRobotCoreHp(a.level) }));
  // Adopted 2026-10-30: interpolate and round the frame-only bonus separately,
  // then add core HP exactly once, preserving the core's own Lv11/31 anchors.
  const frameHpBonus = interpolateRobotValue(hpBonuses, coreLevel);
  if (frameHpBonus === null) issues.push("Frame HP bonus between saved anchors is unresolved: " + frameId + " Lv" + coreLevel);
  const values: Record<RobotStat, number | null> = {
    hp: frameHpBonus === null ? null : coreHp + frameHpBonus,
    melee: null, ranged: null, def: null, spd: null, en: null,
    mov: frames.movementModifierModel.coreBaseMov + (coreLevel < 21 ? f.movementModifierAtCoreLevel["1"] : f.movementModifierAtCoreLevel["21"])
  };
  for (const stat of ["melee", "ranged", "def", "spd", "en"] as const) {
    values[stat] = interpolateRobotValue(f.totalsAtCoreLevel.map(a => ({ level: a.level, value: a[stat] })), coreLevel);
  }
  return { coreHp, frameHpBonus, stats: values, blockingIssues: issues };
}

/** Adopted 40-step core EXP table; shared pool, upgrades only. */
export function getRobotCoreUpgradeExp(fromLevel: number, toLevel: number): number {
  const rule = rules.progression.cores;
  if (![fromLevel, toLevel].every(lv => Number.isSafeInteger(lv) && lv >= rule.levelMin && lv <= ROBOT_PRICED_CORE_LEVEL_MAX) || toLevel < fromLevel) throw new Error("Invalid core upgrade interval");
  return rule.upgradeExpByLevel.slice(fromLevel - 1, toLevel - 1).reduce((sum, n) => sum + n, 0);
}

/** Adopted basic-part upgrade EXP; refunds remain a separate policy. */
export function getRobotPartUpgradeExp(fromLevel: number, toLevel: number): number {
  const { min, expCosts } = rules.progression.equipment.basicLevels;
  if (![fromLevel, toLevel].every(lv => Number.isSafeInteger(lv) && lv >= min && lv <= ROBOT_PRICED_PART_LEVEL_MAX) || toLevel < fromLevel) throw new Error("Invalid part upgrade interval");
  return expCosts.slice(fromLevel - 1, toLevel - 1).reduce((sum, n) => sum + n, 0);
}
