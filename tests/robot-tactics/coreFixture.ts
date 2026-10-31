/** Trusted component scenarios, NEVER a production departure/scheduler/AI.
 * Light EN=100 and explicit reference Lv1 below are TEST INPUTS, not adopted
 * encounter defaults. Null movement refuses to guess unresolved enemy types.
 */
import group from "../../docs/design/robot-tactics/current-group-combat.json";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotInitialEquipmentAvailability, getRobotPartyEquipmentPlan, type RobotLoadout, type RobotEquipmentAvailability } from "../../src/games/robot-tactics/equipment";
import { getRobotFriendlyPresetPlan } from "../../src/games/robot-tactics/friendlyPresets";
import { createRobotBattleCore, makeRobotBattleBoss, makeRobotBattleUnit, getRobotBattleActor, getRobotBattlePendingActors, getRobotBattleUnit, beginRobotBattleTurn, commitRobotBattlePassive, advanceRobotBattleRound, robotBattleTurnId, type RobotBattleCoreState, type RobotBattleReinforcementFactory, type RobotBattleUnitInit } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleBatch, type RobotBattleResolvedAttack } from "../../src/games/robot-tactics/battleBatch";
import { resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition, type RobotPosition } from "../../src/games/robot-tactics/movement";
import type { RobotStageKey } from "../../src/games/robot-tactics/types";

function lightSpec(id: string, squadId: string, position: RobotPosition, chassis = "ranged"): RobotBattleUnitInit {
  const growth = group.enemies.lightSquads;
  const rows: Readonly<Record<string, readonly (readonly number[])[]>> = growth.statsByChassis;
  const row = rows[chassis]![0]!;
  const stat = (name: string) => row[growth.columns.indexOf(name)]!;
  return { id, name: id, kind: "light", number: null, squadId, chassis, position, maxHp: stat("hp"), maxEn: 100,
    stats: { melee: stat("melee"), ranged: stat("ranged"), def: stat("def"), mov: (group.enemies.lightSquads.baseMovByChassis as Record<string, number>)[chassis]!, spd: stat("spd") }, movement: null, parts: [] };
}
export const fixtureWave: RobotBattleReinforcementFactory = wave => wave.cells.map((cell, i) => lightSpec(wave.squadId + ":" + i, wave.squadId, cell));
export function coreFixture(missionNumber = 2, difficulty: RobotStageKey["difficulty"] = "normal", party: readonly RobotLoadout[] = createRobotOfflineProgress().party, positions: Readonly<Record<string, string>> = {}, id = "core-fixture", available: RobotEquipmentAvailability = getRobotInitialEquipmentAvailability()): RobotBattleCoreState {
  const key = { missionNumber, difficulty }, stage = getRobotStagePlan(key);
  const equipment = getRobotPartyEquipmentPlan(party, available);
  const units = equipment.robots.map((plan, i) => {
    const stats = plan.baseStatsBeforeAddons, uid = "p" + (i + 1);
    return makeRobotBattleUnit({ id: uid, name: uid, kind: "controlled", number: (i + 1) as 1 | 2 | 3, squadId: null, chassis: null,
      position: robotCellToPosition(positions[uid] ?? stage.players[i]!), maxHp: stats.hp!, maxEn: stats.en!,
      stats: { melee: stats.melee!, ranged: stats.ranged!, def: stats.def!, mov: stats.mov!, spd: stats.spd! },
      movement: { ...plan.movement!, facing: "north" }, parts: Object.values(party[i]!.basic) });
  });
  for (const [i, friend] of stage.friendlyAI.entries()) {
    const plan = getRobotFriendlyPresetPlan({ presetId: friend.preset, referenceCoreLevel: 1, playerParty: equipment }), stats = plan.stats!, uid = "f" + (i + 1);
    units.push(makeRobotBattleUnit({ id: uid, name: uid, kind: "friendly-ai", number: (i + 1) as 1 | 2 | 3, squadId: null, chassis: null,
      position: robotCellToPosition(positions[uid] ?? friend.cell), maxHp: stats.hp!, maxEn: stats.en!,
      stats: { melee: stats.melee!, ranged: stats.ranged!, def: stats.def!, mov: stats.mov!, spd: stats.spd! },
      movement: { mov: stats.mov!, types: [plan.movementType], facing: "north" }, parts: Object.values(plan.basic!).map(p => ({ partId: p.id, level: p.level })) }));
  }
  const actors = units.map(u => ({ id: u.id, unitIds: [u.id] }));
  for (const enemy of stage.initialEnemies) {
    if (enemy.kind === "boss") { const boss = makeRobotBattleBoss(key, robotCellToPosition(enemy.cells[0]!), null); units.push(boss); actors.push({ id: boss.id, unitIds: [boss.id] }); }
    else if (enemy.kind === "light-squad") {
      const members = enemy.cells.map((cell, i) => makeRobotBattleUnit(lightSpec(enemy.id + ":" + i, enemy.id, robotCellToPosition(cell), enemy.chassisOrArchetype)));
      units.push(...members); actors.push({ id: enemy.id, unitIds: members.map(u => u.id) });
    } else throw new Error("This fixture deliberately supports only M02/M30 rosters");
  }
  return createRobotBattleCore({ id, key, units, actors });
}
/** Common finalization, with a controlled arithmetic result for application tests. */
export const fixtureDamage = (damage: number) => resolveRobotTargetDamage({ attackLegal: true, spatial: { canReach: true, reason: "clear", sight: null }, effect: { kind: "damaging", resolveAfterModifiers: () => damage } });
export function fixtureAttack(s: RobotBattleCoreState, sourceId: string, targetId: string, damage: number, id = "hit-" + s.actionIds.length): RobotBattleResolvedAttack {
  const cells = s.objective.kind === "m30" && targetId === s.objective.state.facility.id ? s.objective.state.facility.cells : [getRobotBattleUnit(s, targetId).position!];
  return { id, sourceId, effectKind: "assault", targets: [{ entityId: targetId, cells, resolution: fixtureDamage(damage) }] };
}
export function fixtureCommit(s: RobotBattleCoreState, attacks: readonly RobotBattleResolvedAttack[], actionId = "action-" + s.actionIds.length, policy: Parameters<typeof commitRobotBattleBatch>[2] = { chooseKillCredit: null }): RobotBattleCoreState {
  return commitRobotBattleBatch(s, { actionId, turnId: robotBattleTurnId(s), summary: "fixture resolved attack", attacks,
    members: getRobotBattleActor(s).unitIds.filter(id => getRobotBattleUnit(s, id).hp > 0).map(unitId => ({ unitId, action: { kind: attacks.some(a => a.sourceId === unitId) ? "normal-attack" : "other", energyCost: 0 } })) }, policy);
}
export function fixtureCloseRound(s: RobotBattleCoreState): RobotBattleCoreState {
  let next = s;
  while (getRobotBattlePendingActors(next).length) {
    if (next.turn.actorId === null) next = beginRobotBattleTurn(next, getRobotBattlePendingActors(next)[0]!.id);
    next = commitRobotBattlePassive(next, { actionId: "wait-" + next.actionIds.length, turnId: robotBattleTurnId(next), kind: "wait" });
  }
  return next;
}
export function fixtureNextRound(s: RobotBattleCoreState): RobotBattleCoreState { return advanceRobotBattleRound(fixtureCloseRound(s), fixtureWave); }
