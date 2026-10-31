import { robotCellToPosition, type RobotPosition } from "./movement";
import type { RobotStagePlan } from "./types";

export interface RobotObjectiveObject {
  readonly id: string; readonly kind: "facility" | "depot" | "transport";
  readonly cells: readonly RobotPosition[]; readonly hp: number; readonly maxHp: number; readonly def: number;
  readonly blocksMovement: boolean; readonly blocksLineOfSight: boolean;
  readonly route: readonly RobotPosition[]; readonly routeIndex: number;
}
export interface RobotObjectiveObjectsState {
  readonly objects: readonly RobotObjectiveObject[]; readonly appliedAttackIds: readonly string[];
  readonly completedRound: number;
}
type Data = Readonly<Record<string, unknown>>;
function obj(value: unknown): Data { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid objective object"); return value as Data; }
const same = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;
function positive(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("Unresolved/invalid adopted objective durability"); return value; }

/** One entity per HP pool, regardless of occupied cell count. The selected
 * stage projection supplies adopted difficulty values; no prototype fallbacks.
 */
export function createRobotObjectiveObjects(stage: RobotStagePlan): RobotObjectiveObjectsState {
  const objects: RobotObjectiveObject[] = [];
  const visit = (o: Data) => {
    if (o.kind === "composite") { (o.conditions as readonly unknown[]).forEach(c => visit(obj(c))); return; }
    const add = (raw: Data, kind: RobotObjectiveObject["kind"]) => {
      if (typeof raw.id !== "string" || !raw.id || objects.some(o => o.id === raw.id)) throw new Error("Invalid/duplicate objective identity");
      const hp = positive(raw.maxHp ?? raw.hp), def = positive(raw.def);
      const route = kind === "transport" ? (raw.route as string[]).map(robotCellToPosition) : [];
      const cells = kind === "transport" ? [robotCellToPosition(raw.initialCell as string)] : (raw.cells as string[]).map(robotCellToPosition);
      if (!cells.length || kind === "transport" && (!route.length || !same(route[0]!, cells[0]!))) throw new Error("Invalid objective footprint/route");
      for (const cell of [...cells, ...route]) if (cell.x >= stage.board.width || cell.y >= stage.board.height) throw new Error("Objective outside adopted board");
      objects.push({ id: raw.id, kind, hp, maxHp: hp, def, cells, route, routeIndex: 0, blocksMovement: raw.blocksMovement === true || o.blocksMovement === true || o.blockMovement === true, blocksLineOfSight: raw.blocksLineOfSight === true });
    };
    if (o.kind === "defend-structure") add(obj(o.structure), "facility");
    if (o.kind === "destroy-two-depots") (o.depots as readonly unknown[]).forEach(d => add(obj(d), "depot"));
    if (o.kind === "escort-transport") add(obj(o.transport), "transport");
  };
  visit(stage.objective.specification);
  return { objects, appliedAttackIds: [], completedRound: 0 };
}

/** Already-resolved damage, consolidated by entity. This is an internal HP
 * adapter; attack legality/minimum/DEF are the common attack resolver's job.
 */
export function applyRobotObjectiveObjectBatch(state: RobotObjectiveObjectsState, attacks: readonly {
  readonly id: string; readonly hits: readonly { readonly objectId: string; readonly cells: readonly RobotPosition[]; readonly damage: number }[];
}[]): RobotObjectiveObjectsState {
  if (new Set(attacks.map(a => a.id)).size !== attacks.length) throw new Error("Duplicate objective attack in batch");
  const totals = new Map<string, number>(); const ids: string[] = [];
  for (const attack of attacks) {
    if (!attack.id) throw new Error("Missing objective attack ID");
    if (state.appliedAttackIds.includes(attack.id)) continue;
    if (new Set(attack.hits.map(h => h.objectId)).size !== attack.hits.length) throw new Error("Consolidate each object once per attack");
    for (const hit of attack.hits) {
      const target = state.objects.find(o => o.id === hit.objectId);
      if (!target || target.hp === 0 || !hit.cells.length || hit.cells.some(c => !target.cells.some(t => same(c, t))) || !Number.isSafeInteger(hit.damage) || hit.damage < 0) throw new Error("Invalid resolved objective hit");
      const sum = (totals.get(target.id) ?? 0) + hit.damage;
      if (!Number.isSafeInteger(sum)) throw new Error("Objective damage overflow"); totals.set(target.id, sum);
    }
    ids.push(attack.id);
  }
  if (!ids.length) return state;
  return { ...state, objects: state.objects.map(o => ({ ...o, hp: Math.max(0, o.hp - (totals.get(o.id) ?? 0)) })), appliedAttackIds: [...state.appliedAttackIds, ...ids] };
}

/** Complete-round boundary only: no guarding requirement, no regeneration,
 * maximum one route step, blocked routes wait in place. Death/outcome belongs
 * to the mission resolver; destroyed objects never move or heal here.
 */
export function advanceRobotObjectiveTransports(state: RobotObjectiveObjectsState, round: number, context: {
  /** All blocking occupants/structures, as resolved by the mission layer. */
  readonly occupied: readonly RobotPosition[]; readonly walls: readonly RobotPosition[];
}): RobotObjectiveObjectsState {
  if (round === state.completedRound) return state;
  if (!Number.isSafeInteger(round) || round !== state.completedRound + 1) throw new Error("Duplicate/out-of-order complete round");
  let objects = [...state.objects];
  for (const transport of state.objects.filter(o => o.kind === "transport" && o.hp > 0)) {
    const next = transport.route[transport.routeIndex + 1]; if (!next) continue;
    const blocked = [...context.occupied, ...context.walls];
    if (!blocked.some(c => same(c, next))) objects = objects.map(o => o.id === transport.id ? { ...o, routeIndex: o.routeIndex + 1, cells: [{ ...next }] } : o);
  }
  return { ...state, objects, completedRound: round };
}
