import { describe, expect, it } from "vitest";
import { commitRobotBattleNormalAttack, commitRobotBattleSlashAttack, getRobotBattleNormalAttackOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { beginRobotBattleTurn, commitRobotBattleShield, decodeRobotBattleCore, getRobotBattleUnit as unit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { getRobotWeaponDamageEstimate, floorRobotDamageProduct } from "../../src/games/robot-tactics/combatMath";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotShieldActionPlan } from "../../src/games/robot-tactics/equipmentEffects";
import { createRobotPerformanceDraft, getRobotPerformanceReport } from "../../src/games/robot-tactics/performanceCheck";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { weaponNormalCoreFixture, weaponNormalFixtureProgress } from "../robot-tactics/weaponNormalFixture";
import { weaponCoreFixture, weaponFixtureProgress, weaponTargetIds } from "../robot-tactics/weaponCoreFixture";
import { weaponShieldCoreFixture } from "../robot-tactics/weaponShieldFixture";
import { createWeaponFixtureRuntime, weaponProgressForCase } from "../robot-tactics/weaponFixtureRuntime";
import { fixtureNextRound } from "../robot-tactics/coreFixture";
const boss = "enemy-supreme-commander";
const identity = (s: RobotBattleCoreState, actionId = "normal-action") => ({ actionId, turnId: robotBattleTurnId(s) });
const fire = (s: RobotBattleCoreState, weaponId: string, targetId = boss) => commitRobotBattleNormalAttack(s, { ...identity(s), weaponId, targetId });
const en = (s: RobotBattleCoreState, value: number) => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: value } } : u) });

for (const id of ["light-lance", "lance", "armor-pile", "sniper-rifle", "precision-rifle", "superheavy-railgun"]) it(`${id} uses equipped stats and the same normal damage/EN as the sandbox`, () => {
  const distance = id.includes("rifle") || id.includes("railgun") ? 3 : 2, p = weaponNormalFixtureProgress(id), s = weaponNormalCoreFixture(id, 1, distance), raw = JSON.stringify(s), source = unit(s, "p1"), target = unit(s, boss);
  const options = getRobotBattleNormalAttackOptions(s, id); expect(options.targetIds).toContain(boss); expect(options.disabledReason).toBeNull();
  const draft = createRobotPerformanceDraft(p), report = getRobotPerformanceReport(p, { ...draft, enemy: { ...draft.enemy, hp: target.hp, def: target.stats.def } });
  const after = fire(s, id), dealt = after.latest!.damage;
  expect(dealt).toHaveLength(1); expect(dealt[0]!.damage).toBe(report.dealt!.totalDamage); expect(unit(after, boss).hp).toBe(target.hp - Math.min(target.hp, dealt[0]!.damage!));
  expect(unit(after, "p1").hp).toBe(source.hp); expect(report.dealt!.recoil).toBe(0);
  expect(unit(after, "p1").energy.action).toEqual({ kind: "normal-attack", energyCost: report.dealt!.requiredEn });
  expect(after.actionIds).toEqual(["normal-action"]); expect(after.attackIds).toEqual(["normal-action:hit:1"]); expect(after.turn.actedActorIds).toEqual(["p1"]);
  expect(unit(after, "p1").stats).toEqual(source.stats); expect(JSON.stringify(s)).toBe(raw); expect(decodeRobotBattleCore(after)).toEqual(after);
});

describe("normal command spatial and authority checks", () => {
  it("allows thrust at two including diagonals, rejects three and enforces each sniper minimum/maximum", () => {
    for (const [id, distances] of [["light-lance", [1, 2]], ["lance", [1, 2]], ["armor-pile", [1, 2]], ["sniper-rifle", [3, 5]], ["precision-rifle", [3, 6]], ["superheavy-railgun", [3, 5]]] as const) {
      for (const d of distances) expect(fire(weaponNormalCoreFixture(id, 1, d), id).latest!.damage[0]!.damage).toBeGreaterThan(0);
      for (const d of [distances[0] - 1, distances[1] + 1].filter(n => n > 0)) { const s = weaponNormalCoreFixture(id, 1, d); expect(getRobotBattleNormalAttackOptions(s, id).targetIds).not.toContain(boss); expect(() => fire(s, id)).toThrow("射程外"); expect(s.actionIds).toEqual([]); }
    }
    const p = weaponNormalFixtureProgress("lance"), s = weaponCoreFixture({ progress: p, targetIds: [boss], offsets: [{ x: 2, y: 2 }] }); expect(fire(s, "lance").latest!.damage[0]!.damage).toBeGreaterThan(0);
  });
  it("uses the shared wall LOS instead of granting a ranged hit through a wall", () => {
    const base = weaponNormalCoreFixture("lance"), reserved = base.units.filter(u => u.id !== "p1" && u.id !== boss).map(u => u.position!);
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < base.board.width && y < base.board.height && !base.board.walls.some(w => w.x === x && w.y === y) && !reserved.some(w => w.x === x && w.y === y);
    const wall = base.board.walls.find(w => free(w.x - 1, w.y) && free(w.x + 1, w.y))!; expect(wall).toBeDefined();
    const s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, position: { x: wall.x - 1, y: wall.y } } : u.id === boss ? { ...u, position: { x: wall.x + 1, y: wall.y } } : u) });
    expect(getRobotBattleNormalAttackOptions(s, "lance").targetIds).not.toContain(boss); expect(() => fire(s, "lance")).toThrow("壁"); expect(s.actionIds).toEqual([]);
  });
  it("does not treat either team's intermediate unit as a LOS blocker", () => {
    const base = weaponNormalCoreFixture("sniper-rifle", 1, 3), origin = unit(base, "p1").position!, other = weaponTargetIds(base)[0]!;
    const s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p2" ? { ...u, position: { x: origin.x + 1, y: origin.y } } : u.id === other ? { ...u, position: { x: origin.x + 2, y: origin.y } } : u) });
    expect(getRobotBattleNormalAttackOptions(s, "sniper-rifle").targetIds).toContain(boss); expect(fire(s, "sniper-rifle").latest!.damage).toHaveLength(1);
  });
  it("rejects unheld weapons, allied targets, stale turns and a new action after completion without mutation", () => {
    const s = weaponNormalCoreFixture("lance"), raw = JSON.stringify(s);
    expect(() => fire(s, "light-lance")).toThrow("not equipped"); expect(() => fire(s, "lance", "p2")).toThrow("opposing");
    expect(() => commitRobotBattleNormalAttack(s, { ...identity(s), turnId: "old", weaponId: "lance", targetId: boss })).toThrow();
    const after = fire(s, "lance"); expect(fire(after, "lance")).toBe(after);
    expect(() => commitRobotBattleNormalAttack(after, { ...identity(after, "another"), weaponId: "lance", targetId: boss })).toThrow(); expect(JSON.stringify(s)).toBe(raw);
  });
  it("does not expose or damage a defeated enemy again on a later turn", () => {
    const base = weaponCoreFixture({ progress: weaponFixtureProgress(["light-blade", "double-edged-sword"]) }), id = weaponTargetIds(base)[0]!;
    const s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === id ? { ...u, hp: 1 } : u) });
    const later = beginRobotBattleTurn(fixtureNextRound(fire(s, "light-blade", id)), "p1");
    expect(getRobotBattleNormalAttackOptions(later, "light-blade").targetIds).not.toContain(id); expect(() => commitRobotBattleNormalAttack(later, { ...identity(later, "dead-repeat"), weaponId: "light-blade", targetId: id })).toThrow("opposing");
  });
  it("leaves squad simultaneous resolution and unresolved statuses behind their existing guards", () => {
    const base = weaponCoreFixture({ openTurn: false }), squad = beginRobotBattleTurn(base, base.actors.find(a => a.unitIds.length === 3)!.id);
    expect(() => fire(squad, "light-blade")).toThrow("single-robot");
    const initial = weaponNormalCoreFixture("lance"), s = decodeRobotBattleCore({ ...initial, units: initial.units.map(u => u.id === "p1" ? { ...u, statuses: ["unresolved-test-status"] } : u) }), before = JSON.stringify(s);
    expect(() => getRobotBattleNormalAttackOptions(s, "lance")).toThrow("status damage resolver"); expect(() => fire(s, "lance")).toThrow("status damage resolver"); expect(JSON.stringify(s)).toBe(before);
  });
  it("connects the adopted suppression mace normal hit without inventing a damage modifier", () => {
    const s=weaponNormalCoreFixture("suppression-mace",1,1),options=getRobotBattleNormalAttackOptions(s,"suppression-mace");expect(options.disabledReason).toBeNull();const n=fire(s,"suppression-mace");expect(unit(n,boss).reactionsSuppressedUntilOwnTurn).toBe(unit(s,boss).energy.ownTurn+1);expect(n.latest!.summary).toContain("反応攻撃抑制");
  });
  it("does not reinterpret armor-pile as DEF piercing, and applies minimum one after all factors", () => {
    const s = weaponNormalCoreFixture("armor-pile"), source = unit(s, "p1"), target = unit(s, boss), estimate = getRobotWeaponDamageEstimate({ weaponId: "armor-pile", weaponLevel: 1, attackStats: source.stats, targetDef: target.stats.def, mode: "normal" });
    expect(fire(s, "armor-pile").latest!.damage[0]!.damage).toBe(estimate.baseDamage);
    expect(commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "armor-pile", targetId: boss }, { postBaseMultipliers: () => [0] }).latest!.damage.map(d => d.damage)).toEqual([1]);
  });
  it("retains the existing slash command and 20% used-sword recoil exactly", () => {
    const s = weaponCoreFixture({ progress: weaponFixtureProgress() }), target = weaponTargetIds(s)[0]!;
    const legacy = commitRobotBattleSlashAttack(s, { ...identity(s), weaponId: "double-edged-sword", kind: "normal", targetIds: [target] });
    expect(fire(s, "double-edged-sword", target)).toEqual(legacy); expect(legacy.latest!.damage.some(d => d.effectKind === "special:sword-recoil")).toBe(true);
  });
  it("uses the same legal normal path for an enemy into an active shield and rejects enemy friendly fire", () => {
    let s = weaponShieldCoreFixture(); s = commitRobotBattleShield(s, identity(s, "shield")); s = beginRobotBattleTurn(s, "commander");
    const source = unit(s, "commander"), target = unit(s, "p1"), weapon = source.parts.find(p => p.partId === "standard-sword")!;
    const base = getRobotWeaponDamageEstimate({ weaponId: weapon.partId, weaponLevel: weapon.level, attackStats: source.stats, targetDef: target.stats.def, mode: "normal" }).baseDamage;
    const factors = getRobotShieldActionPlan(target.parts.map(p => resolveRobotBasicPart(p.partId, p.level)), target.addons).damageFactors;
    expect(getRobotBattleNormalAttackOptions(s, weapon.partId).targetIds).toContain("p1");
    const after = fire(s, weapon.partId, "p1"); expect(after.latest!.damage[0]!.damage).toBe(Math.max(1, floorRobotDamageProduct(base, factors))); expect(unit(after, "p1").shielded).toBe(true);
    expect(() => fire(s, weapon.partId, weaponTargetIds(s)[0]!)).toThrow("opposing");
  });
});

describe("railgun's adopted normal-attack energy table", () => {
  for (const [i, cost] of [12, 14, 16, 18, 20, 22, 24, 26, 28, 30].entries()) it(`charges Lv${i + 1} exactly ${cost}, never normal-hit recovery or unused sword recoil`, () => {
    const base = weaponNormalCoreFixture("superheavy-railgun", i + 1, 3), s = en(base, cost), source = unit(s, "p1"), after = fire(s, "superheavy-railgun"), amounts = getRobotEnergyRecoveryAmounts(source.energy.maxEn);
    expect(getRobotBattleNormalAttackOptions(s, "superheavy-railgun").energyCost).toBe(cost);
    expect(unit(after, "p1").energy).toMatchObject({ action: { kind: "normal-attack", energyCost: cost }, normalHitRecovered: false, en: amounts.actionEnd }); expect(unit(after, "p1").hp).toBe(source.hp);
    const poor = en(base, cost - 1), raw = JSON.stringify(poor); expect(getRobotBattleNormalAttackOptions(poor, "superheavy-railgun")).toMatchObject({ targetIds: [], disabledReason: "EN不足" }); expect(() => fire(poor, "superheavy-railgun")).toThrow("Insufficient EN"); expect(JSON.stringify(poor)).toBe(raw);
  });
  it("grants ordinary zero-cost thrust/sniper normal-hit recovery and circuit +8 once", () => {
    for (const id of ["lance", "precision-rifle"]) {
      const s = en(weaponNormalCoreFixture(id, 1, id === "lance" ? 2 : 3), 0), after = fire(s, id), amounts = getRobotEnergyRecoveryAmounts(unit(s, "p1").energy.maxEn);
      expect(unit(after, "p1").energy).toMatchObject({ normalHitRecovered: true, en: amounts.normalHit + 8 + amounts.actionEnd }); expect(after.latest!.damage).toHaveLength(1);
    }
  });
});

class Storage implements RobotOfflineStorage {
  raw = JSON.stringify({ ...createRobotOfflineSave(), progress: weaponProgressForCase("normal-railgun") }); fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale"); this.raw = next; }
}
it("normal-shot checkpoint validates target, commits atomically, deduplicates replay and restores departure on retry", async () => {
  const storage = new Storage(), runtime = createWeaponFixtureRuntime("normal-railgun"); let id = 0;
  const session = new RobotOfflineSession(storage, runtime, () => "normal-save-" + ++id); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" });
  const before = session.state, raw = storage.raw, core = decodeRobotBattleCore(before.battle!.snapshot), request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-shot", action: { kind: "normal", targetId: boss, energyCost: 0, damage: 9999 } };
  await expect(session.act({ ...request, action: { ...request.action, targetId: "p2" } })).rejects.toThrow("opposing"); expect(storage.raw).toBe(raw);
  storage.fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
  storage.fail = false; await session.act(request); const after = session.state, shot = decodeRobotBattleCore(after.battle!.snapshot); expect(after.battle!.sequence).toBe(1); expect(unit(shot, "p1").energy.action!.energyCost).toBe(30); expect(shot.latest!.damage).toHaveLength(1); expect(shot.latest!.damage[0]!.damage).not.toBe(9999);
  const resumed = new RobotOfflineSession(storage, runtime, () => "resume-unused"); await resumed.load(); await resumed.act(request); expect(resumed.state).toEqual(after); expect(after.progress).toEqual(before.progress);
  await session.retry(true); const retry = decodeRobotBattleCore(session.state.battle!.snapshot); expect(retry.units).toEqual(core.units); expect(session.state.battle!.departure.party).toEqual(before.battle!.departure.party); expect(session.state.battle!.sequence).toBe(0);
});
