import { expect, it } from "vitest";
import { getRobotExpansionStagePlan } from "../../src/games/robot-tactics/expansionStageCatalog";
import { createRobotExpansionInitialEnemies, createRobotExpansionWaveEnemies } from "../../src/games/robot-tactics/expansionStageDeployment";
import { areRobotExpansionMissionsUnlocked, getRobotExpansionFirstClearEquipment } from "../../src/games/robot-tactics/expansionRewards";
import { listRobotAddonIds, listRobotBasicPartIds, resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotStagePlan, listRobotStageKeys } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition, robotPositionToCell } from "../../src/games/robot-tactics/movement";

const caps = [6, 11, 10, 11, 10, 13, 16, 8, 12, 11, 12, 12, 13, 16, 9, 13, 12, 13, 13, 14, 17, 13, 17, 17, 17, 17, 20, 14, 19, 16];

it("projects all 58 ordinary expansion rosters with legal spawn pads and the adopted round limits", () => {
  for (const difficulty of ["hardest", "inferno"] as const) for (const [index, limit] of caps.slice(0, 29).entries()) {
    const missionNumber = index + 1;
    const plan = getRobotExpansionStagePlan({ difficulty, missionNumber });
    const legacy = getRobotStagePlan({ difficulty: "hard", missionNumber });
    expect(plan.base).toEqual(legacy);
    expect(plan.roundLimit).toBe(limit);
    const initial = createRobotExpansionInitialEnemies(plan);
    const cells = initial.map(u => robotPositionToCell(u.position!));
    expect(cells).toEqual([...new Set(cells)]);
    expect(cells.some(c => legacy.board.walls.includes(c) || legacy.players.includes(c) || legacy.friendlyAI.some(a => a.cell === c))).toBe(false);
    expect(plan.initialEnemies).toHaveLength(legacy.initialEnemies.length + 1);
    expect(plan.objective).toEqual(legacy.objective);
    for (const { wave, members } of plan.reinforcements) {
      expect(wave).toEqual(legacy.reinforcements.find(w => w.id === wave.id));
      const branches = wave.spawnBranches.length ? wave.spawnBranches.map(b => b.survivingDepotId) : [undefined];
      for (const branch of branches) {
        const spawned = createRobotExpansionWaveEnemies(plan, wave.id, [], branch)!;
        expect(spawned).toHaveLength(3);
        expect(spawned.filter(u => u.kind === "medium")).toHaveLength([7, 14, 21].includes(missionNumber) ? 3 : 0);
        expect(spawned.every(u => u.parts.every(p => p.level === members[0]!.weaponLevel))).toBe(true);
      }
    }
  }
});

it("uses the prescribed heavy additions and the M30 first-phase roster of twenty", () => {
  for (const [missionNumber, chassis] of [[23, "heavy-armor"], [25, "heavy-artillery"], [27, "heavy-armor"], [29, "heavy-assault"]] as const) {
    const plan = getRobotExpansionStagePlan({ difficulty: "inferno", missionNumber });
    expect(plan.initialEnemies.at(-1)).toMatchObject({ kind: "heavy", chassisOrArchetype: chassis });
  }
  const plan = getRobotExpansionStagePlan({ difficulty: "hardest", missionNumber: 30 });
  const units = [...createRobotExpansionInitialEnemies(plan), ...plan.reinforcements.flatMap(w => createRobotExpansionWaveEnemies(plan, w.wave.id, [])!)];
  expect(new Set(units.map(u => u.id)).size).toBe(20);
  expect(["light", "medium", "heavy", "boss"].map(kind => units.filter(u => u.kind === kind).length)).toEqual([12, 4, 3, 1]);
  expect(new Set(units.filter(u => u.kind === "light").map(u => u.chassis)).size).toBe(4);
  expect(plan.objective).toMatchObject({ kind: "eliminate-all-enemies", specification: { enemyCount: 20 } });
});

it("uses fallback pads for a reinforcement and defers if the entire wave cannot fit", () => {
  const plan = getRobotExpansionStagePlan({ difficulty: "hardest", missionNumber: 7 });
  const { wave } = plan.reinforcements[0]!;
  const blocked = wave.initialCells.map(robotCellToPosition);
  const moved = createRobotExpansionWaveEnemies(plan, wave.id, blocked)!;
  expect(moved.map(u => u.position).every(p => wave.fallbackCells.includes(robotPositionToCell(p!)))).toBe(true);
  expect(createRobotExpansionWaveEnemies(plan, wave.id, [...blocked, ...wave.fallbackCells.map(robotCellToPosition)])).toBeNull();
});

it("requires all 90 base clears and resolves 42 unique first-clear equipment IDs", () => {
  const cleared = listRobotStageKeys().map(k => k.difficulty + "-" + String(k.missionNumber).padStart(2, "0"));
  expect(areRobotExpansionMissionsUnlocked({ cleared })).toBe(true);
  expect(areRobotExpansionMissionsUnlocked({ cleared: cleared.filter(id => id !== "normal-30") })).toBe(false);
  const rows = caps.map((_, index) => getRobotExpansionFirstClearEquipment({ difficulty: "hardest", missionNumber: index + 1 }));
  const ids = rows.flat();
  const basic = listRobotBasicPartIds(), addons = listRobotAddonIds();
  expect(rows.every(row => row.length >= 1 && row.length <= 2)).toBe(true);
  expect(new Set(ids).size).toBe(42);
  expect(ids.filter(id => addons.includes(id))).toHaveLength(20);
  expect(ids.filter(id => basic.includes(id) && resolveRobotBasicPart(id, 1).slot === "weapon")).toHaveLength(12);
  expect(ids.filter(id => basic.includes(id) && resolveRobotBasicPart(id, 1).slot !== "weapon")).toHaveLength(10);
  expect(rows[10]).toEqual(["cluster-cannon"]);
  expect(rows[21]).toEqual(["aether-rail-cannon", "damage-storage-reactor"]);
  expect(rows[24]).toEqual(["precision-response-control", "ultra-heavy-laminated-armor"]);
  expect(getRobotExpansionFirstClearEquipment({ difficulty: "inferno", missionNumber: 30 })).toEqual([]);
});
