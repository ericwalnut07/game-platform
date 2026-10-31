import { createRobotAlliedLifecycle, beginNextRobotAlliedRound, type RobotAlliedLifeUnit, type RobotAlliedLifecycleState } from "./alliedLifecycle";
import { advanceRobotEnergyRound, beginRobotEnergyTurn, commitRobotEnergyAction, createRobotEnergyState, endRobotEnergyTurn, recordRobotEnergyMove, type RobotEnergyState } from "./energy";
import { applyRobotBasicEndTurnRecovery } from "./equipmentEffects";
import { resolveRobotBasicPart, type RobotPartSelection } from "./equipment";
import { beginRobotBossTurn, commitRobotBossSkill, createRobotBossState, endRobotBossTurn, getRobotCommandBonuses, type RobotBossSkillContext, type RobotBossState, type RobotBossUnit } from "./bossCommands";
import { createRobotM30State, commitRobotM30DataAction, finishRobotM30Round, spawnRobotM30Reinforcements, ROBOT_M30_DATA_ID, type RobotM30State } from "./m30Mission";
import { getRobotLegalMoves, robotCellToPosition, type RobotMovementShape, type RobotPosition } from "./movement";
import { getRobotStagePlan } from "./stageCatalog";
import { assertRobotAiConfiguration, type RobotAiConfiguration, type RobotAiInstruction, type RobotAiMode } from "./aiInstructions";
import type { RobotStageKey } from "./types";
import { getRobotBossPlan } from "./bossCatalog";

export type RobotBattleUnitKind = "controlled" | "friendly-ai" | "light" | "medium" | "heavy" | "boss";
export type RobotBattleBossLedger = Omit<RobotBossState, "hp" | "position" | "energy">;
export interface RobotBattleUnit {
  readonly id: string; readonly name: string; readonly kind: RobotBattleUnitKind;
  readonly number: 1 | 2 | 3 | null; readonly squadId: string | null; readonly chassis: string | null;
  readonly hp: number; readonly maxHp: number; readonly position: RobotPosition | null;
  readonly stats: { readonly melee: number; readonly ranged: number; readonly def: number; readonly mov: number; readonly spd: number };
  readonly energy: RobotEnergyState; readonly movement: RobotMovementShape | null;
  readonly parts: readonly RobotPartSelection[]; readonly statuses: readonly string[];
  readonly carriedObjectiveId: string | null; readonly boss: RobotBattleBossLedger | null;
}
export type RobotBattleUnitInit = Omit<RobotBattleUnit, "hp" | "energy" | "statuses" | "carriedObjectiveId" | "boss"> & { readonly maxEn: number };
export interface RobotBattleActor { readonly id: string; readonly unitIds: readonly string[] }
export type RobotBattleObjective =
  | { readonly kind: "m02"; readonly result: "ongoing" | "won" | "lost"; readonly reason: string | null; readonly bossId: "commander" }
  | { readonly kind: "m30"; readonly state: RobotM30State };
export interface RobotBattleDamageEvent {
  readonly sourceId: string; readonly targetId: string; readonly attackId: string;
  /** Primary impact first; one damage number per entity even for large structures. */
  readonly cells: readonly RobotPosition[]; readonly damage: number | null; readonly effectKind: RobotBattleEffectKind;
}
export type RobotBattleEffectKind = "slash" | "blunt" | "thrust" | "assault" | "sniper" | "blast" | "line" | "delta" | "pincer" | "pair-defense" | "protection" | `special:${string}`;
/** One HP/EN/position authority. Boss and allied ledgers deliberately do not duplicate it. */
export interface RobotBattleCoreState {
  readonly version: 1; readonly id: string; readonly key: RobotStageKey;
  readonly board: { readonly width: number; readonly height: number; readonly walls: readonly RobotPosition[] };
  readonly respawnPriority: readonly RobotPosition[];
  readonly units: readonly RobotBattleUnit[]; readonly actors: readonly RobotBattleActor[];
  readonly allied: Omit<RobotAlliedLifecycleState, "allies">;
  readonly objective: RobotBattleObjective;
  readonly turn: { readonly actorId: string | null; readonly serial: number; readonly actedActorIds: readonly string[] };
  readonly actionIds: readonly string[]; readonly attackIds: readonly string[];
  readonly latest: { readonly id: string; readonly summary: string; readonly damage: readonly RobotBattleDamageEvent[] } | null;
  readonly ai: { readonly mode: RobotAiMode; readonly instructions: Readonly<Record<string, RobotAiInstruction>> };
}
export const robotBattleIsAlly = (u: Pick<RobotBattleUnit, "kind">) => u.kind === "controlled" || u.kind === "friendly-ai";
export const sameRobotCoreCell = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;
export const robotBattleTurnId = (s: RobotBattleCoreState) => `${s.id}:r${s.allied.round}:t${s.turn.serial}`;
export function getRobotBattleResult(s: RobotBattleCoreState) {
  return s.objective.kind === "m02" ? { result: s.objective.result, reason: s.objective.reason } : { result: s.objective.state.result, reason: s.objective.state.resultReason };
}
export function requireRobotBattleRunning(s: RobotBattleCoreState): void { if (getRobotBattleResult(s).result !== "ongoing") throw new Error("Battle already ended"); }
export function getRobotBattleUnit(s: RobotBattleCoreState, id: string): RobotBattleUnit { const unit = s.units.find(u => u.id === id); if (!unit) throw new Error("Unknown battle unit: " + id); return unit; }
export function getRobotBattleActor(s: RobotBattleCoreState): RobotBattleActor { const actor = s.actors.find(a => a.id === s.turn.actorId); if (!actor) throw new Error("No open battle actor"); return actor; }
export function robotBattleLifeUnit(u: RobotBattleUnit): RobotAlliedLifeUnit {
  if (!robotBattleIsAlly(u) || u.number === null) throw new Error("Not an allied life unit");
  return { id: u.id, kind: u.kind as RobotAlliedLifeUnit["kind"], number: u.number, hp: u.hp, maxHp: u.maxHp, en: u.energy.en, maxEn: u.energy.maxEn, position: u.position, statuses: u.statuses, carriedObjectiveId: u.carriedObjectiveId };
}
export function robotBattleLifecycle(s: RobotBattleCoreState): RobotAlliedLifecycleState { return { ...s.allied, allies: s.units.filter(robotBattleIsAlly).map(robotBattleLifeUnit) }; }
export function robotBattleAlliedLedger(life: RobotAlliedLifecycleState): RobotBattleCoreState["allied"] { const { allies: _allies, ...ledger } = life; return ledger; }
export function getRobotBattleBoss(u: RobotBattleUnit): RobotBossState {
  if (!u.boss || !u.position) throw new Error("Missing boss state");
  return { ...u.boss, hp: u.hp, position: u.position, energy: u.energy };
}
export function withRobotBattleBoss(u: RobotBattleUnit, boss: RobotBossState): RobotBattleUnit {
  const { hp, position, energy, ...ledger } = boss;
  return { ...u, hp, position, energy, boss: ledger };
}
export function makeRobotBattleUnit(input: RobotBattleUnitInit, round = 1): RobotBattleUnit {
  const { maxEn, ...base } = input;
  return { ...base, hp: input.maxHp, energy: { ...createRobotEnergyState(maxEn), round }, statuses: [], carriedObjectiveId: null, boss: null };
}
export function makeRobotBattleBoss(key: RobotStageKey, position: RobotPosition, movement: RobotMovementShape | null): RobotBattleUnit {
  const boss = createRobotBossState(key.missionNumber, key.difficulty, position), p = boss.plan;
  const unit = makeRobotBattleUnit({ id: p.definition.unitId, name: p.definition.name, kind: "boss", number: null, squadId: null, chassis: null, maxHp: p.stats.hp, maxEn: p.stats.en, position, stats: { melee: p.stats.melee, ranged: p.stats.ranged, def: p.stats.def, mov: p.stats.mov, spd: p.stats.spd }, movement, parts: p.definition.weaponIds.map(partId => ({ partId, level: p.weaponLevel })) });
  return withRobotBattleBoss(unit, boss);
}

/** Trusted scenario construction only. Does not approve a stage, resolve missing
 * movement types, choose a speed tie-break or accept a client-supplied roster.
 */
export function createRobotBattleCore(input: { readonly id: string; readonly key: RobotStageKey; readonly units: readonly RobotBattleUnit[]; readonly actors: readonly RobotBattleActor[] }): RobotBattleCoreState {
  if (![2, 30].includes(input.key.missionNumber)) throw new Error("Only adopted M02/M30 objective adapters are connected");
  const stage = getRobotStagePlan(input.key), life = createRobotAlliedLifecycle(input.units.filter(robotBattleIsAlly).map(robotBattleLifeUnit));
  const result: RobotBattleCoreState = { version: 1, id: input.id, key: { ...input.key }, board: { ...stage.board, walls: stage.board.walls.map(robotCellToPosition) }, respawnPriority: stage.respawnPriority.map(robotCellToPosition), units: input.units, actors: input.actors, allied: robotBattleAlliedLedger(life), objective: input.key.missionNumber === 2 ? { kind: "m02", result: "ongoing", reason: null, bossId: "commander" } : { kind: "m30", state: createRobotM30State(input.key.difficulty) }, turn: { actorId: null, serial: 0, actedActorIds: [] }, actionIds: [], attackIds: [], latest: null, ai: { mode: "auto", instructions: Object.fromEntries(input.units.filter(u => u.kind === "friendly-ai").map(u => [u.id, { tacticId: "free-action" as const }])) } };
  return decodeRobotBattleCore(result);
}
export function getRobotBattleStructures(s: RobotBattleCoreState): readonly RobotPosition[] { return s.objective.kind === "m30" ? s.objective.state.facility.cells : []; }
export function getRobotBattlePendingActors(s: RobotBattleCoreState): readonly RobotBattleActor[] { return s.actors.filter(a => !s.turn.actedActorIds.includes(a.id) && a.unitIds.some(id => getRobotBattleUnit(s, id).hp > 0)); }
/** SPD groups only; no guessed tie-break, mixed-squad SPD aggregation or timing policy. */
export function inspectRobotBattleInitiative(s: RobotBattleCoreState) {
  const unresolved: string[] = [];
  if (s.units.some(u => u.hp > 0 && u.statuses.length)) unresolved.push("active-speed-effects-unresolved");
  const speeds = getRobotBattlePendingActors(s).map(actor => {
    const values = [...new Set(actor.unitIds.map(id => getRobotBattleUnit(s, id)).filter(u => u.hp > 0).map(u => u.stats.spd))];
    if (values.length !== 1) unresolved.push("mixed-squad-speed:" + actor.id);
    return { actorId: actor.id, spd: values.length === 1 ? values[0]! : null };
  });
  const values = [...new Set(speeds.flatMap(a => a.spd === null ? [] : [a.spd]))].sort((a, b) => b - a);
  const groups = values.map(spd => ({ spd, actorIds: speeds.filter(a => a.spd === spd).map(a => a.actorId) }));
  if (groups.some(g => g.actorIds.length > 1)) unresolved.push("equal-speed-order-unadopted");
  return { groups, unresolved, timingPolicy: "unresolved" as const };
}
/** Called by a trusted scheduler, never directly by the UI. Ordering policy is
 * intentionally outside this turn/resource ledger until formally settled.
 */
export function beginRobotBattleTurn(s: RobotBattleCoreState, actorId: string): RobotBattleCoreState {
  requireRobotBattleRunning(s);
  if (s.turn.actorId !== null) throw new Error("A battle turn is already open");
  const actor = getRobotBattlePendingActors(s).find(a => a.id === actorId); if (!actor) throw new Error("Actor already acted or has no living members");
  const units = s.units.map(u => !actor.unitIds.includes(u.id) || u.hp === 0 ? u : u.boss ? withRobotBattleBoss(u, beginRobotBossTurn(getRobotBattleBoss(u))) : { ...u, energy: beginRobotEnergyTurn(u.energy) });
  const next = { ...s, units, turn: { ...s.turn, actorId, serial: s.turn.serial + 1 } }; assertRobotBattleCore(next); return next;
}
export function requireRobotBattleInput(s: RobotBattleCoreState, actionId: string, turnId: string): boolean {
  if (!actionId) throw new Error("Action identity is required");
  if (s.actionIds.includes(actionId)) return false;
  requireRobotBattleRunning(s); if (robotBattleTurnId(s) !== turnId || s.turn.actorId === null) throw new Error("Stale battle turn"); return true;
}
export function finishRobotBattleTurn(s: RobotBattleCoreState): RobotBattleCoreState {
  const actor = getRobotBattleActor(s);
  const units = s.units.map(u => {
    if (!actor.unitIds.includes(u.id)) return u;
    if (u.hp === 0) return { ...u, energy: { ...u.energy, turnOpen: false } };
    let next = u.boss ? withRobotBattleBoss(u, endRobotBossTurn(getRobotBattleBoss(u))) : { ...u, energy: endRobotEnergyTurn(u.energy) };
    const recovery = applyRobotBasicEndTurnRecovery(u.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), { hp: next.hp, maxHp: next.maxHp, en: next.energy.en, maxEn: next.energy.maxEn, moved: next.energy.moved, usedExtraMove: next.energy.usedExtraMove });
    next = { ...next, hp: recovery.hp, energy: { ...next.energy, en: recovery.en } }; return next;
  });
  return { ...s, units, turn: { ...s.turn, actorId: null, actedActorIds: [...s.turn.actedActorIds, actor.id] } };
}
export function recordRobotBattleAction(s: RobotBattleCoreState, actionId: string, summary: string, damage: readonly RobotBattleDamageEvent[] = []): RobotBattleCoreState {
  if (typeof summary !== "string" || !summary || summary.length > 512) throw new Error("A short resolved battle summary is required");
  const next = { ...s, actionIds: [...s.actionIds, actionId], latest: { id: actionId, summary, damage } };
  // Detach resolved packet cells/arrays supplied by an upstream resolver.
  return decodeRobotBattleCore(next);
}
export function moveRobotBattleUnit(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly unitId: string; readonly destination: RobotPosition }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, input.unitId);
  if (actor.unitIds.length !== 1) throw new Error("Squad movement requires its dedicated joint resolver");
  if (!actor.unitIds.includes(unit.id) || unit.hp === 0 || !unit.position || !unit.movement || unit.energy.moved || unit.energy.action) throw new Error("Illegal or unresolved ordinary movement");
  const moves = getRobotLegalMoves({ ...unit.movement, board: s.board, origin: unit.position, occupied: s.units.filter(u => u.hp > 0 && u.id !== unit.id).map(u => u.position!), structures: getRobotBattleStructures(s) });
  if (!moves.some(m => sameRobotCoreCell(m.destination, input.destination))) throw new Error("Illegal ordinary movement destination");
  const units = s.units.map(u => u.id === unit.id ? { ...u, position: { ...input.destination }, energy: recordRobotEnergyMove(u.energy, "ordinary") } : u);
  return recordRobotBattleAction({ ...s, units }, input.actionId, unit.name + "：通常移動");
}
export function commitRobotBattlePassive(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly kind: "wait" | "charge" }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  if (input.kind !== "wait" && input.kind !== "charge") throw new Error("Unsupported passive action");
  const actor = getRobotBattleActor(s), units = s.units.map(u => actor.unitIds.includes(u.id) && u.hp > 0 ? { ...u, energy: commitRobotEnergyAction(u.energy, { kind: input.kind === "charge" ? "charge" : "other", energyCost: 0 }) } : u);
  if (input.kind === "charge" && actor.unitIds.some(id => getRobotBattleUnit(s, id).kind === "light")) throw new Error("Light squads have no charge/special actions");
  return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units }), input.actionId, actor.id + (input.kind === "charge" ? "：チャージ" : "：待機"));
}
export function commitRobotBattleBossCommand(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly context?: Omit<RobotBossSkillContext, "board" | "units"> }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (actor.unitIds.length !== 1 || !unit.boss) throw new Error("Current actor is not a boss");
  const contextUnits: RobotBossUnit[] = s.units.filter(u => u.position !== null).map(u => ({ id: u.id, kind: u.kind, team: robotBattleIsAlly(u) ? "player" : "enemy", hp: u.hp, position: u.position!, squadId: u.squadId, ...(u.chassis ? { chassis: u.chassis } : {}), carryingUnsentData: u.carriedObjectiveId !== null }));
  const boss = commitRobotBossSkill(getRobotBattleBoss(unit), { ...input.context, board: s.board, units: contextUnits });
  return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units: s.units.map(u => u.id === unit.id ? withRobotBattleBoss(u, boss) : u) }), input.actionId, unit.name + "：" + boss.plan.definition.skill.name);
}
export function getRobotBattleCommandBonus(s: RobotBattleCoreState, unitId: string, targetId: string | null) {
  const unit = getRobotBattleUnit(s, unitId);
  return getRobotCommandBonuses(s.units.flatMap(u => u.boss?.effects ?? []), { id: unit.id, squadId: unit.squadId, team: robotBattleIsAlly(unit) ? "player" : "enemy", kind: unit.kind }, targetId);
}
export function commitRobotBattleData(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly kind: "pickup" | "transmit" }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (s.objective.kind !== "m30" || actor.unitIds.length !== 1) throw new Error("M30 data action required");
  const result = commitRobotM30DataAction(s.objective.state, robotBattleLifeUnit(unit), unit.energy, input.kind);
  const units = s.units.map(u => u.id === unit.id ? { ...u, energy: result.energy, carriedObjectiveId: result.actor.carriedObjectiveId } : u);
  return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units, objective: { kind: "m30", state: result.state } }), input.actionId, unit.name + (input.kind === "pickup" ? "：データ取得" : "：データ送信"));
}
export function configureRobotBattleAi(s: RobotBattleCoreState, change: RobotAiConfiguration): RobotBattleCoreState {
  requireRobotBattleRunning(s); assertRobotAiConfiguration(change);
  if (change.kind === "mode") return { ...s, ai: { ...s.ai, mode: change.mode } };
  const owner = getRobotBattleUnit(s, change.unitId), order = change.instruction;
  if (owner.kind !== "friendly-ai" || owner.hp === 0) throw new Error("Invalid friendly AI instruction owner");
  if ("targetUnitId" in order) { const target = getRobotBattleUnit(s, order.targetUnitId); if (target.hp === 0 || (order.tacticId === "focus-attack" ? robotBattleIsAlly(target) : !robotBattleIsAlly(target))) throw new Error("Invalid AI instruction target"); }
  if ("cell" in order) coreCell(s, order.cell);
  return { ...s, ai: { ...s.ai, instructions: { ...s.ai.instructions, [owner.id]: JSON.parse(JSON.stringify(order)) as RobotAiInstruction } } };
}

export type RobotBattleReinforcementFactory = (spawn: ReturnType<typeof spawnRobotM30Reinforcements>["spawned"][number]) => readonly RobotBattleUnitInit[];
export function advanceRobotBattleRound(s: RobotBattleCoreState, reinforcementFactory?: RobotBattleReinforcementFactory): RobotBattleCoreState {
  requireRobotBattleRunning(s);
  if (s.turn.actorId !== null || getRobotBattlePendingActors(s).length) throw new Error("Complete the full round before advancing");
  let objective: RobotBattleObjective = s.objective;
  if (objective.kind === "m02" && s.allied.round === 8) {
    const next = { ...s, objective: { ...objective, result: "lost" as const, reason: "round-limit" } }; assertRobotBattleCore(next); return next;
  }
  if (objective.kind === "m30") {
    objective = { kind: "m30", state: finishRobotM30Round(objective.state, s.allied.round) };
    if (objective.state.result !== "ongoing") { const next = { ...s, objective }; assertRobotBattleCore(next); return next; }
  }
  const life = beginNextRobotAlliedRound(robotBattleLifecycle(s), { board: s.board, spawnPriority: s.respawnPriority, occupied: s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0).map(u => u.position!), structures: getRobotBattleStructures(s) });
  const units: RobotBattleUnit[] = s.units.map(u => {
    const allied = life.state.allies.find(a => a.id === u.id), returned = life.respawnedUnitIds.includes(u.id);
    let energy = advanceRobotEnergyRound(u.energy);
    if (returned) energy = { ...energy, en: allied!.en, moved: false, usedExtraMove: false, action: null, normalHitRecovered: false, killRecovered: false };
    return allied ? { ...u, hp: allied.hp, position: allied.position, statuses: allied.statuses, carriedObjectiveId: allied.carriedObjectiveId, energy } : { ...u, energy };
  });
  let actors = [...s.actors];
  if (objective.kind === "m30") {
    const spawn = spawnRobotM30Reinforcements(objective.state, units.filter(u => u.hp > 0).map(u => u.position!));
    for (const wave of spawn.spawned) {
      if (!reinforcementFactory) throw new Error("Reinforcement stat/movement resolver required before entering this round");
      const specs = reinforcementFactory(wave);
      if (specs.length !== 3 || specs.some(u => u.kind !== "light" || u.squadId !== wave.squadId || !u.position || !wave.cells.some(c => sameRobotCoreCell(c, u.position!))) || new Set(specs.map(u => u.position && u.position.x + "," + u.position.y)).size !== 3) throw new Error("Reinforcement factory differs from adopted placement");
      const fresh = specs.map(spec => makeRobotBattleUnit(spec, life.state.round)); units.push(...fresh); actors.push({ id: wave.squadId, unitIds: fresh.map(u => u.id) });
    }
    objective = { kind: "m30", state: spawn.state };
  }
  const next = { ...s, objective, units, actors, allied: robotBattleAlliedLedger(life.state), turn: { ...s.turn, actorId: null, actedActorIds: [] } }; assertRobotBattleCore(next); return next;
}

function integer(value: number, min = 0): void { if (!Number.isSafeInteger(value) || value < min) throw new Error("Invalid battle core integer"); }
function unique(ids: readonly string[]): void { if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !id || id.length > 512)) throw new Error("Invalid/duplicate battle core identity"); }
function coreCell(s: Pick<RobotBattleCoreState, "board">, cell: RobotPosition): void { integer(cell.x); integer(cell.y); if (cell.x >= s.board.width || cell.y >= s.board.height) throw new Error("Battle cell outside board"); }
/** Resume validation for this version's connected mechanics, not an approval of
 * unimplemented statuses, range, initiative timing or complete attack legality.
 */
export function assertRobotBattleCore(s: RobotBattleCoreState): void {
  if (s.version !== 1 || !s.id || ![2, 30].includes(s.key.missionNumber) || !["easy", "normal", "hard"].includes(s.key.difficulty)) throw new Error("Invalid battle core version/mission");
  integer(s.allied.round, 1); integer(s.turn.serial); unique(s.units.map(u => u.id)); unique(s.actors.map(a => a.id)); unique(s.actionIds); unique(s.attackIds); unique(s.turn.actedActorIds);
  integer(s.allied.lastDefeatEvent);
  const stage = getRobotStagePlan(s.key);
  if (s.board.width !== stage.board.width || s.board.height !== stage.board.height || JSON.stringify(s.board.walls) !== JSON.stringify(stage.board.walls.map(robotCellToPosition)) || JSON.stringify(s.respawnPriority) !== JSON.stringify(stage.respawnPriority.map(robotCellToPosition))) throw new Error("Battle stage geometry differs from catalog");
  const liveCells: string[] = [], allySlots: string[] = [];
  for (const u of s.units) {
    if (!["controlled", "friendly-ai", "light", "medium", "heavy", "boss"].includes(u.kind)) throw new Error("Unknown battle unit kind");
    integer(u.hp); integer(u.maxHp, 1); integer(u.energy.en); integer(u.energy.maxEn); integer(u.energy.ownTurn);
    for (const flag of [u.energy.turnOpen, u.energy.moved, u.energy.usedExtraMove, u.energy.normalHitRecovered, u.energy.killRecovered, u.energy.damagedRecovered]) if (typeof flag !== "boolean") throw new Error("Invalid energy event allowance");
    if (u.energy.action !== null) { if (!["normal-attack", "charge", "extra-move", "other"].includes(u.energy.action.kind)) throw new Error("Invalid energy action"); integer(u.energy.action.energyCost); if (u.energy.action.energyCost > u.energy.maxEn || u.energy.turnOpen) throw new Error("Invalid or unfinished action checkpoint"); }
    if (u.hp > u.maxHp || u.energy.en > u.energy.maxEn || u.energy.round !== s.allied.round) throw new Error("Invalid battle vitals/round");
    for (const stat of ["melee", "ranged", "mov", "spd"] as const) integer(u.stats[stat]);
    if (!Number.isSafeInteger(u.stats.def)) throw new Error("Invalid modified DEF");
    if (u.stats.mov < 1) throw new Error("Movement is below the adopted minimum");
    if (u.movement && (u.movement.mov !== u.stats.mov || !u.movement.types.length || u.movement.types.some(t => !["omni", "straight", "forward", "diagonal"].includes(t)) || !["north", "south", "east", "west"].includes(u.movement.facing) || u.movement.mov < 1 || u.movement.mov > 7)) throw new Error("Invalid movement snapshot");
    u.parts.forEach(p => resolveRobotBasicPart(p.partId, p.level));
    if (!Array.isArray(u.statuses) || u.statuses.some(st => typeof st !== "string")) throw new Error("Invalid status snapshot");
    if (u.position) coreCell(s, u.position);
    if (u.hp > 0) { if (!u.position || s.board.walls.some(w => sameRobotCoreCell(w, u.position!)) || getRobotBattleStructures(s).some(c => sameRobotCoreCell(c, u.position!))) throw new Error("Living unit occupies blocked terrain"); liveCells.push(u.position.x + "," + u.position.y); }
    if (robotBattleIsAlly(u)) { if (u.number === null || ![1, 2, 3].includes(u.number) || u.hp === 0 && u.position !== null) throw new Error("Invalid allied life snapshot"); allySlots.push(u.kind + ":" + u.number); }
    else if (u.number !== null || u.carriedObjectiveId !== null) throw new Error("Enemy cannot use allied respawn/carrier state");
    if (u.kind === "boss") {
      const b = getRobotBattleBoss(u), canonical = getRobotBossPlan(s.key.missionNumber, s.key.difficulty);
      if (JSON.stringify(b.plan) !== JSON.stringify(canonical) || b.plan.definition.unitId !== u.id || b.plan.stats.hp !== u.maxHp || b.plan.stats.en !== u.energy.maxEn || Object.entries(u.stats).some(([stat, value]) => value !== b.plan.stats[stat as keyof typeof u.stats])) throw new Error("Invalid boss snapshot");
      if (u.hp === 0 && b.effects.some(e => e.sourceBossId === u.id)) throw new Error("Defeated boss still grants command effects");
      if (JSON.stringify(u.parts) !== JSON.stringify(canonical.definition.weaponIds.map(partId => ({ partId, level: canonical.weaponLevel })))) throw new Error("Boss weapons differ from adopted equipment");
      if (b.turnStartHp !== null) { integer(b.turnStartHp, 1); if (b.turnStartHp > u.maxHp) throw new Error("Invalid boss turn-start HP"); }
      if ((u.energy.ownTurn === 0) !== (b.turnStartHp === null) || typeof b.ultimateUsed !== "boolean" || b.ultimateUsed !== (s.key.missionNumber === 30 && b.lastSkillOwnTurn !== null)) throw new Error("Invalid boss turn/ultimate ledger");
      if (b.lastSkillOwnTurn !== null) { integer(b.lastSkillOwnTurn, 1); if (b.lastSkillOwnTurn > u.energy.ownTurn) throw new Error("Invalid boss command turn"); }
      if (!Array.isArray(b.events) || b.events.some(e => typeof e !== "string")) throw new Error("Invalid boss event history");
      unique(b.effects.map(e => e.id));
      for (const effect of b.effects) {
        const skill = canonical.definition.skill;
        if (!("bonusesByDifficulty" in skill) || effect.sourceBossId !== u.id || b.lastSkillOwnTurn === null || effect.id !== `${u.id}:${b.lastSkillOwnTurn}` || effect.expiresAtOwnTurn !== b.lastSkillOwnTurn + 1 || effect.expiresAtOwnTurn <= u.energy.ownTurn || effect.consumeOnSquadAttack || effect.squadId !== null || effect.attackTargetId !== null || !Array.isArray(effect.unitIds) || JSON.stringify(effect.bonuses) !== JSON.stringify(skill.bonusesByDifficulty[s.key.difficulty])) throw new Error("Invalid connected boss command effect");
        unique(effect.unitIds);
        for (const id of effect.unitIds) { const target = getRobotBattleUnit(s, id); if (target.kind !== "light" || "guardSquadId" in skill && target.squadId !== skill.guardSquadId) throw new Error("Invalid command recipient"); }
      }
    }
    else if (u.boss) throw new Error("Boss ledger attached to another unit kind");
  }
  unique(liveCells); unique(allySlots);
  if (s.units.filter(u => u.kind === "controlled").length !== 3) throw new Error("Three controlled cores required");
  const assigned: string[] = [];
  for (const actor of s.actors) {
    unique(actor.unitIds); const members = actor.unitIds.map(id => getRobotBattleUnit(s, id));
    if (!members.length || (members.length === 1 ? members[0]!.kind === "light" : members.length !== 3 || members.some(u => u.kind !== "light" || u.squadId !== actor.id))) throw new Error("Invalid singleton/squad initiative slot");
    assigned.push(...actor.unitIds);
  }
  unique(assigned); if (assigned.length !== s.units.length) throw new Error("Every unit must have exactly one initiative actor");
  if (s.turn.actedActorIds.some(id => !s.actors.some(a => a.id === id))) throw new Error("Unknown acted actor");
  const active = s.turn.actorId === null ? [] : getRobotBattleActor(s).unitIds.filter(id => getRobotBattleUnit(s, id).hp > 0);
  if (s.turn.actorId !== null && (s.turn.actedActorIds.includes(s.turn.actorId) || !active.length)) throw new Error("Invalid current turn");
  for (const u of s.units) if (u.energy.turnOpen !== active.includes(u.id)) throw new Error("Energy ledger and current actor disagree");
  for (const actor of s.actors.filter(a => s.turn.actedActorIds.includes(a.id))) for (const id of actor.unitIds) { const unit = getRobotBattleUnit(s, id); if (unit.hp > 0 && (unit.energy.action === null || unit.energy.ownTurn < 1)) throw new Error("Completed actor missing its action receipt"); }
  unique(s.allied.waiting.map(w => w.unitId)); unique(s.allied.controlledDefeatedThisRound);
  for (const w of s.allied.waiting) { const u = getRobotBattleUnit(s, w.unitId); if (!robotBattleIsAlly(u) || u.hp !== 0 || w.returnRound !== w.defeatedRound + 2 || w.defeatedRound > s.allied.round || w.defeatEvent > s.allied.lastDefeatEvent) throw new Error("Invalid respawn queue"); integer(w.defeatedRound, 1); integer(w.returnRound, 3); integer(w.defeatEvent, 1); }
  for (const id of s.allied.controlledDefeatedThisRound) if (getRobotBattleUnit(s, id).kind !== "controlled" || !s.allied.waiting.some(w => w.unitId === id && w.defeatedRound === s.allied.round)) throw new Error("Invalid same-round defeat reference");
  if (s.units.filter(u => robotBattleIsAlly(u) && u.hp === 0).some(u => !s.allied.waiting.some(w => w.unitId === u.id))) throw new Error("Dead ally missing from respawn queue");
  if (s.allied.lostBySameRoundWipe !== (s.allied.controlledDefeatedThisRound.length === 3)) throw new Error("Invalid same-round wipe flag");
  if (s.objective.kind === "m02") {
    const o = s.objective, dead = getRobotBattleUnit(s, "commander").hp === 0;
    if (s.key.missionNumber !== 2 || s.allied.round > 8 || o.bossId !== "commander" || !["ongoing", "won", "lost"].includes(o.result) || s.units.some(u => u.carriedObjectiveId !== null)) throw new Error("Invalid M02 objective");
    if (o.result === "ongoing" && (dead || s.allied.lostBySameRoundWipe || o.reason !== null) || o.result === "won" && (!dead || s.allied.lostBySameRoundWipe || o.reason !== "commander-defeated") || o.result === "lost" && !(o.reason === "same-round-controlled-wipe" && s.allied.lostBySameRoundWipe || o.reason === "round-limit" && s.allied.round === 8 && !dead && getRobotBattlePendingActors(s).length === 0)) throw new Error("M02 outcome disagrees with battle state");
  }
  else if (s.objective.kind === "m30") {
    const m = s.objective.state, canonical = createRobotM30State(s.key.difficulty);
    unique(m.appliedAttackIds); unique(m.spawnedWaveIds);
    if (m.appliedAttackIds.some(id => !s.attackIds.includes(id)) || m.spawnedWaveIds.some(id => !stage.reinforcements.some(w => w.id === id))) throw new Error("Invalid M30 attack/wave receipt");
    for (const wave of stage.reinforcements) {
      const actor = s.actors.find(a => a.id === wave.squad.id), spawned = m.spawnedWaveIds.includes(wave.id);
      if (spawned !== Boolean(actor) || spawned && (wave.availableFromRound === null || m.round < wave.availableFromRound)) throw new Error("M30 reinforcement receipt/roster mismatch");
    }
    if (s.key.missionNumber !== 30 || m.round !== s.allied.round || m.round > 16 || m.difficulty !== s.key.difficulty || m.facility.id !== canonical.facility.id || m.facility.maxHp !== canonical.facility.maxHp || m.facility.def !== canonical.facility.def || JSON.stringify(m.facility.cells) !== JSON.stringify(canonical.facility.cells)) throw new Error("Invalid M30 objective/structure");
    integer(m.facility.hp); if (m.facility.hp > m.facility.maxHp || m.facility.hp === 0 && m.result !== "lost") throw new Error("Invalid facility HP/result");
    if (!["ongoing", "won", "lost"].includes(m.result) || m.result === "ongoing" && (m.resultReason !== null || s.allied.lostBySameRoundWipe) || m.result === "won" && (m.round !== 16 || !m.bossDefeated || !m.data.sent || m.facility.hp === 0 || s.allied.lostBySameRoundWipe || getRobotBattlePendingActors(s).length || m.resultReason !== "all-three-conditions-at-R16-end") || m.result === "lost" && !(m.resultReason === "facility-destroyed" && m.facility.hp === 0 || m.resultReason === "same-round-controlled-wipe" && s.allied.lostBySameRoundWipe || m.resultReason === "round-limit" && m.round === 16 && (!m.bossDefeated || !m.data.sent) && getRobotBattlePendingActors(s).length === 0)) throw new Error("M30 outcome disagrees with battle state");
    if (m.bossDefeated !== (getRobotBattleUnit(s, "enemy-supreme-commander").hp === 0)) throw new Error("Boss objective and HP disagree");
    const carriers = s.units.filter(u => u.carriedObjectiveId !== null);
    if (typeof m.data.sent !== "boolean" || carriers.some(u => u.kind !== "controlled" || u.hp === 0 || u.carriedObjectiveId !== ROBOT_M30_DATA_ID) || carriers.length !== (m.data.carrierId ? 1 : 0) || m.data.carrierId && carriers[0]?.id !== m.data.carrierId || m.data.sent && (m.data.cell !== null || m.data.carrierId !== null) || !m.data.sent && (m.data.cell === null) === (m.data.carrierId === null)) throw new Error("Invalid data carrier/objective snapshot");
    if (m.data.cell) coreCell(s, m.data.cell);
  } else throw new Error("Unsupported battle objective");
  if (getRobotBattleResult(s).result !== "ongoing" && s.turn.actorId !== null) throw new Error("Ended battle still has an open turn");
  if (s.latest && (!s.actionIds.includes(s.latest.id) || typeof s.latest.summary !== "string" || !s.latest.summary || s.latest.damage.some(e => !s.attackIds.includes(e.attackId) || !s.units.some(u => u.id === e.sourceId) || !s.units.some(u => u.id === e.targetId) && !(s.objective.kind === "m30" && s.objective.state.facility.id === e.targetId) || e.damage !== null && (!Number.isSafeInteger(e.damage) || e.damage < 1) || !isRobotBattleEffectKind(e.effectKind) || !e.cells.length || e.cells.some(c => !Number.isSafeInteger(c.x) || !Number.isSafeInteger(c.y) || c.x < 0 || c.y < 0 || c.x >= s.board.width || c.y >= s.board.height)))) throw new Error("Invalid resolved event receipt");
  if (!["auto", "manual"].includes(s.ai.mode)) throw new Error("Invalid AI mode");
  if (Object.keys(s.ai.instructions).length !== s.units.filter(u => u.kind === "friendly-ai").length) throw new Error("Missing friendly AI order");
  for (const [unitId, instruction] of Object.entries(s.ai.instructions)) {
    assertRobotAiConfiguration({ kind: "instruction", unitId, instruction }); if (getRobotBattleUnit(s, unitId).kind !== "friendly-ai") throw new Error("Invalid AI instruction owner");
    if ("targetUnitId" in instruction) { const target = getRobotBattleUnit(s, instruction.targetUnitId); if (instruction.tacticId === "focus-attack" ? robotBattleIsAlly(target) : !robotBattleIsAlly(target)) throw new Error("Invalid saved AI target team"); }
    if ("cell" in instruction) coreCell(s, instruction.cell);
  }
}
export function isRobotBattleEffectKind(kind: string): kind is RobotBattleEffectKind { return ["slash", "blunt", "thrust", "assault", "sniper", "blast", "line", "delta", "pincer", "pair-defense", "protection"].includes(kind) || typeof kind === "string" && kind.startsWith("special:") && kind.length > 8; }
export function decodeRobotBattleCore(raw: unknown): RobotBattleCoreState {
  if (typeof raw !== "object" || raw === null) throw new Error("Invalid battle snapshot");
  const snapshot = JSON.parse(JSON.stringify(raw)) as RobotBattleCoreState; assertRobotBattleCore(snapshot); return snapshot;
}
