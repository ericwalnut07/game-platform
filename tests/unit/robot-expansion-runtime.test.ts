import { expect, it } from "vitest";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { commitRobotBattleData, commitRobotBattlePassive, robotBattleTurnId, decodeRobotBattleCore, getRobotBattleActor, getRobotBattleResult, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { createRobotExpansionBattle, scheduleRobotFormalBattle, validateRobotExpansionBattle, robotBattleJson, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";

const departureFor = (missionNumber: number) => ({
  battleId: "expansion-test-" + missionNumber, key: { missionNumber, difficulty: "hard" as const },
  party: createRobotOfflineProgress().party,
});

it("starts and validates both expansion difficulties across M01–M29, and projects their actual deadlines", () => {
  for (const difficulty of ["hardest", "inferno"] as const) for (let mission = 1; mission <= 29; mission++) {
    const departure = departureFor(mission);
    const snapshot = createRobotExpansionBattle(departure, difficulty);
    expect(() => validateRobotExpansionBattle(snapshot, departure, difficulty)).not.toThrow();
    const state = decodeRobotBattleCore(snapshot);
    expect(state.expansionDifficulty).toBe(difficulty);
    expect(state.units.some(u => u.id.startsWith("expansion-"))).toBe(true);
    const view = robotFormalBattleAdapter.project({ runtimeId: robotFormalRuntime.id, runtimeVersion: robotFormalRuntime.version,
      departure, snapshot, committedActionIds: [], sequence: 0, latestSummary: "" });
    expect(view.roundLimit).toBeGreaterThan(0);
    if (mission === 2) expect(view.objectiveText).toContain("R11");
  }
  const departure = departureFor(8), expansion = createRobotExpansionBattle(departure, "hardest");
  expect(() => robotFormalRuntime.validate(expansion, departure)).toThrow(/departure/);
  expect(() => validateRobotExpansionBattle(expansion, departure, "inferno")).toThrow(/departure/);
  expect(() => robotFormalRuntime.validate(robotFormalRuntime.create(departure), departure)).not.toThrow();
  expect(() => createRobotExpansionBattle(departureFor(30), "hardest")).toThrow();
});

it.each([
  [1, 6, "won", "facility-survived"],
  [2, 11, "lost", "round-limit"],
  [8, 8, "won", "facility-survived"],
] as const)("M%i settles at its expansion deadline", (mission, limit, result, reason) => {
  const departure = departureFor(mission);
  // Use waiting actions to isolate round settlement from AI battle balance.
  let snapshot = createRobotExpansionBattle(departure, "hardest");
  for (let step = 0; step < 100; step++) {
    validateRobotExpansionBattle(snapshot, departure, "hardest");
    const state = decodeRobotBattleCore(snapshot);
    if (getRobotBattleResult(state).result !== "ongoing") {
      expect(state.allied.round).toBe(limit);
      expect(getRobotBattleResult(state)).toEqual({ result, reason });
      return;
    }
    const next = commitRobotBattlePassive(state, { kind: "wait", actionId: "wait-" + step, turnId: robotBattleTurnId(state) });
    snapshot = robotBattleJson(scheduleRobotFormalBattle(next));
  }
  throw new Error("Battle did not finish");
});

it.each([7, 14, 21, 24])("M%i collects data and deploys the complete wave at the next round boundary", mission => {
  const departure = departureFor(mission);
  let state = decodeRobotBattleCore(createRobotExpansionBattle(departure, "inferno"));
  expect(state.objective.kind).toBe("early");
  for (let step = 0; step < 40; step++) {
    const unit = getRobotBattleUnit(state, getRobotBattleActor(state).unitIds[0]!);
    if (unit.kind === "controlled" && state.objective.kind === "early" && state.objective.state.data?.cell) {
      const cell = state.objective.state.data.cell;
      state = { ...state, units: state.units.map(u => u.id === unit.id ? { ...u, position: cell } : u) };
      state = commitRobotBattleData(state, { kind: "pickup", turnId: robotBattleTurnId(state), actionId: "pickup" });
    } else {
      state = commitRobotBattlePassive(state, { kind: "wait", turnId: robotBattleTurnId(state), actionId: "wait-" + step });
    }
    state = scheduleRobotFormalBattle(state);
    if (state.allied.round !== 2) continue;
    validateRobotExpansionBattle(robotBattleJson(state), departure, "inferno");
    expect(state.objective.kind === "early" && state.objective.state.spawnedWaveIds).toHaveLength(1);
    if (mission === 24) return;
    const recruits = state.units.filter(u => u.id.includes(":medium-"));
    expect(recruits).toHaveLength(3);
    expect(state.actors.filter(a => a.id.includes(":medium-")).every(a => a.unitIds.length === 1)).toBe(true);
    return;
  }
  throw new Error("Reinforcements never arrived");
});


it("executes real NPC turns using expansion equipment and validates each resulting checkpoint", () => {
  const departure = departureFor(8);
  let snapshot = createRobotExpansionBattle(departure, "inferno");
  let attacked = false;
  for (let step = 0; step < 35; step++) {
    const state = decodeRobotBattleCore(snapshot);
    const actor = getRobotBattleUnit(state, getRobotBattleActor(state).unitIds[0]!);
    const resolution = robotFormalRuntime.act(snapshot, { kind: actor.kind === "controlled" ? "defend" : "npc" }, departure);
    snapshot = resolution.snapshot;
    validateRobotExpansionBattle(snapshot, departure, "inferno");
    const next = decodeRobotBattleCore(snapshot);
    attacked ||= next.latest?.damage.some(event => next.units.find(u => u.id === event.sourceId)?.parts.some(p => p.level === 15)) ?? false;
    if (resolution.outcome) {
      expect(resolution.outcome.subobjectiveAchieved).toBe(false);
      break;
    }
  }
  expect(attacked).toBe(true);
});
