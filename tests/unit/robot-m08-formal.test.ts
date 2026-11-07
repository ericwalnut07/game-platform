import { expect, it } from "vitest";
import { earlyFormalAction, earlyFormalProgress } from "../robot-tactics/earlyFormalController";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";
import { decodeRobotBattleCore, getRobotBattleResult } from "../../src/games/robot-tactics/battleState";
import { reconcileRobotEarlyMission } from "../../src/games/robot-tactics/earlyMissions";
import { evaluateRobotSubobjective } from "../../src/games/robot-tactics/subobjectives";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { applyRobotOfflineOutcome } from "../../src/games/robot-tactics/offlineProgress";

class Storage implements RobotOfflineStorage {
  raw: string | null = null;
  fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) {
    if (this.fail) throw new Error("disk-full");
    if (this.raw !== expected) throw new Error("stale");
    this.raw = next;
  }
}

for (const difficulty of ["easy", "normal", "hard"] as const) {
  it(`M08 ${difficulty}: real roster, R4 wave, seven-round facility defense, save and earned rewards`, async () => {
    const key = { missionNumber: 8, difficulty }, stage = getRobotStagePlan(key);
    expect(stage.blockingIssues).toEqual([]);
    const progress = earlyFormalProgress(key), storage = new Storage();
    storage.raw = JSON.stringify({ ...createRobotOfflineSave(), progress });
    const session = new RobotOfflineSession(storage, robotFormalRuntime, () => "m08-" + difficulty);
    await session.load();
    await session.start(key);
    let restoredOnce = false, waveSeen = false;
    for (let n = 0; session.state.battle && n < 300; n++) {
      const battle = session.state.battle, s = decodeRobotBattleCore(battle.snapshot);
      if (s.objective.kind !== "early") throw new Error("M08 objective missing");
      const facility = s.objective.state.objects.objects[0]!;
      expect(facility.id).toBe("facility");
      expect(facility.maxHp).toBe(difficulty === "easy" ? 260 : difficulty === "normal" ? 350 : 460);
      expect(facility.hp).toBeGreaterThan(0);
      waveSeen ||= s.objective.state.spawnedWaveIds.includes("round4-ranged");
      expect(() => robotFormalBattleAdapter.project(battle)).not.toThrow();
      if (!restoredOnce && battle.sequence >= 3) {
        const restored = new RobotOfflineSession(storage, robotFormalRuntime, () => "unused");
        await restored.load();
        expect(restored.state).toEqual(session.state);
        restoredOnce = true;
      }
      const action = earlyFormalAction(s);
      const expected = robotFormalRuntime.act(battle.snapshot, action, battle.departure);
      await session.act({ battleId: battle.departure.battleId, expectedSequence: battle.sequence, actionId: "m08-step-" + n, action });
      if (expected.outcome) expect(session.state.result?.subobjectiveAchieved).toBe(expected.outcome.subobjectiveAchieved);
    }
    expect(restoredOnce).toBe(true);
    expect(waveSeen).toBe(true);
    expect(session.state.battle).toBeNull();
    expect(session.state.result).toMatchObject({ result: "won", endedRound: 7 });
    const earned = applyRobotOfflineOutcome(progress, key, session.state.result!);
    expect(session.state.progress).toEqual(earned.progress);
    expect(session.state.result?.expGained).toBe(earned.expGained);
    const restored = new RobotOfflineSession(storage, robotFormalRuntime, () => "unused");
    await restored.load();
    expect(restored.state).toEqual(session.state);
  }, 30000);
}

it("M08 facility destruction is immediate; Normal/Hard 50% bonus boundary is inclusive", () => {
  const key = { missionNumber: 8, difficulty: "normal" as const };
  const departure = { battleId: "m08-failure", key, party: earlyFormalProgress(key).party };
  const core = createRobotFormalBattleState(departure);
  if (core.objective.kind !== "early") throw new Error("M08 objective missing");
  const facility = core.objective.state.objects.objects[0]!;
  const enemy = core.units.find(unit => unit.kind === "light")!;
  const hit = { attackId: "lethal-facility", sourceId: enemy.id, hitCells: facility.cells, damage: facility.hp };
  const defeated = reconcileRobotEarlyMission({ ...core, attackIds: [hit.attackId] }, [hit]);
  expect(getRobotBattleResult(defeated)).toMatchObject({ result: "lost", reason: "facility-destroyed" });
  expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(defeated)))).toEqual(defeated);
  expect(evaluateRobotSubobjective(key, { result: "won", round: 7, facility: { hp: 175, maxHp: 350 } })).toBe(true);
  expect(evaluateRobotSubobjective(key, { result: "won", round: 7, facility: { hp: 174, maxHp: 350 } })).toBe(false);
  expect(evaluateRobotSubobjective({ missionNumber: 8, difficulty: "hard" }, { result: "won", round: 7, facility: { hp: 230, maxHp: 460 } })).toBe(true);
  expect(evaluateRobotSubobjective(key, { result: "lost", round: 7, facility: { hp: 350, maxHp: 350 } })).toBe(false);
});

it("M08 failed save, repeated action and retry remain atomic and preserve departure equipment", async () => {
  const key = { missionNumber: 8, difficulty: "easy" as const }, storage = new Storage();
  const progress = earlyFormalProgress(key);
  storage.raw = JSON.stringify({ ...createRobotOfflineSave(), progress });
  let id = 0;
  const session = new RobotOfflineSession(storage, robotFormalRuntime, () => "m08-atomic-" + (++id));
  await session.load();
  await session.start(key);
  const before = session.state, battle = before.battle!;
  const action = earlyFormalAction(decodeRobotBattleCore(battle.snapshot));
  const input = { battleId: battle.departure.battleId, expectedSequence: battle.sequence, actionId: "atomic", action };
  storage.fail = true;
  await expect(session.act(input)).rejects.toThrow("disk-full");
  expect(session.state).toEqual(before);
  storage.fail = false;
  await session.act(input);
  const after = session.state;
  await session.act(input);
  expect(session.state).toEqual(after);
  await session.retry(true);
  expect(session.state.progress).toEqual(progress);
  expect(session.state.battle!.departure.party).toEqual(before.battle!.departure.party);
  expect(session.state.battle!.departure.battleId).not.toBe(battle.departure.battleId);
});
