import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, getRobotAttackBlockReasonText, resolveRobotTargetDamage, type RobotAttackSpatialCheck } from "./attackResolution";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate } from "./combatMath";
import { resolveRobotBasicPart, type RobotPartSelection, type RobotResolvedPart } from "./equipment";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "./battleBatch";
import { getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { getRobotPiercingComboDefense, getRobotWeaponComboPlan, resolveRobotTwoWeaponHits } from "./weaponActions";
import { getRobotShieldActionPlan } from "./equipmentEffects";
import { getRobotSweepPlan, getRobotSweepTargetSets, isRobotSweepSelection } from "./sweep";

export interface RobotBattleWeaponRules {
  /** Trusted post-base modifiers excluding the shared active-shield layer.
   * Missing status resolution and unresolved shield/status composition fail closed.
   */
  readonly postBaseMultipliers?: (state: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit) => readonly number[];
}
interface Identity { readonly actionId: string; readonly turnId: string }
function controlledActor(s: RobotBattleCoreState): RobotBattleUnit {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (actor.unitIds.length !== 1 || source.kind !== "controlled" || source.hp <= 0 || !source.position || source.energy.action !== null) throw new Error("Weapon command resolver is connected only for the current controlled actor");
  return source;
}
function heldWeapon(source: RobotBattleUnit, id: string): { selection: RobotPartSelection; weapon: RobotResolvedPart } {
  const selections = source.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon");
  if (selections.length !== 2 || new Set(selections.map(p => p.partId)).size !== 2) throw new Error("A trusted two-weapon build is required");
  const selection = selections.find(p => p.partId === id); if (!selection) throw new Error("Selected weapon is not equipped by acting robot");
  return { selection, weapon: resolveRobotBasicPart(selection.partId, selection.level) };
}
function hostileTargets(s: RobotBattleCoreState, ids: readonly string[]): readonly RobotBattleUnit[] {
  if (new Set(ids).size !== ids.length) throw new Error("Distinct combo target IDs required");
  return ids.map(id => {
    const target = getRobotBattleUnit(s, id);
    if (robotBattleIsAlly(target) || target.hp <= 0 || !target.position) throw new Error("Living hostile target required");
    return target;
  });
}
function spatial(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, weapon: RobotResolvedPart): RobotAttackSpatialCheck {
  return checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: target.position!, min: weapon.range!.min, max: weapon.range!.max }), sight: { board: s.board, origin: source.position!, target: target.position! } });
}
function requireReachable(check: RobotAttackSpatialCheck): void { if (!check.canReach) throw new Error(getRobotAttackBlockReasonText(check)!); }
export function getRobotBattlePostBaseModifiers(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, policy: RobotBattleWeaponRules = {}) {
  if (!policy.postBaseMultipliers && (source.statuses.length || target.statuses.length)) throw new Error("Active status damage resolver required");
  if (target.shielded && target.statuses.length) throw new Error("Shield/status composition is not yet connected");
  const shield = target.shielded ? getRobotShieldActionPlan(target.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), target.addons ?? []).damageFactors : [];
  return [...shield, ...(policy.postBaseMultipliers?.(s, source, target) ?? [])];
}
function attackStats(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit) {
  const bonus = getRobotBattleCommandBonus(s, source.id, target.id);
  return { melee: source.stats.melee + bonus.melee, ranged: source.stats.ranged + bonus.ranged };
}
function defense(s: RobotBattleCoreState, target: RobotBattleUnit) { return target.stats.def + getRobotBattleCommandBonus(s, target.id, null).defense; }
function attackPacket(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, weapon: RobotResolvedPart, id: string, multiplier: number, policy: RobotBattleWeaponRules, targetDef = defense(s, target)): RobotBattleResolvedAttack {
  const check = spatial(s, source, target, weapon); requireReachable(check);
  const base = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: attackStats(s, source, target), targetDef, mode: "normal" }).baseDamage;
  const extra = getRobotBattlePostBaseModifiers(s, source, target, policy);
  const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial: check, effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base, [multiplier, ...extra]) } });
  return { id, sourceId: source.id, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"], targets: [{ entityId: target.id, cells: [target.position!], resolution }] };
}
function summary(source: RobotBattleUnit, label: string, targets: readonly RobotBattleUnit[], attacks: readonly RobotBattleResolvedAttack[]): string {
  return source.name + "：" + label + " → " + targets.map(t => t.name).join("・") + "、" + attacks.flatMap(a => a.targets.map(t => t.resolution.damage)).join("＋") + "ダメージ";
}

/** Trusted choice projection; final execution repeats the same shared checks. */
export function getRobotBattleSweepOptions(s: RobotBattleCoreState, weaponId: string) {
  const source = controlledActor(s), { selection, weapon } = heldWeapon(source, weaponId), plan = getRobotSweepPlan(selection, source.addons ?? []);
  const eligible = s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0 && u.position && spatial(s, source, u, weapon).canReach).map(u => ({ id: u.id, position: u.position! }));
  return { plan, targetSets: source.energy.en < plan.energyCost ? [] : getRobotSweepTargetSets(source.position!, eligible, plan.targetCap) };
}

/** Complete controlled-actor command for 15 adopted family pairs. Uses equipped
 * values and common range/LOS/damage/EN/settlement; no caller-supplied damage/cost.
 * Spread and impact need their spatial/push resolver before they can commit.
 * This internal engine API does not approve a departure or schedule initiative.
 */
export function commitRobotBattleWeaponCombo(s: RobotBattleCoreState, input: Identity & {
  readonly primaryWeaponId: string; readonly secondaryWeaponId: string;
  /** For dual-target: slash target first, ranged target second, regardless of slot order. */
  readonly targetIds: readonly string[];
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = controlledActor(s), primary = heldWeapon(source, input.primaryWeaponId), secondary = heldWeapon(source, input.secondaryWeaponId);
  const plan = getRobotWeaponComboPlan(primary.selection, secondary.selection);
  if (plan.kind === "ranged-ranged" || plan.kind === "blunt-ranged") throw new Error("Spread/impact spatial and push resolver not yet connected");
  if (input.targetIds.length !== (plan.kind === "slash-ranged" ? 2 : 1)) throw new Error("Wrong number of combo targets");
  const targets = hostileTargets(s, input.targetIds), attacks: RobotBattleResolvedAttack[] = [];
  if (plan.kind === "melee-melee") {
    const target = targets[0]!, checks = [spatial(s, source, target, primary.weapon), spatial(s, source, target, secondary.weapon)] as const;
    requireReachable(checks[0]);
    const result = resolveRobotTwoWeaponHits({ primary: primary.selection, secondary: secondary.selection, attackStat: attackStats(s, source, target).melee, targetDef: defense(s, target), targetHp: target.hp, spatial: checks, multipliers: getRobotBattlePostBaseModifiers(s, source, target, policy) });
    for (const [index, hit] of result.hits.entries()) {
      requireReachable(checks[index]!);
      const weapon = index === 0 ? primary.weapon : secondary.weapon;
      attacks.push({ id: input.actionId + ":hit:" + (index + 1), sourceId: source.id, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"], targets: [{ entityId: target.id, cells: [target.position!], resolution: hit.resolution }] });
    }
  } else if (plan.kind === "same-family") {
    attacks.push(attackPacket(s, source, targets[0]!, primary.weapon, input.actionId + ":hit:1", plan.sameFamilyNormalDamageMultiplier!, policy));
  } else if (plan.kind === "slash-ranged") {
    const slash = primary.weapon.weaponFamily === "slash" ? primary.weapon : secondary.weapon;
    const ranged = slash === primary.weapon ? secondary.weapon : primary.weapon;
    attacks.push(attackPacket(s, source, targets[0]!, slash, input.actionId + ":hit:1", plan.slashNormalDamageMultiplier!, policy));
    attacks.push(attackPacket(s, source, targets[1]!, ranged, input.actionId + ":hit:2", plan.rangedNormalDamageMultiplier!, policy));
  } else {
    const ranged = primary.weapon.weaponFamily === "thrust" ? secondary.weapon : primary.weapon;
    attacks.push(attackPacket(s, source, targets[0]!, ranged, input.actionId + ":hit:1", plan.rangedNormalDamageMultiplier!, policy, getRobotPiercingComboDefense(defense(s, targets[0]!))));
  }
  return commitRobotBattleBatch(s, { ...input, summary: summary(source, "武装コンボ", targets, attacks), members: [{ unitId: source.id, action: { kind: "other", energyCost: plan.energyCost } }], attacks, resolutionMode: plan.kind === "melee-melee" ? "ordered-single-source" : "simultaneous", swordUse: { attack: "weapon-combo", attackWeaponIds: [primary.weapon.id, secondary.weapon.id] } });
}

/** Normal slash/sweep: direct target selection, common bands and equipment caps.
 * Only the selected attacking weapon can trigger its own drawback.
 */
export function commitRobotBattleSlashAttack(s: RobotBattleCoreState, input: Identity & {
  readonly weaponId: string; readonly kind: "normal" | "sweep"; readonly targetIds: readonly string[];
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = controlledActor(s), { selection, weapon } = heldWeapon(source, input.weaponId);
  if (weapon.weaponFamily !== "slash" || !["normal", "sweep"].includes(input.kind)) throw new Error("Slash normal/sweep command required");
  const plan = input.kind === "sweep" ? getRobotSweepPlan(selection, source.addons ?? []) : { targetCap: 1, energyCost: 0 }, cap = plan.targetCap;
  if (!input.targetIds.length || input.targetIds.length > cap) throw new Error("Slash target cap exceeded");
  const targets = hostileTargets(s, input.targetIds);
  const checks = targets.map(target => { const check = spatial(s, source, target, weapon); requireReachable(check); return check; });
  if (input.kind === "sweep" && !isRobotSweepSelection(source.position!, targets.map(t => t.position!))) throw new Error("薙ぎ払いは同じ直交3マス帯の敵を選択してください。");
  const attacks = targets.map((target, index) => {
    const check = checks[index]!;
    const estimate = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: attackStats(s, source, target), targetDef: defense(s, target), mode: input.kind === "sweep" ? "sweep" : "normal" });
    const extra = getRobotBattlePostBaseModifiers(s, source, target, policy);
    return { id: input.actionId + ":hit:" + (index + 1), sourceId: source.id, effectKind: "slash" as const, targets: [{ entityId: target.id, cells: [target.position!], resolution: resolveRobotTargetDamage({ attackLegal: true, spatial: check, effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(estimate.baseDamage, extra) } }) }] };
  });
  return commitRobotBattleBatch(s, { ...input, summary: summary(source, input.kind === "sweep" ? "薙ぎ払い" : "通常斬撃", targets, attacks), members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: plan.energyCost } }], attacks, swordUse: { attack: input.kind, attackWeaponIds: [weapon.id] } });
}
