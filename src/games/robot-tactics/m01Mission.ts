import { chooseRobotReinforcementCells } from "./reinforcementPlacement";
import { applyRobotObjectiveObjectBatch, createRobotObjectiveObjects, type RobotObjectiveObjectsState } from "./objectiveObjects";
import { robotCellToPosition, type RobotPosition } from "./movement";
import { getRobotStagePlan } from "./stageCatalog";
import type { RobotDifficulty } from "./types";

/** Adopted M01 objective only. Encounter levels, initiative and AI are separate. */
export interface RobotM01State {
  readonly objects: RobotObjectiveObjectsState;
  readonly result: "ongoing" | "won" | "lost";
  readonly resultReason: "facility-destroyed" | "same-round-controlled-wipe" | "facility-survived" | null;
  readonly spawnedWaveIds: readonly string[];
}
export function createRobotM01State(difficulty: RobotDifficulty): RobotM01State {
  return { objects: createRobotObjectiveObjects(getRobotStagePlan({ missionNumber: 1, difficulty })), result: "ongoing", resultReason: null, spawnedWaveIds: [] };
}
export function applyRobotM01Damage(state: RobotM01State, attacks: readonly { attackId: string; hitCells: readonly RobotPosition[]; damage: number }[], sameRoundWipe: boolean): RobotM01State {
  const facility = state.objects.objects[0]!;
  const objects = applyRobotObjectiveObjectBatch(state.objects, attacks.map(a => ({ id: a.attackId, hits: [{ objectId: facility.id, cells: a.hitCells, damage: a.damage }] })));
  if (objects.objects[0]!.hp === 0) return { ...state, objects, result: "lost", resultReason: "facility-destroyed" };
  if (sameRoundWipe) return { ...state, objects, result: "lost", resultReason: "same-round-controlled-wipe" };
  return { ...state, objects };
}
export function finishRobotM01Round(state: RobotM01State, round: number, difficulty: RobotDifficulty): RobotM01State {
  const limit = getRobotStagePlan({ missionNumber: 1, difficulty }).roundLimit;
  if (state.result !== "ongoing" || !Number.isSafeInteger(round) || round !== state.objects.completedRound + 1 || round > limit) throw new Error("Invalid M01 round boundary");
  const objects = { ...state.objects, completedRound: round };
  return round === limit ? { ...state, objects, result: "won", resultReason: "facility-survived" } : { ...state, objects };
}
/** Ordered canonical pads, complete three-member placement in a 4x4 box.
 * Blocked waves defer; this never invents a free cell or a partial squad.
 */
export function spawnRobotM01Reinforcements(state: RobotM01State, round: number, difficulty: RobotDifficulty, occupied: readonly RobotPosition[]) {
  if (state.result !== "ongoing" || round !== state.objects.completedRound + 1) throw new Error("Invalid M01 spawn boundary");
  const stage = getRobotStagePlan({ missionNumber: 1, difficulty });
  const key = (p: RobotPosition) => `${p.x},${p.y}`;
  const blocked = new Set([...occupied, ...stage.board.walls.map(robotCellToPosition), ...state.objects.objects.flatMap(o => o.blocksMovement ? o.cells : [])].map(key));
  const spawned: { waveId: string; squadId: string; cells: readonly RobotPosition[] }[] = [];
  const deferredWaveIds: string[] = [];
  for (const wave of stage.reinforcements) {
    if (state.spawnedWaveIds.includes(wave.id) || wave.triggerType !== "round-start" || wave.triggerRound === null || round < wave.triggerRound) continue;
    const choices = [...wave.initialCells, ...wave.fallbackCells].map(robotCellToPosition).filter(c => !blocked.has(key(c)));
    const cells=chooseRobotReinforcementCells(choices,[]);
    if (!cells) deferredWaveIds.push(wave.id);
    else { spawned.push({ waveId: wave.id, squadId: wave.squad.id, cells }); cells.forEach(p => blocked.add(key(p))); }
  }
  return { state: { ...state, spawnedWaveIds: [...state.spawnedWaveIds, ...spawned.map(w => w.waveId)] }, spawned, deferredWaveIds };
}
