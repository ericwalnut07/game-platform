import { expect, it } from "vitest";
import { RobotOfflineSession, type RobotJson, type RobotOfflineRuntime, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { advanceRobotBattleRound, beginRobotBattleTurn, commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattlePendingActors, getRobotBattleResult, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleNormalFacilityAttacks } from "../../src/games/robot-tactics/battleFacilityActions";
import { isRobotMissionUnlocked, robotMissionRow, robotRecord } from "../../src/games/robot-tactics/offlineProgress";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import { coreFixture, fixtureWave } from "../robot-tactics/coreFixture";

const json = (value: unknown): RobotJson => JSON.parse(JSON.stringify(value)) as RobotJson;
class Storage implements RobotOfflineStorage {
  raw: string | null = null;
  fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) {
    if (this.fail) throw new Error("Test storage unavailable");
    if (expected !== this.raw) throw new Error("Stale test storage");
    this.raw = next;
  }
}
/** Test-only fixed scheduling/levels. Tests the real session/core contract,
 * never registers this runtime or its AI/roster in the app entry point.
 */
function runtime(attackScenario = false): RobotOfflineRuntime {
  return {
    id: "test-only-m01-session", version: 1,
    readiness: key => key.missionNumber === 1 && key.difficulty === "easy" ? [] : ["Test M01 only"],
    create: d => {
      let s = coreFixture(1, "easy", d.party, {}, d.battleId);
      if (attackScenario) s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.squadId === "frontline-1" ? { ...u, position: robotCellToPosition(["E8", "F8", "G8"][Number(u.id.split(":")[1])]!), parts: [{ partId: "light-blade", level: 1 }] } : u) });
      return json(beginRobotBattleTurn(s, attackScenario ? "frontline-1" : "p1"));
    },
    validate: (snapshot, d) => {
      const s = decodeRobotBattleCore(snapshot);
      if (s.id !== d.battleId || s.key.missionNumber !== d.key.missionNumber || s.key.difficulty !== d.key.difficulty) throw new Error("Departure mismatch");
    },
    act: (snapshot, action) => {
      let s = decodeRobotBattleCore(snapshot);
      const actor = s.actors.find(a => a.id === s.turn.actorId)!, first = s.units.find(u => u.id === actor.unitIds[0])!;
      const identity = { actionId: s.id + ":" + s.actionIds.length, turnId: robotBattleTurnId(s) };
      s = robotRecord(action).kind === "attack" ? commitRobotBattleNormalFacilityAttacks(s, { ...identity, attacks: actor.unitIds.map(unitId => ({ unitId, weaponId: "light-blade", objectId: "facility", cell: robotCellToPosition("F9") })) }) : commitRobotBattlePassive(s, { ...identity, kind: "wait" });
      if (getRobotBattleResult(s).result === "ongoing") {
        if (!getRobotBattlePendingActors(s).length) s = advanceRobotBattleRound(s, fixtureWave);
        if (getRobotBattleResult(s).result === "ongoing") s = beginRobotBattleTurn(s, getRobotBattlePendingActors(s)[0]!.id);
      }
      const result = getRobotBattleResult(s).result;
      return { snapshot: json(s), actorKind: first.kind === "controlled" || first.kind === "friendly-ai" ? first.kind : "enemy", summary: s.latest!.summary, outcome: result === "ongoing" ? null : { result, endedRound: s.allied.round, subobjectiveAchieved: false } };
    }
  };
}
async function start(storage = new Storage(), attack = false) {
  let id = 0;
  const session = new RobotOfflineSession(storage, runtime(attack), () => "m01:" + (++id));
  await session.load(); await session.start({ missionNumber: 1, difficulty: "easy" });
  return { storage, session };
}
function act(session: RobotOfflineSession, kind = "wait", id?: string) {
  const b = session.state.battle!;
  return session.act({ battleId: b.departure.battleId, expectedSequence: b.sequence, actionId: id ?? "outer:" + b.sequence, action: { kind } });
}
it("keeps M01 real facility HP/EN/action changes private until durable storage succeeds; retries once", async () => {
  const { storage, session } = await start(undefined, true), before = session.state, raw = storage.raw;
  storage.fail = true;
  await expect(act(session, "attack", "attack:1")).rejects.toThrow("storage unavailable");
  expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
  storage.fail = false;
  await act(session, "attack", "attack:1"); const once = session.state;
  await session.act({ battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "attack:1", action: { kind: "attack" } });
  expect(session.state).toEqual(once);
  const restored = new RobotOfflineSession(storage, runtime(true), () => "unused");
  expect(await restored.load()).toEqual(once);
});
it("restarts M01 from departure and retains a reloadable checkpoint", async () => {
  const { storage, session } = await start(), departure = session.state.battle!;
  await act(session); await session.retry(true);
  const fresh = session.state.battle!;
  expect(fresh.departure.battleId).not.toBe(departure.departure.battleId);
  expect(fresh.sequence).toBe(0);
  expect({ ...decodeRobotBattleCore(fresh.snapshot), id: departure.departure.battleId }).toEqual(decodeRobotBattleCore(departure.snapshot));
  const restored = new RobotOfflineSession(storage, runtime(), () => "unused");
  expect(await restored.load()).toEqual(session.state);
});
it("persists complete M01 rounds through R5, settles EXP/unlocks once and resumes the result", async () => {
  const { storage, session } = await start(), initialExp = session.state.progress.exp;
  let last: Parameters<RobotOfflineSession["act"]>[0] | undefined;
  for (let count = 0; session.state.battle && count < 60; count++) {
    const b = session.state.battle!;
    last = { battleId: b.departure.battleId, expectedSequence: b.sequence, actionId: "outer:" + b.sequence, action: { kind: "wait" } };
    await session.act(last);
  }
  expect(session.state.battle).toBeNull();
  expect(session.state.result).toMatchObject({ result: "won", endedRound: 5, expGained: robotMissionRow({ missionNumber: 1, difficulty: "easy" }).firstClear.exp });
  expect(session.state.progress.exp).toBe(initialExp + session.state.result!.expGained);
  expect(isRobotMissionUnlocked(session.state.progress, { missionNumber: 2, difficulty: "easy" })).toBe(true);
  expect(isRobotMissionUnlocked(session.state.progress, { missionNumber: 1, difficulty: "normal" })).toBe(true);
  const settled = session.state;
  await session.act(last!); expect(session.state).toEqual(settled);
  const restored = new RobotOfflineSession(storage, runtime(), () => "unused");
  expect(await restored.load()).toEqual(settled);
});
