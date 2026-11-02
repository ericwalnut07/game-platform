import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "./attackResolution";
import { getRobotWeaponDamageEstimate } from "./combatMath";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotNormalWeaponEnergyCost } from "./weaponActions";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "./battleBatch";
import { getRobotBattleActor, getRobotBattleCommandBonus, getRobotBattleEffectiveStats, getRobotBattleFacilities, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState } from "./battleState";
import { isRobotBattleNormalWeaponConnected } from "./battleWeaponActions";
import type { RobotPosition } from "./movement";

function actingWeapon(s: RobotBattleCoreState, unitId: string, weaponId: string) {
  const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, unitId);
  if (!actor.unitIds.includes(source.id) || source.hp <= 0 || !source.position || source.energy.action !== null || robotBattleIsAlly(source)) throw new Error("Current living enemy member required for a defense facility attack");
  if (source.statuses.length) throw new Error("Active status damage resolver required");
  const selection = source.parts.find(p => p.partId === weaponId);
  if (!selection || !isRobotBattleNormalWeaponConnected(weaponId)) throw new Error("Connected equipped normal weapon required");
  const weapon = resolveRobotBasicPart(selection.partId, selection.level);
  if (weapon.slot !== "weapon" || !weapon.range || !weapon.weaponFamily) throw new Error("Resolved normal weapon required");
  const energyCost = getRobotNormalWeaponEnergyCost(selection);
  if (source.kind === "light" && energyCost !== 0) throw new Error("Light squads cannot use EN-cost attacks");
  return { source, selection, weapon, energyCost };
}
/** Every footprint cell is independently range/LOS checked; one object HP pool. */
export function getRobotBattleNormalFacilityTargets(s: RobotBattleCoreState, unitId: string, weaponId: string) {
  const { source, weapon, energyCost } = actingWeapon(s, unitId, weaponId);
  if (source.energy.en < energyCost) return [];
  return getRobotBattleFacilities(s).filter(o => o.hp > 0).flatMap(object => object.cells.filter(cell => checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: cell, min: weapon.range!.min, max: weapon.range!.max }), sight: { board: s.board, origin: source.position!, target: cell } }).canReach).map(cell => ({ objectId: object.id, cell: { ...cell } })));
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
    const base = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: { melee: stats.melee + bonus.melee, ranged: stats.ranged + bonus.ranged }, targetDef: target.def, mode: "normal" }).baseDamage;
    const spatial = checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: attack.cell, min: weapon.range!.min, max: weapon.range!.max }), sight: { board: s.board, origin: source.position!, target: attack.cell } });
    const packet: RobotBattleResolvedAttack = { id: attackId, sourceId: source.id, effectKind: weapon.weaponFamily as RobotBattleResolvedAttack["effectKind"], targets: [{ entityId: target.id, cells: [{ ...attack.cell }], resolution: resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => base } }) }] };
    return { ...plan, packet };
}
