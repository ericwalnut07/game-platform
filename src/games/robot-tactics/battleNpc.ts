import { getRobotFriendlyIncoming, getRobotDefensiveFormationValue, getRobotFormationPositionValue } from "./friendlyFormationAi";
import { getRobotEarlyNpcGoal, robotEarlyNpcCellPreference, robotEarlyNpcTargetPriority } from "./earlyTactics";
import { moveRobotThroughHazards } from "./hazards";
import { getRobotM02CommandUtility, createRobotM02Forecast, getRobotM02GuardAnchor } from "./m02Tactics";
import { consumeRobotMark } from "./adoptedEffects";
import { getRobotDecoyCandidates } from "./decoys";
import { getRobotActionEnergyBlock } from "./energy";
import { getRobotFormationOptions, commitRobotFormation } from "./formations";
import { getRobotNormalActionCost, getRobotCombatWeapon, robotIgnoresNormalSight } from "./combatAddons";
import type { RobotDisplacement } from "./displacement";
import { applyRobotReactions } from "./battleEffects";
import { settleRobotBattleConsequences } from "./battleSettlement";
import { commitRobotDelta, getRobotDeltaOptions } from "./commonCombat";
import { getRobotBattleActor, getRobotBattleFacilities, getRobotBattleLegalMoves, getRobotBattleUnit, getRobotBattleResult, commitRobotBattleBossCommand, finishRobotBattleTurn, recordRobotBattleAction, requireRobotBattleInput, robotBattleIsAlly, sameRobotCoreCell, type RobotBattleCoreState, type RobotBattleUnit } from "./battleState";
import { getRobotBattleMemberNormalPacket, isRobotBattleNormalWeaponConnected } from "./battleWeaponActions";
import { getRobotBattleNormalFacilityPacket, getRobotBattleNormalFacilityTargets } from "./battleFacilityActions";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "./battleBatch";
import { recordRobotEnergyMove } from "./energy";
import { resolveRobotBasicPart } from "./equipment";
import { checkRobotAttackRange } from "./attackRange";
import { checkRobotAttackSpatial } from "./attackResolution";
import type { RobotPosition } from "./movement";

const distance = (a: RobotPosition, b: RobotPosition) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
interface Candidate { readonly packet: RobotBattleResolvedAttack; readonly weaponId: string; readonly cost: number; readonly score: number; readonly missionTarget?: boolean; readonly displacement?: RobotDisplacement | null }
function attacks(s: RobotBattleCoreState, source: RobotBattleUnit): readonly Candidate[] {
  const result: Candidate[] = [], order = s.ai.instructions[source.id];
  for (const selection of source.parts) {
    const weapon = getRobotCombatWeapon(resolveRobotBasicPart(selection.partId, selection.level), source.addons);
    if (weapon.slot !== "weapon" || !weapon.range || !isRobotBattleNormalWeaponConnected(weapon.id) || getRobotActionEnergyBlock(source.energy, getRobotNormalActionCost(selection, source.addons))) continue;
    for (const target of s.units.filter(u => u.hp > 0 && robotBattleIsAlly(u) !== robotBattleIsAlly(source))) {
      const check = checkRobotAttackSpatial({ kind: "normal", range: checkRobotAttackRange({ origin: source.position!, target: target.position!, min: weapon.range.min, max: weapon.range.max }), sight: { board: s.board, origin: source.position!, target: target.position! } });
      if (!check.canReach && !(check.reason === "line-of-sight-blocked" && robotIgnoresNormalSight(weapon, source.addons))) continue;
      const plan = getRobotBattleMemberNormalPacket(s, source.id, weapon.id, target.id, "npc-preview");
      const damage = consumeRobotMark(s, source, target, plan.packet.targets[0]!.resolution, new Set());
      const focused = order?.tacticId === "focus-attack" && target.id === order.targetUnitId;
      result.push({ packet: plan.packet, displacement: plan.displacement, weaponId: weapon.id, cost: plan.energyCost, missionTarget:robotEarlyNpcTargetPriority(s,source,target.id), score: (focused ? 10000 : 0) + (damage >= target.hp ? 1000 : 0) + Math.min(target.hp, damage) });
    }
    result.push(...getRobotDecoyCandidates(s,source.id,weapon.id,"npc-preview"));
    if (!robotBattleIsAlly(source)||s.key.missionNumber===4) for (const target of getRobotBattleNormalFacilityTargets(s, source.id, weapon.id)) {
      const plan = getRobotBattleNormalFacilityPacket(s, { unitId: source.id, weaponId: weapon.id, ...target }, "npc-preview");
      result.push({ packet: plan.packet, weaponId: weapon.id, cost: plan.energyCost, missionTarget:robotEarlyNpcTargetPriority(s,source,target.objectId), score: 500 + plan.packet.targets[0]!.resolution.damage });
    }
  }
  return result.sort((a, b) => Number(b.missionTarget??false)-Number(a.missionTarget??false)||b.score - a.score || a.cost - b.cost || (a.packet.targets[0]!.entityId < b.packet.targets[0]!.entityId ? -1 : a.packet.targets[0]!.entityId > b.packet.targets[0]!.entityId ? 1 : a.weaponId < b.weaponId ? -1 : a.weaponId > b.weaponId ? 1 : 0));
}
function goal(s: RobotBattleCoreState, unit: RobotBattleUnit): { cell: RobotPosition; hold: boolean } {
  const order = s.ai.instructions[unit.id];
  if (order?.tacticId === "defend-location" || order?.tacticId === "advance-to-location") return { cell: order.cell, hold: true };
  if (order?.tacticId === "escort-specific-ally" || order?.tacticId === "focus-attack") {
    const target = getRobotBattleUnit(s, order.targetUnitId);
    if (target.hp > 0) return { cell: target.position!, hold: order.tacticId === "escort-specific-ally" };
  }
  const early=getRobotEarlyNpcGoal(s,unit);if(early)return early;
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
    const unit = getRobotBattleUnit(next, id); if(unit.hp===0)continue;
    const objective = goal(next, unit);
    const missionPosition = getRobotEarlyNpcGoal(next, unit) !== null || !!next.ai.instructions[id] && next.ai.instructions[id]!.tacticId !== "free-action";
    const m02Enemy=next.key.missionNumber===2&&!robotBattleIsAlly(unit),anchor=m02Enemy?getRobotM02GuardAnchor(next,id):null;
    const formationAi=unit.kind==="friendly-ai"&&next.ai.allowFormations===true;
    const forecast=m02Enemy?createRobotM02Forecast(next):null,commandUtility=m02Enemy&&unit.kind==="boss"?forecast!.commandUtility(next):null;
    const options = [unit.position!, ...getRobotBattleLegalMoves(next, id).map(m => m.destination)].map(cell => {
      const virtual = { ...next, units: next.units.map(u => u.id === id ? { ...u, position: cell } : u) };
      const attack = attacks(virtual, getRobotBattleUnit(virtual, id))[0];
      const incoming=formationAi?getRobotFriendlyIncoming(virtual,id):forecast?.incoming(virtual,id)??0;
      const formation=formationAi&&incoming<unit.hp?getRobotFormationPositionValue(virtual,id):0;
      return { cell, formation, early:robotEarlyNpcCellPreference(next,unit,cell),missionTarget:attack?.missionTarget??false,score: Math.max(attack?.score ?? 0,commandUtility ?? 0),incoming,lethal:incoming>=unit.hp,distance:distance(cell,anchor??objective.cell), stay: sameRobotCoreCell(cell, unit.position!) };
    });
    options.sort((a, b) => (formationAi?Number(a.lethal)-Number(b.lethal):0)||b.early[0]-a.early[0]||b.early[1]-a.early[1]||Number(b.missionTarget)-Number(a.missionTarget)||(m02Enemy ? Number(a.lethal)-Number(b.lethal)||b.score-a.score||a.incoming-b.incoming||a.distance-b.distance : objective.hold ? a.distance - b.distance || b.score - a.score || b.formation-a.formation : b.score - a.score || (missionPosition ? a.distance-b.distance || b.formation-a.formation : b.formation-a.formation || a.distance-b.distance)) || Number(b.stay) - Number(a.stay) || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
    const chosen = options[0]!.cell;
    if (!sameRobotCoreCell(chosen, unit.position!)) {
      const path=getRobotBattleLegalMoves(next,id).find(m=>sameRobotCoreCell(m.destination,chosen))!.path;
      const moved=moveRobotThroughHazards({...next,units:next.units.map(u=>u.id===id?{...u,energy:recordRobotEnergyMove(u.energy,"ordinary")}:u)},id,path,s.id+":npc-move:"+s.actionIds.length+":"+id);
      next={...moved.state,...(moved.events.length?{priorDamage:[...(next.priorDamage??[]),...moved.events]}:{})};
      movedIds.push(id);
      const reaction = applyRobotReactions(next, { kind: "move", unitId: id }, s.id + ":npc-move:" + s.actionIds.length + ":" + id);
      next = settleRobotBattleConsequences(next, reaction.state.units, [], { ...reaction.state, attackIds: [...new Set([...next.attackIds, ...reaction.state.attackIds, ...reaction.events.map(e => e.attackId)])], ...(reaction.events.length ? { priorDamage: [...(next.priorDamage ?? []), ...reaction.events] } : {}) });
      if (getRobotBattleResult(next).result !== "ongoing") break;
    }
  }
  const choices = actor.unitIds.filter(id => getRobotBattleUnit(next, id).hp > 0).map(id => ({ unitId: id, attack: attacks(next, getRobotBattleUnit(next, id))[0] ?? null }));
  return { stateAfterMoves: next, choices, movedIds };
}
export function commitRobotNpcTurn(s: RobotBattleCoreState, identity: { readonly actionId: string; readonly turnId: string }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, identity.actionId, identity.turnId)) return s;
  const plan = planRobotNpcTurn(s), actor = getRobotBattleActor(s);
  if (!plan.choices.length || getRobotBattleResult(plan.stateAfterMoves).result !== "ongoing") {
    const next = { ...plan.stateAfterMoves, units: plan.stateAfterMoves.units.map(u => actor.unitIds.includes(u.id) && u.hp > 0 ? { ...u, energy: { ...u.energy, action: { kind: "other" as const, energyCost: 0 } } } : u) };
    return recordRobotBattleAction(finishRobotBattleTurn(next), identity.actionId, actor.id + "：移動後の反応解決");
  }
  const source = getRobotBattleUnit(plan.stateAfterMoves, actor.unitIds[0]!);
  const commandUtility=getRobotM02CommandUtility(plan.stateAfterMoves);
  if(commandUtility!==null&&commandUtility>0&&commandUtility>(plan.choices[0]?.attack?.score??0))return commitRobotBattleBossCommand(plan.stateAfterMoves,identity);
  if (actor.unitIds.length === 1 && source.kind === "friendly-ai" && s.ai.allowFormations) {
    let best: RobotBattleCoreState | null = null, bestScore = plan.choices[0]?.attack?.score ?? 0, bestCost = plan.choices[0]?.attack?.cost ?? Infinity;
    for (const selection of source.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")) {
      let options: ReturnType<typeof getRobotDeltaOptions>;
      try { options = getRobotDeltaOptions(plan.stateAfterMoves, selection.partId); } catch { continue; }
      const order = s.ai.instructions[source.id], focused = (id: string) => order?.tacticId === "focus-attack" && order.targetUnitId === id;
      const targetIds = [...options.targetIds].sort((a, b) => Number(focused(b)) - Number(focused(a)) || getRobotBattleUnit(s, b).hp - getRobotBattleUnit(s, a).hp || a.localeCompare(b)).slice(0, 3);
      for (const participantIds of options.participantSets) {
        const candidate = commitRobotDelta(plan.stateAfterMoves, { ...identity, weaponId: selection.partId, participantIds, targetIds });
        const score = candidate.latest!.damage.reduce((sum, event) => sum + Math.min(getRobotBattleUnit(s, event.targetId).hp, event.damage ?? 0) + ((event.damage ?? 0) >= getRobotBattleUnit(s, event.targetId).hp ? 1000 : 0) + (focused(event.targetId) ? 10000 : 0), 0);
        if (score > bestScore || score > 0 && score === bestScore && options.energyCost < bestCost) { best = candidate; bestScore = score; bestCost = options.energyCost; }
      }
    }
    for (const selection of source.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")) for (const kind of ["line", "pincer", "pair-defense", "protection"] as const) {
      const options = getRobotFormationOptions(plan.stateAfterMoves, kind, selection.partId);
      for (const choice of options.selections) {
        const candidate = commitRobotFormation(plan.stateAfterMoves, { ...identity, kind, weaponId: selection.partId, ...choice });
        const order = s.ai.instructions[source.id];
        const score = kind === "pair-defense" || kind === "protection" ? getRobotDefensiveFormationValue(plan.stateAfterMoves, candidate, kind, kind === "pair-defense" ? [source.id] : [source.id, ...choice.participantIds]) : candidate.latest!.damage.filter(e => e.effectKind === kind).reduce((sum, e) => sum + Math.min(getRobotBattleUnit(s, e.targetId).hp, e.damage ?? 0) + ((e.damage ?? 0) >= getRobotBattleUnit(s, e.targetId).hp ? 1000 : 0) + (order?.tacticId === "focus-attack" && order.targetUnitId === e.targetId ? 10000 : 0), 0);
        if (score > bestScore || score > 0 && score === bestScore && options.energyCost < bestCost) { best = candidate; bestScore = score; bestCost = options.energyCost; }
      }
    }
    if (best) return best;
  }
  const next = { ...plan.stateAfterMoves, units: plan.stateAfterMoves.units.map(u => plan.choices.some(c => c.unitId === u.id && c.attack === null) ? { ...u, defended: true } : u) };
  const packets = plan.choices.flatMap((c, i) => c.attack ? [{ ...c.attack.packet, id: identity.actionId + ":hit:" + i }] : []);
  return commitRobotBattleBatch(next, { ...identity, attacks: packets, displacements: plan.choices.flatMap(c => c.attack?.displacement ? [c.attack.displacement] : []), summary: actor.id + (plan.movedIds.length ? "：移動／" : "：") + (packets.length ? "通常攻撃" : "防御"), members: plan.choices.map(c => ({ unitId: c.unitId, action: { kind: c.attack ? "normal-attack" : "other", energyCost: c.attack?.cost ?? 0 } })), ...(actor.unitIds.length === 1 && plan.choices[0]?.attack ? { swordUse: { attack: "normal", attackWeaponIds: [plan.choices[0].attack.weaponId] } } : {}) });
}
