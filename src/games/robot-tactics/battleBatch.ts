import { finalizeRobotDamage } from "./combatMath";
import type { RobotTargetDamageResult } from "./attackResolution";
import { commitRobotEnergyAction, recordRobotEnergyCombatEvent } from "./energy";
import { applyRobotAlliedDefeats, type RobotAlliedLifecycleState } from "./alliedLifecycle";
import { applyRobotBossDamage } from "./bossCommands";
import { applyRobotM30AlliedDefeats, applyRobotM30FacilityBatch, recordRobotM30BossDefeat } from "./m30Mission";
import { finishRobotBattleTurn, getRobotBattleActor, getRobotBattleBoss, getRobotBattleUnit, isRobotBattleEffectKind, recordRobotBattleAction, requireRobotBattleInput, robotBattleAlliedLedger, robotBattleIsAlly, robotBattleLifecycle, sameRobotCoreCell, withRobotBattleBoss, type RobotBattleCoreState, type RobotBattleDamageEvent, type RobotBattleEffectKind, type RobotBattleUnit } from "./battleState";
import type { RobotPosition } from "./movement";

export interface RobotBattleResolvedAttack {
  readonly id: string; readonly sourceId: string; readonly effectKind: RobotBattleEffectKind;
  /** One entry per entity, with all of that entity's impacted cells together.
   * The trusted geometry/effect resolver chooses the entity damage BEFORE here.
   */
  readonly targets: readonly { readonly entityId: string; readonly cells: readonly RobotPosition[]; readonly resolution: RobotTargetDamageResult }[];
}
export interface RobotBattleMemberAction {
  readonly unitId: string;
  readonly action: { readonly kind: "normal-attack" | "charge" | "extra-move" | "other"; readonly energyCost: number };
}
export interface RobotBattleBatchPolicy {
  /** No guessed "last hit" or all-member reward. Needed only if several robots
   * jointly destroy one robot. Tests may inject an explicit fixture policy.
   */
  readonly chooseKillCredit: ((targetId: string, contributingSourceIds: readonly string[]) => string) | null;
}
const VALID_ZERO_REASONS = ["invalid-attack", "non-damaging", "out-of-range", "range-unresolved", "line-of-sight-blocked", "out-of-bounds"];
function validResolution(r: RobotTargetDamageResult): boolean {
  if (r.reason === "hit") {
    if (r.damageBeforeMinimum === null || !Number.isFinite(r.damageBeforeMinimum) || finalizeRobotDamage({ attackLegal: true, dealsDamage: true, damageAfterModifiers: r.damageBeforeMinimum }) !== r.damage) throw new Error("Invalid resolved damaging hit/minimum");
    return true;
  }
  if (!VALID_ZERO_REASONS.includes(r.reason) || r.damage !== 0 || r.damageBeforeMinimum !== null) throw new Error("Invalid non-hit resolution");
  return r.reason === "non-damaging";
}
function sumDamage(values: readonly number[]): number { const total = values.reduce((a, b) => a + b, 0); if (!Number.isSafeInteger(total)) throw new Error("Resolved batch damage exceeds supported numeric range"); return total; }

/** Internal own-turn, hostile, SIMULTANEOUS hit application. Not a client command
 * or a substitute for attack legality, range, weapon effects or reactions.
 * All damage results come from the common target resolver using the pre-batch
 * state; every HP/EN/death/objective update is then published atomically.
 * Sequential two-weapon combos must use their own resolver, not this API.
 */
export function commitRobotBattleBatch(s: RobotBattleCoreState, input: {
  readonly actionId: string; readonly turnId: string; readonly summary: string;
  readonly members: readonly RobotBattleMemberAction[]; readonly attacks: readonly RobotBattleResolvedAttack[];
}, policy: RobotBattleBatchPolicy = { chooseKillCredit: null }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const actor = getRobotBattleActor(s), activeIds = actor.unitIds.filter(id => getRobotBattleUnit(s, id).hp > 0);
  if (new Set(input.members.map(a => a.unitId)).size !== input.members.length || input.members.length !== activeIds.length || input.members.some(a => !activeIds.includes(a.unitId))) throw new Error("One action per living shared-turn member is required");
  if (new Set(input.attacks.map(a => a.id)).size !== input.attacks.length || input.attacks.some(a => !a.id || s.attackIds.includes(a.id) || !activeIds.includes(a.sourceId))) throw new Error("Duplicate/stale attack or wrong source actor");
  const events: RobotBattleDamageEvent[] = [], validSourceIds = new Set<string>(), damagedBy = new Map<string, string[]>();
  const facilityAttacks: { attackId: string; hitCells: readonly RobotPosition[]; damage: number }[] = [];
  for (const attack of input.attacks) {
    if (!isRobotBattleEffectKind(attack.effectKind)) throw new Error("Unknown resolved effect family");
    if (!attack.targets.length || new Set(attack.targets.map(t => t.entityId)).size !== attack.targets.length) throw new Error("An attack must consolidate each target entity exactly once");
    const source = getRobotBattleUnit(s, attack.sourceId);
    for (const hit of attack.targets) {
      if (!hit.cells.length || new Set(hit.cells.map(c => c.x + "," + c.y)).size !== hit.cells.length) throw new Error("Invalid entity impact cells");
      const target = s.units.find(u => u.id === hit.entityId), facility = s.objective.kind === "m30" && hit.entityId === s.objective.state.facility.id ? s.objective.state.facility : null;
      if (target) {
        if (target.hp <= 0 || !target.position || robotBattleIsAlly(source) === robotBattleIsAlly(target)) throw new Error("Hostile living target required; support/recoil needs its own resolver");
        if (hit.cells.length !== 1 || !sameRobotCoreCell(hit.cells[0]!, target.position)) throw new Error("Unit impact differs from current target position");
      } else if (!facility || robotBattleIsAlly(source) || hit.cells.some(c => !facility.cells.some(f => sameRobotCoreCell(c, f)))) throw new Error("Unknown/invalid target entity");
      const valid = validResolution(hit.resolution);
      if (!valid) continue; // blocked, invalid and unresolved attacks never become 1 damage
      validSourceIds.add(source.id);
      if (hit.resolution.reason !== "hit") { events.push({ sourceId: source.id, targetId: hit.entityId, attackId: attack.id, cells: hit.cells, damage: null, effectKind: attack.effectKind }); continue; }
      const damage = hit.resolution.damage;
      events.push({ sourceId: source.id, targetId: hit.entityId, attackId: attack.id, cells: hit.cells, damage, effectKind: attack.effectKind });
      if (target) damagedBy.set(target.id, [...(damagedBy.get(target.id) ?? []), source.id]);
      else facilityAttacks.push({ attackId: attack.id, hitCells: hit.cells, damage });
    }
  }
  for (const member of input.members) if (member.action.kind === "normal-attack" && !validSourceIds.has(member.unitId)) throw new Error("A non-established normal attack cannot consume the action");
  for (const member of input.members) if (getRobotBattleUnit(s, member.unitId).kind === "light" && (!["normal-attack", "other"].includes(member.action.kind) || member.action.energyCost !== 0)) throw new Error("Light squad action requires its adopted normal/defend/wait resolver");
  const totals = new Map(s.units.map(u => [u.id, sumDamage(events.filter(e => e.targetId === u.id).map(e => e.damage ?? 0))]));
  const defeated = s.units.filter(u => u.hp > 0 && totals.get(u.id)! >= u.hp);
  const credits = new Set<string>();
  for (const target of defeated) {
    const sources = [...new Set(damagedBy.get(target.id) ?? [])];
    if (!sources.length) throw new Error("Missing lethal damage source");
    const credited = sources.length === 1 ? sources[0]! : policy.chooseKillCredit?.(target.id, sources);
    if (credited === undefined) throw new Error("Joint-kill EN attribution remains unresolved");
    if (!sources.includes(credited)) throw new Error("Kill credit must refer to a contributing source"); credits.add(credited);
  }
  // Commit member action costs once; no per-target or per-hit action consumption.
  let units: readonly RobotBattleUnit[] = s.units.map(u => {
    const member = input.members.find(a => a.unitId === u.id);
    return member ? { ...u, energy: commitRobotEnergyAction(u.energy, member.action) } : u;
  });
  units = units.map(u => {
    const damage = totals.get(u.id)!; if (!damage) return u;
    const energy = recordRobotEnergyCombatEvent(u.energy, "damaged");
    if (u.boss) return withRobotBattleBoss(u, applyRobotBossDamage({ ...getRobotBattleBoss(u), energy }, damage));
    return { ...u, hp: Math.max(0, u.hp - damage), energy };
  });
  units = units.map(u => {
    if (!activeIds.includes(u.id)) return u;
    let energy = u.energy;
    if (validSourceIds.has(u.id)) energy = recordRobotEnergyCombatEvent(energy, "normal-hit");
    if (credits.has(u.id)) energy = recordRobotEnergyCombatEvent(energy, "kill");
    return { ...u, energy };
  });
  const defeatedAllies = defeated.filter(robotBattleIsAlly).map(u => u.id);
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
  const next = finishRobotBattleTurn({ ...s, units, objective, allied: robotBattleAlliedLedger(lifeResult.state), attackIds: [...s.attackIds, ...input.attacks.map(a => a.id)] });
  return recordRobotBattleAction(next, input.actionId, input.summary, events);
}
