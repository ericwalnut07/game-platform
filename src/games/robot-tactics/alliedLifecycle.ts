import groupRules from "../../../docs/design/robot-tactics/current-group-combat.json";
import type { RobotPosition } from "./movement";

/** A combat-life projection, not a complete BattleState or an enemy respawn model. */
export interface RobotAlliedLifeUnit {
  readonly id: string;
  readonly kind: "controlled" | "friendly-ai";
  readonly number: 1 | 2 | 3;
  readonly hp: number;
  readonly maxHp: number;
  readonly en: number;
  readonly maxEn: number;
  readonly position: RobotPosition | null;
  readonly statuses: readonly string[];
  readonly carriedObjectiveId: string | null;
}

/** Preserve extra configuration fields while widening life fields that can change. */
export type RobotAlliedLifeSnapshot<T extends RobotAlliedLifeUnit> = Omit<T, keyof RobotAlliedLifeUnit> & RobotAlliedLifeUnit;

export interface RobotAlliedReturn {
  readonly unitId: string;
  readonly defeatedRound: number;
  readonly returnRound: number;
  /** One serial per simultaneous defeat batch, independent of request order. */
  readonly defeatEvent: number;
}

export interface RobotAlliedLifecycleState<T extends RobotAlliedLifeUnit = RobotAlliedLifeUnit> {
  readonly round: number;
  readonly allies: readonly T[];
  readonly waiting: readonly RobotAlliedReturn[];
  readonly controlledDefeatedThisRound: readonly string[];
  readonly lastDefeatEvent: number;
  readonly lostBySameRoundWipe: boolean;
}

export interface RobotAlliedSpawnContext {
  readonly board: { readonly width: number; readonly height: number; readonly walls: readonly RobotPosition[] };
  /** Trusted stage priority order; this helper does not approve stage data. */
  readonly spawnPriority: readonly RobotPosition[];
  /** Living enemies and other external occupants; live allies are added internally. */
  readonly occupied: readonly RobotPosition[];
  readonly structures: readonly RobotPosition[];
}

function key(p: RobotPosition): string { return p.x + "," + p.y; }
function integer(n: number, minimum: number): void {
  if (!Number.isSafeInteger(n) || n < minimum) throw new Error("Invalid lifecycle integer");
}
function position(p: RobotPosition): void {
  if (!p) throw new Error("Missing lifecycle position");
  integer(p.x, 0); integer(p.y, 0);
}
function requireRunning(state: RobotAlliedLifecycleState): void {
  if (state.lostBySameRoundWipe) throw new Error("Battle ended by same-round controlled wipe");
}

/** Starts the lifecycle ledger from a trusted living roster, retaining equipment/tactic data. */
export function createRobotAlliedLifecycle<T extends RobotAlliedLifeUnit>(allies: readonly T[]): RobotAlliedLifecycleState<RobotAlliedLifeSnapshot<T>> {
  const ids = new Set<string>(), slots = new Set<string>(), cells = new Set<string>(), carriers = new Set<string>();
  for (const unit of allies) {
    if (!unit.id || ids.has(unit.id)) throw new Error("Duplicate or empty allied unit ID");
    ids.add(unit.id);
    if (unit.kind !== "controlled" && unit.kind !== "friendly-ai") throw new Error("Only allied units belong to this lifecycle");
    integer(unit.number, 1);
    if (unit.number > 3 || slots.has(unit.kind + unit.number)) throw new Error("Invalid or duplicate allied roster number");
    slots.add(unit.kind + unit.number);
    integer(unit.hp, 1); integer(unit.maxHp, 1); integer(unit.en, 0); integer(unit.maxEn, 0);
    if (unit.hp > unit.maxHp || unit.en > unit.maxEn) throw new Error("Allied vitals exceed their maximum");
    if (unit.position === null) throw new Error("Living ally must have a position");
    position(unit.position);
    if (cells.has(key(unit.position))) throw new Error("Allies cannot occupy the same cell");
    cells.add(key(unit.position));
    if (unit.carriedObjectiveId !== null) {
      if (!unit.carriedObjectiveId || carriers.has(unit.carriedObjectiveId)) throw new Error("Invalid or duplicate carried objective");
      carriers.add(unit.carriedObjectiveId);
    }
  }
  if (allies.filter(u => u.kind === "controlled").length !== 3) throw new Error("Three directly controlled robots are required");
  return {
    round: 1, allies: allies.map(u => ({ ...u, position: { ...u.position! }, statuses: [...u.statuses] })),
    waiting: [], controlledDefeatedThisRound: [], lastDefeatEvent: 0, lostBySameRoundWipe: false
  };
}

/** Called with deaths determined by the future damage resolver; rejects invalid batches atomically. */
export function applyRobotAlliedDefeats<T extends RobotAlliedLifeUnit>(state: RobotAlliedLifecycleState<T>, unitIds: readonly string[]) {
  requireRunning(state);
  if (unitIds.length === 0 || new Set(unitIds).size !== unitIds.length) throw new Error("A nonempty distinct defeat batch is required");
  const defeated = unitIds.map(id => {
    const unit = state.allies.find(u => u.id === id);
    if (!unit || unit.hp === 0 || unit.position === null) throw new Error("Defeat requires a living allied unit: " + id);
    return unit;
  });
  const event = state.lastDefeatEvent + 1;
  const selected = new Set(unitIds);
  const controlled = [...new Set([...state.controlledDefeatedThisRound, ...defeated.filter(u => u.kind === "controlled").map(u => u.id)])];
  const droppedObjectives = defeated.flatMap(u => u.carriedObjectiveId === null ? [] : [{ objectiveId: u.carriedObjectiveId, unitId: u.id, position: { ...u.position! } }]);
  const next: RobotAlliedLifecycleState<RobotAlliedLifeSnapshot<T>> = {
    ...state,
    allies: state.allies.map(u => selected.has(u.id) ? { ...u, hp: 0, position: null, carriedObjectiveId: null } : u),
    waiting: [...state.waiting, ...defeated.map(u => ({ unitId: u.id, defeatedRound: state.round, returnRound: state.round + 2, defeatEvent: event }))],
    controlledDefeatedThisRound: controlled, lastDefeatEvent: event, lostBySameRoundWipe: controlled.length === 3
  };
  return { state: next, droppedObjectives };
}

/** All returning allies are placed before the later initiative/scheduler stage. */
export function beginNextRobotAlliedRound<T extends RobotAlliedLifeUnit>(state: RobotAlliedLifecycleState<T>, context: RobotAlliedSpawnContext) {
  requireRunning(state);
  integer(context.board.width, 1); integer(context.board.height, 1);
  const within = (p: RobotPosition) => {
    position(p);
    if (p.x >= context.board.width || p.y >= context.board.height) throw new Error("Lifecycle cell outside board");
  };
  const liveCells = state.allies.flatMap(u => u.position === null ? [] : [u.position]);
  for (const p of [...context.board.walls, ...context.spawnPriority, ...context.occupied, ...context.structures, ...liveCells]) within(p);
  if (context.spawnPriority.length === 0 || new Set(context.spawnPriority.map(key)).size !== context.spawnPriority.length) throw new Error("Unique ordered spawn cells are required");
  const blocked = new Set([...context.board.walls, ...context.occupied, ...context.structures, ...liveCells].map(key));
  const round = state.round + 1;
  const lookup = new Map(state.allies.map(u => [u.id, u]));
  const eligible = state.waiting.filter(q => q.returnRound <= round).sort((a, b) => {
    const left = lookup.get(a.unitId)!, right = lookup.get(b.unitId)!;
    return a.defeatEvent - b.defeatEvent || Number(left.kind === "friendly-ai") - Number(right.kind === "friendly-ai") || left.number - right.number;
  });
  const placements = new Map<string, RobotPosition>();
  const deferredUnitIds: string[] = [];
  for (const entry of eligible) {
    const cell = context.spawnPriority.find(p => !blocked.has(key(p)));
    if (cell === undefined) { deferredUnitIds.push(entry.unitId); continue; }
    placements.set(entry.unitId, { ...cell }); blocked.add(key(cell));
  }
  const next: RobotAlliedLifecycleState<RobotAlliedLifeSnapshot<T>> = {
    ...state, round, controlledDefeatedThisRound: [],
    allies: state.allies.map(u => {
      const cell = placements.get(u.id);
      return cell === undefined ? u : {
        ...u, hp: u.maxHp, en: Math.ceil(u.maxEn * groupRules.defeatAndRespawn.alliedRespawn.enFractionCeil),
        position: cell, statuses: [], carriedObjectiveId: null
      };
    }),
    waiting: state.waiting.filter(q => !placements.has(q.unitId))
  };
  return { state: next, respawnedUnitIds: [...placements.keys()], deferredUnitIds };
}
