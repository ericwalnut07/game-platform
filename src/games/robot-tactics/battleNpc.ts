import { getRobotBattleActor, getRobotBattleFacilities, getRobotBattleLegalMoves, getRobotBattleUnit, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { getRobotBattleMemberNormalPacket, isRobotBattleNormalWeaponConnected } from "./battleWeaponActions";
import { getRobotBattleNormalFacilityPacket, getRobotBattleNormalFacilityTargets } from "./battleFacilityActions";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "./battleBatch";
import { recordRobotEnergyMove } from "./energy";
import { resolveRobotBasicPart } from "./equipment";
import { getRobotNormalWeaponEnergyCost } from "./weaponActions";
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial } from "./attackResolution";
import type { RobotPosition } from "./movement";

const distance = (a: RobotPosition, b: RobotPosition) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
interface Candidate { readonly packet: RobotBattleResolvedAttack; readonly weaponId: string; readonly cost: number; readonly score: number }
function attacks(s: RobotBattleCoreState, source: RobotBattleUnit): readonly Candidate[] {
  const result: Candidate[] = [], order = s.ai.instructions[source.id];
  for (const selection of source.parts) {
    const weapon = resolveRobotBasicPart(selection.partId, selection.level);
    if (weapon.slot !== "weapon" || !weapon.range || !isRobotBattleNormalWeaponConnected(weapon.id) || getRobotNormalWeaponEnergyCost(selection) > source.energy.en) continue;
    for (const target of s.units.filter(u => u.hp > 0 && robotBattleIsAlly(u) !== robotBattleIsAlly(source))) {
      if (!checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: target.position!, min: weapon.range.min, max: weapon.range.max }), sight: { board: s.board, origin: source.position!, target: target.position! } }).canReach) continue;
      const plan = getRobotBattleMemberNormalPacket(s, source.id, weapon.id, target.id, "npc-preview");
      const damage = plan.packet.targets[0]!.resolution.damage;
      const focused = order?.tacticId === "focus-attack" && target.id === order.targetUnitId;
      result.push({ packet: plan.packet, weaponId: weapon.id, cost: plan.energyCost, score: (focused ? 10000 : 0) + (damage >= target.hp ? 1000 : 0) + Math.min(target.hp, damage) });
    }
    if (!robotBattleIsAlly(source)) for (const target of getRobotBattleNormalFacilityTargets(s, source.id, weapon.id)) {
      const plan = getRobotBattleNormalFacilityPacket(s, { unitId: source.id, weaponId: weapon.id, ...target }, "npc-preview");
      result.push({ packet: plan.packet, weaponId: weapon.id, cost: plan.energyCost, score: 500 + plan.packet.targets[0]!.resolution.damage });
    }
  }
  return result.sort((a, b) => b.score - a.score || a.cost - b.cost || (a.packet.targets[0]!.entityId < b.packet.targets[0]!.entityId ? -1 : a.packet.targets[0]!.entityId > b.packet.targets[0]!.entityId ? 1 : a.weaponId < b.weaponId ? -1 : a.weaponId > b.weaponId ? 1 : 0));
}
function goal(s: RobotBattleCoreState, unit: RobotBattleUnit): { cell: RobotPosition; hold: boolean } {
  const order = s.ai.instructions[unit.id];
  if (order?.tacticId === "defend-location" || order?.tacticId === "advance-to-location") return { cell: order.cell, hold: true };
  if (order?.tacticId === "escort-specific-ally" || order?.tacticId === "focus-attack") {
    const target = getRobotBattleUnit(s, order.targetUnitId);
    if (target.hp > 0) return { cell: target.position!, hold: order.tacticId === "escort-specific-ally" };
  }
  const targets = !robotBattleIsAlly(unit) ? getRobotBattleFacilities(s).filter(f => f.hp > 0).flatMap(f => f.cells) : [];
  const cells = targets.length ? targets : s.units.filter(u => u.hp > 0 && robotBattleIsAlly(u) !== robotBattleIsAlly(unit)).map(u => u.position!);
  const nearest = [...cells].sort((a, b) => distance(unit.position!, a) - distance(unit.position!, b) || a.y - b.y || a.x - b.x)[0];
  return { cell: nearest ?? unit.position!, hold: false };
}
/** Deterministic tactical choice, with legal movement and real attack packets.
 * Members move individually in fixed actor-ID order; all attacks use the final
 * common pre-damage state. Auto and manual instruction modes use this function.
 */
export function planRobotNpcTurn(s: RobotBattleCoreState) {
  const actor = getRobotBattleActor(s);
  if (actor.unitIds.some(id => getRobotBattleUnit(s, id).kind === "controlled")) throw new Error("NPC actor required");
  let next = s;
  const movedIds: string[] = [];
  for (const id of actor.unitIds.filter(id => getRobotBattleUnit(s, id).hp > 0)) {
    const unit = getRobotBattleUnit(next, id), objective = goal(next, unit);
    const options = [unit.position!, ...getRobotBattleLegalMoves(next, id).map(m => m.destination)].map(cell => {
      const virtual = { ...next, units: next.units.map(u => u.id === id ? { ...u, position: cell } : u) };
      const attack = attacks(virtual, getRobotBattleUnit(virtual, id))[0];
      return { cell, score: attack?.score ?? 0, distance: distance(cell, objective.cell), stay: sameRobotCoreCell(cell, unit.position!) };
    });
    options.sort((a, b) => (objective.hold ? a.distance - b.distance || b.score - a.score : b.score - a.score || a.distance - b.distance) || Number(b.stay) - Number(a.stay) || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
    const chosen = options[0]!.cell;
    if (!sameRobotCoreCell(chosen, unit.position!)) {
      next = { ...next, units: next.units.map(u => u.id === id ? { ...u, position: chosen, energy: recordRobotEnergyMove(u.energy, "ordinary") } : u) };
      movedIds.push(id);
    }
  }
  const choices = actor.unitIds.filter(id => getRobotBattleUnit(next, id).hp > 0).map(id => ({ unitId: id, attack: attacks(next, getRobotBattleUnit(next, id))[0] ?? null }));
  return { stateAfterMoves: next, choices, movedIds };
}
export function commitRobotNpcTurn(s: RobotBattleCoreState, identity: { readonly actionId: string; readonly turnId: string }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, identity.actionId, identity.turnId)) return s;
  const plan = planRobotNpcTurn(s), actor = getRobotBattleActor(s);
  const next = { ...plan.stateAfterMoves, units: plan.stateAfterMoves.units.map(u => plan.choices.some(c => c.unitId === u.id && c.attack === null) ? { ...u, defended: true } : u) };
  const packets = plan.choices.flatMap((c, i) => c.attack ? [{ ...c.attack.packet, id: identity.actionId + ":hit:" + i }] : []);
  return commitRobotBattleBatch(next, { ...identity, attacks: packets, summary: actor.id + (plan.movedIds.length ? "：移動／" : "：") + (packets.length ? "通常攻撃" : "防御"), members: plan.choices.map(c => ({ unitId: c.unitId, action: { kind: c.attack ? "normal-attack" : "other", energyCost: c.attack?.cost ?? 0 } })), ...(actor.unitIds.length === 1 && plan.choices[0]?.attack ? { swordUse: { attack: "normal", attackWeaponIds: [plan.choices[0].attack.weaponId] } } : {}) });
}
