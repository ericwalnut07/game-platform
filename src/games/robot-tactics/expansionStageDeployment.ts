import { createRobotExpansionStageEnemyUnits, createRobotStageEnemyUnits } from "./stageDeployment";
import { chooseRobotReinforcementCells } from "./reinforcementPlacement";
import { robotCellToPosition, type RobotPosition } from "./movement";
import type { getRobotExpansionStagePlan } from "./expansionStageCatalog";

type ExpansionStage = ReturnType<typeof getRobotExpansionStagePlan>;

export function createRobotExpansionInitialEnemies(plan: ExpansionStage) {
  const stage = { ...plan.base, objective: plan.objective };
  return plan.initialEnemies.flatMap(unit => unit.kind === "boss"
    ? createRobotStageEnemyUnits(stage, unit)
    : createRobotExpansionStageEnemyUnits(stage, plan.key, unit));
}

/** The caller owns the trigger and receipt. All three pads must be available
 * before spawning either a light squad or the replacement solo actors.
 */
export function createRobotExpansionWaveEnemies(plan: ExpansionStage, waveId: string,
  occupied: readonly RobotPosition[], survivingDepotId?: string) {
  const entry = plan.reinforcements.find(item => item.wave.id === waveId);
  if (!entry) throw new Error("Unknown expansion reinforcement: " + waveId);
  const { wave, members } = entry;
  const branch = wave.spawnBranches.find(b => b.survivingDepotId === survivingDepotId);
  const pads = wave.spawnBranches.length
    ? branch ? [...branch.memberCells, ...branch.fallbackCells] : []
    : [...wave.initialCells, ...wave.fallbackCells];
  const cells = chooseRobotReinforcementCells(pads.map(robotCellToPosition), [
    ...occupied, ...plan.base.board.walls.map(robotCellToPosition),
  ]);
  if (!cells) return null;
  const stage = { ...plan.base, objective: plan.objective };
  return members.flatMap((unit, index) =>
    createRobotExpansionStageEnemyUnits(stage, plan.key, unit, members.length === 1 ? cells : [cells[index]!]));
}
