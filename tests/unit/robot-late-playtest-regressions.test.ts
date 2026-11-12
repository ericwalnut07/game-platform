import { expect, it } from "vitest";
import { applyRobotPhaseDamage } from "../../src/games/robot-tactics/battleEffects";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { getRobotActiveCombatOptions } from "../../src/games/robot-tactics/activeCombat";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { commitRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { beginRobotBattleTurn, commitRobotBattleData, decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { finishRobotEarlyRound, reconcileRobotEarlyMission, robotEarlyGoalCells, spawnRobotEarlyWave } from "../../src/games/robot-tactics/earlyMissions";
import { commitRobotFormation } from "../../src/games/robot-tactics/formations";
import { robotBattleJson, robotFormalRuntime, scheduleRobotFormalBattle } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotRoundInitiative } from "../../src/games/robot-tactics/initiative";
import { getRobotLegalMoves, robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";
import { applyRobotOfflineOutcome, createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState, createRobotStageEnemyUnits } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotSubobjectiveAchieved } from "../../src/games/robot-tactics/subobjectives";

const departure = (missionNumber: number, difficulty: "easy" | "normal" | "hard" = "normal") => ({
  battleId: "late-regression-" + missionNumber, key: { missionNumber, difficulty }, party: createRobotOfflineProgress().party,
});
function scene(mission: number, difficulty?: "easy" | "normal" | "hard") {
  const { initiative: _initiative, ...s } = createRobotFormalBattleState(departure(mission, difficulty));
  return s;
}
function early(s: RobotBattleCoreState) {
  if (s.objective.kind !== "early") throw new Error("Expected early objective");
  return s.objective.state;
}
const id = (s: RobotBattleCoreState, actionId: string) => ({ actionId, turnId: robotBattleTurnId(s) });

it("M20 skips a diagonal charge if walls block the attack from its landing", () => {
  const base = scene(20);
  const target = base.units.find(u => u.kind === "light")!;
  const walls = (x: number, y: number) => base.board.walls.some(w => w.x === x && w.y === y);
  const empty = (x: number, y: number) => x >= 0 && y >= 0 && x < base.board.width && y < base.board.height &&
    !walls(x, y) && !base.units.some(u => u.position?.x === x && u.position.y === y);
  let setup: { origin: { x: number; y: number }; enemy: { x: number; y: number } } | undefined;
  for (let x = 1; x < base.board.width - 1; x++) for (let y = 1; y < base.board.height - 1; y++) {
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      const origin = { x: x - dx, y: y - dy }, enemy = { x: x + dx, y: y + dy };
      if (empty(x, y) && empty(origin.x, origin.y) && empty(enemy.x, enemy.y) && walls(enemy.x, y) && walls(x, enemy.y) &&
        getRobotLegalMoves({ board: base.board, origin, mov: 1, types: ["omni"], facing: "north", occupied: [], structures: [] }).some(m => m.destination.x === x && m.destination.y === y)) setup = { origin, enemy };
    }
  }
  expect(setup).toBeDefined();
  const s = beginRobotBattleTurn({ ...base, units: base.units.map(u => u.id === "friendly-1" ? { ...u, position: setup!.origin } :
    u.id === target.id ? { ...u, position: setup!.enemy } : u) }, "friendly-1");
  const moved = { ...s, units: s.units.map(u => u.id === "friendly-1" ? { ...u, energy: { ...u.energy, moved: true } } : u) };
  const blade = getRobotBattleUnit(moved, "friendly-1").parts.find(p => p.partId === "light-blade" || p.partId === "standard-sword");
  expect(blade).toBeDefined();
  const open = { ...moved, board: { ...moved.board, walls: [] } };
  expect(getRobotActiveCombatOptions(open, "charge-strike", blade!.partId).targetIds).toContain(target.id);
  expect(getRobotActiveCombatOptions(moved, "charge-strike", blade!.partId).targetIds).not.toContain(target.id);
  expect(() => commitRobotNpcTurn(moved, id(moved, "npc-turn"))).not.toThrow();
});

it.each(["easy", "normal", "hard"] as const)("M20 %s commits real map AI turns over two rounds", difficulty => {
  const d = departure(20, difficulty);
  let snapshot = robotFormalRuntime.create(d), friendlyTurns = 0;
  for (let i = 0; i < 60; i++) {
    const s = decodeRobotBattleCore(snapshot);
    if (s.allied.round > 2) break;
    const actor = getRobotBattleUnit(s, getRobotBattleActor(s).unitIds[0]!);
    const result = robotFormalRuntime.act(snapshot, { kind: actor.kind === "controlled" ? "wait" : "npc" }, d);
    if (actor.kind === "friendly-ai") friendlyTurns++;
    snapshot = result.snapshot;
    if (result.outcome) break;
  }
  expect(friendlyTurns).toBeGreaterThanOrEqual(2);
  robotFormalRuntime.validate(snapshot, d);
});

it.each(["normal", "hard"] as const)("M16 %s records two separate player hits and grants the first bonus once", difficulty => {
  const key = { missionNumber: 16, difficulty };
  const hit = (base: RobotBattleCoreState, sourceId: string, damage: number, actionId: string) => {
    const state = beginRobotBattleTurn(base, sourceId), boss = getRobotBattleUnit(state, "command-walker");
    return commitRobotBattleBatch(state, { ...id(state, actionId), summary: actionId,
      members: [{ unitId: sourceId, action: { kind: "other", energyCost: 0 } }],
      attacks: [{ id: actionId + ":hit", sourceId, effectKind: "sniper", targets: [
        { entityId: boss.id, cells: [boss.position!], resolution: { damageBeforeMinimum: damage, damage, reason: "hit" } },
      ] }] });
  };
  let s = scene(16, difficulty);
  s = hit(s, "core-a", 1, "first");
  s = decodeRobotBattleCore(robotBattleJson(s));
  const bossHp = getRobotBattleUnit(s, "command-walker").hp;
  const one = hit(s, "friendly-1", bossHp, "friend-finishes");
  expect(getRobotSubobjectiveAchieved(one)).toBe(false);
  s = hit(s, "core-b", bossHp, "second");
  expect(getRobotSubobjectiveAchieved(s)).toBe(true);
  let progress = createRobotOfflineProgress();
  for (let missionNumber = 1; missionNumber <= 30; missionNumber++) progress = applyRobotOfflineOutcome(progress, { missionNumber, difficulty: "easy" }, { result: "won", endedRound: 1, subobjectiveAchieved: false }).progress;
  const outcome = { result: "won" as const, endedRound: 1, subobjectiveAchieved: getRobotSubobjectiveAchieved(s) };
  const first = applyRobotOfflineOutcome(progress, key, outcome);
  expect(first.progress.subobjectives).toContain(difficulty + "-16");
  if (difficulty === "normal") expect(first.equipmentUnlocked).toContain("overwatch-amplifier");
  expect(applyRobotOfflineOutcome(first.progress, key, outcome).progress.subobjectives).toEqual(first.progress.subobjectives);
  if (difficulty === "normal") expect(first.expGained).toBe(365 + 180);
});

it.each(["easy", "normal", "hard"] as const)("M22 %s saves a compound win at the end of round 11", difficulty => {
  const d = departure(22, difficulty), base = scene(22, difficulty), m = early(base);
  const facility = m.objects.objects[0]!;
  const s: RobotBattleCoreState = {
    ...base, allied: { ...base.allied, round: 11 },
    units: base.units.map(u => u.kind === "controlled" || u.kind === "friendly-ai" ? { ...u, energy: { ...u.energy, round: 11 } } :
      { ...u, hp: 0, energy: { ...u.energy, round: 11 } }),
    objective: { kind: "early", state: { ...m, objects: { ...m.objects, completedRound: 10 } } },
  };
  const guarded = { ...s, units: s.units.map(u => u.id === "core-c" ? { ...u, position: { x: facility.cells[0]!.x, y: facility.cells[0]!.y + 1 } } : u) };
  let snapshot = robotBattleJson(scheduleRobotFormalBattle({ ...guarded, initiative: createRobotRoundInitiative(guarded) }));
  let result;
  for (let i = 0; i < 5; i++) {
    const state = decodeRobotBattleCore(snapshot);
    const actor = getRobotBattleUnit(state, getRobotBattleActor(state).unitIds[0]!);
    result = robotFormalRuntime.act(snapshot, { kind: actor.kind === "controlled" ? "wait" : "npc" }, d);
    snapshot = result.snapshot;
    if (result.outcome) break;
  }
  if (!result) throw new Error("Expected a completed M22 round");
  expect(result.outcome).toMatchObject({ result: "won", endedRound: 11 });
  if (difficulty !== "easy") expect(result.outcome?.subobjectiveAchieved).toBe(true);
  robotFormalRuntime.validate(result.snapshot, d);
});

it("M18 requires both earlier depot hits, even if a friendly unit destroys the first depot", () => {
  const base = scene(18), [west, east] = early(base).objects.objects;
  const hit = (s: RobotBattleCoreState, object: typeof west, sourceId: string, damage: number, attackId: string) =>
    reconcileRobotEarlyMission(s, [{ attackId, sourceId, damage, hitCells: object!.cells }]);
  const westHit = hit(base, west, "core-a", 1, "west");
  const both = hit(westHit, east, "core-b", 1, "east");
  const finish = (s: RobotBattleCoreState) => hit(hit(s, west, "friendly-1", west!.hp, "kill-west"), east, "core-a", east!.hp, "kill-east");
  expect(getRobotSubobjectiveAchieved(finish(both))).toBe(true);
  expect(getRobotSubobjectiveAchieved(finish(westHit))).toBe(false);
});

it("M21 records an actual Pair by the data carrier before upload", () => {
  let s = scene(21);
  const takeTurn = (state: RobotBattleCoreState, position: string, buddy?: string) =>
    beginRobotBattleTurn({ ...state, turn: { ...state.turn, actorId: null, actedActorIds: [] },
      units: state.units.map(u => u.id === "core-a" ? { ...u, position: cell(position), energy: { ...u.energy, en: u.energy.maxEn } } :
        buddy && u.id === "core-b" ? { ...u, position: cell(buddy) } : u) }, "core-a");
  s = takeTurn(s, "I2", "I3");
  s = commitRobotBattleData(s, { ...id(s, "pickup"), kind: "pickup" });
  s = takeTurn(s, "I2");
  const weaponId = departure(21).party[0]!.basic.weapon1.partId;
  s = commitRobotFormation(s, { ...id(s, "pair"), kind: "pair-defense", weaponId, participantIds: ["core-b"], targetIds: [] });
  s = takeTurn(s, "I12");
  s = commitRobotBattleData(s, { ...id(s, "upload"), kind: "transmit" });
  expect(early(s).result).toBe("won");
  expect(getRobotSubobjectiveAchieved(s)).toBe(true);
});

it("M20 records the round with all bases allied, including a friendly AI unit", () => {
  const s = scene(20), goals = robotEarlyGoalCells(s.key);
  const ids = ["core-a", "friendly-1", "core-b"];
  const placed = { ...s, units: s.units.map(u => ids.includes(u.id) ? { ...u, position: goals[ids.indexOf(u.id)]! } : u) };
  const m = finishRobotEarlyRound(placed);
  expect(m.lateSubobjectiveEvents?.at(-1)).toMatchObject({ kind: "round-end", bases: [
    { allied: true, controlledId: "core-a" }, { allied: true }, { allied: true, controlledId: "core-b" },
  ] });
});

it("M17 uses the heavy's actual surviving HP in the winning state", () => {
  const s = scene(17), m = early(s);
  const won = reconcileRobotEarlyMission({ ...s, objective: { kind: "early", state: { ...m, arrivedIds: ["core-a", "core-b"] } } });
  expect(getRobotSubobjectiveAchieved(won)).toBe(true);
  expect(getRobotSubobjectiveAchieved({ ...won, units: won.units.map(u => u.id === "central-heavy-armor" ? { ...u, hp: 0 } : u) })).toBe(false);
});

it("M15 records a player final blow on the canonical heavy, but not a friendly AI kill", () => {
  const base = scene(15), heavy = getRobotBattleUnit(base, "center-heavy-assault");
  for (const [source, eligible] of [["core-a", true], ["friendly-1", false]] as const) {
    const damaged = applyRobotPhaseDamage(base, source, heavy.id, heavy.hp, "heavy-damage", "sniper").state;
    expect(early(damaged).lateSubobjectiveEvents?.length).toBe(Number(eligible));
    if (eligible) expect(early(damaged).lateSubobjectiveEvents?.[0]).toMatchObject({ sourceId: source, targetId: heavy.id, lethal: true });
  }
});

it("M19 recognizes the actual R6 reinforcement's squad, not an initial deployment kill", () => {
  const s = scene(19), m = early(s), stage = getRobotStagePlan(s.key);
  const [wave] = stage.reinforcements;
  const spawn = spawnRobotEarlyWave(s, 6, s.units.flatMap(u => u.position ? [u.position] : []));
  expect(spawn.state.spawnedWaveIds).toContain("round6-raiders");
  const units = createRobotStageEnemyUnits(stage, wave!.squad, spawn.spawned[0]!.cells);
  const base: RobotBattleCoreState = { ...s, units: [...s.units, ...units], objective: { kind: "early", state: { ...m, spawnedWaveIds: spawn.state.spawnedWaveIds } } };
  const target = units[0]!;
  const hit = applyRobotPhaseDamage(base, "core-a", target.id, target.hp, "r6-kill", "sniper").state;
  expect(early(hit).lateSubobjectiveEvents?.[0]).toMatchObject({ targetId: target.id, waveId: "round6-raiders", lethal: true });
  const initial = base.units.find(u => u.kind === "light")!;
  expect(early(applyRobotPhaseDamage(base, "core-a", initial.id, initial.hp, "initial-kill", "sniper").state).lateSubobjectiveEvents).toEqual([]);
});

it("M23 records a depot hit and a round-end base held by the same controlled unit", () => {
  const s = scene(23), base = robotEarlyGoalCells(s.key)[0]!, depot = early(s).objects.objects[0]!;
  const placed = { ...s, units: s.units.map(u => u.id === "core-a" ? { ...u, position: base } : u) };
  const hit = reconcileRobotEarlyMission(placed, [{ attackId: "depot-hit", sourceId: "core-a", damage: 1, hitCells: depot.cells }]);
  expect(finishRobotEarlyRound(hit).lateSubobjectiveEvents).toMatchObject([
    { kind: "damage", sourceId: "core-a", targetId: depot.id, hpRemoved: 1 },
    { kind: "round-end", bases: [{ allied: true, controlledId: "core-a" }, {}, {}] },
  ]);
});
