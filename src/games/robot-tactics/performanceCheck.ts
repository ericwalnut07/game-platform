import basicParts from "../../../docs/design/robot-tactics/basic-parts.json";
import { getRobotAddonCost, getRobotNormalActionCost, getRobotNormalAttackStatBonus, robotIgnoresNormalSight } from "./combatAddons";
import rules from "../../../docs/design/robot-tactics/rules.json";
import { resolveRobotTargetDamage, type RobotAttackSpatialCheck } from "./attackResolution";
import { calculateRobotBaseDamage, floorRobotDamageProduct, getRobotRemainingDamageFactor, getRobotWeaponDamageEstimate, type RobotWeaponDamageMode } from "./combatMath";
import { getRobotLoadoutPlan, getRobotPartyEquipmentPlan, listRobotAddonIds, listRobotBasicPartIds, listRobotFrameIds, resolveRobotBasicPart, type RobotCoreId, type RobotEquipmentSlot, type RobotLoadout, type RobotPartSelection } from "./equipment";
import { getRobotShieldActionPlan } from "./equipmentEffects";
import { getRobotAddonEnergyPlan } from "./addonEnergy";
import { getRobotOfflineAvailability, getRobotSharedPartLevelConflicts, type RobotOfflineProgress } from "./offlineProgress";
import { getRobotNormalWeaponEnergyCost, getRobotPiercingComboDefense, getRobotSwordRecoil, getRobotWeaponComboPlan, resolveRobotTwoWeaponHits, type RobotWeaponFamily } from "./weaponActions";
import { getRobotSweepPlan } from "./sweep";

export type RobotPerformanceAttack = RobotWeaponDamageMode | "combo";
export type RobotPerformanceHitCondition = "valid" | "out-of-range" | "wall" | "non-damaging";
export interface RobotPerformanceEnemy {
  readonly hp: number; readonly melee: number; readonly ranged: number; readonly def: number;
  readonly en: number; readonly weaponPower: number; readonly family: RobotWeaponFamily;
}
export interface RobotPerformanceDraft {
  readonly party: readonly RobotLoadout[]; readonly coreId: RobotCoreId;
  readonly enemy: RobotPerformanceEnemy;
  readonly attack: RobotPerformanceAttack; readonly weaponSlot: "weapon1" | "weapon2";
  /** Equal-stat enemies whose legal targeting prerequisites are assumed satisfied. */
  readonly targetCount: number;
  readonly enemyShield: boolean; readonly ownShield: boolean;
  readonly hitCondition: RobotPerformanceHitCondition;
  /** null = full EN for the hypothetical build; no combat energy ledger is changed. */
  readonly currentEn: number | null;
}
export interface RobotPerformanceHit {
  readonly label: string; readonly damage: number; readonly actualHpDamage: number;
}
export interface RobotPerformanceDamage {
  readonly hits: readonly RobotPerformanceHit[];
  readonly totalDamage: number; readonly actualHpDamage: number; readonly recoil: number;
  readonly requiredEn: number; readonly canInitiate: boolean; readonly reason: string | null;
}
export const ROBOT_PERFORMANCE_ALL_EQUIPMENT = {
  frames: listRobotFrameIds(), basicParts: listRobotBasicPartIds(), addons: listRobotAddonIds()
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Local scratch only. This object is never a progression update or save payload. */
export function createRobotPerformanceDraft(progress: RobotOfflineProgress): RobotPerformanceDraft {
  return { party: clone(progress.party), coreId: progress.party[0]!.coreId,
    enemy: { hp: 100, melee: 50, ranged: 50, def: 50, en: 100, weaponPower: 30, family: "assault" },
    attack: "normal", weaponSlot: "weapon1", targetCount: 1, enemyShield: false, ownShield: false, hitCondition: "valid", currentEn: null };
}
export function setRobotPerformancePart(draft: RobotPerformanceDraft, slot: RobotEquipmentSlot, selection: RobotPartSelection): RobotPerformanceDraft {
  const p = resolveRobotBasicPart(selection.partId, selection.level);
  if (p.slot !== (slot === "weapon1" || slot === "weapon2" ? "weapon" : slot)) throw new Error("部位が一致しません。");
  return { ...draft, party: draft.party.map(c => c.coreId === draft.coreId ? { ...c, basic: { ...c.basic, [slot]: clone(selection) } } : c) };
}
function integer(value: number, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new Error("数値は範囲内の整数で入力してください。");
}
function condition(draft: RobotPerformanceDraft): RobotAttackSpatialCheck {
  switch (draft.hitCondition) {
    case "valid": case "non-damaging": return { canReach: true, reason: "clear", sight: null };
    case "out-of-range": return { canReach: false, reason: "out-of-range", sight: null };
    case "wall": return { canReach: false, reason: "line-of-sight-blocked", sight: null };
    default: throw new Error("攻撃条件が不正です。");
  }
}
function conditionReason(draft: RobotPerformanceDraft): string | null {
  switch (draft.hitCondition) { case "valid": return null; case "out-of-range": return "射程外"; case "wall": return "壁による射線遮断"; case "non-damaging": return "ダメージを与えない効果"; }
}
function total(hits: readonly RobotPerformanceHit[], recoil: number, requiredEn: number, canInitiate: boolean, reason: string | null): RobotPerformanceDamage {
  const sum = (key: "damage" | "actualHpDamage") => hits.reduce((n, h) => n + h[key], 0);
  const totalDamage = sum("damage"), actualHpDamage = sum("actualHpDamage");
  integer(totalDamage); integer(actualHpDamage);
  return { hits, totalDamage, actualHpDamage, recoil, requiredEn, canInitiate, reason };
}

/** Damage-only sandbox: shared final damage, equipment, shield, combo, recoil
 * functions. No new range/LOS, formation legality, status timing or save policy.
 */
export function getRobotPerformanceReport(progress: RobotOfflineProgress, draft: RobotPerformanceDraft) {
  const core = draft.party.find(c => c.coreId === draft.coreId);
  if (!core || draft.party.length !== 3 || new Set(draft.party.map(c => c.coreId)).size !== 3) throw new Error("試算する3コアの構成が不正です。");
  for (const [key, value] of Object.entries(draft.enemy)) if (key !== "family") integer(value as number, key === "hp" ? 1 : key === "def" ? Number.MIN_SAFE_INTEGER : 0);
  if (!["slash", "blunt", "thrust", "assault", "sniper", "blast"].includes(draft.enemy.family)) throw new Error("仮想武器の系統が不正です。");
  integer(draft.targetCount, 1); if (draft.targetCount > 9) throw new Error("対象数は1〜9です。");
  if (draft.currentEn !== null) integer(draft.currentEn);
  if (typeof draft.ownShield !== "boolean" || typeof draft.enemyShield !== "boolean") throw new Error("防御条件が不正です。");
  let spatial = condition(draft);
  const plan = getRobotLoadoutPlan(core, ROBOT_PERFORMANCE_ALL_EQUIPMENT);
  const legality = getRobotPartyEquipmentPlan(draft.party, getRobotOfflineAvailability(progress));
  const equipmentIssues = [...new Set([...legality.blockingIssues, ...legality.robots.flatMap(p => [...p.blockingIssues, ...p.baseStatBlockingIssues])])];
  if (getRobotSharedPartLevelConflicts(draft.party).length) equipmentIssues.push("Shared part level mismatch");
  const unsupported: string[] = [];
  // Do not silently ignore an addon carried by an imported/current build.
  const addons = getRobotAddonEnergyPlan(core.addons);
  if (addons.unsupported.length) unsupported.push("追加パーツ効果の試算は準備中です：" + addons.unsupported.join("、") + "。仮構成から外すと試算できます。");
  if (plan.baseStatBlockingIssues.length || Object.values(plan.effectiveStats).some(n => n === null)) unsupported.push("能力値を確定できない構成です。");
  if (core.addons.some(a => ["proximity-mine","movement-interference-field","persistent-blast-fire"].includes(a.partId))) unsupported.push("追加パーツ（感応地雷・進路妨害・残留爆炎）の試算には配置・移動経路・手番が必要です。");
  if (core.addons.some(a => a.partId === "stationary-defense")) unsupported.push("固定防御の試算には前の自身ターンの移動有無が必要です。");
  if (core.addons.some(a => a.partId === "weakness-finisher")) unsupported.push("弱点追撃の試算には対象の最大HPが必要です。");
  if (unsupported.length) return { plan, equipmentIssues, unsupported, dealt: null, received: null, shield: null };
  const stats = plan.effectiveStats as Readonly<Record<"hp" | "melee" | "ranged" | "def" | "mov" | "spd" | "en", number>>;
  if (draft.currentEn !== null && draft.currentEn > stats.en) throw new Error("現在ENが最大ENを超えています。");
  const primary = core.basic[draft.weaponSlot], secondary = core.basic[draft.weaponSlot === "weapon1" ? "weapon2" : "weapon1"];
  const weapon = resolveRobotBasicPart(primary.partId, primary.level), selectedParts = Object.values(plan.basic);
  const pendingWeapon = [primary, ...(draft.attack === "combo" ? [secondary] : [])].some(selection =>
    basicParts.parts.some(part => part.id === selection.partId && part.plannedWeaponEffect),
  );
  if (draft.attack === "normal" && robotIgnoresNormalSight(weapon, core.addons) && spatial.reason === "line-of-sight-blocked") spatial = { canReach: true, reason: "clear", sight: null };
  const outgoingFactors = draft.enemyShield ? [getRobotRemainingDamageFactor(rules.combat.actions.shield.incomingDamageReduction)] : [];
  const shield = getRobotShieldActionPlan(selectedParts, core.addons);
  const incomingFactors = draft.ownShield ? shield.damageFactors : [];
  const applicable = draft.hitCondition !== "non-damaging";
  const resolve = (base: number, factors: readonly number[], legal: boolean) => resolveRobotTargetDamage({ attackLegal: legal, spatial,
    effect: applicable ? { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base, factors) } : { kind: "non-damaging" } }).damage;
  let dealt: RobotPerformanceDamage | null = null;
  try {
    if (pendingWeapon) throw new Error("新武器の攻撃効果の試算は準備中です。");
    let requiredEn = 0, hits: RobotPerformanceHit[] = [], usedWeapons: string[] = [primary.partId];
    let canInitiate = true;
    const availableEn = draft.currentEn ?? stats.en;
    const estimate = (selection: RobotPartSelection, def: number, mode: RobotWeaponDamageMode = "normal") => getRobotWeaponDamageEstimate({ weaponId: selection.partId, weaponLevel: selection.level, attackStats: { ...stats, melee: stats.melee + (draft.attack === "normal" ? getRobotNormalAttackStatBonus(core.addons) : 0), ranged: stats.ranged + (draft.attack === "normal" ? getRobotNormalAttackStatBonus(core.addons) : 0) }, targetDef: def, mode: mode === "overwatch" ? "normal" : mode }).baseDamage;
    const hit = (selection: RobotPartSelection, label: string, multiplier = 1, def = draft.enemy.def, mode: RobotWeaponDamageMode = "normal") => {
      const damage = resolve(estimate(selection, def, mode), [multiplier, ...outgoingFactors], canInitiate);
      hits.push({ label, damage, actualHpDamage: Math.min(draft.enemy.hp, damage) });
    };
    if (draft.attack === "combo") {
      const combo = getRobotWeaponComboPlan(primary, secondary); requiredEn = combo.energyCost; canInitiate = availableEn >= requiredEn; usedWeapons = [primary.partId, secondary.partId];
      if (combo.kind === "blunt-ranged") throw new Error("衝撃コンボの試算は準備中です。");
      if (combo.kind === "melee-melee") {
        if (!canInitiate || !spatial.canReach || !applicable) hits = [{ label: "対象", damage: 0, actualHpDamage: 0 }];
        else hits = resolveRobotTwoWeaponHits({ primary, secondary, attackStat: stats.melee, targetDef: draft.enemy.def, targetHp: draft.enemy.hp, spatial: [spatial, spatial], multipliers: outgoingFactors }).hits.map((h, i) => ({ label: `第${i + 1}撃`, damage: h.resolution.damage, actualHpDamage: h.actualHpDamage }));
      } else if (combo.kind === "same-family") hit(primary, "対象", combo.sameFamilyNormalDamageMultiplier!);
      else if (combo.kind === "ranged-ranged") for (let i = 0; i < draft.targetCount; i++) hit(primary, `拡散対象${i + 1}`, combo.uniformAreaNormalDamageMultiplier!);
      else if (combo.kind === "slash-ranged") {
        const slash = weapon.weaponFamily === "slash" ? primary : secondary, ranged = slash === primary ? secondary : primary;
        hit(slash, "近接対象", combo.slashNormalDamageMultiplier!); hit(ranged, "射撃対象", combo.rangedNormalDamageMultiplier!);
      } else {
        const ranged = weapon.weaponFamily === "thrust" ? secondary : primary;
        hit(ranged, "対象", combo.rangedNormalDamageMultiplier!, getRobotPiercingComboDefense(draft.enemy.def));
      }
    } else {
      if (draft.attack === "overwatch" && ["slash", "blunt", "thrust"].includes(weapon.weaponFamily!)) throw new Error("近接武器の迎撃の試算は準備中です。");
      if (!["normal", "sweep", "burst-center", "burst-neighbor", "overwatch"].includes(draft.attack)) throw new Error("攻撃方法が不正です。");
      requiredEn = draft.attack === "overwatch" ? (core.addons.some(a => a.partId === "overwatch-amplifier") ? getRobotAddonCost("overwatch-amplifier") : rules.combat.actions.overwatch.energyCost) : draft.attack === "normal" ? getRobotNormalActionCost(primary, core.addons) : getRobotNormalWeaponEnergyCost(primary);
      if (draft.attack === "sweep") {
        const sweep = getRobotSweepPlan(primary, core.addons); requiredEn = sweep.energyCost;
        if (draft.targetCount > sweep.targetCap) throw new Error("この武器の薙ぎ払い対象数を超えています。");
      } else if (draft.targetCount !== 1) throw new Error("この試算方法は対象1体で選択してください。");
      canInitiate = availableEn >= requiredEn;
      for (let i = 0; i < draft.targetCount; i++) hit(primary, `対象${i + 1}`, draft.attack === "overwatch" ? core.addons.some(a => a.partId === "overwatch-amplifier") ? .9 : .7 : 1, draft.enemy.def, draft.attack);
    }
    const recoil = getRobotSwordRecoil({ attack: draft.attack === "combo" ? "weapon-combo" : draft.attack === "sweep" ? "sweep" : "normal", attackWeaponIds: usedWeapons, actingAsSupporter: false, actualHpDamage: hits.map(h => h.actualHpDamage) });
    dealt = total(hits, recoil, requiredEn, canInitiate && spatial.canReach && applicable, !canInitiate ? "EN不足" : conditionReason(draft));
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    unsupported.push(/[ぁ-龥]/.test(message) ? message : message.includes("Sweep requires") ? "薙ぎ払いは斬撃武器を選択してください。" : message.includes("Burst requires") ? "爆撃は爆撃武器を選択してください。" : message.includes("distinct") ? "コンボは異なる武器IDを選択してください。" : "この数値・武器の組み合わせでは試算できません。");
  }
  const incomingAttack = ["slash", "blunt", "thrust"].includes(draft.enemy.family) ? draft.enemy.melee : draft.enemy.ranged;
  const base = calculateRobotBaseDamage({ attackStat: incomingAttack, weaponPower: draft.enemy.weaponPower, targetDef: stats.def, actionMultiplier: 1, areaMultiplier: 1 });
  const receivedDamage = resolve(base, incomingFactors, true);
  const received = total([{ label: "自機", damage: receivedDamage, actualHpDamage: Math.min(stats.hp, receivedDamage) }], 0, 0, spatial.canReach && applicable, conditionReason(draft));
  return { plan, equipmentIssues, unsupported, dealt, received, shield };
}
