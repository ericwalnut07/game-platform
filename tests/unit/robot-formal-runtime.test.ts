import { formalPlayerAction } from "../robot-tactics/formalPlayerController";
import { expect, it } from "vitest";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotFormalM01State } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { createRobotRoundInitiative, getRobotInitiativeQueue } from "../../src/games/robot-tactics/initiative";
import { RobotOfflineSession, type RobotJson, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";

const departure = () => ({ battleId: "formal-test", key: { missionNumber: 1, difficulty: "easy" as const }, party: createRobotOfflineProgress().party });
const json = (v: unknown): RobotJson => JSON.parse(JSON.stringify(v)) as RobotJson;
export class RobotFormalTestStorage implements RobotOfflineStorage {
  raw: string | null = null; fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail || expected !== this.raw) throw new Error("Storage rejected"); this.raw = next; }
}
it("loads the adopted Easy 30-level curve, M21 correction and unchanged Hard entry", () => {
  expect(Array.from({ length: 30 }, (_, i) => getRobotStagePlan({ missionNumber: i + 1, difficulty: "easy" }).referenceEnemyCoreLevel)).toEqual([1,2,2,3,3,4,4,5,5,5,6,7,8,9,10,10,11,11,11,11,12,13,14,15,15,16,17,16,17,17]);
  expect(getRobotStagePlan({ missionNumber: 21, difficulty: "easy" }).enemyWeaponLevel).toBe(3);
  expect(getRobotStagePlan({ missionNumber: 1, difficulty: "hard" }).referenceEnemyCoreLevel).toBe(17);
});
it("creates real M01 units with adopted equipment, enemy movement, no light EN, and a saved initiative", () => {
  const d = departure(), s = createRobotFormalM01State(d);
  expect(s.units).toHaveLength(11);
  expect(s.units.filter(u => u.kind === "light").every(u => u.energy.en === 0 && u.energy.maxEn === 0)).toBe(true);
  expect(getRobotBattleUnit(s, "frontline-1:1").movement).toMatchObject({ types: ["straight"], facing: "south" });
  expect(getRobotBattleUnit(s, "assault-1:1").movement).toMatchObject({ types: ["forward"], facing: "south" });
  expect(s.ai.instructions["friendly-1"]).toMatchObject({ tacticId: "defend-location" });
  expect(getRobotInitiativeQueue(s)).toHaveLength(7);
  robotFormalRuntime.validate(json(s), d);
});
it("snapshots descending SPD, friendly-side ties and floor-average living-squad speed", () => {
  const initial = createRobotFormalM01State(departure());
  const equal = { ...initial, units: initial.units.map(u => ({ ...u, stats: { ...u.stats, spd: 50 } })) };
  const queue = createRobotRoundInitiative(equal);
  expect(queue.entries.map(e => e.actorId)).toEqual(["core-a", "core-b", "core-c", "friendly-1", "friendly-2", "assault-1", "frontline-1"]);
  const modified = { ...equal, units: equal.units.map(u => u.id === "frontline-1:1" ? { ...u, weaponDebuffs: [{ stat: "spd" as const, delta: -8 }] } : u) };
  expect(createRobotRoundInitiative(modified).entries.find(e => e.actorId === "frontline-1")!.spd).toBe(47);
  expect(getRobotInitiativeQueue({ ...modified, initiative: queue })).toEqual(queue.entries.map(e => e.actorId));
});
it("plays the unmodified formal M01 from departure through NPC turns, reinforcements and a saved result", async () => {
  const storage = new RobotFormalTestStorage(), session = new RobotOfflineSession(storage, robotFormalRuntime, () => "formal-play");
  await session.load();
  for (const coreId of ["core-a", "core-b", "core-c"] as const) await session.customize({ expectedRevision: session.state.revision, change: { kind: "part-equip", coreId, slot: "weapon2", partId: "assault-rifle" } });
  await session.start({ missionNumber: 1, difficulty: "easy" });
  const kinds = new Set<string>(); let maximumRound = 1, sawWave = false;
  for (let i = 0; session.state.battle && i < 150; i++) {
    const b = session.state.battle!, s = decodeRobotBattleCore(b.snapshot), actor = getRobotBattleActor(s), unit = getRobotBattleUnit(s, actor.unitIds[0]!);
    kinds.add(unit.kind); maximumRound = Math.max(maximumRound, s.allied.round); sawWave ||= s.actors.some(a => a.id === "rearguard-wave");
    robotFormalBattleAdapter.project(b);
    const action = unit.kind === "controlled" ? formalPlayerAction(s) : { kind: "npc" };
    await session.act({ battleId: b.departure.battleId, expectedSequence: b.sequence, actionId: "input:" + i, action });
  }
  expect(session.state.battle).toBeNull();
  expect(kinds).toEqual(new Set(["controlled", "friendly-ai", "light"]));
  expect(maximumRound).toBe(5); expect(sawWave).toBe(true);
  expect(session.state.result).toMatchObject({ result: "won", endedRound: 5, expGained: 80 });
  const restored = new RobotOfflineSession(storage, robotFormalRuntime, () => "unused");
  expect(await restored.load()).toEqual(session.state);
});
