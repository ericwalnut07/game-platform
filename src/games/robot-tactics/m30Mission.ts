import stages from "../../../docs/design/robot-tactics/late-m28-m30-candidates.json";
import { commitRobotEnergyAction, type RobotEnergyState } from "./energy";
import type { RobotAlliedLifeUnit, RobotAlliedLifecycleState, RobotAlliedLifeSnapshot } from "./alliedLifecycle";
import { robotCellToPosition, type RobotPosition } from "./movement";
import type { RobotDifficulty } from "./types";
import { applyRobotBossDamage, type RobotBossState } from "./bossCommands";
import { getRobotM30EnemyAiRole, type RobotM30AiRole } from "./bossAi";

function adoptedStage() {
  const found = stages.stages.find(s => s.number === 30);
  if (!found || !("approvalStatus" in found) || found.approvalStatus !== "adopted-mission-spec-2026-10-30") throw new Error("M30 adopted mission specification is missing");
  return found;
}
const stage = adoptedStage();
const same = (a: RobotPosition, b: RobotPosition) => a.x === b.x && a.y === b.y;
const cellKey = (p: RobotPosition) => p.x + "," + p.y;
export const ROBOT_M30_DATA_ID = "command-archives";
export interface RobotM30State {
  readonly difficulty: RobotDifficulty; readonly round: number;
  readonly result: "ongoing" | "won" | "lost"; readonly resultReason: string | null;
  readonly facility: { readonly id: "allied-final-relay"; readonly cells: readonly RobotPosition[]; readonly hp: number; readonly maxHp: number; readonly def: number };
  readonly bossDefeated: boolean;
  readonly data: { readonly cell: RobotPosition | null; readonly carrierId: string | null; readonly sent: boolean };
  readonly appliedAttackIds: readonly string[]; readonly spawnedWaveIds: readonly string[];
}
function running(s: RobotM30State): void { if (s.result !== "ongoing") throw new Error("M30 has ended"); }
function validCell(p: RobotPosition): void {
  if (!Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= 19 || p.y >= 17) throw new Error("Invalid M30 cell");
}
export function createRobotM30State(difficulty: RobotDifficulty): RobotM30State {
  const raw = stage.objectives.conditions[0]!.structure!;
  const stats = raw.statsByDifficulty[difficulty];
  if (!stats) throw new Error("Invalid M30 difficulty");
  return { difficulty, round: 1, result: "ongoing", resultReason: null,
    facility: { id: "allied-final-relay", cells: raw.cells.map(robotCellToPosition), hp: stats.hp, maxHp: stats.hp, def: stats.defense },
    bossDefeated: false, data: { cell: robotCellToPosition("K3"), carrierId: null, sent: false }, appliedAttackIds: [], spawnedWaveIds: [] };
}
/** One already-resolved entity hit. Hit cells never independently subtract shared HP. */
export function applyRobotM30FacilityAttack(state: RobotM30State, input: { readonly attackId: string; readonly hitCells: readonly RobotPosition[]; readonly damage: number }): RobotM30State {
  if (!input.attackId || !Number.isSafeInteger(input.damage) || input.damage < 0) throw new Error("Invalid resolved facility attack");
  if (state.appliedAttackIds.includes(input.attackId)) return state;
  running(state);
  input.hitCells.forEach(validCell);
  if (!input.hitCells.some(c => state.facility.cells.some(f => same(c, f)))) return state;
  const hp = Math.max(0, state.facility.hp - input.damage);
  return { ...state, facility: { ...state.facility, hp }, appliedAttackIds: [...state.appliedAttackIds, input.attackId],
    ...(hp === 0 ? { result: "lost" as const, resultReason: "facility-destroyed" } : {}) };
}
/** All attacks in a simultaneous batch see the same living facility. Each entity
 * hit has already consolidated its cells; separate squad attacks still add up.
 */
export function applyRobotM30FacilityBatch(state: RobotM30State, attacks: readonly { readonly attackId: string; readonly hitCells: readonly RobotPosition[]; readonly damage: number }[]): RobotM30State {
  if (new Set(attacks.map(a => a.attackId)).size !== attacks.length) throw new Error("Duplicate attack in facility batch");
  const pending = attacks.filter(attack => {
    // Use common validation for each new attack before changing anything.
    applyRobotM30FacilityAttack(state, attack);
    return !state.appliedAttackIds.includes(attack.attackId) && attack.hitCells.some(c => state.facility.cells.some(f => same(c, f)));
  });
  if (!pending.length) return state;
  const damage = pending.reduce((sum, attack) => sum + attack.damage, 0);
  if (!Number.isSafeInteger(damage)) throw new Error("Facility batch damage exceeds supported numeric range");
  const combined = applyRobotM30FacilityAttack(state, { attackId: pending[0]!.attackId, hitCells: pending.flatMap(a => a.hitCells), damage });
  return { ...combined, appliedAttackIds: [...state.appliedAttackIds, ...pending.map(a => a.attackId)] };
}
export function recordRobotM30BossDefeat(state: RobotM30State, bossId: string): RobotM30State {
  running(state);
  if (bossId !== "enemy-supreme-commander") throw new Error("M30 boss identity mismatch");
  return { ...state, bossDefeated: true };
}
/** Common resolved damage -> boss death/effect cleanup -> M30 objective, in one transition. */
export function applyRobotM30BossHit(state: RobotM30State, boss: RobotBossState, damage: number) {
  running(state);
  if(boss.plan.missionNumber!==30||boss.plan.difficulty!==state.difficulty)throw new Error("M30 boss/mission mismatch");
  const nextBoss=applyRobotBossDamage(boss,damage);
  return {boss:nextBoss,state:nextBoss.hp===0?recordRobotM30BossDefeat(state,nextBoss.plan.definition.unitId):state};
}
/** M30 only. Does not establish a pickup/transfer rule for any other mission. */
export function commitRobotM30DataAction<T extends RobotAlliedLifeUnit>(state: RobotM30State, actor: T, energy: RobotEnergyState, action: "pickup" | "transmit") {
  running(state);
  if (actor.kind !== "controlled" || actor.hp <= 0 || actor.position === null || energy.round !== state.round || actor.en !== energy.en) throw new Error("A living controlled actor in the current turn is required");
  if (state.data.sent) throw new Error("M30 data was already transmitted");
  if (action === "pickup") {
    if (state.data.carrierId !== null || state.data.cell === null || !same(actor.position, state.data.cell) || actor.carriedObjectiveId !== null) throw new Error("Actor cannot pick up this data");
  } else if (action === "transmit") {
    if (state.data.carrierId !== actor.id || actor.carriedObjectiveId !== ROBOT_M30_DATA_ID || !same(actor.position, robotCellToPosition("I14"))) throw new Error("Actor cannot transmit this data");
  } else throw new Error("Unknown M30 data action");
  const nextEnergy = commitRobotEnergyAction(energy, { kind: "other", energyCost: 0 });
  const next: RobotM30State = { ...state, data: action === "pickup" ? { cell: null, carrierId: actor.id, sent: false } : { cell: null, carrierId: null, sent: true } };
  const nextActor: RobotAlliedLifeSnapshot<T> = { ...actor, carriedObjectiveId: action === "pickup" ? ROBOT_M30_DATA_ID : null };
  return { state: next, actor: nextActor, energy: nextEnergy };
}
/** Consumes the real common-lifecycle drop batch and same-round wipe result. */
export function applyRobotM30AlliedDefeats(state: RobotM30State, result: { readonly state: RobotAlliedLifecycleState; readonly droppedObjectives: readonly { readonly objectiveId: string; readonly unitId: string; readonly position: RobotPosition }[] }): RobotM30State {
  running(state);
  if (result.state.round !== state.round) throw new Error("M30/common lifecycle round mismatch");
  const drop = result.droppedObjectives.find(d => d.objectiveId === ROBOT_M30_DATA_ID && d.unitId === state.data.carrierId);
  if (drop) validCell(drop.position);
  if (state.data.carrierId && result.state.allies.some(u => u.id === state.data.carrierId && u.hp === 0) && !drop) throw new Error("Missing M30 carrier drop event");
  return { ...state, ...(drop ? { data: { cell: { ...drop.position }, carrierId: null, sent: false } } : {}),
    ...(result.state.lostBySameRoundWipe ? { result: "lost" as const, resultReason: "same-round-controlled-wipe" } : {}) };
}
export function finishRobotM30Round(state: RobotM30State, completedRound: number): RobotM30State {
  running(state);
  if (completedRound !== state.round) throw new Error("Duplicate or out-of-order M30 round completion");
  if (state.facility.hp <= 0) return { ...state, result: "lost", resultReason: "facility-destroyed" };
  if (completedRound === 16) return { ...state, result: state.bossDefeated && state.data.sent ? "won" : "lost", resultReason: state.bossDefeated && state.data.sent ? "all-three-conditions-at-R16-end" : "round-limit" };
  if (completedRound > 16) throw new Error("M30 cannot advance past R16");
  return { ...state, round: completedRound + 1 };
}

function connected(cells: readonly RobotPosition[]): boolean {
  const seen = new Set([0]);
  for (let step = 0; step < cells.length; step++) for (let i = 0; i < cells.length; i++) if (seen.has(i)) for (let j = 0; j < cells.length; j++) {
    if (Math.abs(cells[i]!.x - cells[j]!.x) + Math.abs(cells[i]!.y - cells[j]!.y) === 1) seen.add(j);
  }
  return seen.size === cells.length && Math.max(...cells.map(c => c.x)) - Math.min(...cells.map(c => c.x)) <= 3 && Math.max(...cells.map(c => c.y)) - Math.min(...cells.map(c => c.y)) <= 3;
}
/** R6/R11 triggers become eligible at R7/R12. Full squads, ordered fallback, no revival. */
export function spawnRobotM30Reinforcements(state: RobotM30State, occupied: readonly RobotPosition[]) {
  running(state); occupied.forEach(validCell);
  const blocked = new Set([...occupied, ...stage.board.walls.map(robotCellToPosition), ...state.facility.cells].map(cellKey));
  const spawned: { waveId: string; squadId: string; cells: readonly RobotPosition[]; aiRole: RobotM30AiRole }[] = [];
  const deferredWaveIds: string[] = [];
  for (const wave of stage.reinforcements) {
    if (state.spawnedWaveIds.includes(wave.id) || state.round < wave.availableFromRound) continue;
    const choices = [...wave.squad.memberCells, ...wave.fallbackCells].map(robotCellToPosition).filter(p => !blocked.has(cellKey(p)));
    let placement: readonly RobotPosition[] | null = null;
    for (let a = 0; a < choices.length && placement === null; a++) for (let b = a + 1; b < choices.length && placement === null; b++) for (let c = b + 1; c < choices.length && placement === null; c++) {
      const candidate = [choices[a]!, choices[b]!, choices[c]!];
      if (connected(candidate)) placement = candidate;
    }
    if (placement === null) deferredWaveIds.push(wave.id);
    else { spawned.push({ waveId: wave.id, squadId: wave.squad.id, cells: placement, aiRole: getRobotM30EnemyAiRole(wave.squad.id) }); placement.forEach(p => blocked.add(cellKey(p))); }
  }
  return { state: { ...state, spawnedWaveIds: [...state.spawnedWaveIds, ...spawned.map(w => w.waveId)] }, spawned, deferredWaveIds };
}
