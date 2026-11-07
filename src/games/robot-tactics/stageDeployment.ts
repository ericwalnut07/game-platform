import { getRobotSortieSubobjective } from "./subobjectives";
import group from "../../../docs/design/robot-tactics/current-group-combat.json";
import models from "../../../docs/design/robot-tactics/medium-heavy-models.json";
import { listRobotAddonIds, listRobotBasicPartIds, listRobotFrameIds, getRobotPartyEquipmentPlan } from "./equipment";
import { requireRobotConnectedAddonSupport } from "./addonEffects";
import { getRobotFriendlyPresetPlan } from "./friendlyPresets";
import { getRobotLightEnemyPlan, type RobotLightChassis } from "./lightEnemyPresets";
import { getRobotSoloEnemyPlan } from "./enemyPresets";
import { makeRobotBattleBoss, makeRobotBattleUnit, createRobotBattleCore, decodeRobotBattleCore, type RobotBattleCoreState, type RobotBattleUnit, type RobotBattleUnitInit } from "./battleState";
import { getRobotBossPlan } from "./bossCatalog";
import { createRobotRoundInitiative } from "./initiative";
import { robotCellToPosition, type RobotFacing, type RobotMovementType, type RobotPosition } from "./movement";
import { getRobotStagePlan } from "./stageCatalog";
import type { RobotOfflineDeparture } from "./offlineSession";
import type { RobotStagePlan, RobotStageUnit } from "./types";

/** Availability is checked by the progression/session boundary. This catalogue
 * resolves an already-authorized departure, and grants no ownership/unlocks.
 */
export function getRobotDepartureEquipment(d: RobotOfflineDeparture) {
  const party = getRobotPartyEquipmentPlan(d.party, { frames: listRobotFrameIds(), basicParts: listRobotBasicPartIds(), addons: listRobotAddonIds() });
  if (!party.canEquip || party.robots.some(r => r.baseStatBlockingIssues.length || !r.movement)) throw new Error("Invalid departure equipment");
  d.party.forEach(p => requireRobotConnectedAddonSupport(p.addons));
  return party;
}
const mean = (cells: readonly RobotPosition[]) => ({ x: cells.reduce((s, p) => s + p.x, 0) / cells.length, y: cells.reduce((s, p) => s + p.y, 0) / cells.length });
/** Facing is fixed at spawn. M09 escapes north. Otherwise advance toward the
 * adopted defense objective, or the opposing initial deployment for blockers.
 */
export function getRobotEnemyMovement(stage: RobotStagePlan, unit: RobotStageUnit, mov: number, position: RobotPosition) {
  const p = group.enemies.movementFacingPolicy;
  const types: Readonly<Record<string, string>> = unit.kind === "boss" ? p.bossByMission : unit.kind === "heavy" ? p.heavyByChassis : p.lightAndMediumByChassis;
  const type = types[unit.kind === "boss" ? String(stage.key.missionNumber) : unit.chassisOrArchetype] as RobotMovementType;
  if (!["omni", "straight", "diagonal", "forward"].includes(type)) throw new Error("Missing adopted enemy movement type");
  const objective = stage.objective.specification;
  const conditions = objective.kind === "composite" ? objective.conditions as readonly Record<string, unknown>[] : [objective];
  const defense = conditions.find(c => c.kind === "defend-structure")?.structure as { cells: readonly string[] } | undefined;
  const target = mean((defense?.cells ?? stage.players).map(robotCellToPosition)), dx = target.x - position.x, dy = target.y - position.y;
  const facing: RobotFacing = unit.kind === "boss" && stage.key.missionNumber === 9 ? "north" : Math.abs(dy) >= Math.abs(dx) ? dy >= 0 ? "south" : "north" : dx >= 0 ? "east" : "west";
  return { mov, types: [type], facing };
}
export function createRobotStageEnemyUnits(stage: RobotStagePlan, unit: RobotStageUnit, cells: readonly RobotPosition[] = unit.cells.map(robotCellToPosition)): readonly RobotBattleUnit[] {
  if (unit.kind === "boss") {
    const plan = getRobotBossPlan(stage.key.missionNumber, stage.key.difficulty);
    return [makeRobotBattleBoss(stage.key, cells[0]!, getRobotEnemyMovement(stage, unit, plan.stats.mov, cells[0]!))];
  }
  if (unit.model !== "A" && unit.model !== "B" && unit.model !== "C") throw new Error("Unresolved enemy model");
  if (unit.kind === "light-squad") {
    const plan = getRobotLightEnemyPlan(unit.chassisOrArchetype as RobotLightChassis, unit.model, unit.enemyCoreLevel);
    if (!plan.readyForStatUse || !plan.stats || plan.weaponLevel === null || cells.length !== 3) throw new Error("Unresolved lightweight encounter");
    const stats = plan.stats;
    return cells.map((position, i) => makeRobotBattleUnit({ id: `${unit.id}:${i + 1}`, name: `${unit.id} ${i + 1}`, kind: "light", number: null, squadId: unit.id, chassis: unit.chassisOrArchetype, position, maxHp: stats.hp, maxEn: 0, stats, movement: getRobotEnemyMovement(stage, unit, stats.mov, position), parts: [{ partId: plan.weaponId, level: plan.weaponLevel! }] }));
  }
  const model = models.models.find(m => m.weightClass === unit.kind && m.archetype === unit.chassisOrArchetype && m.model === unit.model);
  if (!model) throw new Error("Unresolved solo enemy model");
  const plan = getRobotSoloEnemyPlan(model.id, unit.enemyCoreLevel), stats = plan.stats;
  if (!plan.readyForStatUse || !stats || !plan.weapons || Object.values(stats).some(v => v === null)) throw new Error("Unresolved solo enemy stats");
  return [makeRobotBattleUnit({ id: unit.id, name: unit.id, kind: unit.kind, number: null, squadId: null, chassis: unit.chassisOrArchetype, position: cells[0]!, maxHp: stats.hp!, maxEn: stats.en!, stats: { melee: stats.melee!, ranged: stats.ranged!, def: stats.def!, mov: stats.mov!, spd: stats.spd! }, movement: getRobotEnemyMovement(stage, unit, stats.mov!, cells[0]!), parts: plan.weapons.map(w => ({ partId: w.id, level: w.level })) })];
}
export function createRobotFormalBattleState(departure: RobotOfflineDeparture) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(departure.key.missionNumber)) throw new Error("Formal objective loop currently connects M01-M14 only");
  const stage = getRobotStagePlan(departure.key), party = getRobotDepartureEquipment(departure);
  const units = party.robots.map((plan, i) => {
    const stats = plan.effectiveStats;
    return makeRobotBattleUnit({ coreLevel: departure.party[i]!.coreLevel, id: departure.party[i]!.coreId, name: `操作機${i + 1}`, kind: "controlled", number: (i + 1) as 1 | 2 | 3, squadId: null, chassis: null, position: robotCellToPosition(stage.players[i]!), maxHp: stats.hp!, maxEn: stats.en!, stats: { melee: stats.melee!, ranged: stats.ranged!, def: stats.def!, mov: stats.mov!, spd: stats.spd! }, movement: { ...plan.movement!, facing: "north" }, parts: Object.values(departure.party[i]!.basic), addons: departure.party[i]!.addons });
  });
  stage.friendlyAI.forEach((friend, i) => {
    const plan = getRobotFriendlyPresetPlan({ presetId: friend.preset, referenceCoreLevel: stage.referenceEnemyCoreLevel, playerParty: party }), stats = plan.stats;
    if (!plan.readyForStatUse || !stats || !plan.basic) throw new Error("Unresolved friendly preset");
    units.push(makeRobotBattleUnit({ coreLevel: plan.referenceCoreLevel!, id: `friendly-${i + 1}`, name: `友軍${i + 1}`, kind: "friendly-ai", number: (i + 1) as 1 | 2 | 3, squadId: null, chassis: null, position: robotCellToPosition(friend.cell), maxHp: stats.hp!, maxEn: stats.en!, stats: { melee: stats.melee!, ranged: stats.ranged!, def: stats.def!, mov: stats.mov!, spd: stats.spd! }, movement: { mov: stats.mov!, types: [plan.movementType], facing: "north" }, parts: Object.values(plan.basic).map(p => ({ partId: p.id, level: p.level })) }));
  });
  const actors = units.map(u => ({ id: u.id, unitIds: [u.id] }));
  stage.initialEnemies.forEach(unit => { const enemies = createRobotStageEnemyUnits(stage, unit); units.push(...enemies); actors.push({ id: unit.id, unitIds: enemies.map(u => u.id) }); });
  const state = createRobotBattleCore({ id: departure.battleId, key: departure.key, units, actors });
  const instructions: RobotBattleCoreState["ai"]["instructions"] = stage.key.missionNumber === 1 ? {
    "friendly-1": { tacticId: "defend-location", cell: robotCellToPosition((stage.objective.specification.structure as { cells: string[] }).cells[0]!) },
    "friendly-2": { tacticId: "free-action" }
  } : state.ai.instructions;
  return decodeRobotBattleCore({ ...state, sortieSubobjectiveEligible: getRobotSortieSubobjective(departure.key.missionNumber, departure.party), initiative: createRobotRoundInitiative(state), ai: { mode: "auto", instructions } });
}
export function createRobotFormalReinforcement(stage: RobotStagePlan, spawn: { squadId: string; cells: readonly RobotPosition[] }): readonly RobotBattleUnitInit[] {
  const wave = stage.reinforcements.find(w => w.squad.id === spawn.squadId);
  if (!wave) throw new Error("Unknown adopted reinforcement");
  return createRobotStageEnemyUnits(stage, wave.squad, spawn.cells).map(u => {
    const { hp: _hp, energy, statuses: _statuses, carriedObjectiveId: _carried, boss: _boss, ...base } = u;
    return { ...base, maxEn: energy.maxEn };
  });
}

/** Stable M01 entry point retained for existing callers and saves. */
export function createRobotFormalM01State(departure: RobotOfflineDeparture) {
  if(departure.key.missionNumber!==1)throw new Error("M01 departure required");
  return createRobotFormalBattleState(departure);
}
