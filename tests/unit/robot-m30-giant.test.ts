import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { expect, it } from "vitest";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleActor, getRobotBattleLegalMoves, getRobotBattleResult,
  getRobotBattleStructures, getRobotBattleUnit, moveRobotBattleUnit, robotBattleIsAlly, robotBattleTurnId,
  type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { settleRobotBattleConsequences } from "../../src/games/robot-tactics/battleSettlement";
import { createRobotM30PhaseOne, robotBattleJson, robotFormalRuntime, scheduleRobotFormalBattle, validateRobotM30Battle } from "../../src/games/robot-tactics/formalRuntime";
import { ROBOT_M30_GIANT_ID, ROBOT_M30_GIANT_SECOND_ACTOR, getRobotM30GiantCells, isRobotM30GiantAnchor } from "../../src/games/robot-tactics/m30Giant";
import { robotCellToPosition, robotPositionToCell } from "../../src/games/robot-tactics/movement";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineDeparture, type RobotJson } from "../../src/games/robot-tactics/offlineSession";
import { offlineExpansionFixtureProgress } from "../robot-tactics/offlineExpansionFixture";

const departureFor = (expansionDifficulty?: "hardest" | "inferno"): RobotOfflineDeparture => ({
  battleId: "m30-giant-test", key: { missionNumber: 30, difficulty: "hard" }, party: createRobotOfflineSave().progress.party,
  ...(expansionDifficulty ? { expansionDifficulty } : {}),
});
function wait(s: RobotBattleCoreState) {
  return scheduleRobotFormalBattle(commitRobotBattlePassive(s, { kind: "wait", actionId: "wait:" + s.turn.serial, turnId: robotBattleTurnId(s) }));
}

function finalEnemy(departure: RobotOfflineDeparture) {
  let s = decodeRobotBattleCore(createRobotM30PhaseOne(departure));
  while (s.allied.round < 10 || getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!).kind !== "controlled") s = wait(s);
  const attacker = getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!);
  const survivor = s.units.find(u => u.kind === "light")!;
  const casualty = s.units.find(u => u.kind === "friendly-ai")!;
  const enemiesDefeated = s.units.map(u => {
    if (u.id === survivor.id) return { ...u, hp: 1, position: { x: attacker.position!.x, y: attacker.position!.y - 1 } };
    if (u.id === casualty.id || !robotBattleIsAlly(u)) return { ...u, hp: 0 };
    return { ...u, hp: u.maxHp - 10, energy: { ...u.energy, en: Math.min(u.energy.en, 20) } };
  });
  s = decodeRobotBattleCore(settleRobotBattleConsequences(s, enemiesDefeated));
  const move = { kind: "normal", weaponId: attacker.parts.find(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")!.partId, targetId: survivor.id };
  return { s, move };
}

function land(departure: RobotOfflineDeparture) {
  const { s, move } = finalEnemy(departure);
  const resolution = robotFormalRuntime.act(robotBattleJson(s), move, departure);
  return { phase1: s, resolution, giantPhase: decodeRobotBattleCore(resolution.snapshot) };
}

it.each([["hardest", 5000, 65, 110, 55], ["inferno", 7000, 70, 130, 65]] as const)(
  "transitions from a real final hit to %s R1 and resets all five allies", (difficulty, hp, def, spd, secondSpd) => {
    const departure = departureFor(difficulty);
    const { phase1, resolution, giantPhase } = land(departure);
    const g = getRobotBattleUnit(giantPhase, ROBOT_M30_GIANT_ID);
    expect(resolution.outcome).toBeNull();
    expect(phase1.allied.waiting).toHaveLength(1);
    expect(giantPhase.allied).toMatchObject({ round: 1, waiting: [], lastDefeatEvent: 0 });
    expect(giantPhase.board.walls.map(robotPositionToCell)).toEqual(["F8", "N8"]);
    expect(giantPhase.units.filter(robotBattleIsAlly).map(u => robotPositionToCell(u.position!))).toEqual(["G16", "J16", "M16", "I15", "K15"]);
    for (const u of giantPhase.units.filter(robotBattleIsAlly)) {
      expect(u.hp).toBe(u.maxHp);
      expect(u.energy.en).toBe(u.energy.maxEn);
      expect(u.statuses).toEqual([]);
      expect(u.parts).toEqual(getRobotBattleUnit(phase1, u.id).parts);
    }
    expect(g).toMatchObject({ hp, maxHp: hp, stats: { def, spd, mov: 2 } });
    expect(getRobotM30GiantCells(g.position!).map(robotPositionToCell)).toEqual(["J7", "K7", "J8", "K8"]);
    expect(getRobotBattleStructures(giantPhase).map(robotPositionToCell)).toEqual(["K7", "J8", "K8"]);
    expect(giantPhase.initiative!.entries.filter(e => e.actorId.startsWith(ROBOT_M30_GIANT_ID)).map(e => e.spd)).toEqual([spd, secondSpd]);
    expect(giantPhase.latest?.damage).toEqual([]);
    expect(giantPhase.latest?.summary).toContain("着地");
    validateRobotM30Battle(resolution.snapshot, departure);
    const view = robotFormalBattleAdapter.project({ departure, runtimeId: robotFormalRuntime.id, runtimeVersion: 1, snapshot: resolution.snapshot, committedActionIds: [], sequence: 0, latestSummary: "" });
    expect(view.hideRoundLimit).toBe(true);
    expect(view.objectiveMarkers).toHaveLength(4);
    expect(view.visualCues.filter(cue => cue.effect === "destroy_large")).toHaveLength(7);
    expect(view.objectiveText).toBe("M30 第2段階：巨大ボスを撃破");
  });

it("keeps Hard on the completed first phase without a giant", () => {
  const { resolution, giantPhase } = land(departureFor());
  expect(giantPhase.objective.kind).toBe("m30-elimination");
  expect(resolution.outcome).toMatchObject({ result: "won", endedRound: 10 });
});

it("resolves both initiative slots independently, with the same footprint and HP on resume", () => {
  const departure = departureFor("hardest");
  let state = land(departure).giantPhase;
  while (state.turn.actorId !== ROBOT_M30_GIANT_ID) state = wait(state);
  const moves = getRobotBattleLegalMoves(state, ROBOT_M30_GIANT_ID);
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.every(m => m.path.length <= 2 && m.path.every(p => isRobotM30GiantAnchor(p)))).toBe(true);
  const destination = moves[0]!.destination;
  state = moveRobotBattleUnit(state, { actionId: "giant-move", turnId: robotBattleTurnId(state), unitId: ROBOT_M30_GIANT_ID, destination });
  validateRobotM30Battle(robotBattleJson(state), departure);
  while (state.turn.actorId !== ROBOT_M30_GIANT_SECOND_ACTOR) state = wait(state);
  expect(getRobotBattleUnit(state, ROBOT_M30_GIANT_ID)).toMatchObject({ position: destination, energy: { ownTurn: 2, moved: false } });
  validateRobotM30Battle(robotBattleJson(state), departure);
  expect(() => validateRobotM30Battle(robotBattleJson({ ...state,
    units: state.units.map(u => u.id === ROBOT_M30_GIANT_ID ? { ...u, position: robotCellToPosition("F7") } : u),
  }), departure)).toThrow(/checkpoint|blocked/);
});

it("keeps the giant phase checkpoint and awards no clear on landing", async () => {
  const progress = offlineExpansionFixtureProgress();
  const initial = { ...createRobotOfflineSave(), progress };
  let raw: string | null = JSON.stringify(initial);
  const storage = { async read() { return raw; }, async replace(expected: string | null, next: string) {
    if (raw !== expected) throw new Error("stale save");
    raw = next;
  } };
  const runtime = { ...robotFormalRuntime, readiness: () => [], validate: validateRobotM30Battle,
    create: (departure: RobotOfflineDeparture) => robotBattleJson(finalEnemy(departure).s) };
  const session = new RobotOfflineSession(storage, runtime, () => "save-giant");
  await session.load();
  await session.start({ missionNumber: 30, difficulty: "hard" }, "hardest");
  const battle = session.state.battle!;
  const command = { battleId: battle.departure.battleId, expectedSequence: battle.sequence, actionId: "last-hit", action: finalEnemy(battle.departure).move as RobotJson };
  await session.act(command);
  expect(session.state.result).toBeNull();
  expect(session.state.progress).toEqual(progress);
  const reloaded = new RobotOfflineSession(storage, runtime, () => "unused");
  await reloaded.load();
  expect(reloaded.state).toEqual(session.state);
  expect(decodeRobotBattleCore(reloaded.state.battle!.snapshot).objective.kind).toBe("m30-giant");
  await reloaded.act(command);
  expect(reloaded.state.battle!.sequence).toBe(1);

  // Use the real completion action and session after preparing an R1 snapshot
  // with the boss at 1 HP, so this test does not depend on unfinished boss AI.
  let ready = decodeRobotBattleCore(reloaded.state.battle!.snapshot);
  while (getRobotBattleUnit(ready, getRobotBattleActor(ready).unitIds[0]!).kind !== "controlled") ready = wait(ready);
  const attacker = getRobotBattleUnit(ready, getRobotBattleActor(ready).unitIds[0]!);
  const weaponId = attacker.parts.find(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")!.partId;
  ready = { ...ready, units: ready.units.map(u => u.id === ROBOT_M30_GIANT_ID ? { ...u, hp: 1 } :
    u.id === attacker.id ? { ...u, position: robotCellToPosition("I7") } : u) };
  const prepared = reloaded.state;
  raw = JSON.stringify({ ...prepared, battle: { ...prepared.battle, snapshot: robotBattleJson(ready) } });
  const completing = new RobotOfflineSession(storage, runtime, () => "unused");
  await completing.load();
  const finish = { ...command, expectedSequence: 1, actionId: "giant-finish",
    action: { kind: "normal", weaponId, targetId: ROBOT_M30_GIANT_ID } };
  await completing.act(finish);
  expect(completing.state.result).toMatchObject({ result: "won", equipmentUnlocked: ["full-core-release-unit"] });
  expect(completing.state.progress.expansionCleared).toEqual(["hardest-30"]);
  await completing.act(finish);
  expect(completing.state.progress.expansionCleared).toEqual(["hardest-30"]);
});

it("allows a kill on R12 and otherwise ends at R13 before opening a turn", () => {
  const departure = departureFor("inferno");
  let state = land(departure).giantPhase;
  while (state.allied.round < 12) state = wait(state);
  const defeated = settleRobotBattleConsequences(state, state.units.map(u => u.id === ROBOT_M30_GIANT_ID ? { ...u, hp: 0 } : u));
  expect(getRobotBattleResult(defeated)).toEqual({ result: "won", reason: "giant-defeated" });
  while (getRobotBattleResult(state).result === "ongoing") state = wait(state);
  expect(state.allied.round).toBe(13);
  expect(state.turn.actorId).toBeNull();
  expect(getRobotBattleResult(state)).toEqual({ result: "lost", reason: "final-annihilation-cannon" });
  expect(state.latest?.summary).toContain("最終殲滅砲");
  validateRobotM30Battle(robotBattleJson(state), departure);
});
