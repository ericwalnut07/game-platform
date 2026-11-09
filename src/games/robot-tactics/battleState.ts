import { assertRobotEarlyMission, createRobotEarlyMission, finishRobotEarlyRound, getRobotEarlyDataAction, reconcileRobotEarlyMission, robotMissionDataId, spawnRobotEarlyWave, type RobotEarlyMissionState } from "./earlyMissions";
import { assertRobotHazards, endRobotHazardTurn, expireRobotHazards, getRobotHazardMovePenalty, moveRobotThroughHazards, type RobotHazardState } from "./hazards";
import { assertRobotDecoys, type RobotDecoy } from "./decoys";
import { assertRobotAfterAttack, type RobotAfterAttack } from "./afterAttack";
import { assertRobotAdoptedEffects, expireRobotOwnedEffects, type RobotOwnedDuration, type RobotResupplyField } from "./adoptedEffects";
import { assertRobotBurning, tickRobotBurning, type RobotBurning } from "./burning";
import type { RobotFuseState, RobotFuseExplosion } from "./fuseTypes";
import { assertRobotFuses } from "./fuseValidation";
import { resolveRobotFuses } from "./fuseResolution";
import { applyRobotPhaseDamage, applyRobotReactions, getRobotDamageFactors, hasRobotAddon, type RobotFormationDefense } from "./battleEffects";
import { settleRobotBattleConsequences } from "./battleSettlement";
import { assertRobotRoundInitiative, createRobotRoundInitiative, getRobotInitiativeQueue, type RobotBattleRoundInitiative } from "./initiative";
import { createRobotM01State, finishRobotM01Round, spawnRobotM01Reinforcements, type RobotM01State } from "./m01Mission";
import { createRobotAlliedLifecycle, beginNextRobotAlliedRound, type RobotAlliedLifeUnit, type RobotAlliedLifecycleState } from "./alliedLifecycle";
import { clearRobotEnergyLock, advanceRobotEnergyRound, beginRobotEnergyTurn, commitRobotEnergyAction, recordRobotEnergyMove, type RobotEnergyState } from "./energy";
import { createRobotAddonEnergyState, endRobotAddonEnergyTurn, requireRobotAddonEnergySupport } from "./addonEnergy";
import { applyRobotBasicEndTurnRecovery, getRobotShieldActionPlan } from "./equipmentEffects";
import { resolveRobotBasicPart, type RobotAddonSelection, type RobotPartSelection } from "./equipment";
import { beginRobotBossTurn, commitRobotBossSkill, createRobotBossState, endRobotBossTurn, getRobotCommandBonuses, isRobotM09VoluntaryDestination, type RobotBossSkillContext, type RobotBossState, type RobotBossUnit } from "./bossCommands";
import { createRobotM30State, commitRobotM30DataAction, finishRobotM30Round, spawnRobotM30Reinforcements, ROBOT_M30_DATA_ID, type RobotM30State } from "./m30Mission";
import { getRobotLegalMoves, robotCellToPosition, type RobotMovementShape, type RobotPosition } from "./movement";
import { getRobotStagePlan } from "./stageCatalog";
import { assertRobotAiConfiguration, type RobotAiConfiguration, type RobotAiInstruction, type RobotAiMode } from "./aiInstructions";
import type { RobotStageKey } from "./types";
import { getRobotBossPlan } from "./bossCatalog";
import { applyRobotWeaponDebuffStats, assertRobotWeaponDebuffs, type RobotWeaponDebuff } from "./weaponHitEffects";

export interface RobotBattleEnergyRecovery { readonly id: string; readonly unitId: string; readonly cell: RobotPosition; readonly amount: number }
export type RobotBattleUnitKind = "controlled" | "friendly-ai" | "light" | "medium" | "heavy" | "boss";
export type RobotBattleBossLedger = Omit<RobotBossState, "hp" | "position" | "energy">;
export interface RobotBattleUnit {
  readonly id: string; readonly name: string; readonly kind: RobotBattleUnitKind;
  readonly number: 1 | 2 | 3 | null; readonly squadId: string | null; readonly chassis: string | null;
  readonly hp: number; readonly maxHp: number; readonly position: RobotPosition | null;
  readonly stats: { readonly melee: number; readonly ranged: number; readonly def: number; readonly mov: number; readonly spd: number };
  readonly energy: RobotEnergyState; readonly movement: RobotMovementShape | null;
  readonly parts: readonly RobotPartSelection[]; readonly statuses: readonly string[];
  /** Missing in legacy checkpoints = none. Cleared at own-turn end or defeat. */
  readonly coreLevel?: number;
  readonly mineSlowUntilOwnTurn?: number;
  readonly burning?: RobotBurning;
  readonly formationDefense?: readonly RobotFormationDefense[];
  readonly stationaryDefense?: boolean;
  readonly overwatch?: { readonly weaponId: string; readonly hitUnitIds: readonly string[]; readonly multiplier: number };
  readonly counterRound?: number; readonly interceptionRound?: number;
  readonly reactionKillRound?: number; readonly dotKillRound?: number;
  readonly fuseKillRound?: number;
  readonly rootedUntilOwnTurn?: number;
  readonly reactionsSuppressedUntilOwnTurn?: number;
  readonly tacticalMark?: RobotOwnedDuration;
  readonly projectedDefense?: RobotOwnedDuration;
  readonly weakpoint?: RobotOwnedDuration & { readonly amount: number };
  readonly weaponDebuffs?: readonly RobotWeaponDebuff[];
  /** Omitted in legacy snapshots = empty. Bound to the departure by the runtime. */
  readonly addons?: readonly RobotAddonSelection[];
  /** Missing/false = inactive. Expires at the next own-turn start. */
  readonly shielded?: boolean;
  readonly defended?: boolean;
  readonly carriedObjectiveId: string | null; readonly boss: RobotBattleBossLedger | null;
}
export type RobotBattleUnitInit = Omit<RobotBattleUnit, "hp" | "energy" | "statuses" | "weaponDebuffs" | "carriedObjectiveId" | "boss" | "shielded"> & { readonly maxEn: number };
export interface RobotBattleActor { readonly id: string; readonly unitIds: readonly string[] }
export type RobotBattleObjective =
  | { readonly kind: "m01"; readonly state: RobotM01State }
  | { readonly kind: "m02"; readonly result: "ongoing" | "won" | "lost"; readonly reason: string | null; readonly bossId: "commander" }
  | { readonly kind: "early"; readonly state: RobotEarlyMissionState }
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
  /** Optional for compatibility with checkpoints predating the adopted objectives. */
  readonly sortieSubobjectiveEligible?: boolean;
  readonly initiative?: RobotBattleRoundInitiative;
  readonly turn: { readonly actorId: string | null; readonly serial: number; readonly actedActorIds: readonly string[] };
  readonly actionIds: readonly string[]; readonly attackIds: readonly string[];
  /** Internal phase output, stripped before publishing any checkpoint. */
  readonly priorDamage?: readonly RobotBattleDamageEvent[];
  readonly pendingDamage?: readonly RobotBattleDamageEvent[];
  readonly sharedVictoryDefeats?: readonly string[];
  readonly decoys?: readonly RobotDecoy[];
  readonly afterAttack?: RobotAfterAttack;
  readonly resupplyField?: RobotResupplyField;
  readonly hazards?: RobotHazardState;
  readonly pendingDecoyTargets?: readonly { readonly id:string; readonly cell:RobotPosition; readonly hp:number }[];
  readonly pendingEnergyRecoveries?: readonly RobotBattleEnergyRecovery[];
  readonly fuses?: RobotFuseState;
  readonly pendingFuseExplosions?: readonly RobotFuseExplosion[];
  readonly spentFormations?: readonly string[];
  readonly latest: { readonly id: string; readonly summary: string; readonly damage: readonly RobotBattleDamageEvent[]; readonly areaCells?: readonly RobotPosition[]; readonly blastEmptyCenters?: readonly RobotPosition[]; readonly supportCues?: readonly { readonly cell:RobotPosition; readonly effect:"defense_up"|"defense_down"|"heal"|"link_attack" }[]; readonly decoyTargets?: readonly { readonly id:string; readonly cell:RobotPosition; readonly hp:number }[]; readonly energyRecoveries?: readonly RobotBattleEnergyRecovery[]; readonly fuseExplosions?: readonly RobotFuseExplosion[] } | null;
  readonly ai: { readonly mode: RobotAiMode; readonly allowFormations?: boolean; readonly instructions: Readonly<Record<string, RobotAiInstruction>> };
}
export const robotBattleIsAlly = (u: Pick<RobotBattleUnit, "kind">) => u.kind === "controlled" || u.kind === "friendly-ai";
export const sameRobotCoreCell = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;
export const robotBattleTurnId = (s: RobotBattleCoreState) => `${s.id}:r${s.allied.round}:t${s.turn.serial}`;
export function getRobotBattleResult(s: RobotBattleCoreState) {
  return s.objective.kind === "m02" ? { result: s.objective.result, reason: s.objective.reason } : { result: s.objective.state.result, reason: s.objective.state.resultReason };
}
export function requireRobotBattleRunning(s: RobotBattleCoreState): void { if (getRobotBattleResult(s).result !== "ongoing") throw new Error("Battle already ended"); }
export function getRobotBattleUnit(s: RobotBattleCoreState, id: string): RobotBattleUnit { const unit = s.units.find(u => u.id === id); if (!unit) throw new Error("Unknown battle unit: " + id); return unit; }
export function clearRobotBattleShield(u: RobotBattleUnit): RobotBattleUnit {
  if (!u.shielded && !u.defended) return u;
  const { shielded: _shielded, defended: _defended, ...rest } = u; return rest;
}
export function clearRobotBattleRestrictions(u: RobotBattleUnit): RobotBattleUnit { const { mineSlowUntilOwnTurn: _mine, rootedUntilOwnTurn: _root, ...rest } = u; return { ...rest, energy: clearRobotEnergyLock(rest.energy) }; }
export function clearRobotBattleWeaponDebuffs(u: RobotBattleUnit): RobotBattleUnit {
  if (u.weaponDebuffs === undefined && u.reactionsSuppressedUntilOwnTurn === undefined) return u;
  const { weaponDebuffs: _debuffs, reactionsSuppressedUntilOwnTurn: _suppression, ...rest } = u; return rest;
}
function expireRobotWeaponDebuffs(u: RobotBattleUnit): RobotBattleUnit { const { weaponDebuffs, ...rest } = u; const remaining = weaponDebuffs?.filter(d => d.untilOwnTurn !== undefined && d.untilOwnTurn > u.energy.ownTurn); return remaining?.length ? { ...rest, weaponDebuffs: remaining } : rest; }
export function getRobotBattleEffectiveStats(u: RobotBattleUnit): RobotBattleUnit["stats"] { const stats = applyRobotWeaponDebuffStats(u.stats, u.weaponDebuffs); return { ...stats, mov: Math.max(1, stats.mov - (u.mineSlowUntilOwnTurn === undefined ? 0 : 1)), def: stats.def - (u.weakpoint?.amount ?? 0) }; }
/** Temporary MOV is projected onto the original movement types/facing. */
export function getRobotBattleMovementShape(u: RobotBattleUnit, s?: RobotBattleCoreState): RobotMovementShape | null { return u.movement ? { ...u.movement, mov: Math.max(1,getRobotBattleEffectiveStats(u).mov-(s?getRobotHazardMovePenalty(s,u):0)) } : null; }
/** Shared ordinary-move choices and execution use the same effective shape. */
export function getRobotBattleLegalMoves(s: RobotBattleCoreState, unitId: string) {
  const u = getRobotBattleUnit(s, unitId), shape = getRobotBattleMovementShape(u, s);
  if (!shape || !u.position || u.hp <= 0 || u.rootedUntilOwnTurn !== undefined || u.energy.moved || u.energy.action !== null) return [];
  const moves = getRobotLegalMoves({ ...shape, board: s.board, origin: u.position, occupied: s.units.filter(other => other.hp > 0 && other.id !== u.id).map(other => other.position!), structures: getRobotBattleStructures(s) });
  return u.kind === "boss" && s.key.missionNumber === 9 ? moves.filter(move => isRobotM09VoluntaryDestination(move.destination)) : moves;
}
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
  const { maxEn: inputMaxEn, ...base } = input;
  const maxEn = input.kind === "light" ? 0 : inputMaxEn;
  return { ...base, hp: input.maxHp, energy: { ...createRobotAddonEnergyState(maxEn, input.addons === undefined ? [] : input.addons), round }, statuses: [], carriedObjectiveId: null, boss: null };
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
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].includes(input.key.missionNumber)) throw new Error("Only M01-M30 objective adapters are connected");
  const stage = getRobotStagePlan(input.key), life = createRobotAlliedLifecycle(input.units.filter(robotBattleIsAlly).map(robotBattleLifeUnit));
  const result: RobotBattleCoreState = { version: 1, id: input.id, key: { ...input.key }, board: { ...stage.board, walls: stage.board.walls.map(robotCellToPosition) }, respawnPriority: stage.respawnPriority.map(robotCellToPosition), units: input.units, actors: input.actors, allied: robotBattleAlliedLedger(life), objective: input.key.missionNumber === 1 ? { kind: "m01", state: createRobotM01State(input.key.difficulty) } : input.key.missionNumber === 2 ? { kind: "m02", result: "ongoing", reason: null, bossId: "commander" } : input.key.missionNumber<=14 || [15,16,17,18,19,20,21,22,23,24,25,26,27,28,29].includes(input.key.missionNumber) ? {kind:"early",state:createRobotEarlyMission(input.key)} : { kind: "m30", state: createRobotM30State(input.key.difficulty) }, turn: { actorId: null, serial: 0, actedActorIds: [] }, actionIds: [], attackIds: [], latest: null, ai: { mode: "auto", instructions: Object.fromEntries(input.units.filter(u => u.kind === "friendly-ai").map(u => [u.id, { tacticId: "free-action" as const }])) } };
  return decodeRobotBattleCore(result);
}
/** Shared HP entities; no pseudo-unit or duplicated HP pool. */
export function getRobotBattleFacilities(s: RobotBattleCoreState) {
  return s.objective.kind === "m01" || s.objective.kind === "early" ? s.objective.state.objects.objects : s.objective.kind === "m30" ? [s.objective.state.facility] : [];
}
/** Depots belong to the enemy; defense facilities, convoy and decoys to allies. */
export function isRobotBattleHostileObject(s:RobotBattleCoreState,sourceId:string,targetId:string):boolean {
  const target=getRobotBattleFacilities(s).find(o=>o.id===targetId),source=getRobotBattleUnit(s,sourceId);
  return target ? robotBattleIsAlly(source)===(s.objective.kind==="early"&&[4,11,18,23].includes(s.key.missionNumber)) : !!s.decoys?.some(d=>d.id===targetId)&&!robotBattleIsAlly(source);
}
export function getRobotBattleStructures(s: RobotBattleCoreState): readonly RobotPosition[] { return [...getRobotBattleFacilities(s).flatMap(o => o.cells), ...(s.decoys??[]).map(d=>d.cell)]; }
export function getRobotBattlePendingActors(s: RobotBattleCoreState): readonly RobotBattleActor[] { return s.actors.filter(a => !s.turn.actedActorIds.includes(a.id) && a.unitIds.some(id => getRobotBattleUnit(s, id).hp > 0)); }
/** SPD groups only; no guessed tie-break, mixed-squad SPD aggregation or timing policy. */
export function inspectRobotBattleInitiative(s: RobotBattleCoreState) {
  const rows = s.initiative?.entries ?? s.actors.flatMap(actor => {
    const living = actor.unitIds.map(id => getRobotBattleUnit(s, id)).filter(u => u.hp > 0);
    return living.length ? [{ actorId: actor.id, spd: Math.floor(living.reduce((n, u) => n + getRobotBattleEffectiveStats(u).spd, 0) / living.length) }] : [];
  });
  const speeds = [...new Set(rows.map(r => r.spd))].sort((a, b) => b - a);
  return { groups: speeds.map(spd => ({ spd, actorIds: rows.filter(r => r.spd === spd).map(r => r.actorId) })), unresolved: [] as string[], timingPolicy: "round-start-snapshot" as const };
}
/** Called by a trusted scheduler, never directly by the UI. Ordering policy is
 * intentionally outside this turn/resource ledger until formally settled.
 */
export function beginRobotBattleTurn(s: RobotBattleCoreState, actorId: string): RobotBattleCoreState {
  requireRobotBattleRunning(s);
  if (s.turn.actorId !== null) throw new Error("A battle turn is already open");
  if (s.initiative && getRobotInitiativeQueue(s)[0] !== actorId) throw new Error("Actor violates saved initiative order");
  const actor = getRobotBattlePendingActors(s).find(a => a.id === actorId); if (!actor) throw new Error("Actor already acted or has no living members");
  const units = s.units.map(u => {
    let next = expireRobotOwnedEffects(s, u, actor.unitIds);
    if (u.formationDefense) { const remaining = u.formationDefense.filter(e => !actor.unitIds.includes(e.ownerId) || e.expiresOwnTurn > getRobotBattleUnit(s, e.ownerId).energy.ownTurn + 1); const { formationDefense: _old, ...rest } = next; next = remaining.length ? { ...rest, formationDefense: remaining } : rest; }
    if (!actor.unitIds.includes(u.id) || u.hp === 0) return next;
    const { overwatch: _overwatch, stationaryDefense: _stationaryDefense, ...rest } = clearRobotBattleShield(next); next = rest;
    return u.boss ? withRobotBattleBoss(next, beginRobotBossTurn(getRobotBattleBoss(next))) : { ...next, energy: beginRobotEnergyTurn(next.energy) };
  });
  const next = { ...s, units, ...(s.decoys?{decoys:s.decoys.filter(d=>!actor.unitIds.includes(d.ownerId)||d.expiresOwnTurn>getRobotBattleUnit(s,d.ownerId).energy.ownTurn+1)}:{}), turn: { ...s.turn, actorId, serial: s.turn.serial + 1 } }; assertRobotBattleCore(next); return next;
}
export function requireRobotBattleInput(s: RobotBattleCoreState, actionId: string, turnId: string, allowAfterAttack = false): boolean {
  if (!actionId) throw new Error("Action identity is required");
  if (s.actionIds.includes(actionId)) return false;
  requireRobotBattleRunning(s); if (s.afterAttack && !allowAfterAttack) throw new Error("Complete the post-attack selection first"); if (robotBattleTurnId(s) !== turnId || s.turn.actorId === null) throw new Error("Stale battle turn"); return true;
}
export function finishRobotBattleTurn(s: RobotBattleCoreState, consequences?: { readonly before: RobotBattleCoreState; readonly facilityAttacks: readonly { readonly attackId: string; readonly sourceId?: string; readonly hitCells: readonly RobotPosition[]; readonly damage: number }[] }): RobotBattleCoreState {
  const actor = getRobotBattleActor(s);
  let units = s.units.map(u => {
    if (!actor.unitIds.includes(u.id)) return u;
    if (u.hp === 0) return { ...clearRobotBattleRestrictions(clearRobotBattleWeaponDebuffs(clearRobotBattleShield(u))), energy: { ...u.energy, turnOpen: false } };
    let next = u.boss ? withRobotBattleBoss(u, endRobotBossTurn(getRobotBattleBoss(u))) : { ...u, energy: endRobotAddonEnergyTurn(u.energy, u.addons === undefined ? [] : u.addons) };
    const recovery = applyRobotBasicEndTurnRecovery(u.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), { hp: next.hp, maxHp: next.maxHp, en: next.energy.en, maxEn: next.energy.maxEn, moved: next.energy.moved, usedExtraMove: next.energy.usedExtraMove });
    if (next.mineSlowUntilOwnTurn !== undefined && next.energy.ownTurn >= next.mineSlowUntilOwnTurn) { const {mineSlowUntilOwnTurn:_mine,...rest}=next; next=rest; }
    if (next.reactionsSuppressedUntilOwnTurn !== undefined && next.energy.ownTurn >= next.reactionsSuppressedUntilOwnTurn) { const {reactionsSuppressedUntilOwnTurn:_suppression,...rest}=next; next=rest; }
    if (next.rootedUntilOwnTurn !== undefined && next.energy.ownTurn >= next.rootedUntilOwnTurn) { const { rootedUntilOwnTurn: _root, ...rest } = next; next = rest; }
    next = { ...expireRobotWeaponDebuffs(next), hp: recovery.hp, energy: { ...next.energy, en: Math.min(next.energy.maxEn, recovery.en + (hasRobotAddon(next, "circular-controller") ? 8 : 0)) }, ...(hasRobotAddon(next, "stationary-defense") && !next.energy.moved && !next.energy.usedExtraMove ? { stationaryDefense: true } : {}) }; return next;
  });
  units = units.map(u => actor.unitIds.includes(u.id) && u.hp>0 && robotBattleIsAlly(u) && u.position && s.resupplyField && Math.max(Math.abs(u.position.x-s.resupplyField.cell.x), Math.abs(u.position.y-s.resupplyField.cell.y))<=2 ? { ...u, energy: { ...u.energy, en: Math.min(u.energy.maxEn, u.energy.en+12) } } : u);
  let resolved: RobotBattleCoreState = { ...s, units };
  const events: RobotBattleDamageEvent[] = [];
  for (const id of actor.unitIds) {
    const u = getRobotBattleUnit(resolved, id); if (!u.burning || u.hp === 0) continue;
    const tick = tickRobotBurning(u.burning, u.hp, u.energy.ownTurn, getRobotDamageFactors(u));
    if (tick.damage) { const hit = applyRobotPhaseDamage(resolved, u.burning.sourceId, id, tick.damage, `${s.id}:dot:${id}:${u.energy.ownTurn}`, "special:dot", "dot"); resolved = hit.state; events.push(hit.event); }
    resolved = { ...resolved, units: resolved.units.map(v => { if (v.id !== id) return v; const { burning: _old, ...rest } = v; return tick.burning ? { ...rest, burning: tick.burning } : rest; }) };
  }
  const hazards = endRobotHazardTurn(resolved, actor.unitIds, `${s.id}:hazard:${s.turn.serial}`); resolved=hazards.state; events.push(...hazards.events);
  const fuses = resolveRobotFuses(resolved, { endUnitIds: actor.unitIds }); resolved = fuses.state; events.push(...fuses.events);
  if (events.length || consequences) resolved = settleRobotBattleConsequences(consequences?.before ?? s, resolved.units, consequences?.facilityAttacks ?? [], { ...resolved, attackIds: [...new Set([...resolved.attackIds, ...events.map(e => e.attackId)])] });
  units = [...resolved.units];
  return { ...resolved, units, ...(events.length || s.pendingDamage?.length ? { pendingDamage: [...(s.pendingDamage ?? []), ...events] } : {}), turn: { ...s.turn, actorId: null, actedActorIds: [...s.turn.actedActorIds, actor.id] } };
}
export function recordRobotBattleAction(s: RobotBattleCoreState, actionId: string, summary: string, damage: readonly RobotBattleDamageEvent[] = []): RobotBattleCoreState {
  if (typeof summary !== "string" || !summary || summary.length > 512) throw new Error("A short resolved battle summary is required");
  const { pendingDamage, priorDamage, pendingFuseExplosions, pendingEnergyRecoveries, pendingDecoyTargets, ...base } = s;
  let next = { ...base, actionIds: [...s.actionIds, actionId], latest: { id: actionId, ...(pendingDecoyTargets?.length?{decoyTargets:pendingDecoyTargets}:{}), summary: summary + (pendingEnergyRecoveries?.length ? "／戦果共有EN回復" : ""), ...(pendingEnergyRecoveries?.length ? { energyRecoveries: pendingEnergyRecoveries } : {}), damage: [...(priorDamage ?? []), ...damage, ...(pendingDamage ?? [])], ...(pendingFuseExplosions?.length ? { fuseExplosions: pendingFuseExplosions } : {}) } };
  if (getRobotBattleResult(next).result !== "ongoing" && next.fuses) next = { ...next, fuses: { ...next.fuses, bombs: [] } };
  if (getRobotBattleResult(next).result !== "ongoing" && next.hazards) next = {...next,hazards:{zones:[],fireHits:[]}};
  // Detach resolved packet cells/arrays supplied by an upstream resolver.
  return decodeRobotBattleCore(next);
}
export function moveRobotBattleUnit(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly unitId: string; readonly destination: RobotPosition }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, input.unitId);
  if (actor.unitIds.length !== 1) throw new Error("Squad movement requires its dedicated joint resolver");
  if (!actor.unitIds.includes(unit.id) || unit.rootedUntilOwnTurn !== undefined || unit.hp === 0 || !unit.position || !unit.movement || unit.energy.moved || unit.energy.action) throw new Error("Illegal or unresolved ordinary movement");
  const moves = getRobotBattleLegalMoves(s, unit.id);
  const move=moves.find(m=>sameRobotCoreCell(m.destination,input.destination));
  if (!move) throw new Error("Illegal ordinary movement destination");
  const moved=moveRobotThroughHazards({...s,units:s.units.map(u=>u.id===unit.id?{...u,energy:recordRobotEnergyMove(u.energy,"ordinary")}:u)},unit.id,move.path,input.actionId);
  return recordRobotBattleMoveReactions({...moved.state,priorDamage:[...(s.priorDamage??[]),...moved.events]},unit.id,input.actionId,unit.name+"：通常移動");
}
export function commitRobotBattlePassive(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string; readonly kind: "wait" | "charge" }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  if (input.kind !== "wait" && input.kind !== "charge") throw new Error("Unsupported passive action");
  const actor = getRobotBattleActor(s), units = s.units.map(u => actor.unitIds.includes(u.id) && u.hp > 0 ? { ...u, energy: commitRobotEnergyAction(u.energy, { kind: input.kind === "charge" ? "charge" : "other", energyCost: 0 }) } : u);
  if (input.kind === "charge" && actor.unitIds.some(id => getRobotBattleUnit(s, id).kind === "light")) throw new Error("Light squads have no charge/special actions");
  return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units }), input.actionId, actor.id + (input.kind === "charge" ? "：チャージ" : "：待機"));
}
/** Controlled-actor shield action. No attack is performed in this action. */
export function commitRobotBattleShield(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, actor.unitIds[0]!);
  if (actor.unitIds.length !== 1 || unit.kind !== "controlled" || unit.hp <= 0) throw new Error("Shield command is connected only for the current controlled actor");
  if (unit.statuses.length) throw new Error("Shield/status composition is not yet connected");
  const plan = getRobotShieldActionPlan(unit.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), unit.addons ?? []);
  const energy = commitRobotEnergyAction(unit.energy, { kind: "other", energyCost: plan.energyCost });
  const units = s.units.map(u => u.id === unit.id ? { ...u, energy, shielded: true } : u);
  return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units }), input.actionId, unit.name + "：シールド（EN" + plan.energyCost + "）");
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
  if(s.objective.kind==="early" && [7,14,21,24,27,29].includes(s.key.missionNumber)){
    const blocked=getRobotEarlyDataAction(s,unit.id,input.kind);if(blocked)throw new Error(blocked);
    const data=s.objective.state.data!;
    const nextData=input.kind==="pickup"?{...data,cell:null,carrierId:unit.id,collectedRound:data.collectedRound??s.allied.round}:{...data,cell:null,carrierId:null,sent:true};
    let next:RobotBattleCoreState={...s,objective:{kind:"early",state:{...s.objective.state,data:nextData}},units:s.units.map(u=>u.id===unit.id?{...u,carriedObjectiveId:input.kind==="pickup"?(robotMissionDataId(s.key.missionNumber)):null,energy:commitRobotEnergyAction(u.energy,{kind:"other",energyCost:0})}:u)};
    next=reconcileRobotEarlyMission(next);
    return recordRobotBattleAction(finishRobotBattleTurn(next),input.actionId,unit.name+(input.kind==="pickup"?"：データ取得":"：データ送信"));
  }
  if (s.objective.kind !== "m30" || actor.unitIds.length !== 1) throw new Error("M30 data action required");
  const result = commitRobotM30DataAction(s.objective.state, robotBattleLifeUnit(unit), unit.energy, input.kind);
  const units = s.units.map(u => u.id === unit.id ? { ...u, energy: result.energy, carriedObjectiveId: result.actor.carriedObjectiveId } : u);
  return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units, objective: { kind: "m30", state: result.state } }), input.actionId, unit.name + (input.kind === "pickup" ? "：データ取得" : "：データ送信"));
}
export function configureRobotBattleAi(s: RobotBattleCoreState, change: RobotAiConfiguration): RobotBattleCoreState {
  requireRobotBattleRunning(s); assertRobotAiConfiguration(change);
  if (change.kind === "mode") {
    if (change.allowFormations && !s.units.some(u => u.kind === "controlled" && u.addons?.some(a => a.partId === "friendly-ai-formation-enabler"))) throw new Error("Friendly formation enabler required");
    return { ...s, ai: { ...s.ai, mode: change.mode, ...(change.allowFormations === undefined ? {} : { allowFormations: change.allowFormations }) } };
  }
  const owner = getRobotBattleUnit(s, change.unitId), order = change.instruction;
  if (owner.kind !== "friendly-ai" || owner.hp === 0) throw new Error("Invalid friendly AI instruction owner");
  if ("targetUnitId" in order) { const target = getRobotBattleUnit(s, order.targetUnitId); if (target.hp === 0 || (order.tacticId === "focus-attack" ? robotBattleIsAlly(target) : !robotBattleIsAlly(target))) throw new Error("Invalid AI instruction target"); }
  if ("cell" in order) coreCell(s, order.cell);
  return { ...s, ai: { ...s.ai, instructions: { ...s.ai.instructions, [owner.id]: JSON.parse(JSON.stringify(order)) as RobotAiInstruction } } };
}

export type RobotBattleReinforcementFactory = (spawn: { readonly waveId: string; readonly squadId: string; readonly cells: readonly RobotPosition[] }) => readonly RobotBattleUnitInit[];
export function advanceRobotBattleRound(s: RobotBattleCoreState, reinforcementFactory?: RobotBattleReinforcementFactory): RobotBattleCoreState {
  requireRobotBattleRunning(s);
  if (s.turn.actorId !== null || getRobotBattlePendingActors(s).length) throw new Error("Complete the full round before advancing");
  let objective: RobotBattleObjective = s.objective;
  if (objective.kind === "m02" && s.allied.round === 8) {
    const next = { ...s, ...(s.hazards?{hazards:{zones:[],fireHits:[]}}:{}), ...(s.fuses ? { fuses: { ...s.fuses, bombs: [] } } : {}), objective: { ...objective, result: "lost" as const, reason: "round-limit" } }; assertRobotBattleCore(next); return next;
  }
  if (objective.kind === "m01") {
    objective = { kind: "m01", state: finishRobotM01Round(objective.state, s.allied.round, s.key.difficulty) };
    if (objective.state.result !== "ongoing") { const next = { ...s, objective, ...(s.hazards?{hazards:{zones:[],fireHits:[]}}:{}), ...(s.fuses ? { fuses: { ...s.fuses, bombs: [] } } : {}) }; assertRobotBattleCore(next); return next; }
  }
  if(objective.kind==="early"){
    objective={kind:"early",state:finishRobotEarlyRound(s)};
    if(objective.state.result!=="ongoing"){const next={...s,objective,...(s.hazards?{hazards:{zones:[],fireHits:[]}}:{}),...(s.fuses?{fuses:{...s.fuses,bombs:[]}}:{})};assertRobotBattleCore(next);return next;}
  }
  if (objective.kind === "m30") {
    objective = { kind: "m30", state: finishRobotM30Round(objective.state, s.allied.round) };
    if (objective.state.result !== "ongoing") { const next = { ...s, objective, ...(s.hazards?{hazards:{zones:[],fireHits:[]}}:{}), ...(s.fuses ? { fuses: { ...s.fuses, bombs: [] } } : {}) }; assertRobotBattleCore(next); return next; }
  }
  const life = beginNextRobotAlliedRound(robotBattleLifecycle(s), { board: s.board, spawnPriority: s.respawnPriority, occupied: s.units.filter(u => !robotBattleIsAlly(u) && u.hp > 0).map(u => u.position!), structures: getRobotBattleStructures({...s,objective}) });
  const units: RobotBattleUnit[] = s.units.map(u => {
    const allied = life.state.allies.find(a => a.id === u.id), returned = life.respawnedUnitIds.includes(u.id);
    let energy = advanceRobotEnergyRound(u.energy);
    if (returned) energy = { ...energy, en: allied!.en, moved: false, usedExtraMove: false, action: null, normalHitRecovered: false, killRecovered: false };
    return allied ? { ...u, hp: allied.hp, position: allied.position, statuses: allied.statuses, carriedObjectiveId: allied.carriedObjectiveId, energy } : { ...u, energy };
  });
  let actors = [...s.actors];
  if (objective.kind === "m01" || objective.kind === "m30" || objective.kind === "early") {
    const occupied = units.filter(u => u.hp > 0).map(u => u.position!);
    const spawn = objective.kind === "m01" ? spawnRobotM01Reinforcements(objective.state, life.state.round, s.key.difficulty, occupied) : objective.kind==="early"?spawnRobotEarlyWave({...s,objective},life.state.round,occupied):spawnRobotM30Reinforcements(objective.state, occupied);
    for (const wave of spawn.spawned) {
      if (!reinforcementFactory) throw new Error("Reinforcement stat/movement resolver required before entering this round");
      const specs = reinforcementFactory(wave);
      if (specs.length !== 3 || specs.some(u => u.kind !== "light" || u.squadId !== wave.squadId || !u.position || !wave.cells.some(c => sameRobotCoreCell(c, u.position!))) || new Set(specs.map(u => u.position && u.position.x + "," + u.position.y)).size !== 3) throw new Error("Reinforcement factory differs from adopted placement");
      const fresh = specs.map(spec => makeRobotBattleUnit(spec, life.state.round)); units.push(...fresh); actors.push({ id: wave.squadId, unitIds: fresh.map(u => u.id) });
    }
    objective = objective.kind === "m01" ? { kind: "m01", state: spawn.state as RobotM01State } : objective.kind==="early"?{kind:"early",state:spawn.state as RobotEarlyMissionState}:{ kind: "m30", state: spawn.state as RobotM30State };
  }
  const { initiative: previousInitiative, ...base } = s;
  let next: RobotBattleCoreState = { ...base, ...(s.spentFormations ? { spentFormations: [] } : {}), objective, units, actors, allied: robotBattleAlliedLedger(life.state), turn: { ...s.turn, actorId: null, actedActorIds: [] } };
  if (next.decoys) next = {...next,decoys:next.decoys.filter(d=>!units.some(u=>u.hp>0&&u.position&&sameRobotCoreCell(u.position,d.cell)))};
  if (life.respawnedUnitIds.length && next.fuses) next = { ...next, fuses: { ...next.fuses, bombs: [] } };
  next=expireRobotHazards(next);
  if (next.resupplyField && next.allied.round > next.resupplyField.expiresRound) { const { resupplyField: _field, ...rest } = next; next = rest; }
  if (previousInitiative) next = { ...next, initiative: createRobotRoundInitiative(next) };
  assertRobotBattleCore(next); return next;
}

function integer(value: number, min = 0): void { if (!Number.isSafeInteger(value) || value < min) throw new Error("Invalid battle core integer"); }
function unique(ids: readonly string[]): void { if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string" || !id || id.length > 512)) throw new Error("Invalid/duplicate battle core identity"); }
function coreCell(s: Pick<RobotBattleCoreState, "board">, cell: RobotPosition): void { integer(cell.x); integer(cell.y); if (cell.x >= s.board.width || cell.y >= s.board.height) throw new Error("Battle cell outside board"); }
/** Resume validation for this version's connected mechanics, not an approval of
 * unimplemented statuses, range, initiative timing or complete attack legality.
 */
export function assertRobotBattleCore(s: RobotBattleCoreState): void {
  if (s.sortieSubobjectiveEligible !== undefined && typeof s.sortieSubobjectiveEligible !== "boolean") throw new Error("Invalid sortie objective eligibility");
  if (s.pendingDamage !== undefined || s.priorDamage !== undefined || s.pendingFuseExplosions !== undefined || s.pendingEnergyRecoveries !== undefined || s.pendingDecoyTargets !== undefined) throw new Error("Unpublished combat phase");
  if (s.spentFormations !== undefined && (!Array.isArray(s.spentFormations) || new Set(s.spentFormations).size !== s.spentFormations.length || s.spentFormations.some(id => !["line", "pair-defense", "delta", "pincer", "protection"].includes(id)))) throw new Error("Invalid spent formations");
  if (s.units.filter(u => u.kind === "controlled" && u.addons?.some(a => a.partId === "friendly-ai-formation-enabler")).length > 1) throw new Error("Friendly formation enabler is limited to one per party");
  if (s.ai.allowFormations !== undefined && (typeof s.ai.allowFormations !== "boolean" || s.ai.allowFormations && !s.units.some(u => u.kind === "controlled" && u.addons?.some(a => a.partId === "friendly-ai-formation-enabler")))) throw new Error("Invalid friendly formation permission");
  if (s.version !== 1 || !s.id || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].includes(s.key.missionNumber) || !["easy", "normal", "hard"].includes(s.key.difficulty)) throw new Error("Invalid battle core version/mission");
  integer(s.allied.round, 1); integer(s.turn.serial); unique(s.units.map(u => u.id)); unique(s.actors.map(a => a.id)); unique(s.actionIds); unique(s.attackIds); unique(s.turn.actedActorIds);
  integer(s.allied.lastDefeatEvent);
  const stage = getRobotStagePlan(s.key);
  if (s.board.width !== stage.board.width || s.board.height !== stage.board.height || JSON.stringify(s.board.walls) !== JSON.stringify(stage.board.walls.map(robotCellToPosition)) || JSON.stringify(s.respawnPriority) !== JSON.stringify(stage.respawnPriority.map(robotCellToPosition))) throw new Error("Battle stage geometry differs from catalog");
  const liveCells: string[] = [], allySlots: string[] = [];
  for (const u of s.units) {
    if (!["controlled", "friendly-ai", "light", "medium", "heavy", "boss"].includes(u.kind)) throw new Error("Unknown battle unit kind");
    if (u.kind === "light" && (u.energy.en !== 0 || u.energy.maxEn !== 0 || u.energy.normalHitRecovered || u.energy.killRecovered || u.energy.damagedRecovered)) throw new Error("Light enemies have no EN resource");
    integer(u.hp); integer(u.maxHp, 1); integer(u.energy.en); integer(u.energy.maxEn); integer(u.energy.ownTurn);
    for (const flag of [u.energy.turnOpen, u.energy.moved, u.energy.usedExtraMove, u.energy.normalHitRecovered, u.energy.killRecovered, u.energy.damagedRecovered]) if (typeof flag !== "boolean") throw new Error("Invalid energy event allowance");
    if (u.energy.action !== null) { if (!["normal-attack", "charge", "extra-move", "other"].includes(u.energy.action.kind)) throw new Error("Invalid energy action"); integer(u.energy.action.energyCost); if (u.energy.action.energyCost > u.energy.maxEn || u.energy.turnOpen && s.afterAttack?.ownerId !== u.id) throw new Error("Invalid or unfinished action checkpoint"); }
    if (u.hp > u.maxHp || u.energy.en > u.energy.maxEn || u.energy.round !== s.allied.round) throw new Error("Invalid battle vitals/round");
    for (const stat of ["melee", "ranged", "mov", "spd"] as const) integer(u.stats[stat]);
    if (!Number.isSafeInteger(u.stats.def)) throw new Error("Invalid modified DEF");
    if (u.stats.mov < 1) throw new Error("Movement is below the adopted minimum");
    if (u.movement && (u.movement.mov !== u.stats.mov || !u.movement.types.length || u.movement.types.some(t => !["omni", "straight", "forward", "diagonal"].includes(t)) || !["north", "south", "east", "west"].includes(u.movement.facing) || u.movement.mov < 1 || u.movement.mov > 7)) throw new Error("Invalid movement snapshot");
    for (const expiry of [u.rootedUntilOwnTurn, u.energy.lockedUntilOwnTurn, u.reactionsSuppressedUntilOwnTurn]) if (expiry !== undefined && (!Number.isSafeInteger(expiry) || expiry < u.energy.ownTurn || expiry > u.energy.ownTurn + 1 || !u.energy.turnOpen && expiry === u.energy.ownTurn || u.hp === 0)) throw new Error("Invalid restriction expiry");
    if (u.coreLevel !== undefined && (!Number.isSafeInteger(u.coreLevel) || u.coreLevel < 1 || u.coreLevel > 41)) throw new Error("Invalid core level");
    if (u.burning) { assertRobotBurning(u.burning); const owner = s.units.find(v => v.id === u.burning!.sourceId); if (owner?.coreLevel !== undefined && owner.coreLevel !== u.burning.sourceCoreLevel) throw new Error("Burning power differs from owner core level"); if (s.units.some(v => v.id === u.burning!.sourceId && robotBattleIsAlly(v) === robotBattleIsAlly(u))) throw new Error("Friendly burning owner"); if (u.hp === 0 || !s.units.some(v => v.id === u.burning!.sourceId) || u.burning.lastTargetOwnTurn > u.energy.ownTurn) throw new Error("Invalid burning owner/turn"); }
    for (const value of [u.counterRound, u.interceptionRound, u.reactionKillRound, u.dotKillRound, u.fuseKillRound]) if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > s.allied.round)) throw new Error("Invalid reaction/DOT/fuse allowance");
    if (u.stationaryDefense !== undefined && (typeof u.stationaryDefense !== "boolean" || !hasRobotAddon(u, "stationary-defense") || u.hp === 0 || u.stationaryDefense && (u.energy.turnOpen || u.energy.moved || u.energy.usedExtraMove))) throw new Error("Invalid stationary defense");
    if (u.overwatch) { const w = u.parts.find(p => p.partId === u.overwatch!.weaponId), multiplier = hasRobotAddon(u, "overwatch-amplifier") ? .9 : .7; if (!w || !["assault", "sniper", "blast"].includes(resolveRobotBasicPart(w.partId, w.level).weaponFamily ?? "") || u.hp === 0 || u.energy.turnOpen || u.overwatch.multiplier !== multiplier || u.energy.action?.energyCost !== 25) throw new Error("Invalid overwatch stance"); unique(u.overwatch.hitUnitIds); if (u.overwatch.hitUnitIds.some(id => !s.units.some(v => v.id === id && robotBattleIsAlly(v) !== robotBattleIsAlly(u)))) throw new Error("Invalid overwatch target receipt"); }
    if (u.formationDefense) { unique(u.formationDefense.map(e => e.kind)); for (const e of u.formationDefense) if (!["pair-defense", "protection"].includes(e.kind) || !Number.isFinite(e.increase) || e.increase < 0 || e.cap !== (e.kind === "pair-defense" ? .6 : .5) || !s.units.some(v => v.id === e.ownerId && robotBattleIsAlly(v) === robotBattleIsAlly(u) && e.expiresOwnTurn === v.energy.ownTurn + 1) || u.hp === 0) throw new Error("Invalid formation defense"); }
    u.parts.forEach(p => resolveRobotBasicPart(p.partId, p.level));
    requireRobotAddonEnergySupport(u.addons === undefined ? [] : u.addons);
    if (u.defended !== undefined && (typeof u.defended !== "boolean" || u.defended && (u.hp === 0 || u.energy.turnOpen || u.energy.action?.kind !== "other" || u.energy.action.energyCost !== 0))) throw new Error("Invalid defend stance");
    if (u.shielded !== undefined && typeof u.shielded !== "boolean") throw new Error("Invalid shield snapshot");
    if (u.shielded && (u.kind !== "controlled" || u.hp === 0 || u.energy.turnOpen || u.energy.action?.kind !== "other" || u.energy.ownTurn === 0)) throw new Error("Invalid or unconnected active shield");
    if (u.shielded && u.energy.action!.energyCost !== getRobotShieldActionPlan(u.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), u.addons ?? []).energyCost) throw new Error("Shield cost differs from equipped effects");
    if (!Array.isArray(u.statuses) || u.statuses.some(st => typeof st !== "string")) throw new Error("Invalid status snapshot");
    if (u.weaponDebuffs !== undefined) { assertRobotWeaponDebuffs(u.weaponDebuffs); if(u.weaponDebuffs.some(d=>d.untilOwnTurn!==undefined&&(d.untilOwnTurn>u.energy.ownTurn+2||d.untilOwnTurn<=u.energy.ownTurn&&!u.energy.turnOpen)))throw new Error("Invalid weapon debuff expiry"); if (u.hp === 0 && u.weaponDebuffs.length) throw new Error("Defeated unit retains weapon debuffs"); }
    if (u.position) coreCell(s, u.position);
    if (u.hp > 0) { if (!u.position || s.board.walls.some(w => sameRobotCoreCell(w, u.position!)) || getRobotBattleStructures(s).some(c => sameRobotCoreCell(c, u.position!))) throw new Error("Living unit occupies blocked terrain"); liveCells.push(u.position.x + "," + u.position.y); }
    if (robotBattleIsAlly(u)) { if (u.number === null || ![1, 2, 3].includes(u.number) || u.hp === 0 && u.position !== null) throw new Error("Invalid allied life snapshot"); allySlots.push(u.kind + ":" + u.number); }
    else if (u.number !== null || u.carriedObjectiveId !== null) throw new Error("Enemy cannot use allied respawn/carrier state");
    if (u.kind === "boss") {
      if (u.addons?.length) throw new Error("Boss addons differ from adopted preset");
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
  if (s.objective.kind === "m01") {
    const m = s.objective.state, canonical = createRobotM01State(s.key.difficulty), facility = m.objects.objects[0], expected = canonical.objects.objects[0]!;
    if (s.key.missionNumber !== 1 || s.allied.round > stage.roundLimit || !facility || m.objects.objects.length !== 1 || JSON.stringify({ ...facility, hp: expected.hp }) !== JSON.stringify(expected)) throw new Error("Invalid M01 facility snapshot");
    integer(facility.hp); integer(m.objects.completedRound);
    unique(m.objects.appliedAttackIds); unique(m.spawnedWaveIds);
    if (facility.hp > facility.maxHp || m.objects.appliedAttackIds.some(id => !s.attackIds.includes(id)) || m.objects.completedRound !== s.allied.round - (m.result === "won" ? 0 : 1) || s.units.some(u => u.carriedObjectiveId !== null)) throw new Error("Invalid M01 objective ledger");
    for (const wave of stage.reinforcements) {
      const spawned = m.spawnedWaveIds.includes(wave.id), actor = s.actors.find(a => a.id === wave.squad.id);
      if (spawned !== Boolean(actor) || spawned && (wave.triggerRound === null || s.allied.round < wave.triggerRound)) throw new Error("Invalid M01 reinforcement receipt");
    }
    if (m.spawnedWaveIds.some(id => !stage.reinforcements.some(w => w.id === id))) throw new Error("Unknown M01 wave receipt");
    if (!["ongoing", "won", "lost"].includes(m.result) || m.result === "ongoing" && (facility.hp === 0 || s.allied.lostBySameRoundWipe || m.resultReason !== null) || m.result === "won" && (s.allied.round !== stage.roundLimit || facility.hp === 0 || s.allied.lostBySameRoundWipe || getRobotBattlePendingActors(s).length > 0 || m.resultReason !== "facility-survived") || m.result === "lost" && !(m.resultReason === "facility-destroyed" && facility.hp === 0 || m.resultReason === "same-round-controlled-wipe" && s.allied.lostBySameRoundWipe && facility.hp > 0)) throw new Error("M01 outcome disagrees with battle state");
  }
  else if (s.objective.kind === "m02") {
    const o = s.objective, dead = getRobotBattleUnit(s, "commander").hp === 0;
    if (s.key.missionNumber !== 2 || s.allied.round > 8 || o.bossId !== "commander" || !["ongoing", "won", "lost"].includes(o.result) || s.units.some(u => u.carriedObjectiveId !== null)) throw new Error("Invalid M02 objective");
    if (o.result === "ongoing" && (dead || s.allied.lostBySameRoundWipe || o.reason !== null) || o.result === "won" && (!dead || s.allied.lostBySameRoundWipe || o.reason !== "commander-defeated") || o.result === "lost" && !(o.reason === "same-round-controlled-wipe" && s.allied.lostBySameRoundWipe || o.reason === "round-limit" && s.allied.round === 8 && !dead && getRobotBattlePendingActors(s).length === 0)) throw new Error("M02 outcome disagrees with battle state");
  }
  else if (s.objective.kind === "early") assertRobotEarlyMission(s);
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
  assertRobotRoundInitiative(s);
  if (getRobotBattleResult(s).result !== "ongoing" && s.turn.actorId !== null) throw new Error("Ended battle still has an open turn");
  if (s.latest && (!s.actionIds.includes(s.latest.id) || typeof s.latest.summary !== "string" || !s.latest.summary || s.latest.damage.some(e => !s.attackIds.includes(e.attackId) || !s.units.some(u => u.id === e.sourceId) || !s.units.some(u => u.id === e.targetId) && !getRobotBattleFacilities(s).some(o => o.id === e.targetId) && !s.latest?.decoyTargets?.some(d=>d.id===e.targetId) || e.damage !== null && (!Number.isSafeInteger(e.damage) || e.damage < 1) || !isRobotBattleEffectKind(e.effectKind) || !e.cells.length || e.cells.some(c => !Number.isSafeInteger(c.x) || !Number.isSafeInteger(c.y) || c.x < 0 || c.y < 0 || c.x >= s.board.width || c.y >= s.board.height)))) throw new Error("Invalid resolved event receipt");
  if (s.latest?.areaCells !== undefined) {
    if (!Array.isArray(s.latest.areaCells) || s.latest.areaCells.length > 18 || new Set(s.latest.areaCells.map(c => c.x + "," + c.y)).size !== s.latest.areaCells.length) throw new Error("Invalid resolved area display");
    s.latest.areaCells.forEach(c => coreCell(s, c));
  }
  if (s.latest?.blastEmptyCenters !== undefined) {
    if (!Array.isArray(s.latest.blastEmptyCenters) || s.latest.blastEmptyCenters.length > 2 || new Set(s.latest.blastEmptyCenters.map(c => c.x + "," + c.y)).size !== s.latest.blastEmptyCenters.length) throw new Error("Invalid empty blast display");
    s.latest.blastEmptyCenters.forEach(c => coreCell(s, c));
  }
  if (s.sharedVictoryDefeats !== undefined) { unique(s.sharedVictoryDefeats); if(s.sharedVictoryDefeats.some(id=>!s.units.some(u=>u.id===id&&!robotBattleIsAlly(u)&&u.hp===0)))throw new Error("Invalid shared victory receipt"); }
  if(s.latest?.energyRecoveries){unique(s.latest.energyRecoveries.map(e=>e.id));for(const e of s.latest.energyRecoveries){integer(e.amount,1);coreCell(s,e.cell);if(!s.units.some(u=>u.id===e.unitId&&robotBattleIsAlly(u)))throw new Error("Invalid EN recovery display");}}
  if(s.latest?.supportCues){if(!Array.isArray(s.latest.supportCues)||s.latest.supportCues.length>2)throw new Error("Invalid support cues");for(const c of s.latest.supportCues){coreCell(s,c.cell);if(!["defense_up","defense_down","heal","link_attack"].includes(c.effect))throw new Error("Invalid support cue effect");}}
  if(s.latest?.decoyTargets){unique(s.latest.decoyTargets.map(d=>d.id));for(const d of s.latest.decoyTargets){coreCell(s,d.cell);integer(d.hp);if(d.hp>60)throw new Error("Invalid decoy display HP");}}
  assertRobotDecoys(s);
  assertRobotAfterAttack(s);
  assertRobotAdoptedEffects(s);
  assertRobotHazards(s);
  assertRobotFuses(s);
  if (s.latest?.fuseExplosions !== undefined) {
    if (!Array.isArray(s.latest.fuseExplosions) || new Set(s.latest.fuseExplosions.map(e => e.bombId)).size !== s.latest.fuseExplosions.length || s.latest.fuseExplosions.some(e => typeof e.bombId !== "string" || e.attackId !== e.bombId + ":detonate" || !s.attackIds.includes(e.attackId))) throw new Error("Invalid fuse explosion display");
    s.latest.fuseExplosions.forEach(e => coreCell(s, e.cell));
  }
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

export function commitRobotBattleDefend(s: RobotBattleCoreState, input: { readonly actionId: string; readonly turnId: string }): RobotBattleCoreState {
  if (!requireRobotBattleInput(s, input.actionId, input.turnId)) return s;
  const actor = getRobotBattleActor(s);
  const units = s.units.map(u => actor.unitIds.includes(u.id) && u.hp > 0 ? { ...u, defended: true, energy: commitRobotEnergyAction(u.energy, { kind: "other", energyCost: 0 }) } : u);
  return recordRobotBattleAction(finishRobotBattleTurn({ ...s, units }), input.actionId, actor.id + "：防御");
}

/** Ordinary movement keeps the actor open unless reactions kill it/end the mission. */
export function recordRobotBattleMoveReactions(s: RobotBattleCoreState, unitId: string, actionId: string, summary: string): RobotBattleCoreState {
  const phase = applyRobotReactions(s, { kind: "move", unitId }, actionId);
  let next = settleRobotBattleConsequences(s, phase.state.units, [], { ...phase.state, attackIds: [...new Set([...s.attackIds, ...phase.state.attackIds, ...phase.events.map(e => e.attackId)])] });
  if (!getRobotBattleActor(next).unitIds.some(id => getRobotBattleUnit(next, id).hp > 0) || getRobotBattleResult(next).result !== "ongoing" || getRobotBattleActor(next).unitIds.some(id => getRobotBattleUnit(next, id).energy.action !== null)) {
    next = { ...next, units: next.units.map(u => getRobotBattleActor(next).unitIds.includes(u.id) && u.hp > 0 && !u.energy.action ? { ...u, energy: commitRobotEnergyAction(u.energy, { kind: "other", energyCost: 0 }) } : u) }; next = finishRobotBattleTurn(next);
  }
  return recordRobotBattleAction(next, actionId, summary, phase.events);
}
