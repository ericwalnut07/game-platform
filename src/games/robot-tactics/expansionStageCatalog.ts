import { getRobotExpansionEnemyWeaponLevel, type RobotExpansionEnemyKey } from "./expansionEnemyPresets";
import { robotCellToPosition, robotPositionToCell } from "./movement";
import { getRobotStagePlan } from "./stageCatalog";
import type { RobotStageObjectivePlan, RobotStagePlan, RobotStageUnit, RobotStageWave } from "./types";

const roundLimits = [6, 11, 10, 11, 10, 13, 16, 8, 12, 11, 12, 12, 13, 16, 9, 13, 12, 13, 13, 14, 17, 13, 17, 17, 17, 17, 20, 14, 19, 16];
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
  const roundLimit = roundLimits[key.missionNumber - 1]!;
  const base = getRobotStagePlan({ difficulty: "hard", missionNumber: key.missionNumber });
  const free = freeDeploymentCells(base);
  const mission30 = key.missionNumber === 30;

  const additions: readonly [RobotStageUnit["kind"], string][] = mission30
    ? [["medium", "melee"], ["medium", "ranged"], ["medium", "defense"], ["medium", "mobile"],
       ["heavy", "heavy-assault"], ["heavy", "heavy-artillery"], ["heavy", "heavy-armor"]]
    : heavyAdditions[key.missionNumber] ? [["heavy", heavyAdditions[key.missionNumber]!]] : [["medium", "mobile"]];

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
  const objective: RobotStageObjectivePlan = mission30 ? {
    kind: "eliminate-all-enemies", conditionKinds: ["eliminate-all-enemies"],
    specification: { kind: "eliminate-all-enemies", enemyCount: 20 },
  } : base.objective;
  return { key, base, initialEnemies, reinforcements, roundLimit, objective };
}
