import rules from "../../../docs/design/robot-tactics/rules.json";
import frames from "../../../docs/design/robot-tactics/frames.json";
import groupRules from "../../../docs/design/robot-tactics/current-group-combat.json";

export type RobotStat = "hp" | "melee" | "ranged" | "def" | "mov" | "spd" | "en";
export type RobotStatValues = Readonly<Record<RobotStat, number | null>>;
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

export function getRobotCoreHp(coreLevel: number): number {
  return interpolateRobotValue(rules.progression.cores.hpGrowth.checkpoints.map(a => ({ level: a.level, value: a.hp })), coreLevel)!;
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

/** Adopted basic-part upgrade EXP only; no proposed core costs or refund rounding. */
export function getRobotPartUpgradeExp(fromLevel: number, toLevel: number): number {
  const { min, max, expCosts } = rules.progression.equipment.basicLevels;
  if (![fromLevel, toLevel].every(lv => Number.isSafeInteger(lv) && lv >= min && lv <= max) || toLevel < fromLevel) throw new Error("Invalid part upgrade interval");
  return expCosts.slice(fromLevel - 1, toLevel - 1).reduce((sum, n) => sum + n, 0);
}
