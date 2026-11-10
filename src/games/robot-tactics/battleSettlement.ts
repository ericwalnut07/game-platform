import { reconcileRobotEarlyMission, recordRobotM09FormationDamage, recordRobotM14PursuerKill, recordRobotLateBossDamage } from "./earlyMissions";
import { applyRobotM01Damage } from "./m01Mission";
import { applyRobotAlliedDefeats, type RobotAlliedLifecycleState } from "./alliedLifecycle";
import { applyRobotM30AlliedDefeats, applyRobotM30FacilityBatch, recordRobotM30BossDefeat } from "./m30Mission";
import { clearRobotBattleRestrictions, clearRobotBattleShield, clearRobotBattleWeaponDebuffs, finishRobotBattleTurn, getRobotBattleResult, getRobotBattleUnit, recordRobotBattleAction, robotBattleAlliedLedger, robotBattleIsAlly, robotBattleLifecycle, type RobotBattleCoreState, type RobotBattleDamageEvent, type RobotBattleUnit } from "./battleState";
import type { RobotPosition } from "./movement";

/** Internal finalizer shared by simultaneous and pre-resolved sequential actions.
 * Called exactly once AFTER attack damage, recovery events and weapon recoil.
 * No partial turn/checkpoint/result is exposed while those phases are running.
 */
export function settleRobotBattleConsequences(s: RobotBattleCoreState, units: readonly RobotBattleUnit[], facilityAttacks: readonly { attackId: string; sourceId?: string; hitCells: readonly RobotPosition[]; damage: number }[] = [], effects: RobotBattleCoreState = s): RobotBattleCoreState {
  const defeatedAllies = s.units.filter(u => robotBattleIsAlly(u) && u.hp > 0 && units.find(next => next.id === u.id)!.hp === 0).map(u => u.id);
  // The shared defeat helper requires a living pre-death record. Preserve the
  // just-resolved EN, final death location and survivors' HP while presenting
  // only those deaths alive (already-settled null cells use the prior record).
  const lifeInput = robotBattleLifecycle({ ...s, units: units.map(u => defeatedAllies.includes(u.id) ? { ...u, hp: getRobotBattleUnit(s, u.id).hp, position: u.position ?? getRobotBattleUnit(s, u.id).position } : u) });
  const lifeResult: { state: RobotAlliedLifecycleState; droppedObjectives: readonly { objectiveId: string; unitId: string; position: RobotPosition }[] } = defeatedAllies.length ? applyRobotAlliedDefeats(lifeInput, defeatedAllies) : { state: lifeInput, droppedObjectives: [] };
  units = units.map(u => {
    if (u.hp === 0) { const { tacticalMark: _mark, projectedDefense: _projected, weakpoint: _weakpoint, burning: _burning, formationDefense: _formationDefense, overwatch: _overwatch, stationaryDefense: _stationaryDefense, ...rest } = u; u = clearRobotBattleRestrictions(clearRobotBattleWeaponDebuffs(clearRobotBattleShield(rest))); }
    const life = lifeResult.state.allies.find(a => a.id === u.id);
    return life ? { ...(life.hp === 0 ? clearRobotBattleShield(u) : u), hp: life.hp, position: life.position, statuses: life.statuses, carriedObjectiveId: life.carriedObjectiveId, energy: { ...u.energy, ...(life.hp === 0 ? { turnOpen: false } : {}) } } : u;
  });
  let objective = effects.objective.kind==="early"?effects.objective:s.objective;
  if (objective.kind === "m01") {
    objective = { kind: "m01", state: applyRobotM01Damage(objective.state, facilityAttacks, lifeResult.state.lostBySameRoundWipe) };
  } else if (objective.kind === "m02") {
    const bossId = objective.bossId;
    if (lifeResult.state.lostBySameRoundWipe) objective = { ...objective, result: "lost", reason: "same-round-controlled-wipe" };
    else if (units.find(u => u.id === bossId)!.hp === 0) objective = { ...objective, result: "won", reason: "commander-defeated" };
  } else if(objective.kind==="early"){
    objective=reconcileRobotEarlyMission({...effects,units,objective,allied:robotBattleAlliedLedger(lifeResult.state)},facilityAttacks,lifeResult.droppedObjectives,defeatedAllies).objective;
  } else {
    // Independent projections of the SAME pre-batch mission avoid prematurely
    // closing a simultaneous batch when one of several immediate losses occurs.
    const before = objective.state;
    const life = applyRobotM30AlliedDefeats(before, lifeResult);
    const boss = units.find(u => u.id === "enemy-supreme-commander")!.hp === 0 ? recordRobotM30BossDefeat(before, "enemy-supreme-commander") : before;
    const facility = applyRobotM30FacilityBatch(before, facilityAttacks);
    objective = { kind: "m30", state: { ...before, bossDefeated: boss.bossDefeated, data: life.data, facility: facility.facility, appliedAttackIds: facility.appliedAttackIds, result: facility.result === "lost" ? "lost" : life.result, resultReason: facility.result === "lost" ? facility.resultReason : life.resultReason } };
  }
  return { ...effects, ...(effects.decoys?{decoys:effects.decoys.filter(d=>units.some(u=>u.id===d.ownerId&&u.hp>0))}:{}), units, objective, allied: robotBattleAlliedLedger(lifeResult.state) };
}
export function settleRobotBattleDamageAction(s: RobotBattleCoreState, units: readonly RobotBattleUnit[], newAttackIds: readonly string[], events: readonly RobotBattleDamageEvent[], facilityAttacks: readonly { attackId: string; sourceId?: string; hitCells: readonly RobotPosition[]; damage: number }[], input: { readonly actionId: string; readonly summary: string }, effects: RobotBattleCoreState = s): RobotBattleCoreState {
  // End-turn healing and DOT belong to this same atomic action. Reconcile
  // objectives only after those phases, so no ended mission is re-entered.
  const attackIds = [...new Set([...s.attackIds, ...effects.attackIds, ...newAttackIds])];
  effects = recordRobotM09FormationDamage(s, effects, events);
  effects = recordRobotM14PursuerKill(s, {...effects,units,attackIds}, events);
  effects = recordRobotLateBossDamage(s,effects,events);
  if (effects.afterAttack && !effects.afterAttack.chainUsed) {
    const pending=settleRobotBattleConsequences(s,units,facilityAttacks,{...effects,attackIds});
    if(getRobotBattleResult(pending).result==="ongoing"&&getRobotBattleUnit(pending,effects.afterAttack.ownerId).hp>0)return recordRobotBattleAction(pending,input.actionId,input.summary,events);
    effects=pending;
  }
  const {afterAttack:_pending,...base}=effects;
  const next = finishRobotBattleTurn({ ...base, units, attackIds: [...new Set([...s.attackIds, ...effects.attackIds, ...newAttackIds])] }, { before: s, facilityAttacks });
  const dropped = s.units.some(u => u.carriedObjectiveId && next.units.find(v => v.id === u.id)!.hp === 0);
  return recordRobotBattleAction(next, input.actionId, input.summary + (dropped ? "／データ落下" : ""), events);
}
