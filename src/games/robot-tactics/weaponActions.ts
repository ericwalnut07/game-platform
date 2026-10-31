import parts from "../../../docs/design/robot-tactics/basic-parts.json";
import rules from "../../../docs/design/robot-tactics/rules.json";
import { resolveRobotBasicPart, type RobotPartSelection } from "./equipment";
import { calculateRobotBaseDamage, floorRobotDamageProduct, getRobotEffectiveDefense } from "./combatMath";
import { resolveRobotTargetDamage, type RobotAttackSpatialCheck, type RobotTargetDamageResult } from "./attackResolution";

export type RobotWeaponFamily = "slash" | "blunt" | "thrust" | "assault" | "sniper" | "blast";
export type RobotComboKind = "same-family" | "melee-melee" | "ranged-ranged" | "slash-ranged" | "thrust-ranged" | "blunt-ranged";
export interface RobotWeaponComboPlan {
  readonly kind: RobotComboKind; readonly energyCost: number;
  readonly normalAttackEffects: false; readonly normalAttackAddonEffects: false;
  readonly normalHitEnergyRecovery: false; readonly railgunExtraEnergy: 0;
  readonly sameFamilyNormalDamageMultiplier: number | null;
  readonly uniformAreaNormalDamageMultiplier: number | null;
  readonly slashNormalDamageMultiplier: number | null; readonly rangedNormalDamageMultiplier: number | null;
  readonly pushDistance: number; readonly skipSecondHitOnDefeat: boolean;
}
const matrix = rules.combat.actions.weaponFamilyComboMatrix;
const families = [...matrix.familyGroups.melee, ...matrix.familyGroups.ranged];
const pairKey = (a: string, b: string) => [a, b].sort().join("+");

/** Classification/parameters only. No client-authorized targets or guessed
 * targeting/sequence/push implementation. Permanent equipment stats still apply.
 */
export function getRobotWeaponComboPlan(primary: RobotPartSelection, secondary: RobotPartSelection): RobotWeaponComboPlan {
  const a = resolveRobotBasicPart(primary.partId, primary.level), b = resolveRobotBasicPart(secondary.partId, secondary.level);
  if (a.slot !== "weapon" || b.slot !== "weapon" || a.id === b.id || !families.includes(a.weaponFamily!) || !families.includes(b.weaponFamily!)) throw new Error("Two distinct equipped weapon IDs required");
  const category = matrix.differentFamilies.categories.find(c => c.pairs.some(p => pairKey(p[0]!, p[1]!) === pairKey(a.weaponFamily!, b.weaponFamily!)));
  const same = a.weaponFamily === b.weaponFamily;
  if (!same && !category) throw new Error("Combo family pair not adopted");
  const kind = same ? "same-family" : category!.id as RobotComboKind;
  const parameter = (key: string): number => {
    const effect = category?.effect;
    const value = typeof effect === "object" && effect !== null ? (effect as Record<string, unknown>)[key] : undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Missing adopted combo parameter: " + key);
    return value;
  };
  return {
    kind, energyCost: same ? rules.combat.actions.enhancedSameTypeCombo.energyCost : category!.energyCost,
    normalAttackEffects: false, normalAttackAddonEffects: false, normalHitEnergyRecovery: false, railgunExtraEnergy: 0,
    sameFamilyNormalDamageMultiplier: same ? matrix.sameFamily.damageMultiplier : null,
    uniformAreaNormalDamageMultiplier: kind === "ranged-ranged" ? parameter("allTargetsNormalDamageMultiplier") : null,
    slashNormalDamageMultiplier: kind === "slash-ranged" ? parameter("slashNormalDamageMultiplier") : null,
    rangedNormalDamageMultiplier: kind === "slash-ranged" ? parameter("rangedNormalDamageMultiplier") : kind === "thrust-ranged" ? parameter("damageMultiplier") : kind === "blunt-ranged" ? parameter("normalRangedDamageMultiplier") : null,
    pushDistance: kind === "blunt-ranged" ? parameter("pushDistance") : 0,
    skipSecondHitOnDefeat: kind === "melee-melee"
  };
}

export function getRobotNormalWeaponEnergyCost(weapon: RobotPartSelection): number {
  const resolved = resolveRobotBasicPart(weapon.partId, weapon.level);
  if (resolved.slot !== "weapon") throw new Error("Weapon required");
  const raw = parts.parts.find(p => p.id === weapon.partId)!;
  const effect = raw.builtInEffect as unknown as Record<string, unknown> | undefined;
  if (effect?.kind !== "extra-energy-per-weapon-attack") return 0;
  const table = effect.costsByLevel;
  if (!Array.isArray(table) || table.length !== 10 || !Number.isSafeInteger(table[weapon.level - 1]) || table[weapon.level - 1] < 0) throw new Error("Missing adopted weapon EN table");
  return table[weapon.level - 1] as number;
}

/** Temporary calculation DEF only, after status/equipment DEF modifiers. */
export function getRobotPiercingComboDefense(defAfterModifiers: number): number {
  const def = getRobotEffectiveDefense(defAfterModifiers);
  return getRobotEffectiveDefense(def - Math.floor(Math.max(0, def - 30) / 2));
}

export interface RobotTwoWeaponHit {
  readonly weaponId: string; readonly resolution: RobotTargetDamageResult; readonly actualHpDamage: number;
}
/** Adopted explicit two-hit formulas; spatial verdicts and all applicable
 * post-base factors come from trusted shared action/effect resolution.
 */
export function resolveRobotTwoWeaponHits(input: {
  readonly primary: RobotPartSelection; readonly secondary: RobotPartSelection;
  readonly attackStat: number; readonly targetDef: number; readonly targetHp: number;
  readonly spatial: readonly [RobotAttackSpatialCheck, RobotAttackSpatialCheck];
  readonly multipliers?: readonly number[];
}): { readonly hits: readonly RobotTwoWeaponHit[]; readonly remainingHp: number } {
  const plan = getRobotWeaponComboPlan(input.primary, input.secondary);
  if (plan.kind !== "melee-melee") throw new Error("Different melee families required");
  if (!Number.isSafeInteger(input.targetHp) || input.targetHp <= 0) throw new Error("Living target required");
  const weapons = [resolveRobotBasicPart(input.primary.partId, input.primary.level), resolveRobotBasicPart(input.secondary.partId, input.secondary.level)];
  let hp = input.targetHp; const hits: RobotTwoWeaponHit[] = [];
  for (const [i, weapon] of weapons.entries()) {
    if (hp === 0) break;
    const base = () => calculateRobotBaseDamage({ attackStat: input.attackStat, weaponPower: weapon.weaponPower! * (i === 0 ? 1 : 0.5), targetDef: input.targetDef, actionMultiplier: i === 0 ? 1 : 0.5, areaMultiplier: 1 });
    const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial: input.spatial[i]!, effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base(), input.multipliers ?? []) } });
    const actualHpDamage = Math.min(hp, resolution.damage); hp -= actualHpDamage;
    hits.push({ weaponId: weapon.id, resolution, actualHpDamage });
  }
  return { hits, remainingHp: hp };
}

export type RobotSwordAttackKind = "normal" | "sweep" | "weapon-combo" | "line" | "pincer" | "delta" | "pair-defense" | "protection";
/** Actual HP loss per legal damaging hit, already capped by target remaining HP.
 * Invalid attacks, misses and deliberately non-damaging effects contribute zero.
 */
export function getRobotSwordRecoil(input: {
  readonly attack: RobotSwordAttackKind; readonly attackWeaponIds: readonly string[];
  readonly actingAsSupporter: boolean; readonly actualHpDamage: readonly number[];
}): number {
  const kinds = ["normal", "sweep", "weapon-combo", "line", "pincer", "delta", "pair-defense", "protection"];
  if (!kinds.includes(input.attack)) throw new Error("Unknown sword use");
  for (const damage of input.actualHpDamage) if (!Number.isSafeInteger(damage) || damage < 0) throw new Error("Invalid actual HP damage");
  if (input.actingAsSupporter || input.attack === "pair-defense" || input.attack === "protection" || !input.attackWeaponIds.includes("double-edged-sword")) return 0;
  const effect = parts.parts.find(p => p.id === "double-edged-sword")!.builtInEffect as unknown as { selfDamageRatio: number; weaponComboSelfDamageRatio: number; formationSelfDamageRatio: number };
  const ratio = input.attack === "normal" || input.attack === "sweep" ? effect.selfDamageRatio : input.attack === "weapon-combo" ? effect.weaponComboSelfDamageRatio : effect.formationSelfDamageRatio;
  const total = input.actualHpDamage.reduce((sum, damage) => sum + damage, 0);
  return floorRobotDamageProduct(total, [ratio]);
}

/** HP projection AFTER attack resolution; the enclosing battle transition owns
 * defeat/drop/respawn/mission processing. Recoil has no minimum-one guarantee.
 */
export function applyRobotSwordRecoil(hpAfterAttack: number, input: Parameters<typeof getRobotSwordRecoil>[0]) {
  if (!Number.isSafeInteger(hpAfterAttack) || hpAfterAttack < 0) throw new Error("Invalid attacker HP");
  const recoil = getRobotSwordRecoil(input), hp = Math.max(0, hpAfterAttack - recoil);
  return { recoil, hp, defeated: hpAfterAttack > 0 && hp === 0 };
}
