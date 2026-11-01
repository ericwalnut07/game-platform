import { describe, expect, it } from "vitest";
import { getRobotBlastFootprint, getRobotBlastPlan } from "../../src/games/robot-tactics/blast";
import { assertRobotWeaponDebuffs, getRobotAssaultHitEffect, getRobotNormalHitEffect, mergeRobotWeaponDebuffs } from "../../src/games/robot-tactics/weaponHitEffects";
import { beginRobotBattleTurn, clearRobotBattleWeaponDebuffs, commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleEffectiveStats, getRobotBattleLegalMoves, getRobotBattleMovementShape, getRobotBattleUnit as unit, makeRobotBattleUnit, moveRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleNormalAttack, commitRobotBattleWeaponCombo } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotLegalMoves, type RobotMovementType } from "../../src/games/robot-tactics/movement";
import { checkRobotLineOfSight } from "../../src/games/robot-tactics/lineOfSight";
import { getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { weaponNormalCoreFixture, weaponNormalFixtureProgress } from "../robot-tactics/weaponNormalFixture";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";
import { createWeaponFixtureRuntime, weaponProgressForCase } from "../robot-tactics/weaponFixtureRuntime";
import { fixtureNextRound } from "../robot-tactics/coreFixture";
const boss = "enemy-supreme-commander", debuff = [{ stat: "mov" as const, delta: -1 }];
const identity = (s: RobotBattleCoreState, actionId = "binding-" + s.actionIds.length) => ({ actionId, turnId: robotBattleTurnId(s) });
const wait = (s: RobotBattleCoreState) => commitRobotBattlePassive(s, { ...identity(s), kind: "wait" });
const fire = (s: RobotBattleCoreState, targetId = boss) => commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "binding-hammer", targetId });

/** Test-only two-weapon NPC input, not a mission roster/AI or an enemy default. */
function boundPlayer() {
  let s = weaponCoreFixture({ progress: weaponNormalFixtureProgress("binding-hammer"), openTurn: false, sourceHp: 150 });
  const own = unit(s, "p1"), occupied = [...s.board.walls, ...s.units.filter(u => u.hp > 0).map(u => u.position!), ...(s.objective.kind === "m30" ? s.objective.state.facility.cells : [])];
  const offsets = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }];
  const position = offsets.map(d => ({ x: own.position!.x + d.x, y: own.position!.y + d.y })).find(c => c.x >= 0 && c.y >= 0 && c.x < s.board.width && c.y < s.board.height && !occupied.some(b => b.x === c.x && b.y === c.y) && checkRobotLineOfSight({ board: s.board, origin: c, target: own.position! }).clear)!;
  if (!position) throw new Error("No fixed test NPC cell");
  const npc = makeRobotBattleUnit({ id: "test-binding-npc", name: "拘束効果検証機", kind: "medium", number: null, squadId: null, chassis: null, maxHp: 200, maxEn: 100, position, stats: { melee: 100, ranged: 50, def: 50, mov: 1, spd: 80 }, movement: null, parts: [{ partId: "binding-hammer", level: 1 }, { partId: "light-blade", level: 1 }] });
  s = decodeRobotBattleCore({ ...s, units: [...s.units, npc], actors: [...s.actors, { id: npc.id, unitIds: [npc.id] }] });
  s = fire(beginRobotBattleTurn(s, npc.id), "p1"); return beginRobotBattleTurn(s, "p1");
}
function rawMoves(s: RobotBattleCoreState) {
  const u = unit(s, "p1"); return getRobotLegalMoves({ ...u.movement!, board: s.board, origin: u.position!, occupied: s.units.filter(v => v.hp > 0 && v.id !== u.id).map(v => v.position!), structures: s.objective.kind === "m30" ? s.objective.state.facility.cells : [] });
}
const key = (p: { x: number; y: number }) => p.x + "," + p.y;

describe("binding hammer normal hit and temporary movement", () => {
  it("reads adopted MOV-1 and retains the assault-only compatibility boundary", () => {
    expect(getRobotNormalHitEffect("binding-hammer")).toEqual({ kind: "debuff", modifiers: debuff }); expect(() => getRobotAssaultHitEffect("binding-hammer")).toThrow("assault"); expect(mergeRobotWeaponDebuffs(debuff, debuff)).toEqual(debuff);
    expect(() => assertRobotWeaponDebuffs([{ stat: "mov", delta: -2 }])).toThrow();
  });
  it("uses normal melee damage, no equipment MOV penalty, no unused sword recoil and one EN0 action", () => {
    const s = weaponNormalCoreFixture("binding-hammer", 1, 1), own = unit(s, "p1"), target = unit(s, boss), after = fire(s);
    expect(after.latest!.damage).toHaveLength(1); expect(after.latest!.damage[0]!.effectKind).toBe("blunt"); expect(after.latest!.damage[0]!.damage).toBe(getRobotWeaponDamageEstimate({ weaponId: "binding-hammer", weaponLevel: 1, attackStats: own.stats, targetDef: target.stats.def, mode: "normal" }).baseDamage);
    expect(unit(after, boss).weaponDebuffs).toEqual(debuff); expect(unit(after, "p1").hp).toBe(own.hp); expect(unit(after, "p1").energy.action).toEqual({ kind: "normal-attack", energyCost: 0 }); expect(unit(after, "p1").energy.normalHitRecovered).toBe(true); expect(unit(after, "p1").stats).toEqual(own.stats); expect(after.latest!.summary).toContain("MOV-1");
  });
  it("rejects an out-of-range hammer without damage/effect/EN or a receipt", () => {
    const s = weaponNormalCoreFixture("binding-hammer", 1, 2), raw = JSON.stringify(s); expect(() => fire(s)).toThrow("射程外"); expect(JSON.stringify(s)).toBe(raw);
  });
  it("uses effective MOV with the original type/facing and existing minimum 1 at every MOV1..7", () => {
    const s = boundPlayer(), original = unit(s, "p1");
    for (const mov of [1, 2, 3, 4, 5, 6, 7]) for (const type of ["straight", "diagonal", "omni", "forward"] as const) for (const facing of ["north", "east", "south", "west"] as const) {
      const u = { ...original, stats: { ...original.stats, mov }, movement: { mov, types: [type], facing } };
      expect(getRobotBattleMovementShape(u)).toEqual({ mov: Math.max(1, mov - 1), types: [type], facing }); expect(u.movement.mov).toBe(mov);
    }
  });
  for (const type of ["straight", "diagonal", "omni", "forward"] as const) it(`${type} choice projection and actual move share the weakened geometry/path`, () => {
    const base = boundPlayer(), s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, movement: { ...u.movement!, types: [type] as readonly RobotMovementType[] } } : u) }), own = unit(s, "p1"), raw = JSON.stringify(s);
    const expected = getRobotLegalMoves({ ...own.movement!, mov: Math.max(1, own.stats.mov - 1), board: s.board, origin: own.position!, occupied: s.units.filter(u => u.hp > 0 && u.id !== own.id).map(u => u.position!), structures: s.objective.kind === "m30" ? s.objective.state.facility.cells : [] }), moves = getRobotBattleLegalMoves(s, "p1");
    expect(moves).toEqual(expected); expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(unit(moveRobotBattleUnit(s, { ...identity(s), unitId: "p1", destination: m.destination }), "p1").position).toEqual(m.destination);
    const choices = new Set(moves.map(m => key(m.destination))), forbidden = rawMoves(s).find(m => !choices.has(key(m.destination)));
    expect(forbidden).toBeDefined(); expect(() => moveRobotBattleUnit(s, { ...identity(s), unitId: "p1", destination: forbidden!.destination })).toThrow("Illegal ordinary movement"); expect(JSON.stringify(s)).toBe(raw);
  });
  it("ordinary movement recovers EN3 once and retains the debuff until the final action ends the turn", () => {
    const s = boundPlayer(), own = unit(s, "p1"), destination = getRobotBattleLegalMoves(s, "p1")[0]!.destination, request = { ...identity(s), unitId: "p1", destination }, moved = moveRobotBattleUnit(s, request), u = unit(moved, "p1");
    expect(u.energy.en).toBe(Math.min(own.energy.maxEn, own.energy.en + 3)); expect(u.energy.action).toBeNull(); expect(moved.turn.actorId).toBe("p1"); expect(u.weaponDebuffs).toEqual(debuff); expect(u.stats).toEqual(own.stats); expect(u.movement).toEqual(own.movement);
    expect(getRobotBattleLegalMoves(moved, "p1")).toEqual([]); expect(moveRobotBattleUnit(moved, request)).toBe(moved); expect(() => moveRobotBattleUnit(moved, { ...request, actionId: "move-again" })).toThrow();
    const ended = wait(moved); expect(unit(ended, "p1").weaponDebuffs).toBeUndefined(); expect(getRobotBattleMovementShape(unit(ended, "p1"))).toEqual(own.movement);
    const next = beginRobotBattleTurn(fixtureNextRound(ended), "p1"); expect(getRobotBattleMovementShape(unit(next, "p1"))).toEqual(own.movement); expect(getRobotBattleLegalMoves(next, "p1")).toEqual(rawMoves(next));
  });
  it("does not invent a movement type for an NPC whose movement remains unconnected", () => {
    const s = fire(weaponNormalCoreFixture("binding-hammer", 1, 1)); expect(unit(s, boss).movement).toBeNull(); expect(getRobotBattleEffectiveStats(unit(s, boss)).mov).toBe(1); expect(getRobotBattleMovementShape(unit(s, boss))).toBeNull(); expect(getRobotBattleLegalMoves(s, boss)).toEqual([]);
  });
  it("suppresses binding's normal-only effect for a melee combo", () => {
    let p = weaponNormalFixtureProgress("binding-hammer"); p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot: "weapon2", partId: "light-lance" });
    const s = weaponCoreFixture({ progress: p, targetIds: [boss], offsets: [{ x: 1, y: 0 }] }), after = commitRobotBattleWeaponCombo(s, { ...identity(s), primaryWeaponId: "binding-hammer", secondaryWeaponId: "light-lance", targetIds: [boss] }); expect(unit(after, boss).weaponDebuffs).toBeUndefined();
  });
  it("persists MOV1 floor, combines different debuffs, and clears its ledger without changing base stats", () => {
    const s = boundPlayer(), own = unit(s, "p1"), u = { ...own, stats: { ...own.stats, mov: 1 }, movement: { ...own.movement!, mov: 1 }, weaponDebuffs: mergeRobotWeaponDebuffs(debuff, [{ stat: "def", delta: -8 }]) };
    const state = decodeRobotBattleCore({ ...s, units: s.units.map(v => v.id === own.id ? u : v) }); expect(getRobotBattleEffectiveStats(unit(state, "p1"))).toMatchObject({ mov: 1, def: own.stats.def - 8 }); expect(unit(state, "p1").stats.mov).toBe(1); expect(clearRobotBattleWeaponDebuffs(unit(state, "p1")).stats).toEqual(u.stats);
  });
});

describe("adopted blast parameters and geometry only", () => {
  for (const id of ["light-grenade-launcher", "howitzer", "heavy-missile-cannon", "wide-grenade-cannon"]) it(`${id} retains 70/40 percent and two neighbors at Lv1/Lv10`, () => {
    for (const level of [1, 10]) expect(getRobotBlastPlan({ partId: id, level })).toEqual({ centerMultiplier: 0.7, neighborMultiplier: 0.4, neighborTargetCap: 2, geometry: id === "wide-grenade-cannon" ? "8-neighborhood" : "orthogonal-4" });
  });
  it("keeps four orthogonal candidates and all eight wide candidates without selecting the two targets", () => {
    const board = { width: 7, height: 7 }, center = { x: 3, y: 3 }, narrow = getRobotBlastFootprint({ weapon: { partId: "howitzer", level: 1 }, center, board }), wide = getRobotBlastFootprint({ weapon: { partId: "wide-grenade-cannon", level: 1 }, center, board });
    expect(narrow.neighborCells.map(key).sort()).toEqual(["2,3", "3,2", "3,4", "4,3"]); expect(wide.neighborCells).toHaveLength(8); expect(new Set(wide.neighborCells.map(key)).size).toBe(8); expect(wide.neighborCells).not.toContainEqual(center); expect(wide.plan.neighborTargetCap).toBe(2);
    expect(Object.keys(wide).sort()).toEqual(["center", "neighborCells", "plan"]); expect(wide.center).not.toBe(center);
  });
  it("trims only off-board cells and does not decide wall LOS or shared-facility hits", () => {
    const board = { width: 3, height: 3, walls: [{ x: 1, y: 0 }] }, center = { x: 0, y: 0 }, raw = JSON.stringify({ board, center });
    expect(getRobotBlastFootprint({ board, center, weapon: { partId: "howitzer", level: 1 } }).neighborCells.map(key).sort()).toEqual(["0,1", "1,0"]);
    expect(getRobotBlastFootprint({ board, center, weapon: { partId: "wide-grenade-cannon", level: 1 } }).neighborCells.map(key).sort()).toEqual(["0,1", "1,0", "1,1"]); expect(JSON.stringify({ board, center })).toBe(raw);
  });
  it("rejects invalid geometry inputs and non-blast weapons", () => {
    expect(() => getRobotBlastPlan({ partId: "binding-hammer", level: 1 })).toThrow("Blast"); expect(() => getRobotBlastPlan({ partId: "howitzer", level: 0 })).toThrow();
    for (const center of [{ x: -1, y: 0 }, { x: 3, y: 0 }, { x: NaN, y: 1 }, { x: 0.5, y: 1 }]) expect(() => getRobotBlastFootprint({ board: { width: 3, height: 3 }, center, weapon: { partId: "howitzer", level: 1 } })).toThrow("Invalid blast");
    expect(() => getRobotBlastFootprint({ board: { width: 0, height: 3 }, center: { x: 0, y: 0 }, weapon: { partId: "howitzer", level: 1 } })).toThrow();
  });
});

class Storage implements RobotOfflineStorage {
  raw: string; fail = false;
  constructor(kind: "normal-binding" | "binding-movement") { this.raw = JSON.stringify({ ...createRobotOfflineSave(), progress: weaponProgressForCase(kind) }); }
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (expected !== this.raw) throw new Error("stale"); this.raw = next; }
}
it("binding hit persists atomically, resumes target expiry once, and retry restores departure", async () => {
  const storage = new Storage("normal-binding"), runtime = createWeaponFixtureRuntime("normal-binding"); let id = 0; const session = new RobotOfflineSession(storage, runtime, () => "binding-save-" + ++id); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" }); const before = session.state, raw = storage.raw;
  const request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-binding", action: { kind: "normal", targetId: boss, delta: -99 } };
  storage.fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
  storage.fail = false; await session.act(request); const hit = session.state; expect(unit(decodeRobotBattleCore(hit.battle!.snapshot), boss).weaponDebuffs).toEqual(debuff);
  const resumed = new RobotOfflineSession(storage, runtime, () => "unused"); await resumed.load(); await resumed.act(request); expect(resumed.state).toEqual(hit);
  await resumed.act({ battleId: request.battleId, expectedSequence: 1, actionId: "target-end", action: { kind: "assault-fixture-wait" } }); expect(unit(decodeRobotBattleCore(resumed.state.battle!.snapshot), boss).weaponDebuffs).toBeUndefined(); await resumed.retry(true); expect(resumed.state.battle!.departure.party).toEqual(before.battle!.departure.party); expect(resumed.state.battle!.sequence).toBe(0);
});
it("weakened move rejects a forged far cell, survives failed storage, resumes mid-turn and clears at the final action", async () => {
  const storage = new Storage("binding-movement"), runtime = createWeaponFixtureRuntime("binding-movement"); let id = 0; const session = new RobotOfflineSession(storage, runtime, () => "bound-move-" + ++id); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" });
  const before = session.state, initial = decodeRobotBattleCore(before.battle!.snapshot), moves = getRobotBattleLegalMoves(initial, "p1"), keys = new Set(moves.map(m => key(m.destination))), forbidden = rawMoves(initial).find(m => !keys.has(key(m.destination)))!, raw = storage.raw;
  const request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-move", action: { kind: "move", destination: { ...moves[0]!.destination } } };
  await expect(session.act({ ...request, action: { kind: "move", destination: { ...forbidden.destination } } })).rejects.toThrow("Illegal ordinary movement"); expect(storage.raw).toBe(raw);
  storage.fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw); storage.fail = false; await session.act(request); const moved = session.state;
  const resumed = new RobotOfflineSession(storage, runtime, () => "unused"); await resumed.load(); await resumed.act(request); expect(resumed.state).toEqual(moved); expect(decodeRobotBattleCore(moved.battle!.snapshot).turn.actorId).toBe("p1"); expect(unit(decodeRobotBattleCore(moved.battle!.snapshot), "p1").weaponDebuffs).toEqual(debuff);
  await resumed.act({ battleId: request.battleId, expectedSequence: 1, actionId: "end-own-turn", action: { kind: "wait" } }); expect(unit(decodeRobotBattleCore(resumed.state.battle!.snapshot), "p1").weaponDebuffs).toBeUndefined(); expect(resumed.state.progress).toEqual(before.progress); await resumed.retry(true); expect(decodeRobotBattleCore(resumed.state.battle!.snapshot).units).toEqual(initial.units);
});
