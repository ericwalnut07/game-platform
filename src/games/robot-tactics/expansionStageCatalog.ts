import { getRobotM30EliminationPlan } from "./m30Elimination";
import { getRobotExpansionEnemyWeaponLevel, type RobotExpansionEnemyKey } from "./expansionEnemyPresets";
import { robotCellToPosition, robotPositionToCell } from "./movement";
import { getRobotStagePlan } from "./stageCatalog";
import type { RobotStagePlan, RobotStageUnit, RobotStageWave } from "./types";

const roundLimits = [6, 11, 10, 11, 10, 13, 16, 8, 12, 11, 12, 12, 13, 16, 9, 13, 12, 13, 13, 14, 17, 13, 17, 17, 17, 17, 20, 14, 19, 20];
export function getRobotExpansionRoundLimit(missionNumber: number): number {
  const limit = roundLimits[missionNumber - 1];
  if (!limit) throw new Error("Unknown expansion mission");
  return limit;
}
const heavyAdditions: Readonly<Partial<Record<number, string>>> = {
  23: "heavy-armor", 25: "heavy-artillery", 27: "heavy-armor", 29: "heavy-assault",
};

function objectiveCells(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectiveCells);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    if (["cell", "initialCell", "goalCell", "bossCell"].includes(key) && typeof child === "string") return [child];
    if (["cells", "route", "breakthroughCells"].includes(key) && Array.isArray(child)) return child as string[];
    return objectiveCells(child);
  });
}

function freeDeploymentCells(stage: RobotStagePlan): string[] {
  const blocked = new Set([
    ...stage.board.walls, ...stage.players, ...stage.friendlyAI.map(u => u.cell), ...stage.respawnPriority,
    ...stage.initialEnemies.flatMap(u => u.cells), ...objectiveCells(stage.objective.specification),
    ...stage.reinforcements.flatMap(w => [
      ...w.initialCells, ...w.fallbackCells, ...w.spawnBranches.flatMap(b => [...b.memberCells, ...b.fallbackCells]),
    ]),
  ]);
  // Keep additional enemies near the existing enemy front, on distinct free tiles.
  const anchors = stage.initialEnemies.flatMap(u => u.cells.map(robotCellToPosition));
  const front = Math.max(...anchors.map(p => p.y));
  const center = (stage.board.width - 1) / 2;
  return Array.from({ length: stage.board.width * (front + 1) }, (_, index) => ({
    x: index % stage.board.width, y: Math.floor(index / stage.board.width),
  })).sort((a, b) => Math.abs(a.x - center) + front - a.y - (Math.abs(b.x - center) + front - b.y) || a.x - b.x)
    .map(robotPositionToCell).filter(cell => !blocked.has(cell));
}

function reinforcementMembers(wave: RobotStageWave, replaceSquad: boolean, weaponLevel: number): readonly RobotStageUnit[] {
  if (!replaceSquad) return [{ ...wave.squad, weaponLevel }];
  return wave.squad.cells.map((cell, index) => ({
    ...wave.squad, id: `${wave.squad.id}:medium-${index + 1}`, kind: "medium",
    cells: [cell], weaponLevel,
  }));
}

/** Expansion scenario data. The existing Hard stage supplies terrain, objectives
 * (M01–M29), movement reference and the unchanged triggers.
 */
export function getRobotExpansionStagePlan(key: RobotExpansionEnemyKey) {
  const weaponLevel = getRobotExpansionEnemyWeaponLevel(key);
  const roundLimit = getRobotExpansionRoundLimit(key.missionNumber);
  const stageKey = { difficulty: "hard", missionNumber: key.missionNumber } as const;
  if (key.missionNumber === 30) {
    const base = getRobotM30EliminationPlan(stageKey);
    const initialEnemies = base.initialEnemies.map(unit => unit.kind === "boss" ? unit : { ...unit, weaponLevel });
    const reinforcements = base.reinforcements.map(wave => ({ wave, members: [{ ...wave.squad, weaponLevel }] }));
    return { key, base, initialEnemies, reinforcements, roundLimit, objective: base.objective };
  }
  const base = getRobotStagePlan(stageKey);
  const free = freeDeploymentCells(base);
  const heavy = heavyAdditions[key.missionNumber];
  const additions: readonly [RobotStageUnit["kind"], string][] = heavy ? [["heavy", heavy]] : [["medium", "mobile"]];

  const initialEnemies = [
    ...base.initialEnemies.map(u => u.kind === "boss" ? u : { ...u, weaponLevel }),
    ...additions.map(([kind, chassisOrArchetype], index): RobotStageUnit => {
      const cell = free[index];
      if (!cell) throw new Error("No free expansion enemy deployment cell");
      return { id: `expansion-${kind}-${chassisOrArchetype}`, kind, chassisOrArchetype, model: "B", cells: [cell],
        enemyCoreLevel: null, weaponLevel };
    }),
  ];
  const reinforcements = base.reinforcements.map(wave => ({
    wave, members: reinforcementMembers(wave, [7, 14, 21].includes(key.missionNumber), weaponLevel),
  }));
  return { key, base, initialEnemies, reinforcements, roundLimit, objective: base.objective };
}
