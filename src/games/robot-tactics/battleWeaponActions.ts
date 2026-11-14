import { getRobotBattleNormalFacilityPacket, getRobotBattleNormalFacilityTargets } from "./battleFacilityActions";
import { getRobotHostileFacilities } from "./specialFacilityTargets";
import { getRobotFacilityDefense } from "./facilityEffects";
import { resolveRobotFacilityDamage } from "./facilityDefense";
import type { RobotPosition } from "./movement";
import { consumeRobotMark } from "./adoptedEffects";
import { getRobotActionEnergyBlock } from "./energy";
import basicParts from "../../../docs/design/robot-tactics/basic-parts.json";
import { getRobotBattleDefense, getRobotDamageFactors, getRobotTacticalCommandFactor, hasRobotAddon, recordRobotAdaptation } from "./battleEffects";
import { getRobotCombatWeapon, getRobotNormalActionCost, getRobotNormalAttackStatBonus, getRobotUnitNormalFinisherFactor, getRobotRetargetingFactor, robotIgnoresNormalSight } from "./combatAddons";
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, getRobotAttackBlockReasonText, resolveRobotTargetDamage, type RobotAttackSpatialCheck } from "./attackResolution";
import { floorRobotDamageProduct, getRobotEffectiveDefense, getRobotWeaponDamageEstimate, type RobotWeaponDamageMode } from "./combatMath";
import { resolveRobotBasicPart, type RobotPartSelection, type RobotResolvedPart } from "./equipment";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "./battleBatch";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { getRobotNormalWeaponEnergyCost, getRobotPiercingComboDefense, getRobotWeaponComboPlan, resolveRobotTwoWeaponHits } from "./weaponActions";
import { getRobotSweepBands, getRobotSweepPlan, getRobotSweepTargetSets } from "./sweep";
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
function controlledActor(s: RobotBattleCoreState, allowFriendly = false): RobotBattleUnit {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (actor.unitIds.length !== 1 || (source.kind !== "controlled" && !(allowFriendly && source.kind === "friendly-ai")) || source.hp <= 0 || !source.position || source.energy.action !== null) throw new Error("Weapon command resolver is connected only for the current controlled actor");
  return source;
}
function heldWeapon(source: RobotBattleUnit, id: string): { selection: RobotPartSelection; weapon: RobotResolvedPart } {
  const selections = source.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon");
  if (selections.length !== (source.kind === "light" ? 1 : 2) || new Set(selections.map(p => p.partId)).size !== selections.length) throw new Error("A trusted two-weapon build is required");
  const selection = selections.find(p => p.partId === id); if (!selection) throw new Error("Selected weapon is not equipped by acting robot");
  return { selection, weapon: getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level), source.addons) };
}
function spatial(s: RobotBattleCoreState, source: RobotBattleUnit, target: Pick<RobotBattleUnit, "position">, weapon: RobotResolvedPart, normal = false): RobotAttackSpatialCheck {
  const result = checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: target.position!, min: weapon.range!.min, max: weapon.range!.max }), sight: { board: s.board, origin: source.position!, target: target.position! } });
  return normal && robotIgnoresNormalSight(weapon, source.addons) && result.reason === "line-of-sight-blocked" ? { canReach: true, reason: "clear", sight: null } : result;
}
function requireReachable(check: RobotAttackSpatialCheck): void { if (!check.canReach) throw new Error(getRobotAttackBlockReasonText(check)!); }
export function getRobotBattlePostBaseModifiers(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, policy: RobotBattleWeaponRules = {}) {
  if (!policy.postBaseMultipliers && (source.statuses.length || target.statuses.length)) throw new Error("Active status damage resolver required");
  if (target.shielded && target.statuses.length) throw new Error("Shield/status composition is not yet connected");
  return [...getRobotDamageFactors(target), ...(policy.postBaseMultipliers?.(s, source, target) ?? [])];
}
function attackStats(s: RobotBattleCoreState, source: RobotBattleUnit, target: { id: string }) {
  const bonus = getRobotBattleCommandBonus(s, source.id, target.id), stats = getRobotBattleEffectiveStats(source);
  return { melee: stats.melee + bonus.melee, ranged: stats.ranged + bonus.ranged };
}
function defense(s: RobotBattleCoreState, target: RobotBattleUnit) { return getRobotBattleDefense(s, target); }
/** A blast reaches its chosen impact through normal weapon LOS. Once it lands,
 * splash damage spreads by the weapon footprint, without another ray from the
 * attacking robot to each secondary target (including those behind a wall).
 * This check is only for splash; never use it for direct/normal hits.
 */
function neighborSpatial(target: RobotBattleUnit, center: Pick<RobotBattleUnit, "position">): RobotAttackSpatialCheck {
  const range = checkRobotAttackRange({ origin: center.position!, target: target.position!, min: 1, max: 1 });
  return range.status === "in-range"
    ? { canReach: true, reason: "clear", sight: null }
    : { canReach: false, reason: "out-of-range", sight: null };
}
function attackPacket(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, weapon: RobotResolvedPart, id: string, multiplier: number, policy: RobotBattleWeaponRules, targetDef = defense(s, target), options: { readonly mode?: RobotWeaponDamageMode; readonly center?: Pick<RobotBattleUnit, "position">; readonly normalAttack?: boolean; readonly normalArea?: boolean } = {}): RobotBattleResolvedAttack {
  const check = options.center ? neighborSpatial(target, options.center) : spatial(s, source, target, weapon, options.normalAttack); requireReachable(check);
  const base = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: Object.fromEntries(Object.entries(attackStats(s, source, target)).map(([k, v]) => [k, v + (options.normalAttack ? getRobotNormalAttackStatBonus(source.addons) : 0)])) as { melee: number; ranged: number }, targetDef, mode: options.mode ?? "normal" }).baseDamage;
  const finisher = options.normalAttack || options.normalArea ? getRobotUnitNormalFinisherFactor(target.hp, target.maxHp, source.addons, options.normalArea) : 1;
  const retargeting = options.normalAttack || options.normalArea ? getRobotRetargetingFactor(weapon, source.energy.moved, source.addons) : 1;
  const command = options.normalAttack || options.normalArea ? getRobotTacticalCommandFactor(s, source) : 1;
  const factors = [multiplier, finisher, retargeting, command, ...getRobotBattlePostBaseModifiers(s, source, target, policy)];
  const resolution = resolveRobotTargetDamage({ attackLegal: true, spatial: check, effect: { kind: "damaging", product: { base, factors }, resolveAfterModifiers: () => floorRobotDamageProduct(base, factors) } });
  return { id, sourceId: source.id, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"], targets: [{ entityId: target.id, cells: [target.position!], resolution }] };
}
function summary(source: RobotBattleUnit, label: string, targets: readonly { name: string }[], attacks: readonly RobotBattleResolvedAttack[]): string {
  return source.name + "：" + label + " → " + targets.map(t => t.name).join("・") + "、" + attacks.flatMap(a => a.targets.map(t => t.resolution.damage)).join("＋") + "ダメージ";
}

// Connection capabilities, not a replacement catalogue. Other weapons must
// connect their normal-only effects before exposing a normal command. Blast
// normal attacks are explicitly single-target; the burst is a separate action.
const normalWeapons = new Set(["overdrive-saber", "dual-burst-rifle", "fortress-mace", "aether-rail-cannon", "accel-lancer", "meteor-buster", "plasma-blade", "impact-breaker", "phase-lance", "pulse-assault", "linear-sniper", "cluster-cannon", "light-blade", "standard-sword", "whirlwind-saber", "double-edged-sword", "light-lance", "lance", "armor-pile", "sniper-rifle", "precision-rifle", "superheavy-railgun", "light-pistol", "assault-rifle", "corrosion-rifle", "emp-carbine", "suppression-mace", "heavy-hammer", "quake-hammer", "binding-hammer", "light-grenade-launcher", "howitzer", "heavy-missile-cannon", "wide-grenade-cannon"]);
export const isRobotBattleNormalWeaponConnected = (weaponId: string): boolean => normalWeapons.has(weaponId);
const normalUnavailable = "この武器の通常攻撃効果は未接続です";
function normalLabel(weapon: RobotResolvedPart): string { return weapon.weaponFamily === "slash" ? "通常斬撃" : weapon.weaponFamily === "thrust" ? "通常刺突" : weapon.weaponFamily === "sniper" ? "通常狙撃" : weapon.weaponFamily === "assault" ? "通常射撃" : weapon.weaponFamily === "blunt" ? "通常打撃" : "通常攻撃"; }
export function hasRobotNormalHitEffect(weapon: RobotResolvedPart): boolean {
  const effect = basicParts.parts.find(p => p.id === weapon.id)?.builtInEffect?.kind;
  return effect === "on-hit-debuff" || effect === "on-hit-energy-drain" || effect === "on-hit-suppress-reaction-attacks";
}
export const getRobotNormalDefenseFactor = (source: RobotBattleUnit, weaponId: string): number =>
  weaponId === "linear-sniper" && !source.energy.moved && !source.energy.usedExtraMove ? .85 : 1;
export function getRobotNormalWeaponBurns(s: RobotBattleCoreState, source: RobotBattleUnit, weaponId: string, attacks: readonly RobotBattleResolvedAttack[]) {
  return weaponId === "plasma-blade" && source.coreLevel !== undefined
    ? attacks.flatMap(a => a.targets.filter(t => t.resolution.reason === "hit" && !s.decoys?.some(d => d.id === t.entityId)).map(t => ({ sourceId: source.id, targetId: t.entityId })))
    : [];
}
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
  if (hasRobotNormalHitEffect(weapon)) getRobotNormalHitEffect(weapon.id);
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
  const target = opposingTarget(s, source, input.targetId), attack = attackPacket(s, source, target, weapon, input.actionId + ":hit:1", 1, policy, defense(s, target) * getRobotNormalDefenseFactor(source, weapon.id), { normalAttack: true });
  if (hasRobotNormalHitEffect(weapon)) getRobotNormalHitEffect(weapon.id);
  const attacks = [{ ...attack, ...(hasRobotNormalHitEffect(weapon) ? { normalWeaponId: weapon.id } : {}) }];
  return commitRobotBattleBatch(s, { ...input, summary: summary(source, normalLabel(weapon), [target], attacks), members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: cost } }], attacks, burns: getRobotNormalWeaponBurns(s, source, weapon.id, attacks), ...(weapon.weaponFamily === "blunt" ? { displacements: [{ sourceId: source.id, targetId: target.id, distance: 1, normalBlunt: true }] } : {}), swordUse: { attack: "normal", attackWeaponIds: [weapon.id] } });
}

const opposingUnits = (s: RobotBattleCoreState, source: RobotBattleUnit) => s.units.filter(u => robotBattleIsAlly(u) !== robotBattleIsAlly(source) && u.hp > 0 && u.position);
function neighborSets(ids: readonly string[], cap: number): readonly (readonly string[])[] {
  const sets: string[][] = [[]];
  for (const id of ids) for (const subset of [...sets]) if (subset.length < cap) sets.push([...subset, id]);
  return sets;
}
/** Enemy center only; no action/EN until the final confirm. Secondary targets
 * use the weapon's impact-footprint geometry, not a second source-ray LOS
 * or a second check against the firing weapon's max range.
 */
export function getRobotBattleBurstOptions(s: RobotBattleCoreState, weaponId: string, policy: RobotBattleWeaponRules = {}) {
  const source = singleActor(s), { selection, weapon } = heldWeapon(source, weaponId), plan = getRobotBlastPlan(selection), energyCost = getRobotNormalWeaponEnergyCost(selection);
  const targets = comboTargets(s, source);
  const centers = getRobotActionEnergyBlock(source.energy, energyCost) ? [] : targets.flatMap(center => {
    const cell = directComboCell(s, source, center, weapon);
    if (!cell) return [];
    const areaCells = getRobotBlastFootprint({ weapon: selection, center: cell, board: s.board }).neighborCells;
    const neighborhood = spreadTargets(targets, center, cell, areaCells);
    neighborhood.forEach(({ target }) => { if (target.unit) getRobotBattlePostBaseModifiers(s, source, target.unit, policy); });
    const neighborIds = neighborhood.slice(1).map(({ target }) => target.id);
    return [{ centerId: center.id, areaCells, neighborIds, neighborSets: neighborSets(neighborIds, plan.neighborTargetCap) }];
  });
  return { plan, energyCost, centers, disabledReason: getRobotActionEnergyBlock(source.energy, energyCost) ?? (centers.length ? null : "合法な中心対象がいません（射程・射線を確認）") };
}
export function commitRobotBattleBurstAttack(s: RobotBattleCoreState, input: Identity & {
  readonly weaponId: string; readonly centerId: string; readonly neighborIds: readonly string[];
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = singleActor(s), { selection } = heldWeapon(source, input.weaponId);
  const packets = getRobotBattleBurstPackets(s, input.weaponId, input.centerId, input.neighborIds, input.actionId + ":hit:1", 1, policy, true);
  const targets = comboTargets(s, source).filter(t => [input.centerId, ...input.neighborIds].includes(t.id));
  const attacks = [{ ...packets[0]!, targets: packets.flatMap(p => p.targets) }];
  return commitRobotBattleBatch(s, { ...input, summary: summary(source, "爆撃", targets, attacks), members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: getRobotNormalWeaponEnergyCost(selection) } }], attacks });
}
/** Legacy blast selections and the burn add-on share the same footprint. */
export function getRobotBattleBurstPackets(s: RobotBattleCoreState, weaponId: string, centerId: string,
  neighborIds: readonly string[], attackId: string, multiplier: number, policy: RobotBattleWeaponRules = {}, normalArea = false) {
  const source = singleActor(s), { selection, weapon } = heldWeapon(source, weaponId), plan = getRobotBlastPlan(selection);
  if (neighborIds.length > plan.neighborTargetCap || new Set(neighborIds).size !== neighborIds.length || neighborIds.includes(centerId))
    throw new Error("Distinct blast neighbors within the adopted cap required");
  const candidates = comboTargets(s, source), center = candidates.find(t => t.id === centerId);
  if (!center) throw new Error("Living hostile target required");
  const cell = directComboCell(s, source, center, weapon);
  if (!cell) {
    requireReachable(spatial(s, source, { position: center.cells[0]! }, weapon));
    throw new Error("Legal blast center required");
  }
  const area = getRobotBlastFootprint({ weapon: selection, center: cell, board: s.board }).neighborCells;
  const neighborhood = spreadTargets(candidates, center, cell, area);
  return [centerId, ...neighborIds].map((id, index) => {
    if (!candidates.some(t => t.id === id)) throw new Error("Living hostile target required");
    const hit = neighborhood.find(h => h.target.id === id);
    if (!hit) throw new Error("Target is outside this weapon's blast neighborhood");
    return comboPacket(s, source, hit.target, weapon, attackId, multiplier, policy, hit.target.def, hit.cells,
      index === 0 ? "burst-center" : "burst-neighbor", undefined, normalArea);
  });
}
function spreadPlan(source: RobotBattleUnit, primaryId: string, secondaryId: string) {
  const primary = heldWeapon(source, primaryId), secondary = heldWeapon(source, secondaryId), plan = getRobotWeaponComboPlan(primary.selection, secondary.selection);
  if (plan.kind !== "ranged-ranged") throw new Error("Different ranged weapon families required for spread shot");
  return { primary, secondary, plan };
}
type ComboTarget = { id: string; name: string; hp: number; cells: readonly RobotPosition[]; unit?: RobotBattleUnit; def: number };
function comboTargets(s: RobotBattleCoreState, source: RobotBattleUnit): ComboTarget[] {
  return [
    ...opposingUnits(s, source).map(unit => ({ id: unit.id, name: unit.name, hp: unit.hp, cells: [unit.position!], unit, def: defense(s, unit) })),
    ...getRobotHostileFacilities(s, source.id).map(o => ({ id: o.id, name: o.id, hp: o.hp, cells: o.cells, def: getRobotFacilityDefense(s, o) })),
  ];
}
function directComboCell(s: RobotBattleCoreState, source: RobotBattleUnit, target: ComboTarget, weapon: RobotResolvedPart) {
  return target.cells.find(position => spatial(s, source, { position }, weapon).canReach);
}
function comboPacket(s: RobotBattleCoreState, source: RobotBattleUnit, target: ComboTarget, weapon: RobotResolvedPart,
  id: string, multiplier: number, policy: RobotBattleWeaponRules, targetDef = target.def,
  cells?: readonly RobotPosition[], mode: RobotWeaponDamageMode = "normal", baseOverride?: number, normalArea = false): RobotBattleResolvedAttack {
  const cell = cells?.[0] ?? directComboCell(s, source, target, weapon);
  if (!cell) requireReachable(spatial(s, source, { position: target.cells[0]! }, weapon));
  if (target.unit && !cells) return attackPacket(s, source, target.unit, weapon, id, multiplier, policy, targetDef);
  const base = baseOverride ?? getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: attackStats(s, source, target), targetDef, mode }).baseDamage;
  const finisher = target.unit && normalArea ? getRobotUnitNormalFinisherFactor(target.unit.hp, target.unit.maxHp, source.addons, true) : 1;
  const retargeting = normalArea ? getRobotRetargetingFactor(weapon, source.energy.moved, source.addons) : 1;
  const command = normalArea ? getRobotTacticalCommandFactor(s, source) : 1;
  const factors = [multiplier, finisher, retargeting, command, ...(target.unit ? getRobotBattlePostBaseModifiers(s, source, target.unit, policy) : [])];
  return { id, sourceId: source.id, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"],
    targets: [{ entityId: target.id, cells: cells ?? [cell!], resolution: resolveRobotTargetDamage({ attackLegal: true,
      spatial: { canReach: true, reason: "clear", sight: null },
      effect: { kind: "damaging", product: { base, factors }, resolveAfterModifiers: () => floorRobotDamageProduct(base, factors) },
    }) }] };
}
function spreadTargets(targets: readonly ComboTarget[], center: ComboTarget, centerCell: RobotPosition, area: readonly RobotPosition[]) {
  return [{ target: center, cells: [centerCell] }, ...targets.filter(t => t.id !== center.id).flatMap(target => {
    const cells = target.cells.filter(c => area.some(a => a.x === c.x && a.y === c.y));
    return cells.length ? [{ target, cells }] : [];
  })];
}
export function getRobotBattleSpreadOptions(s: RobotBattleCoreState, primaryId: string, secondaryId: string, policy: RobotBattleWeaponRules = {}) {
  const source = singleActor(s), { primary, plan } = spreadPlan(source, primaryId, secondaryId);
  const targets = comboTargets(s, source);
  const centers = getRobotActionEnergyBlock(source.energy, plan.energyCost) ? [] : targets.flatMap(center => {
    const cell = directComboCell(s, source, center, primary.weapon);
    if (!cell) return [];
    const area = getRobotAreaNeighborCells(s.board, cell, "8-neighborhood");
    const targetsInArea = spreadTargets(targets, center, cell, area);
    targetsInArea.forEach(({ target }) => { if (target.unit) getRobotBattlePostBaseModifiers(s, source, target.unit, policy); });
    return [{ centerId: center.id, targetIds: targetsInArea.map(({ target }) => target.id) }];
  });
  return { energyCost: plan.energyCost, centers, disabledReason: getRobotActionEnergyBlock(source.energy, plan.energyCost) ?? (centers.length ? null : "合法な中心対象がいません（射程・射線を確認）") };
}
/** One center input; complete automatic target set is recomputed. */
export function commitRobotBattleSpreadAttack(s: RobotBattleCoreState, input: Identity & {
  readonly primaryWeaponId: string; readonly secondaryWeaponId: string; readonly centerId: string;
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = singleActor(s), { primary, plan } = spreadPlan(source, input.primaryWeaponId, input.secondaryWeaponId);
  if (getRobotActionEnergyBlock(source.energy, plan.energyCost)) throw new Error(source.energy.lockedUntilOwnTurn === undefined ? "Insufficient EN" : getRobotActionEnergyBlock(source.energy, plan.energyCost)!);
  const candidates = comboTargets(s, source), center = candidates.find(t => t.id === input.centerId);
  const cell = center && directComboCell(s, source, center, primary.weapon);
  if (!center || !cell) throw new Error("Legal spread center required");
  const areaCells = getRobotAreaNeighborCells(s.board, cell, "8-neighborhood");
  const targets = spreadTargets(candidates, center, cell, areaCells);
  const packets = targets.map(({ target, cells }) => comboPacket(s, source, target, primary.weapon,
    input.actionId + ":hit:1", plan.uniformAreaNormalDamageMultiplier!, policy, target.def, cells));
  const attacks = [{ ...packets[0]!, effectKind: "special:spread-shot" as const, adaptationFamily: primary.weapon.weaponFamily!, targets: packets.flatMap(p => p.targets) }];
  const after = commitRobotBattleBatch(s, { ...input, summary: summary(source, "拡散射撃", targets.map(t => t.target), attacks), members: [{ unitId: source.id, action: { kind: "other", energyCost: plan.energyCost } }], attacks });
  return decodeRobotBattleCore({ ...after, latest: { ...after.latest!, areaCells: [cell, ...areaCells] } });
}

/** Trusted choice projection; final execution repeats the same shared checks. */
export function getRobotBattleSweepOptions(s: RobotBattleCoreState, weaponId: string) {
  const source = controlledActor(s, true), { selection, weapon } = heldWeapon(source, weaponId), plan = getRobotSweepPlan(selection, source.addons ?? []);
  const sets = new Map<string, readonly string[]>();
  const targets = comboTargets(s, source);
  for (const band of getRobotSweepBands(source.position!)) {
    const eligible = targets.flatMap(t => {
      const position = t.cells.find(c => band.some(p => p.x === c.x && p.y === c.y) && spatial(s, source, { position: c }, weapon).canReach);
      return position ? [{ id: t.id, position }] : [];
    });
    for (const ids of getRobotSweepTargetSets(source.position!, eligible, plan.targetCap)) sets.set(JSON.stringify([...ids].sort()), ids);
  }
  return { plan, disabledReason: getRobotActionEnergyBlock(source.energy, plan.energyCost),
    targetSets: getRobotActionEnergyBlock(source.energy, plan.energyCost) ? [] : [...sets.values()] };
}

/** Legal AI combo candidates reuse the execution resolver's target geometry. */
export function getRobotBattleNpcComboTargets(s: RobotBattleCoreState, primaryId: string, secondaryId: string): readonly (readonly string[])[] {
  const source = controlledActor(s, true), primary = heldWeapon(source, primaryId), secondary = heldWeapon(source, secondaryId);
  const plan = getRobotWeaponComboPlan(primary.selection, secondary.selection);
  if (getRobotActionEnergyBlock(source.energy, plan.energyCost)) return [];
  const targets = comboTargets(s, source);
  const reachable = (weapon: RobotResolvedPart) => targets.filter(t => directComboCell(s, source, t, weapon)).map(t => t.id);
  if (plan.kind === "slash-ranged") {
    const [slash, ranged] = primary.weapon.weaponFamily === "slash" ? [primary.weapon, secondary.weapon] : [secondary.weapon, primary.weapon];
    const rangedIds = reachable(ranged);
    return reachable(slash).flatMap(id => rangedIds.filter(other => other !== id).map(other => [id, other]));
  }
  if (plan.kind === "melee-melee") {
    const second = new Set(reachable(secondary.weapon));
    return reachable(primary.weapon).filter(id => second.has(id)).map(id => [id]);
  }
  const ranged = plan.kind === "blunt-ranged" || plan.kind === "thrust-ranged"
    ? [primary.weapon, secondary.weapon].find(w => ["assault", "sniper", "blast"].includes(w.weaponFamily!))!
    : primary.weapon;
  return reachable(ranged).map(id => [id]);
}

/** Complete allied-actor command for adopted family pairs. Uses equipped
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
  const source = controlledActor(s, true), primary = heldWeapon(source, input.primaryWeaponId), secondary = heldWeapon(source, input.secondaryWeaponId);
  const plan = getRobotWeaponComboPlan(primary.selection, secondary.selection);
  if (plan.kind === "ranged-ranged") {
    if (input.targetIds.length !== 1) throw new Error("One spread center is required; neighbors are automatic");
    return commitRobotBattleSpreadAttack(s, { ...input, centerId: input.targetIds[0]! }, policy);
  }
  if (input.targetIds.length !== (plan.kind === "slash-ranged" ? 2 : 1)) throw new Error("Wrong number of combo targets");
  if (new Set(input.targetIds).size !== input.targetIds.length) throw new Error("Distinct combo target IDs required");
  const candidates = comboTargets(s, source);
  const targets = input.targetIds.map(id => {
    const target = candidates.find(t => t.id === id);
    if (!target) throw new Error("Living hostile combo target required");
    return target;
  });
  const attacks: RobotBattleResolvedAttack[] = [], first = targets[0]!;
  const packet = (target: ComboTarget, weapon: RobotResolvedPart, index: number, multiplier: number, def = target.def) =>
    comboPacket(s, source, target, weapon, input.actionId + ":hit:" + index, multiplier, policy, def);
  if (plan.kind === "blunt-ranged") {
    const ranged = primary.weapon.weaponFamily === "blunt" ? secondary.weapon : primary.weapon;
    return commitRobotBattleBatch(s, { ...input, summary: source.name + "：衝撃射撃",
      members: [{ unitId: source.id, action: { kind: "other", energyCost: plan.energyCost } }],
      attacks: [packet(first, ranged, 1, plan.rangedNormalDamageMultiplier!)],
      ...(first.unit ? { displacements: [{ sourceId: source.id, targetId: first.id, distance: plan.pushDistance }] } : {}),
    });
  }
  if (plan.kind === "melee-melee") {
    const weapons = [primary.weapon, secondary.weapon] as const;
    const cells = weapons.map(w => directComboCell(s, source, first, w));
    const checks = weapons.map((w, i) => spatial(s, source, { position: cells[i] ?? first.cells[0]! }, w)) as unknown as readonly [RobotAttackSpatialCheck, RobotAttackSpatialCheck];
    requireReachable(checks[0]);
    const consumed = new Set<string>();
    let adaptedFamilies = first.unit?.adaptedWeaponFamilies;
    const result = resolveRobotTwoWeaponHits({ primary: primary.selection, secondary: secondary.selection,
      attackStat: attackStats(s, source, first).melee, targetDef: first.def, targetHp: first.hp, spatial: checks,
      multipliers: first.unit ? getRobotBattlePostBaseModifiers(s, source, first.unit, policy) : [],
      ...(!first.unit ? { damageForHp: (resolution: Parameters<typeof consumeRobotMark>[3]) => resolveRobotFacilityDamage(s, first.id,
        consumeRobotMark(s, source, { id: first.id, tacticalMark: s.facilityMarks?.[first.id] }, resolution, consumed)) } :
        hasRobotAddon(first.unit, "tactical-adaptation-unit") ? { damageForHp: (resolution: Parameters<typeof consumeRobotMark>[3], index: number) => {
          const family = weapons[index]!.weaponFamily!;
          const damage = consumeRobotMark(s, source, first.unit, resolution, consumed, adaptedFamilies?.includes(family));
          if (damage > 0) adaptedFamilies = recordRobotAdaptation(adaptedFamilies, family);
          return damage;
        } } : {}),
    });
    for (const [index, hit] of result.hits.entries()) {
      requireReachable(checks[index]!);
      attacks.push({ id: input.actionId + ":hit:" + (index + 1), sourceId: source.id,
        effectKind: weapons[index]!.weaponFamily as RobotBattleResolvedAttack["effectKind"],
        targets: [{ entityId: first.id, cells: [cells[index]!], resolution: hit.resolution }] });
    }
  } else if (plan.kind === "same-family") {
    attacks.push(packet(first, primary.weapon, 1, plan.sameFamilyNormalDamageMultiplier!));
  } else if (plan.kind === "slash-ranged") {
    const slash = primary.weapon.weaponFamily === "slash" ? primary.weapon : secondary.weapon;
    const ranged = slash === primary.weapon ? secondary.weapon : primary.weapon;
    attacks.push(packet(first, slash, 1, plan.slashNormalDamageMultiplier!));
    attacks.push(packet(targets[1]!, ranged, 2, plan.rangedNormalDamageMultiplier!));
  } else {
    const ranged = primary.weapon.weaponFamily === "thrust" ? secondary.weapon : primary.weapon;
    attacks.push(packet(first, ranged, 1, plan.rangedNormalDamageMultiplier!, getRobotPiercingComboDefense(first.def)));
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
  const source = controlledActor(s, true), { selection, weapon } = heldWeapon(source, input.weaponId);
  if (weapon.weaponFamily !== "slash" || !["normal", "sweep"].includes(input.kind)) throw new Error("Slash normal/sweep command required");
  if (input.kind === "normal") {
    if (input.targetIds.length !== 1) throw new Error("Slash target cap exceeded");
    return commitRobotBattleNormalAttack(s, { ...input, targetId: input.targetIds[0]! }, policy);
  }
  const plan = getRobotSweepPlan(selection, source.addons ?? []), cap = plan.targetCap;
  if (!input.targetIds.length || input.targetIds.length > cap) throw new Error("Slash target cap exceeded");
  if (new Set(input.targetIds).size !== input.targetIds.length) throw new Error("Distinct sweep target IDs required");
  const candidates = comboTargets(s, source);
  const targets = input.targetIds.map(id => {
    const target = candidates.find(t => t.id === id);
    if (!target) throw new Error("Living hostile target required");
    return target;
  });
  for (const target of targets) {
    const checks = target.cells.map(position => spatial(s, source, { position }, weapon));
    if (!checks.some(check => check.canReach)) requireReachable(checks[0]!);
  }
  const cells = getRobotSweepBands(source.position!).map(band => targets.map(t => t.cells.find(c =>
    band.some(p => p.x === c.x && p.y === c.y) && spatial(s, source, { position: c }, weapon).canReach))).find(c => c.every(Boolean));
  if (!cells) throw new Error("薙ぎ払いは同じ直交3マス帯の敵を選択してください。");
  const attacks = targets.map((target, index) => comboPacket(s, source, target, weapon,
    input.actionId + ":hit:" + (index + 1), 1, policy, target.def, [cells[index]!], "sweep", undefined, true));
  return commitRobotBattleBatch(s, { ...input, summary: summary(source, input.kind === "sweep" ? "薙ぎ払い" : "通常斬撃", targets, attacks), members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: plan.energyCost } }], attacks, burns: getRobotNormalWeaponBurns(s, source, weapon.id, attacks), swordUse: { attack: input.kind, attackWeaponIds: [weapon.id] } });
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
    const result=attackPacket(s,current,target,weapon,"forecast-only",1,{},defense(s,target) * getRobotNormalDefenseFactor(current, weapon.id),{normalAttack:true}).targets[0]!.resolution;
    return consumeRobotMark(s,current,target,result,new Set(),target.adaptedWeaponFamilies?.includes(weapon.weaponFamily!));
  };
}
/** Trusted NPC/shared-turn packet. Selection and actual commit use one legality path. */
export function getRobotBattleMemberNormalPacket(s: RobotBattleCoreState, unitId: string, weaponId: string, targetId: string, attackId: string) {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, unitId);
  if (!actor.unitIds.includes(unitId) || source.hp <= 0 || !source.position || source.energy.action !== null) throw new Error("Current living actor member required");
  const { selection, weapon } = heldWeapon(source, weaponId), energyCost = getRobotNormalActionCost(selection, source.addons);
  if (!normalWeapons.has(weapon.id) || getRobotActionEnergyBlock(source.energy, energyCost) || source.kind === "light" && energyCost > 0) throw new Error("Unavailable normal attack");
  const target = opposingTarget(s, source, targetId), packet = attackPacket(s, source, target, weapon, attackId, 1, {}, defense(s, target) * getRobotNormalDefenseFactor(source, weapon.id), { normalAttack: true });
  return { packet: { ...packet, ...(hasRobotNormalHitEffect(weapon) ? { normalWeaponId: weapon.id } : {}) }, energyCost, displacement: weapon.weaponFamily === "blunt" ? { sourceId: source.id, targetId: target.id, distance: 1, normalBlunt: true as const } : null };
}

/** Trusted special action packet: no normal-only recovery or modifiers. */
export function getRobotSpecialWeaponPacket(s: RobotBattleCoreState, weaponId: string, targetId: string, attackId: string, range: { min: number; max: number }, multiplier: number, mode: RobotWeaponDamageMode = "normal", centerId?: string, defenseMultiplier = 1) {
  const source = controlledActor(s, true), { weapon } = heldWeapon(source, weaponId), target = opposingTarget(s, source, targetId);
  return attackPacket(s, source, target, { ...weapon, range }, attackId, multiplier, {}, defense(s, target) * defenseMultiplier, { mode, ...(centerId ? { center: getRobotBattleUnit(s, centerId) } : {}) });
}

export function getRobotBuiltInPushDistance(weaponId: string): number {
  const effect = basicParts.parts.find(p => p.id === weaponId)?.builtInEffect as unknown as { kind?: string; distance?: number } | undefined;
  return effect?.kind === "push-on-hit" ? effect.distance! : 0;
}

/** The same base-floor and defense/shield path as ordinary burst. Empty centers
 * carry geometry only; they never become damage targets or minimum-one hits. */
export function getRobotBattleBlastPacket(s: RobotBattleCoreState, weaponId: string, targetId: string, attackId: string, mode: "burst-center" | "burst-neighbor", center: RobotPosition, normalArea = true) {
  const source = singleActor(s), { weapon } = heldWeapon(source, weaponId), target = opposingTarget(s, source, targetId);
  return attackPacket(s, source, target, weapon, attackId, 1, {}, defense(s, target), { mode, normalArea, ...(mode === "burst-neighbor" ? { center: { position: center } } : {}) });
}

/** Residual fire uses full ordinary damage as its 50%/30% basis. */
export function getRobotHazardBlastPacket(s:RobotBattleCoreState,weaponId:string,targetId:string,attackId:string,center:RobotPosition,neighbor:boolean){const source=singleActor(s),{weapon}=heldWeapon(source,weaponId),target=opposingTarget(s,source,targetId);return attackPacket(s,source,target,weapon,attackId,neighbor?.3:.5,{},defense(s,target),neighbor?{center:{position:center}}:{});}

const expansionSpecials = {
  "impact-breaker": { label: "衝撃打撃", cost: 15 },
  "phase-lance": { label: "位相貫通", cost: 15 },
  "pulse-assault": { label: "パルス二連射", cost: 15 },
  "cluster-cannon": { label: "クラスター爆撃", cost: 20 },
  "overdrive-saber": { label: "オーバードライブ斬撃", cost: 25 },
  "dual-burst-rifle": { label: "デュアルバースト三連射", cost: 25 },
  "aether-rail-cannon": { label: "エーテルレール砲撃", cost: 30 },
  "meteor-buster": { label: "メテオ爆撃", cost: 0 },
} as const;
type ExpansionSpecialId = keyof typeof expansionSpecials;

export function isRobotExpansionSpecialWeapon(id: string): id is ExpansionSpecialId {
  return Object.hasOwn(expansionSpecials, id);
}

export function getRobotHitAndAwayOptions(s: RobotBattleCoreState) {
  const source = controlledActor(s, true);
  const normal = getRobotBattleNormalAttackOptions(s, "accel-lancer");
  if (!source.accelOrigin) return { targetIds: [] as string[], disabledReason: "通常移動後に使用できます" };
  const facilities = getRobotHostileFacilities(s, source.id).length
    ? getRobotBattleNormalFacilityTargets(s, source.id, "accel-lancer") : [];
  const targetIds = [...new Set([...normal.targetIds, ...facilities.map(f => f.objectId)])];
  return { targetIds, disabledReason: targetIds.length ? null : normal.disabledReason };
}

export function commitRobotHitAndAway(s: RobotBattleCoreState, input: Identity & { readonly targetId: string }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = controlledActor(s, true), { weapon } = heldWeapon(source, "accel-lancer");
  if (!getRobotHitAndAwayOptions(s).targetIds.includes(input.targetId)) throw new Error("移動後の合法な攻撃対象が必要です");
  const facility = getRobotHostileFacilities(s, source.id).some(f => f.id === input.targetId)
    ? getRobotBattleNormalFacilityTargets(s, source.id, weapon.id).find(t => t.objectId === input.targetId)
    : undefined;
  const unit = facility ? undefined : opposingTarget(s, source, input.targetId);
  const attackId = input.actionId + ":hit:1";
  const packet = facility ? getRobotBattleNormalFacilityPacket(s, { unitId: source.id, weaponId: weapon.id, ...facility }, attackId).packet
    : attackPacket(s, source, unit!, weapon, attackId, 1, {}, defense(s, unit!), { normalAttack: true });
  const origin = source.accelOrigin!;
  return commitRobotBattleBatch(s, { ...input, attacks: [packet],
    summary: summary(source, "ヒット＆アウェイ", [{ name: unit?.name ?? input.targetId }], [packet]),
    members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: 0 } }],
    ...(!sameRobotCoreCell(origin, source.position!) ? { returnLanding: origin } : {}),
    swordUse: { attack: "normal", attackWeaponIds: [weapon.id] },
  });
}

function getExpansionHitDamage(s: RobotBattleCoreState, source: RobotBattleUnit, target: ComboTarget,
  packet: RobotBattleResolvedAttack, consumed: Set<string>, repeat = false): number {
  const object = target.unit ?? { id: target.id, tacticalMark: s.facilityMarks?.[target.id] };
  const adapted = target.unit && (target.unit.adaptedWeaponFamilies?.includes(packet.effectKind) ||
    repeat && hasRobotAddon(target.unit, "tactical-adaptation-unit"));
  const damage = consumeRobotMark(s, source, object, packet.targets[0]!.resolution, consumed, adapted);
  return target.unit ? damage : resolveRobotFacilityDamage(s, target.id, damage);
}

export function isRobotExpansionAreaWeapon(weaponId: string): boolean {
  return weaponId === "cluster-cannon" || weaponId === "meteor-buster";
}

export function getRobotExpansionSpecialOptions(s: RobotBattleCoreState, weaponId: ExpansionSpecialId, boosted = false) {
  const source = controlledActor(s, true), { weapon } = heldWeapon(source, weaponId);
  if (boosted && weaponId !== "aether-rail-cannon") throw new Error("Only the aether rail cannon supports additional EN");
  const spec = expansionSpecials[weaponId];
  const label = boosted ? spec.label + "・出力強化" : spec.label;
  const cost = weaponId === "meteor-buster" ? Math.ceil(source.energy.maxEn / 2) : spec.cost + (boosted ? 20 : 0);
  const blocked = getRobotActionEnergyBlock(source.energy, cost);
  const targets = blocked ? [] : comboTargets(s, source);
  const direct = targets.flatMap(target => target.cells.filter(cell => spatial(s, source, { position: cell }, weapon).canReach)
    .map(cell => ({ target, cell })));
  const choices = new Map<string, { targets: { target: ComboTarget; cells: readonly RobotPosition[] }[]; areaCells: readonly RobotPosition[] }>();
  const add = (entries: { target: ComboTarget; cells: readonly RobotPosition[] }[], areaCells: readonly RobotPosition[] = []) => {
    const key = JSON.stringify(entries.map(e => e.target.id));
    if (!choices.has(key)) choices.set(key, { targets: entries, areaCells });
  };
  for (const center of direct) {
    const first = { target: center.target, cells: [center.cell] };
    if (weaponId === "phase-lance") {
      const dx = center.cell.x - source.position!.x, dy = center.cell.y - source.position!.y;
      for (const back of direct) {
        const bx = back.cell.x - source.position!.x, by = back.cell.y - source.position!.y;
        if (back.target.id !== center.target.id && dx * by === dy * bx && dx * bx + dy * by > dx * dx + dy * dy) {
          add([first, { target: back.target, cells: [back.cell] }]);
        }
      }
    } else if (weaponId === "overdrive-saber") {
      add([first]);
      const strike = comboPacket(s, source, center.target, weapon, "preview", 1.2, {}, center.target.def, first.cells);
      if (getExpansionHitDamage(s, source, center.target, strike, new Set()) >= center.target.hp) {
        for (const other of direct) if (other.target.id !== center.target.id) add([first, { target: other.target, cells: [other.cell] }]);
      }
    } else if (isRobotExpansionAreaWeapon(weaponId)) {
      const area = getRobotAreaNeighborCells(s.board, center.cell, "8-neighborhood");
      const neighbors = spreadTargets(targets, center.target, center.cell, area).slice(1);
      for (const ids of neighborSets(neighbors.map(n => n.target.id).sort(), 2)) {
        add([first, ...neighbors.filter(n => ids.includes(n.target.id))], area);
      }
    } else {
      add([first]);
    }
  }
  return { label, cost, choices: [...choices.values()], disabledReason: blocked ?? (choices.size ? null : "合法な対象がいません") };
}

export function commitRobotExpansionSpecial(s: RobotBattleCoreState, input: Identity & {
  readonly weaponId: ExpansionSpecialId; readonly targetIds: readonly string[]; readonly boosted?: boolean;
}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const options = getRobotExpansionSpecialOptions(s, input.weaponId, input.boosted);
  const choice = options.choices.find(c => {
    const ids = c.targets.map(t => t.target.id);
    if (ids.length !== input.targetIds.length) return false;
    return isRobotExpansionAreaWeapon(input.weaponId)
      ? ids[0] === input.targetIds[0] && new Set(input.targetIds).size === ids.length && ids.every(id => input.targetIds.includes(id))
      : ids.every((id, i) => id === input.targetIds[i]);
  });
  if (options.disabledReason || !choice) throw new Error(options.disabledReason ?? "指定された対象の組み合わせは選べません");
  const source = controlledActor(s, true), { weapon } = heldWeapon(source, input.weaponId);
  const multipliers = {
    "impact-breaker": [.8], "phase-lance": [.7, 1], "pulse-assault": [.6], "cluster-cannon": [1, .4, .4],
    "overdrive-saber": [1.2, 1], "dual-burst-rifle": [.5], "aether-rail-cannon": [input.boosted ? 1.7 : 1.4],
    "meteor-buster": [.7, .4, .4],
  }[input.weaponId];
  const attacks = choice.targets.map(({ target, cells }, i) => {
    const multiplier = multipliers[i]!;
    const meteorBase = input.weaponId === "meteor-buster"
      ? Math.floor(20 * options.cost ** 2 / (100 * getRobotEffectiveDefense(target.def))) : undefined;
    return comboPacket(s, source, target, weapon, input.actionId + ":special:" + i, multiplier, {}, target.def, cells, "normal", meteorBase);
  });
  const hitCap = input.weaponId === "pulse-assault" ? 2 : input.weaponId === "dual-burst-rifle" ? 3 : 1;
  if (hitCap > 1) {
    const first = attacks[0]!, { target } = choice.targets[0]!;
    const consumed = new Set<string>();
    let damage = getExpansionHitDamage(s, source, target, first, consumed);
    for (let i = 1; i < hitCap && damage < target.hp; i++) {
      attacks.push({ ...first, id: input.actionId + ":special:" + i });
      damage += getExpansionHitDamage(s, source, target, first, consumed, true);
    }
  }
  const after = commitRobotBattleBatch(s, {
    ...input, attacks, summary: summary(source, options.label, choice.targets.map(t => t.target), attacks),
    members: [{ unitId: source.id, action: { kind: "other", energyCost: options.cost } }],
    ...(hitCap > 1 || input.weaponId === "overdrive-saber" ? { resolutionMode: "ordered-single-source" as const } : {}),
    ...(input.weaponId === "impact-breaker" && choice.targets[0]!.target.unit ? {
      restrictions: [{ sourceId: source.id, targetId: choice.targets[0]!.target.id, kind: "impact-breaker" as const }],
    } : {}),
  });
  return choice.areaCells.length ? decodeRobotBattleCore({ ...after, latest: {
    ...after.latest!, areaCells: [...choice.targets[0]!.cells, ...choice.areaCells],
  } }) : after;
}
