import { expect, it } from "vitest";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleActor, getRobotBattleFacilities, getRobotBattleResult, getRobotBattleUnit, robotBattleIsAlly, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { settleRobotBattleConsequences } from "../../src/games/robot-tactics/battleSettlement";
import { createRobotM30PhaseOne, robotFormalRuntime, robotBattleJson, scheduleRobotFormalBattle, validateRobotM30PhaseOne } from "../../src/games/robot-tactics/formalRuntime";
import { getRobotM30EliminationPlan } from "../../src/games/robot-tactics/m30Elimination";
import { robotCellToPosition, robotPositionToCell } from "../../src/games/robot-tactics/movement";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineDeparture } from "../../src/games/robot-tactics/offlineSession";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotSubobjectiveAchieved } from "../../src/games/robot-tactics/subobjectives";
import { offlineExpansionFixtureProgress } from "../robot-tactics/offlineExpansionFixture";

function departureFor(difficulty: "easy" | "normal" | "hard" | "hardest" | "inferno"): RobotOfflineDeparture {
  const expansionDifficulty = difficulty === "hardest" || difficulty === "inferno" ? difficulty : undefined;
  return {
    battleId: "m30:" + difficulty, key: { missionNumber: 30, difficulty: expansionDifficulty ? "hard" : difficulty as "easy" | "normal" | "hard" },
    party: createRobotOfflineProgress().party,
    ...(expansionDifficulty ? { expansionDifficulty } : {}),
  };
}

function enemies(state: RobotBattleCoreState) {
  return state.units.filter(u => !robotBattleIsAlly(u));
}

function waitToRound(state: RobotBattleCoreState, round: number): RobotBattleCoreState {
  while (state.allied.round < round && getRobotBattleResult(state).result === "ongoing") {
    state = scheduleRobotFormalBattle(commitRobotBattlePassive(state, { kind: "wait", actionId: "wait:" + state.turn.serial, turnId: robotBattleTurnId(state) }));
  }
  return state;
}

it.each(["easy", "normal", "hard", "hardest", "inferno"] as const)("M30 %s uses fixed placements and R4/R7/R10 reinforcements", difficulty => {
  const departure = departureFor(difficulty);
  const snapshot = robotFormalRuntime.create(departure);
  let state = decodeRobotBattleCore(snapshot);
  expect(enemies(state).map(u => robotPositionToCell(u.position!)).sort()).toEqual(["E8", "H6", "I6", "J4", "J6", "J8", "O9", "P8", "Q8", "R8"]);
  expect(state.units.filter(robotBattleIsAlly).map(u => robotPositionToCell(u.position!))).toEqual(["G16", "J16", "M16", "I15", "K15"]);
  expect(getRobotBattleFacilities(state)).toEqual([]);
  robotFormalRuntime.validate(snapshot, departure);
  const view = robotFormalBattleAdapter.project({ departure, runtimeId: robotFormalRuntime.id, runtimeVersion: 1, snapshot, committedActionIds: [], sequence: 0, latestSummary: "" });
  expect(view.objectiveText).toContain("0/20");
  expect(view.commands.some(command => command.id === "pickup" || command.id === "transmit")).toBe(false);
  for (const [round, cells] of [
    [4, ["D5", "E5", "F5", "G4"]],
    [7, ["C7", "Q6"]],
    [10, ["N5", "O5", "P5", "Q4"]],
  ] as const) {
    const prior = waitToRound(state, round - 1);
    const existing = new Set(enemies(prior).map(u => u.id));
    state = waitToRound(prior, round);
    expect(enemies(state).filter(u => !existing.has(u.id)).map(u => robotPositionToCell(u.position!)).sort()).toEqual(cells);
    validateRobotM30PhaseOne(robotBattleJson(state), departure);
  }
  const deployed = enemies(state);
  expect(new Set(deployed.map(u => u.id)).size).toBe(20);
  expect(deployed.map(u => u.kind).sort()).toEqual([
    "boss", ...Array(3).fill("heavy"), ...Array(12).fill("light"), ...Array(4).fill("medium"),
  ]);
  expect(deployed.filter(u => u.kind === "light").every(u => u.energy.maxEn === 0)).toBe(true);
  if (difficulty === "hardest" || difficulty === "inferno") {
    const level = difficulty === "hardest" ? 13 : 18;
    expect(deployed.filter(u => u.kind !== "boss").every(u =>
      u.parts.length > 0 && u.parts.every(p => p.level === level))).toBe(true);
  }
});

it("defers an occupied squad, preserves its preferred cells, and does not clear while reinforcements are pending", () => {
  let state = decodeRobotBattleCore(createRobotM30PhaseOne(departureFor("hardest")));
  const core = state.units.find(u => u.kind === "controlled")!;
  state = { ...state, units: state.units.map(u => u.id === core.id ? { ...u, position: robotCellToPosition("D5") } : u) };
  const defeated = state.units.map(u => robotBattleIsAlly(u) ? u : { ...u, hp: 0 });
  state = settleRobotBattleConsequences(state, defeated);
  expect(getRobotBattleResult(state).result).toBe("ongoing");
  state = waitToRound(state, 4);
  expect(enemies(state)).toHaveLength(11);
  state = { ...state, units: state.units.map(u => u.id === core.id ? { ...u, position: core.position } : u) };
  state = waitToRound(state, 5);
  expect(enemies(state).filter(u => u.squadId === "r6-west-assault-squad").map(u => robotPositionToCell(u.position!))).toEqual(["D5", "E5", "F5"]);
});

it("settles all 20 defeats, rejects altered receipts, and applies the R16 deadline", () => {
  const departure = departureFor("hard");
  const state = waitToRound(decodeRobotBattleCore(createRobotM30PhaseOne(departure)), 10);
  const completed = settleRobotBattleConsequences(state, state.units.map(u => robotBattleIsAlly(u) ? u : { ...u, hp: 0 }));
  const result = { ...completed, turn: { ...completed.turn, actorId: null }, units: completed.units.map(u => ({ ...u, energy: { ...u.energy, turnOpen: false } })) };
  expect(getRobotBattleResult(result)).toEqual({ result: "won", reason: "enemies-eliminated" });
  validateRobotM30PhaseOne(robotBattleJson(result), departure);
  robotFormalRuntime.validate(robotBattleJson(result), departure);
  expect(getRobotSubobjectiveAchieved(result)).toBe(false);
  const objective = result.objective;
  if (objective.kind !== "m30-elimination") throw new Error("M30 objective expected");
  expect(() => validateRobotM30PhaseOne(robotBattleJson({
    ...result, objective: { ...objective, state: { ...objective.state, spawnedWaveIds: [] } },
  }), departure)).toThrow(/roster/);

  const timedOut = waitToRound(state, 17);
  expect(timedOut.allied.round).toBe(16);
  expect(getRobotBattleResult(timedOut)).toEqual({ result: "lost", reason: "round-limit" });
  validateRobotM30PhaseOne(robotBattleJson(timedOut), departure);
});

it("loads and resumes a legacy M30 checkpoint, then uses elimination when retried", async () => {
  const progress = offlineExpansionFixtureProgress();
  const departure = { ...departureFor("hard"), party: progress.party };
  const snapshot = robotBattleJson(scheduleRobotFormalBattle(createRobotFormalBattleState(departure)));
  const legacy = { ...createRobotOfflineSave(), progress, battle: {
    departure, runtimeId: robotFormalRuntime.id, runtimeVersion: robotFormalRuntime.version, snapshot,
    committedActionIds: [], sequence: 0, latestSummary: "戦闘開始",
  } };
  let raw = JSON.stringify(legacy);
  const storage = { async read() { return raw; }, async replace(expected: string | null, next: string) {
    if (raw !== expected) throw new Error("Stale save");
    raw = next;
  } };
  const session = new RobotOfflineSession(storage, robotFormalRuntime, () => "m30-retry");
  await session.load();
  expect(session.state).toEqual(legacy);
  const state = decodeRobotBattleCore(snapshot);
  expect(getRobotBattleFacilities(state)).toHaveLength(1);
  const actor = getRobotBattleUnit(state, getRobotBattleActor(state).unitIds[0]!);
  await session.act({ battleId: departure.battleId, expectedSequence: 0, actionId: "legacy-turn",
    action: { kind: actor.kind === "controlled" ? "defend" : "npc" },
  });
  const resumed = new RobotOfflineSession(storage, robotFormalRuntime, () => "m30-retry");
  await resumed.load();
  expect(resumed.state).toEqual(session.state);
  expect(decodeRobotBattleCore(resumed.state.battle!.snapshot).objective.kind).toBe("m30");
  await resumed.retry(true);
  expect(resumed.state.progress).toEqual(progress);
  expect(resumed.state.battle!.departure.party).toEqual(departure.party);
  expect(decodeRobotBattleCore(resumed.state.battle!.snapshot).objective.kind).toBe("m30-elimination");
});

it("loses at the R16 deadline when a squad never spawns and keeps the R16 survivor side objective", () => {
  const departure = departureFor("normal");
  let state = decodeRobotBattleCore(robotFormalRuntime.create(departure));
  expect(getRobotM30EliminationPlan(departure.key).board.walls).toEqual(["G11", "M11", "H9", "L9", "F8", "N8", "K7", "H5", "L5"]);
  const core = state.units.find(u => u.kind === "controlled")!;
  state = { ...state, units: state.units.map(u => u.id === core.id ? { ...u, position: robotCellToPosition("D5") } : u) };
  const blocked = waitToRound(state, 16);
  expect(enemies(blocked)).toHaveLength(17);
  const defeated = settleRobotBattleConsequences(blocked, blocked.units.map(u => robotBattleIsAlly(u) ? u : { ...u, hp: 0 }));
  expect(getRobotBattleResult(defeated).result).toBe("ongoing");
  const expired = waitToRound(defeated, 17);
  expect(getRobotBattleResult(expired)).toEqual({ result: "lost", reason: "round-limit" });
  robotFormalRuntime.validate(robotBattleJson(expired), departure);

  const unblocked = waitToRound(decodeRobotBattleCore(robotFormalRuntime.create(departure)), 16);
  const won = settleRobotBattleConsequences(unblocked, unblocked.units.map(u => robotBattleIsAlly(u) ? u : { ...u, hp: 0 }));
  expect(getRobotBattleResult(won).result).toBe("won");
  expect(getRobotSubobjectiveAchieved(won)).toBe(true);
});
it.each(["hard", "hardest", "inferno"] as const)("executes real %s turns and validates their checkpoints through combat", difficulty => {
  const departure = departureFor(difficulty);
  let snapshot = robotFormalRuntime.create(departure);
  let attacked = false;
  for (let step = 0; step < 50; step++) {
    const state = decodeRobotBattleCore(snapshot);
    const actor = getRobotBattleUnit(state, getRobotBattleActor(state).unitIds[0]!);
    const resolution = robotFormalRuntime.act(snapshot, { kind: actor.kind === "controlled" ? "defend" : "npc" }, departure);
    snapshot = resolution.snapshot;
    robotFormalRuntime.validate(snapshot, departure);
    attacked ||= !!decodeRobotBattleCore(snapshot).latest?.damage.length;
    if (resolution.outcome) break;
  }
  expect(attacked).toBe(true);
});

it("settles a same-round controlled wipe even when all enemies were defeated", () => {
  const departure = departureFor("inferno");
  const state = waitToRound(decodeRobotBattleCore(createRobotM30PhaseOne(departure)), 10);
  const batch = state.units.map(u => u.kind === "friendly-ai" ? u : { ...u, hp: 0 });
  const completed = settleRobotBattleConsequences(state, batch);
  const result = { ...completed, turn: { ...completed.turn, actorId: null }, units: completed.units.map(u => ({ ...u, energy: { ...u.energy, turnOpen: false } })) };
  expect(getRobotBattleResult(result)).toEqual({ result: "lost", reason: "same-round-controlled-wipe" });
  validateRobotM30PhaseOne(robotBattleJson(result), departure);
});
