import { getRobotLegalMoves, type RobotPosition } from "../../../games/robot-tactics/movement";
import { robotMovementDurationMs, type RobotBattleMotion, type RobotBattleMovementPlan, type RobotBattleMotionStyle } from "./BattleMovement";
import type { RobotBattlePlaybackSpeed } from "./BattlePresentation";
import type { RobotBattleUnitView, RobotBattleViewModel } from "./BattleViewModel";

const zero: RobotBattleMovementPlan = { movers: [], durationMs: 0 };
const same = (a: RobotPosition, b: RobotPosition): boolean => a.x === b.x && a.y === b.y;
const distance = (a: RobotPosition, b: RobotPosition): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const scaleFor = (speed: RobotBattlePlaybackSpeed): number => speed === "skip" ? 0 : speed === "fast" ? .55 : 1;
function plan(movers: readonly RobotBattleMotion[]): RobotBattleMovementPlan {
  return { movers, durationMs: Math.max(0, ...movers.map(m => m.durationMs)) };
}
function receipt(unit: RobotBattleUnitView, route: readonly RobotPosition[], style: RobotBattleMotionStyle, ms: number, speed: RobotBattlePlaybackSpeed): RobotBattleMotion {
  return { unitId: unit.id, kind: unit.kind, style, route, durationMs: Math.round(ms * scaleFor(speed)) };
}

/** Reconstruct committed step-by-step geometry without approving new actions. */
function legalAdjacentRoute(
  from: RobotPosition, to: RobotPosition, before: RobotBattleViewModel,
  occupied: ReadonlyMap<string, RobotPosition>, movingId: string,
): readonly RobotPosition[] | null {
  const dx = to.x - from.x, dy = to.y - from.y, steps = distance(from, to);
  if (!steps || (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy))) return null;
  const delta = { x: Math.sign(dx), y: Math.sign(dy) };
  const route: RobotPosition[] = [from];
  let current = from;
  const structures = before.structures.flatMap(structure => structure.cells);
  for (let step = 0; step < steps; step++) {
    const next = { x: current.x + delta.x, y: current.y + delta.y };
    if (!getRobotLegalMoves({
      board: before.board, origin: current, mov: 1, facing: "north", types: ["omni"],
      occupied: [...occupied].filter(([id]) => id !== movingId).map(([, cell]) => cell),
      structures,
    }).some(move => same(move.destination, next))) return null;
    route.push(next);
    current = next;
  }
  return same(current, to) ? route : null;
}

/** Same named player action, same canonical reach and footprint; no new movement rule. */
function extraRoute(unit: RobotBattleUnitView, destination: RobotPosition, before: RobotBattleViewModel): readonly RobotPosition[] | null {
  if (!unit.movement || !unit.extraMoveDistance) return null;
  const move = getRobotLegalMoves({
    ...unit.movement, mov: unit.extraMoveDistance, board: before.board, origin: unit.cell,
    occupied: before.units.filter(other => other.id !== unit.id).map(other => other.cell),
    structures: before.structures.flatMap(structure => structure.cells),
  }).find(option => same(option.destination, destination));
  return move && move.path.length ? [unit.cell, ...move.path] : null;
}
export interface RobotBattleSpecialMotionPhases {
  /** Extra movement and charge/advance happen BEFORE any impact animation. */
  readonly before: RobotBattleMovementPlan;
  /** Knockback/pull and vault landing happen AFTER the impact animation. */
  readonly after: RobotBattleMovementPlan;
}
/**
 * Compare two *already committed* battle projections.
 * Unknown movement and all geometry ambiguities fail closed to the saved cell.
 * Teleport animation is only enabled by an explicit teleport-like action label.
 */
export function planRobotBattleSpecialMovement(
  before: RobotBattleViewModel,
  after: RobotBattleViewModel,
  speed: RobotBattlePlaybackSpeed = "standard",
): RobotBattleSpecialMotionPhases {
  const empty = { before: zero, after: zero };
  if (speed === "skip" || before.checkpoint.battleId !== after.checkpoint.battleId ||
    after.checkpoint.sequence <= before.checkpoint.sequence || !after.latestAction ||
    after.latestAction.id === before.latestAction?.id) return empty;
  const actor = before.queue[0];
  if (!actor) return empty;
  const summary = after.latestSummary.split("／設置効果")[0]!;
  const isExtra = /：追加移動(?:$|／)/.test(summary);
  const isCharge = /：(超特攻|特攻|踏み込み中に撃破)(?:$|／)/.test(summary);
  const isVault = /：刃渡り(?:$|／)/.test(summary);
  const isWarp = /：(瞬間移動|空間転移|テレポート|ワープ)(?:$|／)/.test(summary);
  const occupied = new Map(before.units.map(unit => [unit.id, unit.cell]));
  const pre: RobotBattleMotion[] = [], post: RobotBattleMotion[] = [];
  for (const id of actor.unitIds) {
    const unit = before.units.find(other => other.id === id);
    const destination = after.units.find(other => other.id === id)?.cell;
    if (!unit || !destination || same(unit.cell, destination)) continue;
    let route: readonly RobotPosition[] | null = null;
    let style: RobotBattleMotionStyle;
    if (isExtra && unit.kind === "controlled") {
      style = "extra"; route = extraRoute(unit, destination, before);
    } else if (isCharge && unit.kind === "controlled") {
      style = "charge"; route = legalAdjacentRoute(unit.cell, destination, before, occupied, id);
    } else if (isVault && unit.kind === "controlled") {
      style = "vault";
      const middle = { x: (unit.cell.x + destination.x) / 2, y: (unit.cell.y + destination.y) / 2 };
      if (Number.isInteger(middle.x) && Number.isInteger(middle.y) &&
        before.units.some(other => other.id !== id && same(other.cell, middle)) &&
        distance(unit.cell, middle) === 1 && distance(middle, destination) === 1) route = [unit.cell, middle, destination];
    } else if (isWarp) {
      style = "blink"; route = [unit.cell, destination];
    } else continue;
    if (!route) continue;
    const steps = route.length - 1;
    const duration = style === "vault" ? 480 : style === "blink" ? 380 :
      style === "charge" ? Math.min(720, 270 + steps * 135) :
      Math.max(300, Math.round(robotMovementDurationMs(steps) * .75));
    const mover = receipt(unit, route, style, duration, speed);
    if (style === "vault") post.push(mover); else pre.push(mover);
    occupied.set(id, destination);
  }
  // Other units can move as a consequence of an attack. Only a target at a
  // confirmed impact cell qualifies; unrelated position changes never animate.
  for (const unit of before.units) {
    if (actor.unitIds.includes(unit.id)) continue;
    const destination = after.units.find(other => other.id === unit.id)?.cell;
    if (!destination || same(unit.cell, destination)) continue;
    const directHit = after.latestAction.hits.some(hit => hit.damage !== null && same(hit.cell, unit.cell));
    if (!directHit) continue;
    const route = legalAdjacentRoute(unit.cell, destination, before, occupied, unit.id);
    if (!route) continue;
    const source = after.units.find(other => other.id === actor.unitIds[0]) ??
      before.units.find(other => other.id === actor.unitIds[0]);
    const toward = !!source && distance(destination, source.cell) < distance(unit.cell, source.cell);
    const style: RobotBattleMotionStyle = /引戻し|引き寄せ/.test(summary) || toward ? "pull" : "push";
    post.push(receipt(unit, route, style, Math.min(520, 180 + (route.length - 1) * 120), speed));
    occupied.set(unit.id, destination);
  }
  return { before: plan(pre), after: plan(post) };
}
