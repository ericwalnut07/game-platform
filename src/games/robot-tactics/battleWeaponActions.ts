import type { RobotPosition } from "./movement";
import { consumeRobotMark } from "./adoptedEffects";
import { getRobotActionEnergyBlock } from "./energy";
import basicParts from "../../../docs/design/robot-tactics/basic-parts.json";
import { getRobotBattleDefense, getRobotDamageFactors } from "./battleEffects";
import { getRobotSpecialFacilityPacket, getRobotSpecialFacilityCells } from "./specialFacilityActions";
import { getRobotCombatWeapon, getRobotNormalActionCost, getRobotNormalAttackStatBonus, getRobotNormalFinisherFactor, robotIgnoresNormalSight } from "./combatAddons";
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, getRobotAttackBlockReasonText, resolveRobotTargetDamage, type RobotAttackSpatialCheck } from "./attackResolution";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate, type RobotWeaponDamageMode } from "./combatMath";
import { resolveRobotBasicPart, type RobotPartSelection, type RobotResolvedPart } from "./equipment";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "./battleBatch";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleFacilities, isRobotBattleHostileObject, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
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
function attackPacket(s: RobotBattleCoreState, source: RobotBattleUnit, target: RobotBattleUnit, weapon: RobotResolvedPart, id: string, multiplier: number, policy: RobotBattleWeaponRules, targetDef = defense(s, target), options: { readonly mode?: RobotWeaponDamageMode; readonly center?: Pick<RobotBattleUnit, "position">; readonly normalAttack?: boolean } = {}): RobotBattleResolvedAttack {
  const check = options.center ? neighborSpatial(target, options.center) : spatial(s, source, target, weapon, options.normalAttack); requireReachable(check);
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
const normalWeapons = new Set(["light-blade", "standard-sword", "whirlwind-saber", "double-edged-sword", "light-lance", "lance", "armor-pile", "sniper-rifle", "precision-rifle", "superheavy-railgun", "light-pistol", "assault-rifle", "corrosion-rifle", "emp-carbine", "suppression-mace", "heavy-hammer", "quake-hammer", "binding-hammer", "light-grenade-launcher", "howitzer", "heavy-missile-cannon", "wide-grenade-cannon"]);
export const isRobotBattleNormalWeaponConnected = (weaponId: string): boolean => normalWeapons.has(weaponId);
const normalUnavailable = "この武器の通常攻撃効果は未接続です";
function normalLabel(weapon: RobotResolvedPart): string { return weapon.weaponFamily === "slash" ? "通常斬撃" : weapon.weaponFamily === "thrust" ? "通常刺突" : weapon.weaponFamily === "sniper" ? "通常狙撃" : weapon.weaponFamily === "assault" ? "通常射撃" : weapon.weaponFamily === "blunt" ? "通常打撃" : "通常攻撃"; }
const hasNormalHitEffect = (weapon: RobotResolvedPart) => weapon.weaponFamily === "assault" || weapon.id === "binding-hammer" || weapon.id === "suppression-mace";
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
 * use the weapon's impact-footprint geometry, not a second source-ray LOS
 * or a second check against the firing weapon's max range.
 */
export function getRobotBattleBurstOptions(s: RobotBattleCoreState, weaponId: string, policy: RobotBattleWeaponRules = {}) {
  const source = singleActor(s), { selection, weapon } = heldWeapon(source, weaponId), plan = getRobotBlastPlan(selection), energyCost = getRobotNormalWeaponEnergyCost(selection);
  const units = opposingUnits(s,source);
  const hostileFacilities = getRobotBattleFacilities(s).filter(o=>o.hp>0&&isRobotBattleHostileObject(s,source.id,o.id));
  // One selectable center per facility, resolving its legal footprint cell
  // using the same range/LOS rule as a direct unit impact.
  const facilityCenters = [...new Map(getRobotSpecialFacilityCells(s,source.id,weaponId,weapon.range!).map(c=>[c.objectId,c])).values()];
  const possible = [
    ...units.filter(c=>spatial(s,source,c,weapon).canReach).map(unit=>({id:unit.id,cell:unit.position!,unit})),
    ...facilityCenters.map(c=>({id:c.objectId,cell:c.cell,unit:null})),
  ];
  const centers = getRobotActionEnergyBlock(source.energy, energyCost) ? [] : possible.map(center=>{
    if(center.unit)getRobotBattlePostBaseModifiers(s,source,center.unit,policy);
    const areaCells=getRobotBlastFootprint({weapon:selection,center:center.cell,board:s.board}).neighborCells;
    const neighbors = units.filter(u=>u.id!==center.id&&inCells(u,areaCells)&&neighborSpatial(u,{position:center.cell}).canReach);
    neighbors.forEach(u=>getRobotBattlePostBaseModifiers(s,source,u,policy));
    const adjacentFacilities = hostileFacilities.filter(o=>o.id!==center.id&&o.cells.some(c=>areaCells.some(a=>a.x===c.x&&a.y===c.y)));
    const neighborIds=[...neighbors.map(u=>u.id),...adjacentFacilities.map(o=>o.id)];
    return {centerId:center.id,areaCells,neighborIds,neighborSets:neighborSets(neighborIds,plan.neighborTargetCap)};
  });
  return { plan, energyCost, centers, disabledReason: getRobotActionEnergyBlock(source.energy, energyCost) ?? (centers.length ? null : "合法な中心対象がいません（射程・射線を確認）") };
}
export function commitRobotBattleBurstAttack(s: RobotBattleCoreState, input: Identity & {
  readonly weaponId: string; readonly centerId: string; readonly neighborIds: readonly string[];
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const source = singleActor(s), { weapon } = heldWeapon(source,input.weaponId), options=getRobotBattleBurstOptions(s,input.weaponId,policy);
  const selected=options.centers.find(c=>c.centerId===input.centerId);
  if(!selected||options.disabledReason)throw new Error(options.disabledReason??"Illegal blast impact center");
  if(input.neighborIds.length>options.plan.neighborTargetCap||new Set(input.neighborIds).size!==input.neighborIds.length
      ||input.neighborIds.includes(input.centerId))throw new Error("Distinct legal blast neighbors within cap required");
  if(input.neighborIds.some(id=>s.units.some(u=>u.id===id&&u.hp<=0)))throw new Error("Living hostile blast neighbor required");
  if(input.neighborIds.some(id=>!selected.neighborIds.includes(id)))throw new Error("Target is outside the legal blast neighborhood");
  const centerCell=s.units.find(u=>u.id===input.centerId)?.position
    ??getRobotSpecialFacilityCells(s,source.id,input.weaponId,weapon.range!).find(c=>c.objectId===input.centerId)?.cell;
  if(!centerCell)throw new Error("Missing eligible blast center cell");
  const targetIds=[input.centerId,...input.neighborIds];
  const packets = targetIds.map((id,i)=>{
    const unit=s.units.find(u=>u.id===id);
    const mode=i===0?"burst-center" as const:"burst-neighbor" as const;
    return unit
      ? attackPacket(s,source,unit,weapon,input.actionId+":hit:1",1,policy,defense(s,unit),
          {mode,...(i?{center:{position:centerCell}}:{})})
      : getRobotSpecialFacilityPacket(s,source.id,input.weaponId,id,input.actionId+":hit:1",weapon.range!,1,
          {mode,...(i?{splashCenter:centerCell}:{preferredCell:centerCell})});
  });
  const label=targetIds.map(id=>s.units.find(u=>u.id===id)?.name??getRobotBattleFacilities(s).find(o=>o.id===id)?.id??id).join("・");
  return commitRobotBattleBatch(s, {
    ...input, summary: source.name+"：爆撃 → "+label,
    members:[{unitId:source.id,action:{kind:"normal-attack",energyCost:options.energyCost}}],
    attacks:[{...packets[0]!,targets:packets.flatMap(p=>p.targets)}],
  });
}
function spreadPlan(source: RobotBattleUnit, primaryId: string, secondaryId: string) {
  const primary = heldWeapon(source, primaryId), secondary = heldWeapon(source, secondaryId), plan = getRobotWeaponComboPlan(primary.selection, secondary.selection);
  if (plan.kind !== "ranged-ranged") throw new Error("Different ranged weapon families required for spread shot");
  return { primary, secondary, plan };
}
function spreadArea(s:RobotBattleCoreState,source:RobotBattleUnit,centerId:string,centerCell:RobotPosition) {
  const areaCells=getRobotAreaNeighborCells(s.board,centerCell,"8-neighborhood");
  const units=opposingUnits(s,source).filter(u=>u.id===centerId||inCells(u,areaCells));
  const structures=getRobotBattleFacilities(s).filter(o=>o.hp>0&&isRobotBattleHostileObject(s,source.id,o.id)
    &&(o.id===centerId||o.cells.some(c=>areaCells.some(a=>a.x===c.x&&a.y===c.y))));
  return {areaCells,targetIds:[centerId,...[...units.map(u=>u.id),...structures.map(o=>o.id)].filter(id=>id!==centerId)]};
}
export function getRobotBattleSpreadOptions(s: RobotBattleCoreState, primaryId: string, secondaryId: string, policy: RobotBattleWeaponRules = {}) {
  const source=singleActor(s),{primary,plan}=spreadPlan(source,primaryId,secondaryId);
  const unitCenters=opposingUnits(s,source).filter(c=>spatial(s,source,c,primary.weapon).canReach).map(u=>({id:u.id,cell:u.position!}));
  const objectCenters=[...new Map(getRobotSpecialFacilityCells(s,source.id,primaryId,primary.weapon.range!).map(c=>[c.objectId,c])).values()].map(c=>({id:c.objectId,cell:c.cell}));
  const centers=getRobotActionEnergyBlock(source.energy,plan.energyCost)?[]:[...unitCenters,...objectCenters].map(center=>{
    const targets=spreadArea(s,source,center.id,center.cell).targetIds;
    targets.forEach(id=>{const unit=s.units.find(u=>u.id===id);if(unit)getRobotBattlePostBaseModifiers(s,source,unit,policy)});
    return {centerId:center.id,targetIds:targets};
  });
  return {energyCost:plan.energyCost,centers,disabledReason:getRobotActionEnergyBlock(source.energy,plan.energyCost)??(centers.length?null:"合法な中心対象がいません（射程・射線を確認）")};
}
/** One center input; all eight-neighbor robot/structure targets are computed by
 * Core, never accepted as a caller-supplied list. */
export function commitRobotBattleSpreadAttack(s: RobotBattleCoreState, input: Identity & {
  readonly primaryWeaponId: string; readonly secondaryWeaponId: string; readonly centerId: string;
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s,input.actionId,input.turnId)) return s;
  const source=singleActor(s),{primary,plan}=spreadPlan(source,input.primaryWeaponId,input.secondaryWeaponId);
  if(getRobotActionEnergyBlock(source.energy,plan.energyCost))
    throw new Error(source.energy.lockedUntilOwnTurn===undefined?"Insufficient EN":getRobotActionEnergyBlock(source.energy,plan.energyCost)!);
  const options=getRobotBattleSpreadOptions(s,input.primaryWeaponId,input.secondaryWeaponId,policy);
  if(options.disabledReason||!options.centers.some(c=>c.centerId===input.centerId))throw new Error(options.disabledReason??"Illegal spread center");
  const centerCell=s.units.find(u=>u.id===input.centerId)?.position
    ??getRobotSpecialFacilityCells(s,source.id,input.primaryWeaponId,primary.weapon.range!).find(c=>c.objectId===input.centerId)?.cell;
  if(!centerCell)throw new Error("Missing legal spread center");
  const {targetIds,areaCells}=spreadArea(s,source,input.centerId,centerCell);
  const packets=targetIds.map(id=>{
    const unit=s.units.find(u=>u.id===id);
    return unit
      ? attackPacket(s,source,unit,primary.weapon,input.actionId+":hit:1",plan.uniformAreaNormalDamageMultiplier!,policy,defense(s,unit),id===input.centerId?{}:{center:{position:centerCell}})
      : getRobotSpecialFacilityPacket(s,source.id,input.primaryWeaponId,id,input.actionId+":hit:1",primary.weapon.range!,plan.uniformAreaNormalDamageMultiplier!,id===input.centerId?{preferredCell:centerCell}:{splashCenter:centerCell});
  });
  const attacks=[{...packets[0]!,effectKind:"special:spread-shot" as const,targets:packets.flatMap(p=>p.targets)}];
  const after=commitRobotBattleBatch(s,{...input,summary:source.name+"：拡散射撃",members:[{unitId:source.id,action:{kind:"other",energyCost:plan.energyCost}}],attacks});
  return decodeRobotBattleCore({...after,latest:{...after.latest!,areaCells:[centerCell,...areaCells]}});
}

/** Trusted choice projection; final execution repeats the same shared checks. */
export function getRobotBattleSweepOptions(s: RobotBattleCoreState, weaponId: string) {
  const source = controlledActor(s), { selection, weapon } = heldWeapon(source, weaponId), plan = getRobotSweepPlan(selection, source.addons ?? []);
  const units = s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0 && u.position && spatial(s, source, u, weapon).canReach).map(u => ({ id: u.id, position: u.position! }));
  const occupied = new Set(units.map(u=>u.position.x+","+u.position.y));
  const objects = [...new Map(getRobotSpecialFacilityCells(s,source.id,weaponId,weapon.range!)
    .map(c=>[c.objectId,c])).values()].filter(c=>!occupied.has(c.cell.x+","+c.cell.y))
    .map(c=>({id:c.objectId,position:c.cell}));
  return { plan, disabledReason: getRobotActionEnergyBlock(source.energy, plan.energyCost), targetSets: getRobotActionEnergyBlock(source.energy, plan.energyCost) ? [] : getRobotSweepTargetSets(source.position!, [...units,...objects], plan.targetCap) };
}

/** Complete controlled-actor command for 18 adopted family pairs. Uses equipped
 * values and common range/LOS/damage/EN/settlement; no caller-supplied damage/cost.
 * Impact still needs its push/collision resolver before it can commit.
 * This internal engine API does not approve a departure or schedule initiative.
 */
export function commitRobotBattleWeaponCombo(s: RobotBattleCoreState, input: Identity & {
  readonly primaryWeaponId: string; readonly secondaryWeaponId: string;
  /** Slash target first, ranged target second for dual-target combos. */
  readonly targetIds: readonly string[];
}, policy: RobotBattleWeaponRules = {}): RobotBattleCoreState {
  if(!requireRobotBattleInput(s,input.actionId,input.turnId))return s;
  const source=controlledActor(s),primary=heldWeapon(source,input.primaryWeaponId),secondary=heldWeapon(source,input.secondaryWeaponId);
  const plan=getRobotWeaponComboPlan(primary.selection,secondary.selection);
  if(plan.kind==="ranged-ranged"){
    if(input.targetIds.length!==1)throw new Error("One spread center is required; neighbors are automatic");
    return commitRobotBattleSpreadAttack(s,{...input,centerId:input.targetIds[0]!},policy);
  }
  if(input.targetIds.length!==(plan.kind==="slash-ranged"?2:1)||
    new Set(input.targetIds).size!==input.targetIds.length)throw new Error("Distinct combo targets required");
  const units=input.targetIds.map(id=>s.units.find(u=>u.id===id)??null);
  input.targetIds.forEach((id,i)=>{
    const unit=units[i];
    if(unit){
      if(robotBattleIsAlly(unit)||unit.hp<=0||!unit.position)throw new Error("Living hostile combo target required");
    }else{
      const object=getRobotBattleFacilities(s).find(o=>o.id===id);
      if(!object||object.hp<=0||!isRobotBattleHostileObject(s,source.id,id))throw new Error("Living hostile facility required");
    }
  });
  const direct=(id:string,weapon:RobotResolvedPart,attackId:string,multiplier:number,defOverride?:number):RobotBattleResolvedAttack=>{
    const unit=s.units.find(u=>u.id===id);
    return unit
      ? attackPacket(s,source,unit,weapon,attackId,multiplier,policy,defOverride??defense(s,unit))
      : getRobotSpecialFacilityPacket(s,source.id,weapon.id,id,attackId,weapon.range!,multiplier,
          defOverride===undefined?{}:{targetDefOverride:defOverride});
  };
  const attacks:RobotBattleResolvedAttack[]=[];
  let displacements: {sourceId:string;targetId:string;distance:number}[]=[];
  if(plan.kind==="blunt-ranged"){
    const ranged=primary.weapon.weaponFamily==="blunt"?secondary.weapon:primary.weapon;
    attacks.push(direct(input.targetIds[0]!,ranged,input.actionId+":hit:1",plan.rangedNormalDamageMultiplier!));
    if(units[0])displacements=[{sourceId:source.id,targetId:units[0]!.id,distance:plan.pushDistance}];
  }else if(plan.kind==="melee-melee"){
    const id=input.targetIds[0]!,target=units[0];
    if(target){
      const checks=[spatial(s,source,target,primary.weapon),spatial(s,source,target,secondary.weapon)] as const;
      requireReachable(checks[0]);
      const result=resolveRobotTwoWeaponHits({primary:primary.selection,secondary:secondary.selection,
        attackStat:attackStats(s,source,target).melee,targetDef:defense(s,target),targetHp:target.hp,
        spatial:checks,multipliers:getRobotBattlePostBaseModifiers(s,source,target,policy)});
      for(const [i,hit] of result.hits.entries()){
        requireReachable(checks[i]!);
        const weapon=i?secondary.weapon:primary.weapon;
        attacks.push({id:input.actionId+":hit:"+(i+1),sourceId:source.id,effectKind:weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"],
          targets:[{entityId:id,cells:[target.position!],resolution:hit.resolution}]});
      }
    }else{
      const object=getRobotBattleFacilities(s).find(o=>o.id===id)!;
      const first=getRobotSpecialFacilityCells(s,source.id,primary.weapon.id,primary.weapon.range!).filter(t=>t.objectId===id);
      const second=getRobotSpecialFacilityCells(s,source.id,secondary.weapon.id,secondary.weapon.range!).filter(t=>t.objectId===id);
      const cell=first.find(a=>second.some(b=>b.cell.x===a.cell.x&&b.cell.y===a.cell.y))?.cell;
      if(!cell)throw new Error("Both melee weapons must reach the same facility footprint");
      const bonus=getRobotBattleCommandBonus(s,source.id,id),stats=getRobotBattleEffectiveStats(source);
      const reachable={canReach:true as const,reason:"clear" as const,sight:null};
      const result=resolveRobotTwoWeaponHits({primary:primary.selection,secondary:secondary.selection,
        attackStat:stats.melee+bonus.melee,targetDef:object.def,targetHp:object.hp,spatial:[reachable,reachable]});
      for(const [i,hit] of result.hits.entries()){
        const weapon=i?secondary.weapon:primary.weapon;
        attacks.push({id:input.actionId+":hit:"+(i+1),sourceId:source.id,effectKind:weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"],
          targets:[{entityId:id,cells:[cell],resolution:hit.resolution}]});
      }
    }
  }else if(plan.kind==="same-family"){
    attacks.push(direct(input.targetIds[0]!,primary.weapon,input.actionId+":hit:1",plan.sameFamilyNormalDamageMultiplier!));
  }else if(plan.kind==="slash-ranged"){
    const slash=primary.weapon.weaponFamily==="slash"?primary.weapon:secondary.weapon;
    const ranged=slash===primary.weapon?secondary.weapon:primary.weapon;
    attacks.push(direct(input.targetIds[0]!,slash,input.actionId+":hit:1",plan.slashNormalDamageMultiplier!));
    attacks.push(direct(input.targetIds[1]!,ranged,input.actionId+":hit:2",plan.rangedNormalDamageMultiplier!));
  }else{
    const ranged=primary.weapon.weaponFamily==="thrust"?secondary.weapon:primary.weapon;
    const id=input.targetIds[0]!,unit=units[0];
    const baseDef=unit?defense(s,unit):getRobotBattleFacilities(s).find(o=>o.id===id)!.def;
    attacks.push(direct(id,ranged,input.actionId+":hit:1",plan.rangedNormalDamageMultiplier!,getRobotPiercingComboDefense(baseDef)));
  }
  const targetNames=input.targetIds.map(id=>s.units.find(u=>u.id===id)?.name??getRobotBattleFacilities(s).find(o=>o.id===id)?.id??id);
  return commitRobotBattleBatch(s,{...input,summary:source.name+"：武装コンボ → "+targetNames.join("・"),
    members:[{unitId:source.id,action:{kind:"other",energyCost:plan.energyCost}}],attacks,
    ...(displacements.length?{displacements}:{}),
    resolutionMode:plan.kind==="melee-melee"?"ordered-single-source":"simultaneous",
    swordUse:{attack:"weapon-combo",attackWeaponIds:[primary.weapon.id,secondary.weapon.id]}});
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
  if(new Set(input.targetIds).size!==input.targetIds.length)throw new Error("Distinct sweep target IDs required");
  const facilityCells=getRobotSpecialFacilityCells(s,source.id,input.weaponId,weapon.range!);
  const slots=input.targetIds.map(id=>{
    const unit=s.units.find(u=>u.id===id);
    if(unit){
      if(robotBattleIsAlly(unit)||unit.hp<=0||!unit.position)throw new Error("Living hostile sweep target required");
      return {id,cell:unit.position,unit};
    }
    const cell=facilityCells.find(c=>c.objectId===id)?.cell;
    if(!cell)throw new Error("Living hostile facility in sweep range required");
    return {id,cell,unit:null};
  });
  if (!isRobotSweepSelection(source.position!,slots.map(t=>t.cell))) throw new Error("薙ぎ払いは同じ直交3マス帯の敵を選択してください。");
  const attacks=slots.map((target,index)=>{
    const unit=target.unit;
    if(!unit)return getRobotSpecialFacilityPacket(s,source.id,weapon.id,target.id,input.actionId+":hit:"+(index+1),
      weapon.range!,1,{mode:"sweep",preferredCell:target.cell});
    const check=spatial(s,source,unit,weapon);requireReachable(check);
    const estimate=getRobotWeaponDamageEstimate({weaponId:weapon.id,weaponLevel:weapon.level,attackStats:attackStats(s,source,unit),targetDef:defense(s,unit),mode:"sweep"});
    const extra=getRobotBattlePostBaseModifiers(s,source,unit,policy);
    return {id:input.actionId+":hit:"+(index+1),sourceId:source.id,effectKind:"slash" as const,
      targets:[{entityId:unit.id,cells:[unit.position!],resolution:resolveRobotTargetDamage({attackLegal:true,spatial:check,
        effect:{kind:"damaging",product:{base:estimate.baseDamage,factors:extra},resolveAfterModifiers:()=>floorRobotDamageProduct(estimate.baseDamage,extra)}})}]};
  });
  return commitRobotBattleBatch(s, { ...input, summary: source.name+"：薙ぎ払い → "+input.targetIds.join("・"), members: [{ unitId: source.id, action: { kind: "normal-attack", energyCost: plan.energyCost } }], attacks, swordUse: { attack: input.kind, attackWeaponIds: [weapon.id] } });
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
export function getRobotSpecialWeaponPacket(s: RobotBattleCoreState, weaponId: string, targetId: string, attackId: string, range: { min: number; max: number }, multiplier: number, mode: RobotWeaponDamageMode = "normal", centerId?: string, defenseMultiplier = 1, preferredCell?: RobotPosition) {
  const source = controlledActor(s), { weapon } = heldWeapon(source, weaponId);
  if (!s.units.some(u => u.id === targetId)) {
    const centerCell = centerId
      ? s.units.find(u => u.id===centerId)?.position ??
        getRobotSpecialFacilityCells(s, source.id, weaponId, range).find(c => c.objectId===centerId)?.cell
      : undefined;
    return getRobotSpecialFacilityPacket(s, source.id, weaponId, targetId, attackId, range, multiplier, {
      mode, defenseMultiplier, ...(preferredCell ? { preferredCell } : {}), ...(mode==="burst-neighbor" && centerCell ? { splashCenter: centerCell } : {}),
    });
  }
  const target = opposingTarget(s, source, targetId);
  const centerCell = centerId
    ? s.units.find(u => u.id===centerId)?.position ??
      getRobotSpecialFacilityCells(s, source.id, weaponId, range).find(c => c.objectId===centerId)?.cell
    : undefined;
  return attackPacket(s, source, target, { ...weapon, range }, attackId, multiplier, {}, defense(s, target) * defenseMultiplier, { mode, ...(centerCell ? { center: { position: centerCell } } : {}) });
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
