import { expect, it } from "vitest";
import { RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { createRobotFormalM01State, createRobotStageEnemyUnits, getRobotEnemyMovement } from "../../src/games/robot-tactics/stageDeployment";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotStagePlan, listRobotStageKeys } from "../../src/games/robot-tactics/stageCatalog";
import { beginRobotBattleTurn, commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { planRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { commitRobotEnergyAction, createRobotEnergyState, endRobotEnergyTurn, getRobotEnergyRecoveryAmounts, recordRobotEnergyCombatEvent, recordRobotEnergyMove, beginRobotEnergyTurn } from "../../src/games/robot-tactics/energy";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import { commitRobotBattleNormalAttack } from "../../src/games/robot-tactics/battleWeaponActions";

const departure = () => ({ battleId: "safety", key: { missionNumber: 1, difficulty: "easy" as const }, party: createRobotOfflineProgress().party });
class Storage implements RobotOfflineStorage {
  raw: string | null = null; fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail || expected !== this.raw) throw new Error("Storage rejected"); this.raw = next; }
}
it("EN-less resources neither recover nor consume energy, and cannot charge or use extra movement", () => {
  let e = beginRobotEnergyTurn(createRobotEnergyState(0));
  expect(getRobotEnergyRecoveryAmounts(0)).toEqual({ actionEnd: 0, normalHit: 0, charge: 0 });
  e = recordRobotEnergyMove(e, "ordinary"); expect(e).toMatchObject({ en: 0, moved: true });
  expect(() => commitRobotEnergyAction(e, { kind: "charge", energyCost: 0 })).toThrow();
  expect(() => commitRobotEnergyAction(e, { kind: "extra-move", energyCost: 0 })).toThrow();
  e = commitRobotEnergyAction(e, { kind: "normal-attack", energyCost: 0 });
  for (const event of ["normal-hit", "damaged", "kill"] as const) expect(recordRobotEnergyCombatEvent(e, event)).toBe(e);
  expect(endRobotEnergyTurn(e)).toMatchObject({ en: 0, maxEn: 0, turnOpen: false, normalHitRecovered: false, killRecovered: false, damagedRecovered: false });
});
it("EMP still damages an EN-less lightweight target without creating drain/recovery events", () => {
  const base = createRobotFormalM01State(departure()), { initiative: _initiative, ...component } = base;
  const targetId = "frontline-1:1";
  const s = beginRobotBattleTurn(decodeRobotBattleCore({ ...component, units: component.units.map(u => u.id === targetId ? { ...u, position: robotCellToPosition("F8") } : u.id === "core-a" ? { ...u, parts: u.parts.map(p => p.partId === "light-pistol" ? { partId: "emp-carbine", level: 1 } : p) } : u) }), "core-a");
  const next = commitRobotBattleNormalAttack(s, { actionId: "emp", turnId: robotBattleTurnId(s), weaponId: "emp-carbine", targetId });
  expect(getRobotBattleUnit(next, targetId).hp).toBeLessThan(getRobotBattleUnit(s, targetId).hp);
  expect(getRobotBattleUnit(next, targetId).energy).toMatchObject({ en: 0, maxEn: 0, damagedRecovered: false });
  expect(next.latest!.summary).not.toContain("EN0減少");
});
it("binds all three M01 difficulty rosters and preserves the fixed six boss movement types", () => {
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    const d = { ...departure(), key: { missionNumber: 1, difficulty } }, s = createRobotFormalM01State(d);
    robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)), d);
    expect(s.units.filter(u => u.kind === "light").every(u => u.energy.maxEn === 0)).toBe(true);
  }
  for (const [missionNumber, type] of [[2,"omni"],[9,"forward"],[16,"omni"],[22,"diagonal"],[27,"straight"],[30,"straight"]] as const) {
    const stage = getRobotStagePlan({ missionNumber, difficulty: "easy" }), boss = stage.initialEnemies.find(u => u.kind === "boss")!;
    expect(getRobotEnemyMovement(stage, boss, 3, robotCellToPosition(boss.cells[0]!)).types).toEqual([type]);
    if (missionNumber === 9) expect(createRobotStageEnemyUnits(stage, boss)[0]!.movement!.facing).toBe("north");
  }
  for (const key of listRobotStageKeys().filter(k => ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(k.missionNumber))) expect(robotFormalRuntime.readiness(key).length).toBeGreaterThan(0);
});
it("uses one algorithm for all five friendly instructions and keeps movement/legal state private during planning", () => {
  const base = createRobotFormalM01State(departure()), { initiative: _initiative, ...component } = base;
  const instructions = [{ tacticId: "free-action" }, { tacticId: "focus-attack", targetUnitId: "frontline-1:1" }, { tacticId: "escort-specific-ally", targetUnitId: "core-a" }, { tacticId: "defend-location", cell: robotCellToPosition("E9") }, { tacticId: "advance-to-location", cell: robotCellToPosition("C5") }] as const;
  for (const instruction of instructions) {
    const s = beginRobotBattleTurn(decodeRobotBattleCore({ ...component, ai: { ...base.ai, instructions: { ...base.ai.instructions, "friendly-1": instruction } } }), "friendly-1"), before = JSON.stringify(s);
    const auto = planRobotNpcTurn(s), manual = planRobotNpcTurn({ ...s, ai: { ...s.ai, mode: "manual" } });
    expect(auto.choices).toEqual(manual.choices); expect(auto.movedIds).toEqual(manual.movedIds);
    expect(JSON.stringify(s)).toBe(before);
  }
});
it("does not expose or partially save a real NPC turn on failure, and resumes/retries the same production battle", async () => {
  const storage = new Storage(); let id = 0;
  const session = new RobotOfflineSession(storage, robotFormalRuntime, () => "battle:" + (++id));
  await session.load(); await session.start({ missionNumber: 1, difficulty: "easy" });
  const before = session.state, raw = storage.raw, b = before.battle!;
  expect(getRobotBattleUnit(decodeRobotBattleCore(b.snapshot), getRobotBattleActor(decodeRobotBattleCore(b.snapshot)).unitIds[0]!).kind).toBe("light");
  storage.fail = true;
  await expect(session.act({ battleId: b.departure.battleId, expectedSequence: b.sequence, actionId: "npc:1", action: { kind: "npc" } })).rejects.toThrow("Storage rejected");
  expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
  storage.fail = false;
  await session.act({ battleId: b.departure.battleId, expectedSequence: b.sequence, actionId: "npc:1", action: { kind: "npc" } });
  const committed = session.state;
  await session.act({ battleId: b.departure.battleId, expectedSequence: b.sequence, actionId: "npc:1", action: { kind: "npc" } }); expect(session.state).toEqual(committed);
  const restored = new RobotOfflineSession(storage, robotFormalRuntime, () => "unused"); expect(await restored.load()).toEqual(committed);
  await session.retry(true); expect(session.state.battle!.sequence).toBe(0); expect(session.state.battle!.departure.battleId).not.toBe(b.departure.battleId);
  const view = robotFormalBattleAdapter.project(session.state.battle!); expect(view.units.filter(u => u.hasEnergyResource === false)).toHaveLength(6);
});
it("rejects changed departure equipment, fake energy, corrupt queue and player actions on an NPC turn", () => {
  const d = departure(), snapshot = robotFormalRuntime.create(d), s = decodeRobotBattleCore(snapshot);
  for (const changed of [
    { ...s, units: s.units.map(u => u.kind === "light" ? { ...u, energy: { ...u.energy, maxEn: 100, en: 30 } } : u) },
    { ...s, units: s.units.map(u => u.id === "core-a" ? { ...u, maxHp: u.maxHp + 1 } : u) },
    { ...s, initiative: { ...s.initiative!, entries: [...s.initiative!.entries].reverse() } }
  ]) expect(() => robotFormalRuntime.validate(JSON.parse(JSON.stringify(changed)), d)).toThrow();
  expect(() => robotFormalRuntime.act(snapshot, { kind: "wait" }, d)).toThrow("NPC action");
  expect(() => beginRobotBattleTurn(s, "core-a")).toThrow();
});
it("keeps the snapshot stable across a completed actor and preserves effect expiration separately", () => {
  const initial = createRobotFormalM01State(departure()), nextId = initial.initiative!.entries[0]!.actorId;
  const opened = beginRobotBattleTurn(initial, nextId), done = commitRobotBattlePassive(opened, { actionId: "wait", turnId: robotBattleTurnId(opened), kind: "wait" });
  expect(done.initiative).toEqual(initial.initiative); expect(done.turn.actedActorIds).toEqual([nextId]);
});
