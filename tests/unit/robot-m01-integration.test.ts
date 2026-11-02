import { describe, expect, it } from "vitest";
import { advanceRobotBattleRound, beginRobotBattleTurn, decodeRobotBattleCore, getRobotBattleFacilities, getRobotBattleLegalMoves, getRobotBattlePendingActors, getRobotBattleResult, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleNormalFacilityAttacks, getRobotBattleNormalFacilityTargets } from "../../src/games/robot-tactics/battleFacilityActions";
import { getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition } from "../../src/games/robot-tactics/movement";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { spawnRobotM01Reinforcements } from "../../src/games/robot-tactics/m01Mission";
import { coreFixture, fixtureCloseRound, fixtureCommit, fixtureDamage, fixtureWave } from "../robot-tactics/coreFixture";

// Explicit component scenarios. These do not choose production encounter Lv,
// enemy movement types, initiative order, AI decisions or joint-kill EN policy.
function attackingSquad() {
  const initial = coreFixture(1, "easy");
  return beginRobotBattleTurn(decodeRobotBattleCore({ ...initial, units: initial.units.map(u => u.squadId === "frontline-1" ? { ...u, position: robotCellToPosition(["E8", "F8", "G8"][Number(u.id.split(":")[1])]!), parts: [{ partId: "light-blade", level: 1 }] } : u) }), "frontline-1");
}
describe("M01 adopted objective connected to battle authority", () => {
  it("reproduces the narrow M01 p1 deployment using actual occupied cells and the formal movement rule", () => {
    const s = coreFixture(1, "easy");
    expect(getRobotBattleUnit(s, "p1").position).toEqual(robotCellToPosition("F10"));
    expect(getRobotBattleLegalMoves(s, "p1").map(m => m.destination)).toEqual([robotCellToPosition("G10")]);
  });
  it.each(["easy", "normal", "hard"] as const)("uses adopted geometry, HP/DEF and R5 in %s", difficulty => {
    const s = coreFixture(1, difficulty), facility = getRobotBattleFacilities(s)[0]!;
    expect(facility).toMatchObject({ id: "facility", hp: 160, maxHp: 160, def: 18, cells: [robotCellToPosition("F9"), robotCellToPosition("G9")] });
    const model = projectRobotBattleCore(s, { battleId: s.id, sequence: 0 });
    expect(model.roundLimit).toBe(5); expect(model.structures[0]!.cells).toEqual(facility.cells);
    expect(getRobotBattleLegalMoves(s, "p1").some(m => facility.cells.some(c => c.x === m.destination.x && c.y === m.destination.y))).toBe(false);
    expect(getRobotStagePlan(s.key).isReadyForFormalPlay).toBe(false);
  });
  it("survives exactly five complete rounds, spawns the canonical R3 wave and survives codec round trips", () => {
    let s = coreFixture(1, "easy");
    for (let round = 1; round <= 5; round++) {
      expect(s.allied.round).toBe(round);
      if (round < 3) expect(s.actors.some(a => a.id === "rearguard-wave")).toBe(false);
      else expect(s.actors.filter(a => a.id === "rearguard-wave")).toHaveLength(1);
      s = fixtureCloseRound(s);
      expect(getRobotBattleResult(s).result).toBe("ongoing");
      s = decodeRobotBattleCore(advanceRobotBattleRound(s, fixtureWave));
      expect(getRobotBattleFacilities(s)[0]!.hp).toBe(160);
    }
    expect(getRobotBattleResult(s)).toEqual({ result: "won", reason: "facility-survived" });
    expect(s.allied.round).toBe(5); expect(getRobotBattlePendingActors(s)).toHaveLength(0);
    expect(() => advanceRobotBattleRound(s, fixtureWave)).toThrow("ended");
  });
  it("does not end a round early or enter a reinforcement round without the real stat factory", () => {
    const s = coreFixture(1, "easy");
    expect(() => advanceRobotBattleRound(s)).toThrow("full round");
    const r2 = advanceRobotBattleRound(fixtureCloseRound(s));
    const closed = fixtureCloseRound(r2), before = JSON.stringify(closed);
    expect(() => advanceRobotBattleRound(closed)).toThrow("resolver required");
    expect(JSON.stringify(closed)).toBe(before);
  });
  it("resolves shared-turn normal weapon damage once per member against one shared facility HP", () => {
    const s = attackingSquad(), actor = s.actors.find(a => a.id === "frontline-1")!;
    const attacks = actor.unitIds.map(unitId => ({ unitId, weaponId: "light-blade", objectId: "facility", cell: robotCellToPosition("F9") }));
    const expected = actor.unitIds.reduce((sum, id) => sum + getRobotWeaponDamageEstimate({ weaponId: "light-blade", weaponLevel: 1, attackStats: getRobotBattleUnit(s, id).stats, targetDef: 18, mode: "normal" }).baseDamage, 0);
    const next = commitRobotBattleNormalFacilityAttacks(s, { actionId: "joint-facility", turnId: robotBattleTurnId(s), attacks });
    expect(getRobotBattleFacilities(next)[0]!.hp).toBe(Math.max(0, 160 - expected));
    expect(next.latest!.damage).toHaveLength(3); expect(next.attackIds).toHaveLength(3);
    expect(next.turn.actorId).toBeNull(); expect(s.turn.actorId).toBe("frontline-1");
    expect(commitRobotBattleNormalFacilityAttacks(next, { actionId: "joint-facility", turnId: "stale", attacks })).toBe(next);
  });
  it("checks each footprint cell independently and rejects friendly, duplicate or out-of-range attacks atomically", () => {
    const s = attackingSquad(), id = "frontline-1:0", before = JSON.stringify(s);
    const options = getRobotBattleNormalFacilityTargets(s, id, "light-blade");
    expect(options).toEqual([{ objectId: "facility", cell: robotCellToPosition("F9") }]);
    const attack = { unitId: id, weaponId: "light-blade", objectId: "facility", cell: robotCellToPosition("G9") };
    const identity = { actionId: "illegal", turnId: robotBattleTurnId(s) };
    expect(() => commitRobotBattleNormalFacilityAttacks(s, { ...identity, attacks: [attack] })).toThrow("Illegal");
    expect(() => commitRobotBattleNormalFacilityAttacks(s, { ...identity, attacks: [attack, attack] })).toThrow("One normal");
    expect(() => getRobotBattleNormalFacilityTargets(beginRobotBattleTurn(coreFixture(1), "p1"), "p1", "standard-sword")).toThrow("enemy member");
    expect(JSON.stringify(s)).toBe(before);
  });
  it("consolidates a two-cell impact once, loses immediately at zero HP, and validates outcome receipts", () => {
    const s = attackingSquad(), cells = getRobotBattleFacilities(s)[0]!.cells;
    const next = fixtureCommit(s, [{ id: "destroy-facility", sourceId: "frontline-1:0", effectKind: "blast", targets: [{ entityId: "facility", cells, resolution: fixtureDamage(160) }] }]);
    expect(getRobotBattleFacilities(next)[0]!.hp).toBe(0);
    expect(getRobotBattleResult(next)).toEqual({ result: "lost", reason: "facility-destroyed" });
    expect(next.latest!.damage).toHaveLength(1);
    expect(() => decodeRobotBattleCore({ ...next, objective: { kind: "m01", state: { ...(next.objective.kind === "m01" ? next.objective.state : {}), result: "won" } } })).toThrow();
  });
  it("retains the same-round three-controlled-defeats loss even with an intact facility", () => {
    const s = attackingSquad();
    const next = fixtureCommit(s, [1, 2, 3].map((n, i) => ({ id: "wipe:" + i, sourceId: "frontline-1:" + i, effectKind: "assault", targets: [{ entityId: "p" + n, cells: [getRobotBattleUnit(s, "p" + n).position!], resolution: fixtureDamage(10000) }] })));
    expect(getRobotBattleResult(next)).toEqual({ result: "lost", reason: "same-round-controlled-wipe" });
    expect(getRobotBattleFacilities(next)[0]!.hp).toBe(160);
    expect(next.allied.waiting).toHaveLength(3);
  });
  it("defers blocked waves and chooses ordered canonical fallback pads without partial squads", () => {
    const r1 = coreFixture(1, "easy"), r2 = advanceRobotBattleRound(fixtureCloseRound(r1));
    if (r2.objective.kind !== "m01") throw new Error("M01 expected");
    const state = { ...r2.objective.state, objects: { ...r2.objective.state.objects, completedRound: 2 } };
    const wave = getRobotStagePlan(r2.key).reinforcements[0]!;
    const all = [...wave.initialCells, ...wave.fallbackCells].map(robotCellToPosition);
    const blocked = spawnRobotM01Reinforcements(state, 3, "easy", all);
    expect(blocked.spawned).toHaveLength(0); expect(blocked.deferredWaveIds).toEqual(["wave-1"]);
    const fallback = spawnRobotM01Reinforcements(state, 3, "easy", wave.initialCells.map(robotCellToPosition));
    expect(fallback.spawned[0]!.cells).toEqual(wave.fallbackCells.slice(0, 3).map(robotCellToPosition));
    expect(spawnRobotM01Reinforcements(fallback.state, 3, "easy", []).spawned).toHaveLength(0);
  });
  it("rejects damaged geometry, invalid HP, round history and missing wave receipts on resume", () => {
    const s = coreFixture(1, "easy");
    if (s.objective.kind !== "m01") throw new Error("M01 expected");
    const m = s.objective.state, object = m.objects.objects[0]!;
    for (const change of [{ hp: -1 }, { hp: 161 }, { def: 99 }, { cells: [robotCellToPosition("F8")] }]) expect(() => decodeRobotBattleCore({ ...s, objective: { kind: "m01", state: { ...m, objects: { ...m.objects, objects: [{ ...object, ...change }] } } } })).toThrow();
    expect(() => decodeRobotBattleCore({ ...s, objective: { kind: "m01", state: { ...m, spawnedWaveIds: ["wave-1"] } } })).toThrow();
  });
});
