import type { RobotPosition } from "./movement";
import { consumeRobotMark } from "./adoptedEffects";
import { getRobotActionEnergyBlock } from "./energy";
import basicParts from "../../../docs/design/robot-tactics/basic-parts.json";
import { getRobotBattleDefense, getRobotDamageFactors } from "./battleEffects";
import { getRobotCombatWeapon, getRobotNormalActionCost, getRobotNormalAttackStatBonus, getRobotNormalFinisherFactor, robotIgnoresNormalSight } from "./combatAddons";
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, getRobotAttackBlockReasonText, resolveRobotTargetDamage, type RobotAttackSpatialCheck } from "./attackResolution";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate, type RobotWeaponDamageMode } from "./combatMath";
import { resolveRobotBasicPart, type RobotPartSelection, type RobotResolvedPart } from "./equipment";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "./battleBatch";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { getRobotNormalWeaponEnergyCost, getRobotPiercingComboDefense, getRobotWeaponComboPlan, resolveRobotTwoWeaponHits } from "./weaponActions";
import { getRobotSweepPlan, getRobotSweepTargetSets, isRobotSweepSelection } from "./sweep";
import { getRobotNormalHitEffect } from "./weaponHitEffects";
import { getRobotAreaNeighborCells, getRobotBlastFootprint, getRobotBlastPlan } from "./blast";

export interface RobotBattleWeaponRules {
  /** Trusted post-base modifiers excluding the shared active-shield layer.
   * Missing status resolution and unresolved shield/status composition fail closed.
   */
  readonly postBaseMultipliers?: (state: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit) => readonly number[];
}
interface Identity { readonly actionId: string; readonly turnId: string }
function singleActor(s: RobotBattleCoreState): RobotBattleUnit {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (actor.unitIds.length !== 1 || source.kind === "light" || source.hp <= 0 || !source.position || source.energy.action !== null) throw new Error("Current living single-robot actor required");
  return source;
}
function controlledActor(s: RobotBattleCoreState): RobotBattleUnit {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (actor.unitIds.length !== 1 || source.kind !== "controlled" || source.hp <= 0 || !source.position || source.energy.action !== null) throw new Error("Weapon command resolver is connected only for the current controlled actor");
  return source;
}
function heldWeapon(source: RobotBattleUnit, id: string): { selection: RobotPartSelection; weapon: RobotResolvedPart } {
  const selections = source.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon");
  if (selections.length !== (source.kind === "light" ? 1 : 2) || new Set(selections.map(p => p.partId)).size !== selections.length) throw new Error("A trusted two-weapon build is required");
  const selection = selections.find(p => p.partId === id); if (!selection) throw new Error("Selected weapon is not equipped by acting robot");
  return { selection, weapon: getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level), source.addons) };
}
function hostileTargets(s: RobotBattleCoreState, ids: readonly string[]): readonly RobotBattleUnit[] {
  if (new Set(ids).size !== ids.length) throw new Error("Distinct combo target IDs required");
  return ids.map(id => {
    const target = getRobotBattleUnit(s, id);
    if (robotBattleIsAlly(target) || target.hp <= 0 || !target.position) throw new Error("Living hostile target required");
    return target;
  });
}
function spatial(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, weapon: RobotResolvedPart, normal = false): RobotAttackSpatialCheck {
  const result = checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: target.position!, min: weapon.range!.min, max: weapon.range!.max }), sight: { board: s.board, origin: source.position!, target: target.position! } });
  return normal && robotIgnoresNormalSight(weapon, source.addons) && result.reason === "line-of-sight-blocked" ? { canReach: true, reason: "clear", sight: null } : result;
}
function requireReachable(check: RobotAttackSpatialCheck): void { if (!check.canReach) throw new Error(getRobotAttackBlockReasonText(check)!); }
export function getRobotBattlePostBaseModifiers(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, policy: RobotBattleWeaponRules = {}) {
  if (!policy.postBaseMultipliers && (source.statuses.length || target.statuses.length)) throw new Error("Active status damage resolver required");
  if (target.shielded && target.statuses.length) throw new Error("Shield/status composition is not yet connected");
  return [...getRobotDamageFactors(target), ...(policy.postBaseMultipliers?.(s, source, target) ?? [])];
}
function attackStats(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit) {
  const bonus = getRobotBattleCommandBonus(s, source.id, target.id), stats = getRobotBattleEffectiveStats(source);
  return { melee: stats.melee + bonus.melee, ranged: stats.ranged + bonus.ranged };
}
function defense(s: RobotBattleCoreState, target: RobotBattleUnit) { return getRobotBattleDefense(s, target); }
function neighborSpatial(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, center: Pick<RobotBattleUnit, "position">): RobotAttackSpatialCheck {
  return checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: center.position!, target: target.position!, min: 1, max: 1 }), sight: { board: s.board, origin: source.position!, target: target.position! } });
}
function attackPacket(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, weapon: RobotResolvedPart, id: string, multiplier: number, policy: RobotBattleWeaponRules, targetDef = defense(s, target), options: { readonly mode?: RobotWeaponDamageMode; readonly center?: Pick<RobotBattleUnit, "position">; readonly normalAttack?: boolean } = {}): RobotBattleResolvedAttack {
  const check = options.center ? neighborSpatial(s, source, target, options.center) : spatial(s, source, target, weapon, options.normalAttack); requireReachable(check);
  const base = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: Object.fromEntries(Object.entries(attackStats(s, source, target)).map(([k, v]) => [k, v + (options.normalAttack ? getRobotNormalAttackStatBonus(source.addons) : 0)])) as { melee: number; ranged: number }, targetDef, mode: options.mode ?? "normal" }).baseDamage;
  const extra = getRobotBattlePostBaseModifiers(s, source, target, policy);
  const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial: check, effect: { kind: "damaging", product: { base, factors: [multiplier, ...(options.normalAttack ? [getRobotNormalFinisherFactor(target.hp, target.maxHp, source.addons)] : []), ...extra] }, resolveAfterModifiers: () => floorRobotDamageProduct(base, [multiplier, ...(options.normalAttack ? [getRobotNormalFinisherFactor(target.hp, target.maxHp, source.addons)] : []), ...extra]) } });
  return { id, sourceId: source.id, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"], targets: [{ entityId: target.id, cells: [target.position!], resolution }] };
}
function summary(source: RobotBattleUnit, label: string, targets: readonly RobotBattleUnit[], attacks: readonly RobotBattleResolvedAttack[]): string {
  return source.name + "：" + label + " → " + targets.map(t => t.name).join("・") + "、" + attacks.flatMap(a => a.targets.map(t => t.resolution.damage)).join("＋") + "ダメージ";
}

// Connection capabilities, not a replacement catalogue. Other weapons must
// connect their normal-only effects before exposing a normal command. Blast
// normal attacks are explicitly single-target; the burst is a separate action.
const normalWeapons = new Set(["light-blade", "standard-sword", "whirlwind-saber", "double-edged-sword", "light-lance", "lance", "armor-pile", "sniper-rifle", "precision-rifle", "superheavy-railgun", "light-pistol", "assault-rifle", "corrosion-rifle", "emp-carbine", "heavy-hammer", "quake-hammer", "binding-hammer", "light-grenade-launcher", "howitzer", "heavy-missile-cannon", "wide-grenade-cannon"]);
export const isRobotBattleNormalWeaponConnected = (weaponId: string): boolean => normalWeapons.has(weaponId);
const normalUnavailable = "この武器の通常攻撃効果は未接続です";
function normalLabel(weapon: RobotResolvedPart): string { return weapon.weaponFamily === "slash" ? "通常斬撃" : weapon.weaponFamily === "thrust" ? "通常刺突" : weapon.weaponFamily === "sniper" ? "通常狙撃" : weapon.weaponFamily === "assault" ? "通常射撃" : weapon.weaponFamily === "blunt" ? "通常打撃" : "通常攻撃"; }
const hasNormalHitEffect = (weapon: RobotResolvedPart) => weapon.weaponFamily === "assault" || weapon.id === "binding-hammer";
function opposingTarget(s: RobotBattleCoreState, source: RobotBattleUnit, id: string): RobotBattleUnit {
  const target = getRobotBattleUnit(s, id);
  if (robotBattleIsAlly(source) === robotBattleIsAlly(target) || target.hp <= 0 || !target.position) throw new Error("Living opposing target required");
  return target;
}

/** Single-target unit choices for the connected normal weapons. Range and LOS
 * remain separate shared checks. This does not select/schedule an AI action or
 * define a targeting rule for a multi-cell facility.
 */
export function getRobotBattleNormalAttackOptions(s: RobotBattleCoreState, weaponId: string, policy: RobotBattleWeaponRules = {}) {
  const source = singleActor(s), { selection, weapon } = heldWeapon(source, weaponId), energyCost = getRobotNormalActionCost(selection, source.addons);
  if (hasNormalHitEffect(weapon)) getRobotNormalHitEffect(weapon.id);
  const blocked = !normalWeapons.has(weapon.id) ? normalUnavailable : getRobotActionEnergyBlock(source.energy, energyCost) ?? null;
  const targetIds = blocked ? [] : s.units.filter(target => {
    if (robotBattleIsAlly(source) === robotBattleIsAlly(target) || target.hp <= 0 || !target.position || !spatial(s, source, target, weapon, true).canReach) return false;
    getRobotBattlePostBaseModifiers(s, source, target, policy);
    return true;
  }).map(target => target.id);
  return { energyCost, range: weapon.range!, label: normalLabel(weapon), targetIds, disabledReason: blocked ?? (targetIds.length ? null : "合法な対象がいません（射程・射線を確認）") };
}

/** Equipped values and common damage/shield/EN/settlement only. Supports either
 * team's single robot; light-squad simultaneous attacks are a separate resolver.
 * Only the weapon actually used can produce sword recoil.
 */
export function commitRobotBattleNormalAttack(s: RobotBattleCoreState, input: Identity & {
  readonly weaponId: string; readonly targetId: string;
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = singleActor(s), { selection, weapon } = heldWeapon(source, input.weaponId);
  if (!normalWeapons.has(weapon.id)) throw new Error(normalUnavailable);
  const cost = getRobotNormalActionCost(selection, source.addons);
  if (getRobotActionEnergyBlock(source.energy, cost)) throw new Error(source.energy.lockedUntilOwnTurn === undefined ? "Insufficient EN" : getRobotActionEnergyBlock(source.energy, cost)!);
  const target = opposingTarget(s, source, input.targetId), attack = attackPacket(s, source, target, weapon, input.actionId + ":hit:1", 1, policy, defense(s, target), { normalAttack: true });
  if (hasNormalHitEffect(weapon)) getRobotNormalHitEffect(weapon.id);
  const attacks = [{ ...attack, ...(hasNormalHitEffect(weapon) ? { normalWeaponId: weapon.id } : {}) }];
  return commitRobotBattleBatch(s, { ...input, summary: summary(source, normalLabel(weapon), [target], attacks), members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: cost } }], attacks, ...(getRobotNormalPushDistance(weapon.id) ? { displacements: [{ sourceId: source.id, targetId: target.id, distance: getRobotNormalPushDistance(weapon.id) }] } : {}), swordUse: { attack: "normal", attackWeaponIds: [weapon.id] } });
}

const opposingUnits = (s: RobotBattleCoreState, source: RobotBattleUnit) => s.units.filter(u => robotBattleIsAlly(u) !== robotBattleIsAlly(source) && u.hp > 0 && u.position);
const inCells = (u: RobotBattleUnit, cells: readonly { readonly x: number; readonly y: number }[]) => cells.some(c => c.x === u.position!.x && c.y === u.position!.y);
function neighborSets(ids: readonly string[], cap: number): readonly (readonly string[])[] {
  const sets: string[][] = [[]];
  for (const id of ids) for (const subset of [...sets]) if (subset.length < cap) sets.push([...subset, id]);
  return sets;
}
/** Enemy center only; no action/EN until the final confirm. Secondary targets
 * use center adjacency and inherited source-ray LOS, without weapon range again.
 */
export function getRobotBattleBurstOptions(s: RobotBattleCoreState, weaponId: string, policy: RobotBattleWeaponRules = {}) {
  const source = singleActor(s), { selection, weapon } = heldWeapon(source, weaponId), plan = getRobotBlastPlan(selection), energyCost = getRobotNormalWeaponEnergyCost(selection);
  const centers = getRobotActionEnergyBlock(source.energy, energyCost) ? [] : opposingUnits(s, source).filter(c => spatial(s, source, c, weapon).canReach).map(center => {
    getRobotBattlePostBaseModifiers(s, source, center, policy);
    const areaCells = getRobotBlastFootprint({ weapon: selection, center: center.position!, board: s.board }).neighborCells;
    const neighbors = opposingUnits(s, source).filter(u => u.id !== center.id && inCells(u, areaCells) && neighborSpatial(s, source, u, center).canReach);
    neighbors.forEach(u => getRobotBattlePostBaseModifiers(s, source, u, policy));
    return { centerId: center.id, areaCells, neighborIds: neighbors.map(u => u.id), neighborSets: neighborSets(neighbors.map(u => u.id), plan.neighborTargetCap) };
  });
  return { plan, energyCost, centers, disabledReason: getRobotActionEnergyBlock(source.energy, energyCost) ?? (centers.length ? null : "合法な中心対象がいません（射程・射線を確認）") };
}
export function commitRobotBattleBurstAttack(s: RobotBattleCoreState, input: Identity & {
  readonly weaponId: string; readonly centerId: string; readonly neighborIds: readonly string[];
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = singleActor(s), { selection, weapon } = heldWeapon(source, input.weaponId), plan = getRobotBlastPlan(selection), center = opposingTarget(s, source, input.centerId);
  requireReachable(spatial(s, source, center, weapon));
  if (input.neighborIds.length > plan.neighborTargetCap || new Set(input.neighborIds).size !== input.neighborIds.length || input.neighborIds.includes(center.id)) throw new Error("Distinct blast neighbors within the adopted cap required");
  const area = getRobotBlastFootprint({ weapon: selection, center: center.position!, board: s.board }), neighbors = input.neighborIds.map(id => opposingTarget(s, source, id));
  if (neighbors.some(u => !inCells(u, area.neighborCells))) throw new Error("Target is outside this weapon's blast neighborhood");
  const targets = [center, ...neighbors], packets = targets.map((target, i) => attackPacket(s, source, target, weapon, input.actionId + ":hit:1", 1, policy, defense(s, target), { mode: i === 0 ? "burst-center" : "burst-neighbor", ...(i ? { center } : {}) }));
  const attacks = [{ ...packets[0]!, targets: packets.flatMap(p => p.targets) }];
  return commitRobotBattleBatch(s, { ...input, summary: summary(source, "爆撃", targets, attacks), members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: getRobotNormalWeaponEnergyCost(selection) } }], attacks });
}
function spreadPlan(source: RobotBattleUnit, primaryId: string, secondaryId: string) {
  const primary = heldWeapon(source, primaryId), secondary = heldWeapon(source, secondaryId), plan = getRobotWeaponComboPlan(primary.selection, secondary.selection);
  if (plan.kind !== "ranged-ranged") throw new Error("Different ranged weapon families required for spread shot");
  return { primary, secondary, plan };
}
function spreadTargets(s: RobotBattleCoreState, source: RobotBattleUnit, center: RobotBattleUnit) {
  const areaCells = getRobotAreaNeighborCells(s.board, center.position!, "8-neighborhood");
  return { areaCells, targets: [center, ...opposingUnits(s, source).filter(u => u.id !== center.id && inCells(u, areaCells) && neighborSpatial(s, source, u, center).canReach)] };
}
export function getRobotBattleSpreadOptions(s: RobotBattleCoreState, primaryId: string, secondaryId: string, policy: RobotBattleWeaponRules = {}) {
  const source = singleActor(s), { primary, plan } = spreadPlan(source, primaryId, secondaryId);
  const centers = getRobotActionEnergyBlock(source.energy, plan.energyCost) ? [] : opposingUnits(s, source).filter(c => spatial(s, source, c, primary.weapon).canReach).map(center => {
    const targets = spreadTargets(s, source, center).targets; targets.forEach(t => getRobotBattlePostBaseModifiers(s, source, t, policy));
    return { centerId: center.id, targetIds: targets.map(t => t.id) };
  });
  return { energyCost: plan.energyCost, centers, disabledReason: getRobotActionEnergyBlock(source.energy, plan.energyCost) ?? (centers.length ? null : "合法な中心対象がいません（射程・射線を確認）") };
}
/** One center input; complete automatic target set is recomputed, never accepted
 * as a client subset. Primary equipped ranged weapon supplies normal power/range.
 */
export function commitRobotBattleSpreadAttack(s: RobotBattleCoreState, input: Identity & {
  readonly primaryWeaponId: string; readonly secondaryWeaponId: string; readonly centerId: string;
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = singleActor(s), { primary, plan } = spreadPlan(source, input.primaryWeaponId, input.secondaryWeaponId);
  if (getRobotActionEnergyBlock(source.energy, plan.energyCost)) throw new Error(source.energy.lockedUntilOwnTurn === undefined ? "Insufficient EN" : getRobotActionEnergyBlock(source.energy, plan.energyCost)!);
  const center = opposingTarget(s, source, input.centerId); requireReachable(spatial(s, source, center, primary.weapon));
  const { targets, areaCells } = spreadTargets(s, source, center);
  const packets = targets.map(target => attackPacket(s, source, target, primary.weapon, input.actionId + ":hit:1", plan.uniformAreaNormalDamageMultiplier!, policy, defense(s, target), target.id === center.id ? {} : { center }));
  const attacks = [{ ...packets[0]!, effectKind: "special:spread-shot" as const, targets: packets.flatMap(p => p.targets) }];
  const after = commitRobotBattleBatch(s, { ...input, summary: summary(source, "拡散射撃", targets, attacks), members: [{ unitId: source.id, action: { kind: "other", energyCost: plan.energyCost } }], attacks });
  return decodeRobotBattleCore({ ...after, latest: { ...after.latest!, areaCells: [center.position!, ...areaCells] } });
}

/** Trusted choice projection; final execution repeats the same shared checks. */
export function getRobotBattleSweepOptions(s: RobotBattleCoreState, weaponId: string) {
  const source = controlledActor(s), { selection, weapon } = heldWeapon(source, weaponId), plan = getRobotSweepPlan(selection, source.addons ?? []);
  const eligible = s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0 && u.position && spatial(s, source, u, weapon).canReach).map(u => ({ id: u.id, position: u.position! }));
  return { plan, disabledReason: getRobotActionEnergyBlock(source.energy, plan.energyCost), targetSets: getRobotActionEnergyBlock(source.energy, plan.energyCost) ? [] : getRobotSweepTargetSets(source.position!, eligible, plan.targetCap) };
}

/** Complete controlled-actor command for 18 adopted family pairs. Uses equipped
 * values and common range/LOS/damage/EN/settlement; no caller-supplied damage/cost.
 * Impact still needs its push/collision resolver before it can commit.
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
  if (plan.kind === "ranged-ranged") {
    if (input.targetIds.length !== 1) throw new Error("One spread center is required; neighbors are automatic");
    return commitRobotBattleSpreadAttack(s, { ...input, centerId: input.targetIds[0]! }, policy);
  }
  if (plan.kind === "blunt-ranged") {
    if (input.targetIds.length !== 1) throw new Error("One impact target required");
    const target = hostileTargets(s, input.targetIds)[0]!, ranged = primary.weapon.weaponFamily === "blunt" ? secondary.weapon : primary.weapon;
    const packet = attackPacket(s, source, target, ranged, input.actionId + ":hit:1", plan.rangedNormalDamageMultiplier!, policy);
    return commitRobotBattleBatch(s, { ...input, summary: source.name + "：衝撃射撃", members: [{ unitId: source.id, action: { kind: "other", energyCost: plan.energyCost } }], attacks: [packet], displacements: [{ sourceId: source.id, targetId: target.id, distance: plan.pushDistance }] });
  }
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
  if (input.kind === "normal") {
    if (input.targetIds.length !== 1) throw new Error("Slash target cap exceeded");
    return commitRobotBattleNormalAttack(s, { ...input, targetId: input.targetIds[0]! }, policy);
  }
  const plan = getRobotSweepPlan(selection, source.addons ?? []), cap = plan.targetCap;
  if (!input.targetIds.length || input.targetIds.length > cap) throw new Error("Slash target cap exceeded");
  const targets = hostileTargets(s, input.targetIds);
  const checks = targets.map(target => { const check = spatial(s, source, target, weapon); requireReachable(check); return check; });
  if (input.kind === "sweep" && !isRobotSweepSelection(source.position!, targets.map(t => t.position!))) throw new Error("薙ぎ払いは同じ直交3マス帯の敵を選択してください。");
  const attacks = targets.map((target, index) => {
    const check = checks[index]!;
    const estimate = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: attackStats(s, source, target), targetDef: defense(s, target), mode: input.kind === "sweep" ? "sweep" : "normal" });
    const extra = getRobotBattlePostBaseModifiers(s, source, target, policy);
    return { id: input.actionId + ":hit:" + (index + 1), sourceId: source.id, effectKind: "slash" as const, targets: [{ entityId: target.id, cells: [target.position!], resolution: resolveRobotTargetDamage({ attackLegal: true, spatial: check, effect: { kind: "damaging", product: {base: estimate.baseDamage, factors: extra}, resolveAfterModifiers: () => floorRobotDamageProduct(estimate.baseDamage, extra) } }) }] };
  });
  return commitRobotBattleBatch(s, { ...input, summary: summary(source, input.kind === "sweep" ? "薙ぎ払い" : "通常斬撃", targets, attacks), members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: plan.energyCost } }], attacks, swordUse: { attack: input.kind, attackWeaponIds: [weapon.id] } });
}

/** Read-only ordinary-attack forecast for tactical AI. It shares equipped range,
 * LOS, normal-only modifiers, DEF and reduction math, without opening a turn or
 * consuming a resource. A forecast never becomes an executable attack receipt. */
/** Scoped to one planning pass; discard after equipment changes. */
export function createRobotNormalDamageForecast(source: RobotBattleUnit, weaponId: string) {
  const {selection,weapon}=heldWeapon(source,weaponId);
  return (s:RobotBattleCoreState,targetId:string):number|null=>{
    const current=getRobotBattleUnit(s,source.id);
    if(current.hp<=0||!current.position||current.statuses.length||!normalWeapons.has(weapon.id)||getRobotActionEnergyBlock(current.energy,getRobotNormalActionCost(selection,current.addons)))return null;
    const target=opposingTarget(s,current,targetId);
    if(!spatial(s,current,target,weapon,true).canReach)return null;
    const result=attackPacket(s,current,target,weapon,"forecast-only",1,{},defense(s,target),{normalAttack:true}).targets[0]!.resolution;
    return consumeRobotMark(s,current,target,result,new Set());
  };
}
/** Trusted NPC/shared-turn packet. Selection and actual commit use one legality path. */
export function getRobotBattleMemberNormalPacket(s: RobotBattleCoreState, unitId: string, weaponId: string, targetId: string, attackId: string) {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, unitId);
  if (!actor.unitIds.includes(unitId) || source.hp <= 0 || !source.position || source.energy.action !== null) throw new Error("Current living actor member required");
  const { selection, weapon } = heldWeapon(source, weaponId), energyCost = getRobotNormalActionCost(selection, source.addons);
  if (!normalWeapons.has(weapon.id) || getRobotActionEnergyBlock(source.energy, energyCost) || source.kind === "light" && energyCost > 0) throw new Error("Unavailable normal attack");
  const target = opposingTarget(s, source, targetId), packet = attackPacket(s, source, target, weapon, attackId, 1, {}, defense(s, target), { normalAttack: true });
  return { packet: { ...packet, ...(hasNormalHitEffect(weapon) ? { normalWeaponId: weapon.id } : {}) }, energyCost, displacement: getRobotNormalPushDistance(weapon.id) ? { sourceId: source.id, targetId: target.id, distance: getRobotNormalPushDistance(weapon.id) } : null };
}

/** Trusted special action packet: no normal-only recovery or modifiers. */
export function getRobotSpecialWeaponPacket(s: RobotBattleCoreState, weaponId: string, targetId: string, attackId: string, range: { min: number; max: number }, multiplier: number, mode: RobotWeaponDamageMode = "normal", centerId?: string, defenseMultiplier = 1) {
  const source = controlledActor(s), { weapon } = heldWeapon(source, weaponId), target = opposingTarget(s, source, targetId);
  return attackPacket(s, source, target, { ...weapon, range }, attackId, multiplier, {}, defense(s, target) * defenseMultiplier, { mode, ...(centerId ? { center: getRobotBattleUnit(s, centerId) } : {}) });
}

export function getRobotNormalPushDistance(weaponId: string): number {
  const effect = basicParts.parts.find(p => p.id === weaponId)?.builtInEffect as unknown as { kind?: string; distance?: number } | undefined;
  return effect?.kind === "push-on-hit" ? effect.distance! : 0;
}

/** The same base-floor and defense/shield path as ordinary burst. Empty centers
 * carry geometry only; they never become damage targets or minimum-one hits. */
export function getRobotBattleBlastPacket(s: RobotBattleCoreState, weaponId: string, targetId: string, attackId: string, mode: "burst-center" | "burst-neighbor", center: { readonly x: number; readonly y: number }) {
  const source = singleActor(s), { weapon } = heldWeapon(source, weaponId), target = opposingTarget(s, source, targetId);
  return attackPacket(s, source, target, weapon, attackId, 1, {}, defense(s, target), { mode, ...(mode === "burst-neighbor" ? { center: { position: center } } : {}) });
}

/** Residual fire uses full ordinary damage as its 50%/30% basis. */
export function getRobotHazardBlastPacket(s:RobotBattleCoreState,weaponId:string,targetId:string,attackId:string,center:RobotPosition,neighbor:boolean){const source=singleActor(s),{weapon}=heldWeapon(source,weaponId),target=opposingTarget(s,source,targetId);return attackPacket(s,source,target,weapon,attackId,neighbor?.3:.5,{},defense(s,target),neighbor?{center:{position:center}}:{});}
