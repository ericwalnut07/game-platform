import { expect, it } from "vitest";
import { advanceRobotBattleRound, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { robotFormalRuntime, robotBattleJson } from "../../src/games/robot-tactics/formalRuntime";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { createRobotFormalBattleState, createRobotFormalReinforcement, createRobotStageEnemyUnits } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";

it("accepts legal M03 fallback reinforcement facing on a saved round-2 snapshot, but rejects altered movement stats", () => {
  const key = { missionNumber: 3, difficulty: "easy" as const };
  const departure = { battleId: "m03-fallback-repro", key, party: createRobotOfflineProgress().party };
  const initial = createRobotFormalBattleState(departure);
  if (initial.objective.kind !== "early") throw new Error("Expected M03 early objective");
  const stage = getRobotStagePlan(key);
  const wave = stage.reinforcements.find(w => w.squad.id === "rear-pursuit");
  if (!wave || wave.initialCells.length !== 3) throw new Error("Expected adopted M03 rear pursuit wave");
  const initialEnemy = createRobotStageEnemyUnits(stage, wave.squad);
  let reproduced = false;
  for (const blockCount of [1, 2, 3]) {
    // Controlled units occupy legitimate planned enemy arrival pads at round start,
    // so the adopted placement resolver must use its ordered fallback cells.
    const controlled = initial.units.filter(u => u.kind === "controlled");
    const units = initial.units.map(u => {
      const index = controlled.findIndex(c => c.id === u.id);
      return index >= 0 && index < blockCount
        ? { ...u, position: robotCellToPosition(wave.initialCells[index]!) }
        : u;
    });
    const ready = {
      ...initial,
      units,
      turn: { ...initial.turn, actorId: null, actedActorIds: initial.actors.map(a => a.id) },
      objective: { kind: "early" as const, state: { ...initial.objective.state, waveDueRound: 2 } }
    };
    const next = advanceRobotBattleRound(ready, spawn => createRobotFormalReinforcement(stage, spawn));
    const different = initialEnemy.some(e => {
      const actual = getRobotBattleUnit(next, e.id);
      return actual.movement?.facing !== e.movement?.facing;
    });
    if (!different) continue;
    reproduced = true;
    expect(next.objective.kind === "early" && next.objective.state.spawnedWaveIds).toContain(wave.id);
    expect(() => robotFormalRuntime.validate(robotBattleJson(next), departure)).not.toThrow();
    const targetId = initialEnemy.find(e => getRobotBattleUnit(next, e.id).movement?.facing !== e.movement?.facing)!.id;
    const invalid = { ...next, units: next.units.map(u => u.id === targetId
      ? { ...u, movement: { ...u.movement!, mov: u.movement!.mov + 1 } }
      : u) };
    expect(() => robotFormalRuntime.validate(robotBattleJson(invalid), departure)).toThrow();
    break;
  }
  expect(reproduced, "Need a real legal fallback with a different spawn facing").toBe(true);
});
