import { getRobotBossPlan, type RobotBossPlan } from "./bossCatalog";
import { beginRobotEnergyTurn, commitRobotEnergyAction, createRobotEnergyState, endRobotEnergyTurn, recordRobotEnergyMove, type RobotEnergyState } from "./energy";
import { checkRobotAttackSpatial } from "./attackResolution";
import { checkRobotAttackRange, robotChebyshevDistance, type RobotRangeCheck, type RobotRangeDistance } from "./attackRange";
import type { RobotSightStructure } from "./lineOfSight";
import { getRobotLegalMoves, robotCellToPosition, type RobotMovementQuery, type RobotPosition } from "./movement";
import type { RobotDifficulty } from "./types";

export interface RobotCommandBonuses { readonly melee: number; readonly ranged: number; readonly defense: number }
export interface RobotCommandEffect {
  readonly id: string; readonly sourceBossId: string;
  readonly unitIds: readonly string[] | null; readonly squadId: string | null; readonly attackTargetId: string | null;
  readonly bonuses: RobotCommandBonuses; readonly expiresAtOwnTurn: number | null;
  readonly consumeOnSquadAttack: boolean;
}
export interface RobotBossUnit {
  readonly id: string; readonly kind: "controlled" | "friendly-ai" | "light" | "medium" | "heavy" | "boss";
  readonly team: "player" | "enemy"; readonly hp: number; readonly position: RobotPosition;
  readonly squadId: string | null; readonly chassis?: string; readonly carryingUnsentData?: boolean;
}
export interface RobotBossState {
  readonly plan: RobotBossPlan; readonly hp: number; readonly position: RobotPosition;
  readonly energy: RobotEnergyState; readonly turnStartHp: number | null;
  readonly lastSkillOwnTurn: number | null; readonly ultimateUsed: boolean;
  readonly effects: readonly RobotCommandEffect[]; readonly events: readonly string[];
}
export interface RobotBossSkillContext {
  readonly units: readonly RobotBossUnit[];
  readonly board: RobotMovementQuery["board"];
  readonly structures?: readonly RobotSightStructure[];
  readonly targetId?: string; readonly squadId?: string;
  readonly rifleRange?: RobotRangeCheck;
  /** Undefined uses adopted Chebyshev; explicit null fails closed. */
  readonly measureDistance?: RobotRangeDistance | null;
  readonly move?: { readonly query: RobotMovementQuery; readonly destination: RobotPosition };
}
const same = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;

export function createRobotBossState(mission: number, difficulty: RobotDifficulty, position: RobotPosition): RobotBossState {
  const plan = getRobotBossPlan(mission, difficulty);
  return { plan, hp: plan.stats.hp, position: { ...position }, energy: createRobotEnergyState(plan.stats.en), turnStartHp: null, lastSkillOwnTurn: null, ultimateUsed: false, effects: [], events: [] };
}
export function beginRobotBossTurn(state: RobotBossState): RobotBossState {
  if (state.hp <= 0) throw new Error("Defeated bosses never respawn or take turns");
  const energy = beginRobotEnergyTurn(state.energy);
  return { ...state, energy, turnStartHp: state.hp, effects: state.effects.filter(e => e.sourceBossId !== state.plan.definition.unitId || e.expiresAtOwnTurn === null || e.expiresAtOwnTurn > energy.ownTurn) };
}
export function endRobotBossTurn(state: RobotBossState): RobotBossState {
  return { ...state, energy: endRobotEnergyTurn(state.energy) };
}
export function applyRobotBossDamage(state: RobotBossState, damage: number): RobotBossState {
  if (!Number.isSafeInteger(damage) || damage < 0) throw new Error("Invalid resolved boss damage");
  const hp = Math.max(0, state.hp - damage);
  return { ...state, hp, ...(hp === 0 ? { effects: state.effects.filter(e => e.sourceBossId !== state.plan.definition.unitId), energy: { ...state.energy, turnOpen: false }, events: [...state.events, "boss-defeated:command-effects-cleared"] } : {}) };
}

export function isRobotM09VoluntaryDestination(cell: RobotPosition): boolean {
  const min = robotCellToPosition("F2"), max = robotCellToPosition("L6");
  return cell.x >= min.x && cell.x <= max.x && cell.y >= min.y && cell.y <= max.y;
}
function legalMoves(state: RobotBossState, query: RobotMovementQuery) {
  if (!same(query.origin, state.position) || query.mov !== state.plan.stats.mov) throw new Error("Boss movement query differs from current actor");
  return getRobotLegalMoves(query).filter(m => state.plan.missionNumber !== 9 || isRobotM09VoluntaryDestination(m.destination));
}
export function getRobotBossVoluntaryMoves(state: RobotBossState, query: RobotMovementQuery) { return legalMoves(state, query); }
export function commitRobotBossOrdinaryMove(state: RobotBossState, query: RobotMovementQuery, destination: RobotPosition): RobotBossState {
  if (state.hp <= 0 || state.energy.moved) throw new Error("Boss cannot move again");
  const move = legalMoves(state, query).find(m => same(m.destination, destination));
  if (!move) throw new Error("Illegal boss ordinary movement");
  return { ...state, position: { ...move.destination }, energy: recordRobotEnergyMove(state.energy, "ordinary") };
}

function eligibleUnits(state: RobotBossState, context: RobotBossSkillContext) {
  const skill = state.plan.definition.skill;
  const light = context.units.filter(u => u.team === "enemy" && u.kind === "light" && u.hp > 0);
  if ("guardSquadId" in skill) return light.filter(u => u.squadId === skill.guardSquadId);
  if (state.plan.missionNumber === 22) return light.filter(u => u.squadId === context.squadId && u.chassis === "ranged");
  return light;
}
export function checkRobotBossSkill(state: RobotBossState, context: RobotBossSkillContext): { readonly available: boolean; readonly reason: string } {
  const skill = state.plan.definition.skill;
  if (state.hp <= 0 || !state.energy.turnOpen) return { available: false, reason: "not-own-turn" };
  if (state.energy.action !== null) return { available: false, reason: "action-used" };
  if (state.ultimateUsed && state.plan.missionNumber === 30) return { available: false, reason: "once-per-battle-used" };
  if (state.lastSkillOwnTurn === state.energy.ownTurn - 1) return { available: false, reason: "consecutive-own-turn" };
  if (state.energy.en < skill.energyCost) return { available: false, reason: "insufficient-energy" };
  if (state.plan.missionNumber === 30 && (state.turnStartHp === null || state.turnStartHp > state.plan.stats.hp * 0.5)) return { available: false, reason: "turn-start-hp-above-half" };
  if (state.plan.missionNumber === 9) {
    const measure = context.measureDistance === undefined ? robotChebyshevDistance : context.measureDistance;
    if (!measure) return { available: false, reason: "distance-unresolved" };
    const near = context.units.some(u => {
      if (u.team !== "player" || u.kind !== "controlled" || u.hp <= 0) return false;
      const distance = measure(state.position, u.position);
      if (!Number.isSafeInteger(distance) || distance < 0) throw new Error("Invalid boss proximity distance");
      return distance <= 4;
    });
    if (!near) return { available: false, reason: "no-controlled-unit-within-four" };
    if (!context.move) return { available: false, reason: "select-legal-extra-move" };
    const q = context.move.query;
    const occupied = [...q.occupied, ...context.units.filter(u => u.hp > 0 && u.id !== state.plan.definition.unitId).map(u => u.position)];
    if (!legalMoves(state, { ...q, board: context.board, occupied }).some(m => m.path.length <= 2 && same(m.destination, context.move!.destination))) return { available: false, reason: "illegal-extra-move" };
  } else {
    if (state.plan.missionNumber !== 27 && state.plan.missionNumber !== 30 && eligibleUnits(state, context).length === 0) return { available: false, reason: "no-living-squad-target" };
    if (state.plan.missionNumber === 27) {
      const target = context.units.find(u => u.id === context.targetId && u.team === "player" && u.kind === "controlled" && u.hp > 0);
      if (!target) return { available: false, reason: "select-controlled-target" };
      const rifle = state.plan.weapons[1]!;
      const range = context.rifleRange ?? checkRobotAttackRange({ origin: state.position, target: target.position, min: rifle.range!.min, max: rifle.range!.max });
      const spatial = checkRobotAttackSpatial({ kind: "normal", range, sight: { board: context.board, origin: state.position, target: target.position, ...(context.structures ? { structures: context.structures } : {}) } });
      if (!spatial.canReach) return { available: false, reason: spatial.reason };
    }
  }
  return { available: true, reason: "available" };
}
export function commitRobotBossSkill(state: RobotBossState, context: RobotBossSkillContext): RobotBossState {
  const check = checkRobotBossSkill(state, context);
  if (!check.available) throw new Error("Boss skill unavailable: " + check.reason);
  const skill = state.plan.definition.skill;
  const energy = commitRobotEnergyAction(state.energy, { kind: "other", energyCost: skill.energyCost });
  let effects = state.effects;
  if ("bonusesByDifficulty" in skill) {
    const units = eligibleUnits(state, context);
    const effect: RobotCommandEffect = {
      id: state.plan.definition.unitId + ":" + energy.ownTurn, sourceBossId: state.plan.definition.unitId,
      unitIds: state.plan.missionNumber === 27 ? null : units.map(u => u.id), squadId: state.plan.missionNumber === 22 ? context.squadId! : null,
      attackTargetId: state.plan.missionNumber === 27 ? context.targetId! : null,
      bonuses: skill.bonusesByDifficulty[state.plan.difficulty],
      expiresAtOwnTurn: state.plan.missionNumber === 22 ? null : energy.ownTurn + 1,
      consumeOnSquadAttack: state.plan.missionNumber === 22
    };
    effects = [...effects, effect];
  }
  return { ...state, energy: state.plan.missionNumber === 9 ? { ...energy, usedExtraMove: true } : energy, effects, lastSkillOwnTurn: energy.ownTurn, ultimateUsed: state.ultimateUsed || state.plan.missionNumber === 30,
    position: state.plan.missionNumber === 9 ? { ...context.move!.destination } : state.position,
    events: [...state.events, skill.name + ":activated"] };
}
/** Apply to the committed squad attack batch, never consume once for every member hit. */
export function completeRobotCommandedSquadAttack(state: RobotBossState, squadId: string): RobotBossState {
  return { ...state, effects: state.effects.filter(e => !(e.consumeOnSquadAttack && e.squadId === squadId)) };
}
export function getRobotCommandBonuses(effects: readonly RobotCommandEffect[], attacker: Pick<RobotBossUnit, "id" | "squadId" | "team" | "kind">, targetId: string | null): RobotCommandBonuses {
  const applicable = effects.filter(e => (e.unitIds === null ? attacker.team === "enemy" && attacker.kind === "light" : e.unitIds.includes(attacker.id)) && (e.squadId === null || e.squadId === attacker.squadId) && (e.attackTargetId === null || e.attackTargetId === targetId));
  return {
    melee: Math.max(0, ...applicable.map(e => e.bonuses.melee)), ranged: Math.max(0, ...applicable.map(e => e.bonuses.ranged)), defense: Math.max(0, ...applicable.map(e => e.bonuses.defense))
  };
}
export function getRobotBossTrackingMarkers(state: RobotBossState): readonly string[] {
  return [...new Set(state.effects.filter(e=>e.sourceBossId===state.plan.definition.unitId).flatMap(e => e.attackTargetId === null ? [] : [e.attackTargetId]))];
}
export function getRobotBossSkillView(state: RobotBossState, context: RobotBossSkillContext) {
  return { name: state.plan.definition.skill.name, energyCost: state.plan.definition.skill.energyCost, ...checkRobotBossSkill(state, context), used: state.ultimateUsed, markers: getRobotBossTrackingMarkers(state), lastEvent: [...state.events].reverse().find(e=>e===state.plan.definition.skill.name+":activated") ?? null };
}
