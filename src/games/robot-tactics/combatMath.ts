import rules from "../../../docs/design/robot-tactics/rules.json";
import { resolveRobotBasicPart } from "./equipment";

export type RobotWeaponDamageMode = "normal" | "sweep" | "burst-center" | "burst-neighbor" | "overwatch";

/** Arithmetic terms only: this is not a legal attack or a final HP mutation. */
export interface RobotBaseDamageTerms {
  readonly attackStat: number;
  readonly weaponPower: number;
  readonly targetDef: number;
  readonly actionMultiplier: number;
  readonly areaMultiplier: number;
}

// Decimal catalog coefficients (e.g. 0.7) must not lose one damage point to
// binary floating-point drift just below an integer before the final floor.
function decimalFraction(value: number): readonly [bigint, bigint] {
  const [mantissa = "0", exponent = "0"] = value.toString().split("e");
  const decimals = mantissa.split(".")[1]?.length ?? 0;
  const digits = BigInt(mantissa.replace(".", ""));
  const scale = decimals - Number(exponent);
  return scale >= 0 ? [digits, 10n ** BigInt(scale)] : [digits * 10n ** BigInt(-scale), 1n];
}

/**
 * The adopted floor expression, before defense/shield/addons/on-hit effects.
 * Zero remains zero here: the adopted minimum belongs AFTER all final modifiers.
 * Nonpositive DEF fails closed rather than inventing a denominator floor.
 */
export function calculateRobotBaseDamage(terms: RobotBaseDamageTerms): number {
  for (const value of Object.values(terms)) {
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid base damage term");
  }
  if (terms.targetDef <= 0) throw new Error("Nonpositive DEF requires an adopted DEF floor");
  const [attack, attackDen] = decimalFraction(terms.attackStat);
  const [power, powerDen] = decimalFraction(terms.weaponPower);
  const [action, actionDen] = decimalFraction(terms.actionMultiplier);
  const [area, areaDen] = decimalFraction(terms.areaMultiplier);
  const [def, defDen] = decimalFraction(terms.targetDef);
  const numerator = 10n * (attack * powerDen + power * attackDen) * action * area * defDen;
  const denominator = attackDen * powerDen * actionDen * areaDen * def;
  const damage = numerator / denominator;
  if (damage > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Base damage is outside the supported numeric range");
  return Number(damage);
}

/** The adopted final minimum applies only to legal, damage-dealing hits. */
export function finalizeRobotDamage(input: {
  readonly attackLegal: boolean;
  readonly dealsDamage: boolean;
  readonly damageAfterModifiers: number;
}): number {
  if (!input.attackLegal || !input.dealsDamage) return 0;
  const damage = input.damageAfterModifiers;
  if (!Number.isFinite(damage)) throw new Error("Invalid final damage");
  if (damage < 1) return rules.combat.finalDamage.minimumPerValidDamagingTarget;
  // The new adoption does not settle rounding of undefined special effects.
  if (!Number.isSafeInteger(damage)) throw new Error("Final effect rounding must be adopted before damage resolution");
  return damage;
}

/** Uses current catalog growth and family stat selection; no range/LOS/target selection. */
export function getRobotWeaponDamageEstimate(input: {
  readonly weaponId: string;
  readonly weaponLevel: number;
  /** Already composed stats: core/frame/basic equipment must not be added again. */
  readonly attackStats: { readonly melee: number; readonly ranged: number };
  readonly targetDef: number;
  readonly mode: RobotWeaponDamageMode;
}) {
  const weapon = resolveRobotBasicPart(input.weaponId, input.weaponLevel);
  if (weapon.slot !== "weapon" || weapon.weaponPower === null || weapon.weaponFamily === null) throw new Error("Resolved weapon required");
  const families = rules.combat.weaponFamilies;
  if (!Object.hasOwn(families, weapon.weaponFamily)) throw new Error("Unsupported weapon family");
  const family = families[weapon.weaponFamily as keyof typeof families];
  const attackStatKind = family.combatType as "melee" | "ranged";
  let actionMultiplier = rules.combat.damageFormula.normalActionMultiplier;
  let areaMultiplier = rules.combat.damageFormula.normalAreaMultiplier;
  switch (input.mode) {
    case "normal": break;
    case "sweep":
      if (weapon.weaponFamily !== "slash") throw new Error("Sweep requires a slash weapon");
      areaMultiplier = families.slash.sweep.perTargetAreaMultiplier;
      break;
    case "burst-center":
    case "burst-neighbor":
      if (weapon.weaponFamily !== "blast") throw new Error("Burst requires a blast weapon");
      areaMultiplier = input.mode === "burst-center" ? families.blast.burst.centerMultiplier : families.blast.burst.neighborMultiplier;
      break;
    case "overwatch": actionMultiplier = rules.combat.actions.overwatch.damageMultiplier; break;
    default: throw new Error("Unsupported damage estimate mode");
  }
  const terms: RobotBaseDamageTerms = { attackStat: input.attackStats[attackStatKind], weaponPower: weapon.weaponPower, targetDef: input.targetDef, actionMultiplier, areaMultiplier };
  return { weaponId: weapon.id, weaponLevel: weapon.level, attackStatKind, mode: input.mode, terms, baseDamage: calculateRobotBaseDamage(terms) };
}
