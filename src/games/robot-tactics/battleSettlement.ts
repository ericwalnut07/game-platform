import { applyRobotAlliedDefeats, type RobotAlliedLifecycleState } from "./alliedLifecycle";
import { applyRobotM30AlliedDefeats, applyRobotM30FacilityBatch, recordRobotM30BossDefeat } from "./m30Mission";
import { finishRobotBattleTurn, getRobotBattleUnit, recordRobotBattleAction, robotBattleAlliedLedger, robotBattleIsAlly, robotBattleLifecycle, type RobotBattleCoreState, type RobotBattleDamageEvent, type RobotBattleUnit } from "./battleState";
import type { RobotPosition } from "./movement";

/** Internal finalizer shared by simultaneous and pre-resolved sequential actions.
 * Called exactly once AFTER attack damage, recovery events and weapon recoil.
 * No partial turn/checkpoint/result is exposed while those phases are running.
 */
export function settleRobotBattleDamageAction(s: RobotBattleCoreState, units: readonly RobotBattleUnit[], newAttackIds: readonly string[], events: readonly RobotBattleDamageEvent[], facilityAttacks: readonly { attackId: string; hitCells: readonly RobotPosition[]; damage: number }[], input: { readonly actionId: string; readonly summary: string }): RobotBattleCoreState {
  const defeatedAllies = s.units.filter(u => robotBattleIsAlly(u) && u.hp > 0 && units.find(next => next.id === u.id)!.hp === 0).map(u => u.id);
  // The shared defeat helper requires a living pre-death record. Preserve the
  // just-resolved EN and survivors' HP while presenting only those deaths alive.
  const lifeInput = robotBattleLifecycle({ ...s, units: units.map(u => defeatedAllies.includes(u.id) ? { ...u, hp: getRobotBattleUnit(s, u.id).hp, position: getRobotBattleUnit(s, u.id).position } : u) });
  const lifeResult: { state: RobotAlliedLifecycleState; droppedObjectives: readonly { objectiveId: string; unitId: string; position: RobotPosition }[] } = defeatedAllies.length ? applyRobotAlliedDefeats(lifeInput, defeatedAllies) : { state: lifeInput, droppedObjectives: [] };
  units = units.map(u => {
    const life = lifeResult.state.allies.find(a => a.id === u.id);
    return life ? { ...u, hp: life.hp, position: life.position, statuses: life.statuses, carriedObjectiveId: life.carriedObjectiveId, energy: { ...u.energy, ...(life.hp === 0 ? { turnOpen: false } : {}) } } : u;
  });
  let objective = s.objective;
  if (objective.kind === "m02") {
    const bossId = objective.bossId;
    if (lifeResult.state.lostBySameRoundWipe) objective = { ...objective, result: "lost", reason: "same-round-controlled-wipe" };
    else if (units.find(u => u.id === bossId)!.hp === 0) objective = { ...objective, result: "won", reason: "commander-defeated" };
  } else {
    // Independent projections of the SAME pre-batch mission avoid prematurely
    // closing a simultaneous batch when one of several immediate losses occurs.
    const before = objective.state;
    const life = applyRobotM30AlliedDefeats(before, lifeResult);
    const boss = units.find(u => u.id === "enemy-supreme-commander")!.hp === 0 ? recordRobotM30BossDefeat(before, "enemy-supreme-commander") : before;
    const facility = applyRobotM30FacilityBatch(before, facilityAttacks);
    objective = { kind: "m30", state: { ...before, bossDefeated: boss.bossDefeated, data: life.data, facility: facility.facility, appliedAttackIds: facility.appliedAttackIds, result: facility.result === "lost" ? "lost" : life.result, resultReason: facility.result === "lost" ? facility.resultReason : life.resultReason } };
  }
  const next = finishRobotBattleTurn({ ...s, units, objective, allied: robotBattleAlliedLedger(lifeResult.state), attackIds: [...s.attackIds, ...newAttackIds] });
  return recordRobotBattleAction(next, input.actionId, input.summary + (lifeResult.droppedObjectives.length ? "／データ落下" : ""), events);
}
