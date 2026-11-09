import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "./attackResolution";
import { getRobotWeaponDamageEstimate } from "./combatMath";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotCombatWeapon, getRobotNormalActionCost, getRobotNormalAttackStatBonus, getRobotNormalFinisherFactor, robotIgnoresNormalSight } from "./combatAddons";
import { getRobotActionEnergyBlock } from "./energy";
import { floorRobotDamageProduct } from "./combatMath";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "./battleBatch";
import { getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, isRobotBattleHostileObject, getRobotBattleFacilities, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState } from "./battleState";
import { isRobotBattleNormalWeaponConnected } from "./battleWeaponActions";
import type { RobotPosition } from "./movement";

function actingWeapon(s: RobotBattleCoreState, unitId: string, weaponId: string) {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, unitId);
  if (!actor.unitIds.includes(source.id) || source.hp <= 0 || !source.position || source.energy.action !== null || robotBattleIsAlly(source) && ![4,11,18,23].includes(s.key.missionNumber)) throw new Error("Current living enemy member required for a defense facility attack");
  if (source.statuses.length) throw new Error("Active status damage resolver required");
  const selection = source.parts.find(p => p.partId === weaponId);
  if (!selection || !isRobotBattleNormalWeaponConnected(weaponId)) throw new Error("Connected equipped normal weapon required");
  const weapon = getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level),source.addons);
  if (weapon.slot !== "weapon" || !weapon.range || !weapon.weaponFamily) throw new Error("Resolved normal weapon required");
  const energyCost = getRobotNormalActionCost(selection,source.addons);
  if (source.kind === "light" && energyCost !== 0) throw new Error("Light squads cannot use EN-cost attacks");
  return { source, selection, weapon, energyCost };
}
/** Every footprint cell is independently range/LOS checked; one object HP pool. */
export function getRobotBattleNormalFacilityTargets(s: RobotBattleCoreState, unitId: string, weaponId: string) {
  const { source, weapon, energyCost } = actingWeapon(s, unitId, weaponId);
  if (getRobotActionEnergyBlock(source.energy,energyCost)) return [];
  return getRobotBattleFacilities(s).filter(o => o.hp > 0 && isRobotBattleHostileObject(s,source.id,o.id)).flatMap(object => object.cells.filter(cell => checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: cell, min: weapon.range!.min, max: weapon.range!.max }), sight: { board: s.board, origin: source.position!, target: cell } }).canReach || robotIgnoresNormalSight(weapon,source.addons) && checkRobotAttackRange({origin:source.position!,target:cell,min:weapon.range!.min,max:weapon.range!.max}).status === "in-range").map(cell => ({ objectId: object.id, cell: { ...cell } })));
}
/** A single enemy or a lightweight shared turn. Members without an attack wait.
 * All equipped-weapon damage is resolved against the SAME pre-action HP/DEF,
 * then committed once. Does not plan/schedule AI or invent joint robot kill EN.
 */
export function commitRobotBattleNormalFacilityAttacks(s: RobotBattleCoreState, input: {
  readonly actionId: string; readonly turnId: string;
  readonly attacks: readonly { readonly unitId: string; readonly weaponId: string; readonly objectId: string; readonly cell: RobotPosition }[];
}): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  if (!input.attacks.length || new Set(input.attacks.map(a => a.unitId)).size !== input.attacks.length) throw new Error("One normal attack per attacking member required");
  const actor = getRobotBattleActor(s), packets: RobotBattleResolvedAttack[] = [];
  const plans = input.attacks.map((attack, i) => {
    const plan = getRobotBattleNormalFacilityPacket(s, attack, input.actionId + ":hit:" + (i + 1));
    packets.push(plan.packet); return plan;
  });
  return commitRobotBattleBatch(s, { ...input, attacks: packets, summary: actor.id + "：施設へ通常攻撃", members: actor.unitIds.filter(id => getRobotBattleUnit(s, id).hp > 0).map(unitId => {
    const plan = plans.find(p => p.source.id === unitId);
    return { unitId, action: { kind: plan ? "normal-attack" : "other", energyCost: plan?.energyCost ?? 0 } };
  }), ...(actor.unitIds.length === 1 ? { swordUse: { attack: "normal", attackWeaponIds: input.attacks.map(a => a.weaponId) } } : {}) });
}

export function getRobotBattleNormalFacilityPacket(s: RobotBattleCoreState, attack: { readonly unitId: string; readonly weaponId: string; readonly objectId: string; readonly cell: RobotPosition }, attackId: string) {
    const plan = actingWeapon(s, attack.unitId, attack.weaponId), { source, weapon } = plan;
    const target = getRobotBattleFacilities(s).find(o => o.id === attack.objectId);
    if (!target || !getRobotBattleNormalFacilityTargets(s, source.id, weapon.id).some(t => t.objectId === target.id && sameRobotCoreCell(t.cell, attack.cell))) throw new Error("Illegal facility footprint target");
    const bonus = getRobotBattleCommandBonus(s, source.id, target.id), stats = getRobotBattleEffectiveStats(source);
    const base = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: { melee: stats.melee + bonus.melee+getRobotNormalAttackStatBonus(source.addons), ranged: stats.ranged + bonus.ranged+getRobotNormalAttackStatBonus(source.addons) }, targetDef: target.def, mode: "normal" }).baseDamage;
    const spatial = checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: attack.cell, min: weapon.range!.min, max: weapon.range!.max }), sight: { board: s.board, origin: source.position!, target: attack.cell } });
    const reachable=spatial.reason==="line-of-sight-blocked"&&robotIgnoresNormalSight(weapon,source.addons)?{canReach:true as const,reason:"clear" as const,sight:null}:spatial;
    const packet: RobotBattleResolvedAttack = { id: attackId, sourceId: source.id, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"], targets: [{ entityId: target.id, cells: [{ ...attack.cell }], resolution: resolveRobotTargetDamage({ attackLegal: true, spatial:reachable, effect: { kind: "damaging", resolveAfterModifiers: () => floorRobotDamageProduct(base,[getRobotNormalFinisherFactor(target.hp,target.maxHp,source.addons)]) } }) }] };
    return { ...plan, packet };
}

/** Adopted depot footprint damage, one HP pool per blast packet. */
export function getRobotBattleBlastObjectPacket(s:RobotBattleCoreState,unitId:string,weaponId:string,targetId:string,attackId:string,mode:"burst-center"|"burst-neighbor",cells:readonly RobotPosition[]):RobotBattleResolvedAttack {
  const source=getRobotBattleUnit(s,unitId),selection=source.parts.find(p=>p.partId===weaponId),weapon=selection&&getRobotCombatWeapon(resolveRobotBasicPart(selection.partId,selection.level),source.addons),target=getRobotBattleFacilities(s).find(o=>o.id===targetId);
  if(!weapon||weapon.weaponFamily!=="blast"||!target||target.hp<=0||!isRobotBattleHostileObject(s,source.id,targetId)||!cells.length||cells.some(c=>!target.cells.some(p=>sameRobotCoreCell(p,c))))throw new Error("Legal hostile blast object footprint required");
  const bonus=getRobotBattleCommandBonus(s,source.id,targetId),stats=getRobotBattleEffectiveStats(source),base=getRobotWeaponDamageEstimate({weaponId:weapon.id,weaponLevel:weapon.level,attackStats:{melee:stats.melee+bonus.melee,ranged:stats.ranged+bonus.ranged},targetDef:target.def,mode}).baseDamage;
  return{id:attackId,sourceId:source.id,effectKind:"blast",targets:[{entityId:targetId,cells,resolution:resolveRobotTargetDamage({attackLegal:true,spatial:{canReach:true,reason:"clear",sight:null},effect:{kind:"damaging",resolveAfterModifiers:()=>base}})}]};
}
