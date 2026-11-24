import { robotCellToPosition, type RobotPosition } from "./movement";
import { getRobotStagePlan } from "./stageCatalog";
import type { RobotStageKey, RobotStagePlan, RobotStageUnit, RobotStageWave } from "./types";

export const ROBOT_M30_ELIMINATION_COUNT = 20;

export interface RobotM30EliminationState {
  readonly result: "ongoing" | "won" | "lost";
  readonly resultReason: "enemies-eliminated" | "same-round-controlled-wipe" | "round-limit" | null;
  readonly spawnedWaveIds: readonly string[];
}

export function getRobotM30EliminationPlan(key: RobotStageKey): RobotStagePlan {
  if (key.missionNumber !== 30) throw new Error("M30 elimination plan requires M30");
  const base = getRobotStagePlan(key);
  const enemy = (kind: "medium" | "heavy", chassisOrArchetype: string, cell: string): RobotStageUnit => ({
    id: `m30-${kind}-${chassisOrArchetype}`, kind, chassisOrArchetype, model: "B", cells: [cell],
    enemyCoreLevel: base.referenceEnemyCoreLevel, weaponLevel: base.enemyWeaponLevel,
  });
  const wave = (squad: RobotStageUnit, round: number, id = squad.id): RobotStageWave => ({
    id, triggerType: "round-start", triggerRound: round, availableFromRound: round,
    initialCells: squad.cells, fallbackCells: [], spawnBranches: [], squad,
  });
  const [west, east] = base.reinforcements;
  return { ...base, roundLimit: 20,
    initialEnemies: [...base.initialEnemies, enemy("medium", "melee", "E8"), enemy("medium", "ranged", "O9"), enemy("heavy", "heavy-armor", "J8")],
    reinforcements: [
      wave(west!.squad, 4, "m30-round-4-west"), wave(enemy("medium", "mobile", "G4"), 4),
      wave(enemy("heavy", "heavy-assault", "C7"), 7), wave(enemy("medium", "defense", "Q6"), 7),
      wave(east!.squad, 10, "m30-round-10-east"), wave(enemy("heavy", "heavy-artillery", "Q4"), 10),
    ],
    objective: { kind: "eliminate-all-enemies", conditionKinds: ["eliminate-all-enemies"],
      specification: { kind: "eliminate-all-enemies", enemyCount: ROBOT_M30_ELIMINATION_COUNT } },
  };
}

export function spawnRobotM30EliminationWaves(stage: RobotStagePlan, state: RobotM30EliminationState,
  round: number, occupied: readonly RobotPosition[]) {
  const spawned = stage.reinforcements.flatMap(wave => {
    if (state.spawnedWaveIds.includes(wave.id) || round < wave.availableFromRound!) return [];
    const cells = wave.initialCells.map(robotCellToPosition);
    // Retry the prescribed cells on later rounds if occupied. Alternate pads
    // have not been adopted for this scenario.
    if (cells.some(cell => occupied.some(p => p.x === cell.x && p.y === cell.y))) return [];
    return [{ waveId: wave.id, squadId: wave.squad.id, cells, kind: wave.squad.kind }];
  });
  return { spawned, state: { ...state, spawnedWaveIds: [...state.spawnedWaveIds, ...spawned.map(w => w.waveId)] } };
}

export function getRobotM30EliminationResult(defeated: number, wiped: boolean, timedOut: boolean): Omit<RobotM30EliminationState, "spawnedWaveIds"> {
  if (wiped) return { result: "lost", resultReason: "same-round-controlled-wipe" };
  if (defeated === ROBOT_M30_ELIMINATION_COUNT) return { result: "won", resultReason: "enemies-eliminated" };
  return timedOut ? { result: "lost", resultReason: "round-limit" } : { result: "ongoing", resultReason: null };
}
