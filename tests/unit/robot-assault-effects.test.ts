import { describe, expect, it } from "vitest";
import { assertRobotWeaponDebuffs, getRobotAssaultHitEffect, mergeRobotWeaponDebuffs } from "../../src/games/robot-tactics/weaponHitEffects";
import { beginRobotBattleTurn, clearRobotBattleWeaponDebuffs, commitRobotBattlePassive, commitRobotBattleShield, decodeRobotBattleCore, getRobotBattleEffectiveStats, getRobotBattleUnit as unit, inspectRobotBattleInitiative, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleNormalAttack, commitRobotBattleSlashAttack, commitRobotBattleWeaponCombo, getRobotBattleNormalAttackOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { commitRobotBattleBatch } from "../../src/games/robot-tactics/battleBatch";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { getRobotPiercingComboDefense, getRobotWeaponComboPlan } from "../../src/games/robot-tactics/weaponActions";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { checkRobotLineOfSight } from "../../src/games/robot-tactics/lineOfSight";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { createWeaponFixtureRuntime, weaponProgressForCase } from "../robot-tactics/weaponFixtureRuntime";
import { weaponNormalCoreFixture, weaponNormalFixtureProgress } from "../robot-tactics/weaponNormalFixture";
import { weaponCoreFixture, weaponTargetIds } from "../robot-tactics/weaponCoreFixture";
import { weaponShieldCoreFixture } from "../robot-tactics/weaponShieldFixture";
import { fixtureAttack, fixtureCommit, fixtureNextRound } from "../robot-tactics/coreFixture";
const boss = "enemy-supreme-commander";
const identity = (s: RobotBattleCoreState, actionId = "assault-" + s.actionIds.length) => ({ actionId, turnId: robotBattleTurnId(s) });
const fire = (s: RobotBattleCoreState, weaponId: string, targetId = boss) => commitRobotBattleNormalAttack(s, { ...identity(s), weaponId, targetId });
const wait = (s: RobotBattleCoreState) => commitRobotBattlePassive(s, { ...identity(s), kind: "wait" });
const altered = (s: RobotBattleCoreState, targetId: string, patch: Partial<RobotBattleCoreState["units"][number]>) => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === targetId ? { ...u, ...patch } : u) });
const effects = [
  ["light-pistol", [{ stat: "spd", delta: -8 }]],
  ["assault-rifle", [{ stat: "melee", delta: -10 }, { stat: "ranged", delta: -10 }]],
  ["corrosion-rifle", [{ stat: "def", delta: -8 }]]
] as const;

describe("adopted assault effects", () => {
  for (const [id, modifiers] of effects) it(`${id} reads the adopted effect and applies it after pre-debuff damage`, () => {
    expect(getRobotAssaultHitEffect(id)).toEqual({ kind: "debuff", modifiers });
    const s = weaponNormalCoreFixture(id), source = unit(s, "p1"), target = unit(s, boss), raw = JSON.stringify(s), after = fire(s, id);
    const estimate = getRobotWeaponDamageEstimate({ weaponId: id, weaponLevel: 1, attackStats: source.stats, targetDef: target.stats.def, mode: "normal" });
    expect(after.latest!.damage).toHaveLength(1); expect(after.latest!.damage[0]!.damage).toBe(estimate.baseDamage); expect(unit(after, boss).weaponDebuffs).toEqual(modifiers);
    expect(unit(after, boss).stats).toEqual(target.stats); expect(unit(after, "p1").hp).toBe(source.hp); expect(after.latest!.summary).toContain("次の手番終了まで");
    expect(unit(after, "p1").energy.action).toEqual({ kind: "normal-attack", energyCost: 0 }); expect(unit(after, "p1").energy.normalHitRecovered).toBe(true);
    expect(JSON.stringify(s)).toBe(raw); expect(decodeRobotBattleCore(after)).toEqual(after);
  });
  it("reads EMP's fixed 25 EN and rejects an unrelated effect family", () => {
    expect(getRobotAssaultHitEffect("emp-carbine")).toEqual({ kind: "energy-drain", amount: 25 }); expect(() => getRobotAssaultHitEffect("binding-hammer")).toThrow("assault");
  });
  it("keeps highest-only same-stat reductions and coexisting different stats without mutating inputs", () => {
    const a = [{ stat: "def" as const, delta: -8 }], b = [{ stat: "melee" as const, delta: -10 }, { stat: "ranged" as const, delta: -10 }], before = JSON.stringify([a, b]);
    expect(mergeRobotWeaponDebuffs(a, a)).toEqual(a); expect(mergeRobotWeaponDebuffs(a, b)).toEqual([...b, ...a]); expect(JSON.stringify([a, b])).toBe(before);
    expect(() => assertRobotWeaponDebuffs([{ stat: "def", delta: -16 }])).toThrow();
  });
  for (const [id, modifiers] of effects) it(`${id} persists through target turn start and clears only at its turn end`, () => {
    const initial = weaponNormalCoreFixture(id), s = fire(initial, id), target = unit(s, boss), open = beginRobotBattleTurn(s, boss);
    expect(unit(open, boss).weaponDebuffs).toEqual(modifiers);
    for (const d of modifiers) expect(getRobotBattleEffectiveStats(unit(open, boss))[d.stat]).toBe(target.stats[d.stat] + d.delta);
    const ended = wait(open); expect(unit(ended, boss).weaponDebuffs).toBeUndefined(); expect(unit(ended, boss).stats).toEqual(target.stats);
    expect(getRobotBattleEffectiveStats(unit(ended, boss))).toEqual(target.stats);
  });
  it("retains a late hit across the round boundary when its target already acted", () => {
    let s = weaponCoreFixture({ progress: weaponNormalFixtureProgress("corrosion-rifle"), targetIds: [boss], offsets: [{ x: 2, y: 0 }], openTurn: false });
    s = wait(beginRobotBattleTurn(s, boss)); s = fire(beginRobotBattleTurn(s, "p1"), "corrosion-rifle");
    const next = fixtureNextRound(s); expect(next.allied.round).toBe(2); expect(unit(next, boss).weaponDebuffs).toEqual([{ stat: "def", delta: -8 }]);
    expect(unit(wait(beginRobotBattleTurn(next, boss)), boss).weaponDebuffs).toBeUndefined();
  });
  it("uses reduced SPD for inspection without selecting an initiative timing/tie rule", () => {
    const base = weaponNormalCoreFixture("light-pistol"), s = fire(base, "light-pistol"), reduced = unit(base, boss).stats.spd - 8;
    expect(inspectRobotBattleInitiative(s).groups.find(g => g.actorIds.includes(boss))!.spd).toBe(reduced); expect(inspectRobotBattleInitiative(s).timingPolicy).toBe("unresolved");
    const next = wait(beginRobotBattleTurn(s, boss)); expect(getRobotBattleEffectiveStats(unit(next, boss)).spd).toBe(unit(base, boss).stats.spd);
  });
  it("keeps a one-member SPD reduction explicit instead of inventing a whole-squad speed", () => {
    const p = weaponNormalFixtureProgress("light-pistol"), seed = weaponNormalCoreFixture("light-pistol"), id = weaponTargetIds(seed)[0]!;
    const s = weaponCoreFixture({ progress: p, targetIds: [id], offsets: [{ x: 2, y: 0 }] }), after = fire(s, "light-pistol", id), squad = after.actors.find(a => a.unitIds.includes(id))!;
    expect(inspectRobotBattleInitiative(after).unresolved).toContain("mixed-squad-speed:" + squad.id);
    const done = wait(beginRobotBattleTurn(after, squad.id)); expect(unit(done, id).weaponDebuffs).toBeUndefined();
  });
  it("repeated actual hits reduce DEF once and use the already-reduced DEF for the later damage", () => {
    let p = weaponNormalFixtureProgress("corrosion-rifle");
    for (const [slot, partId] of [["weapon2", "double-edged-sword"], ["weapon1", "corrosion-rifle"]] as const) p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-b", slot, partId });
    let s = weaponCoreFixture({ progress: p, targetIds: [boss], offsets: [{ x: 2, y: 0 }] });
    const target = unit(s, boss), blocked = [...s.board.walls, ...s.units.filter(u => u.id !== "p2").map(u => u.position!), ...(s.objective.kind === "m30" ? s.objective.state.facility.cells : [])];
    const cells = Array.from({ length: s.board.height }, (_, y) => Array.from({ length: s.board.width }, (_, x) => ({ x, y }))).flat();
    const position = cells.find(c => Math.max(Math.abs(c.x - target.position!.x), Math.abs(c.y - target.position!.y)) <= 3 && !blocked.some(b => b.x === c.x && b.y === c.y) && checkRobotLineOfSight({ board: s.board, origin: c, target: target.position! }).clear)!;
    expect(position).toBeDefined(); s = altered(s, "p2", { position }); s = fire(s, "corrosion-rifle"); s = beginRobotBattleTurn(s, "p2");
    const expected = getRobotWeaponDamageEstimate({ weaponId: "corrosion-rifle", weaponLevel: 1, attackStats: unit(s, "p2").stats, targetDef: target.stats.def - 8, mode: "normal" }).baseDamage;
    const after = fire(s, "corrosion-rifle"); expect(after.latest!.damage[0]!.damage).toBe(expected); expect(unit(after, boss).weaponDebuffs).toEqual([{ stat: "def", delta: -8 }]); expect(unit(after, boss).stats.def).toBe(target.stats.def);
  });
  it("keeps the adopted effective DEF10 floor after corrosion without changing raw DEF", () => {
    const seed = weaponNormalCoreFixture("corrosion-rifle"), id = weaponTargetIds(seed)[0]!, base = weaponCoreFixture({ progress: weaponNormalFixtureProgress("corrosion-rifle"), targetIds: [id], offsets: [{ x: 2, y: 0 }] });
    const s = altered(base, id, { maxHp: 10000, hp: 10000, stats: { ...unit(base, id).stats, def: 5 } }), after = fire(s, "corrosion-rifle", id), target = unit(after, id);
    expect(target.hp).toBeGreaterThan(0); expect(target.stats.def).toBe(5); expect(getRobotBattleEffectiveStats(target).def).toBe(-3);
    const input = { weaponId: "corrosion-rifle", weaponLevel: 1, attackStats: unit(s, "p1").stats, mode: "normal" as const };
    expect(getRobotWeaponDamageEstimate({ ...input, targetDef: getRobotBattleEffectiveStats(target).def }).baseDamage).toBe(getRobotWeaponDamageEstimate({ ...input, targetDef: 10 }).baseDamage);
  });
  it("applies minimum one independently of a legal debuff hit, without damaging the unused sword's owner", () => {
    const s = weaponNormalCoreFixture("corrosion-rifle"), after = commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "corrosion-rifle", targetId: boss }, { postBaseMultipliers: () => [0] });
    expect(after.latest!.damage.map(d => d.damage)).toEqual([1]); expect(unit(after, boss).weaponDebuffs).toEqual([{ stat: "def", delta: -8 }]); expect(unit(after, "p1").hp).toBe(unit(s, "p1").hp);
  });
  it("rejects out-of-range/friendly targets without damage, EN loss, debuffs or action receipts", () => {
    const s = weaponNormalCoreFixture("corrosion-rifle", 1, 4), raw = JSON.stringify(s); expect(getRobotBattleNormalAttackOptions(s, "corrosion-rifle").targetIds).not.toContain(boss);
    expect(() => fire(s, "corrosion-rifle")).toThrow("射程外"); expect(() => fire(s, "corrosion-rifle", "p2")).toThrow("opposing"); expect(JSON.stringify(s)).toBe(raw);
  });
  it("does not add a debuff/drain to a blocked or deliberately non-damaging resolved effect", () => {
    const s = weaponNormalCoreFixture("emp-carbine"), packet = fixtureAttack(s, "p1", boss, 1), before = unit(s, boss);
    for (const resolution of [{ damage: 0, damageBeforeMinimum: null, reason: "line-of-sight-blocked" as const }, { damage: 0, damageBeforeMinimum: null, reason: "non-damaging" as const }]) {
      const input = { ...identity(s), summary: "non-hit fixture", members: [{ unitId: "p1", action: { kind: "normal-attack" as const, energyCost: 0 } }], attacks: [{ ...packet, normalWeaponId: "emp-carbine", targets: [{ ...packet.targets[0]!, resolution }] }] };
      if (resolution.reason === "line-of-sight-blocked") expect(() => commitRobotBattleBatch(s, input)).toThrow("non-established");
      else { const after = commitRobotBattleBatch(s, input); expect(unit(after, boss)).toEqual(before); expect(after.latest!.damage[0]!.damage).toBeNull(); }
    }
  });
});

for (const initialEn of [0, 5, 24, 25, 50, 355]) it(`EMP resolves target damage recovery before EN25 drain at initial EN${initialEn}`, () => {
  const base = weaponNormalCoreFixture("emp-carbine"), original = unit(base, boss), s = altered(base, boss, { energy: { ...original.energy, en: initialEn } }), after = fire(s, "emp-carbine"), target = unit(after, boss);
  const recovered = Math.min(original.energy.maxEn, initialEn + 3), expected = Math.max(0, recovered - 25);
  expect(target.energy.en).toBe(expected); expect(target.energy.damagedRecovered).toBe(true); expect(target.weaponDebuffs).toBeUndefined(); expect(target.hp).toBeLessThan(original.hp);
  expect(after.latest!.summary).toContain("EN" + Math.min(recovered, 25) + "減少"); expect(unit(after, "p1").energy.normalHitRecovered).toBe(true); expect(after.latest!.damage).toHaveLength(1);
});
it("EMP neither grants target recovery twice nor transfers drained energy to the attacker", () => {
  const base = weaponNormalCoreFixture("emp-carbine"), target = unit(base, boss), s = altered(base, boss, { energy: { ...target.energy, en: 40, damagedRecovered: true } }), after = fire(s, "emp-carbine"), source = unit(s, "p1"), recovery = getRobotEnergyRecoveryAmounts(source.energy.maxEn);
  expect(unit(after, boss).energy.en).toBe(15); expect(unit(after, "p1").energy.en).toBe(Math.min(source.energy.maxEn, source.energy.en + recovery.normalHit + 8 + recovery.actionEnd));
});

for (const id of ["light-pistol", "assault-rifle", "corrosion-rifle", "emp-carbine"]) it(`weapon combo suppresses ${id}'s normal-only effect`, () => {
  let p = weaponNormalFixtureProgress(id); p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot: "weapon2", partId: "lance" });
  const s = weaponCoreFixture({ progress: p, targetIds: [boss], offsets: [{ x: 2, y: 0 }] }), before = unit(s, boss), after = commitRobotBattleWeaponCombo(s, { ...identity(s), primaryWeaponId: id, secondaryWeaponId: "lance", targetIds: [boss] });
  expect(unit(after, boss).weaponDebuffs).toBeUndefined(); expect(unit(after, boss).energy.en).toBe(Math.min(before.energy.maxEn, before.energy.en + 3)); expect(after.latest!.summary).not.toContain("次の手番終了まで");
});
it("rejects a normal-only effect attached to a combo/delta-style action instead of leaking it", () => {
  const s = weaponNormalCoreFixture("corrosion-rifle"), packet = fixtureAttack(s, "p1", boss, 1), before = JSON.stringify(s);
  expect(() => commitRobotBattleBatch(s, { ...identity(s), summary: "invalid normal-only hook", members: [{ unitId: "p1", action: { kind: "other", energyCost: 50 } }], attacks: [{ ...packet, normalWeaponId: "corrosion-rifle" }] })).toThrow("equipped normal action"); expect(JSON.stringify(s)).toBe(before);
});
it("known attack/DEF debuffs compose before shield and remain active for the affected attack, then expire", () => {
  let s = weaponShieldCoreFixture(); s = commitRobotBattleShield(s, identity(s)); s = beginRobotBattleTurn(s, "commander"); s = fire(s, "assault-rifle", "p1");
  expect(unit(s, "p1").shielded).toBe(true); expect(unit(s, "p1").weaponDebuffs).toEqual([{ stat: "melee", delta: -10 }, { stat: "ranged", delta: -10 }]);
  s = beginRobotBattleTurn(fixtureNextRound(s), "p1"); const owner = unit(s, "p1"), target = unit(s, "commander"), weaponId = "light-blade";
  const expected = getRobotWeaponDamageEstimate({ weaponId, weaponLevel: 1, attackStats: getRobotBattleEffectiveStats(owner), targetDef: target.stats.def, mode: "normal" }).baseDamage;
  const after = fire(s, weaponId, "commander"); expect(after.latest!.damage[0]!.damage).toBe(expected); expect(unit(after, "p1").weaponDebuffs).toBeUndefined(); expect(unit(after, "p1").stats).toEqual(owner.stats);
});
it("existing sweep uses effective attack/DEF while leaving base equipment untouched", () => {
  const s = weaponCoreFixture(), ids = weaponTargetIds(s).slice(0, 2);
  const debuffed = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, weaponDebuffs: [{ stat: "melee", delta: -10 }] } : ids.includes(u.id) ? { ...u, weaponDebuffs: [{ stat: "def", delta: -8 }] } : u) });
  const explicit = decodeRobotBattleCore({ ...s, units: s.units.map(u => ({ ...u, stats: getRobotBattleEffectiveStats(unit(debuffed, u.id)) })) });
  const sweep = (v: RobotBattleCoreState) => commitRobotBattleSlashAttack(v, { ...identity(v), kind: "sweep", weaponId: "double-edged-sword", targetIds: ids });
  expect(sweep(debuffed).latest!.damage).toEqual(sweep(explicit).latest!.damage); expect(unit(debuffed, "p1").stats).toEqual(unit(s, "p1").stats);
});
it("existing combo uses active effective stats without refreshing target debuffs", () => {
  let p = weaponNormalFixtureProgress("corrosion-rifle"); p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot: "weapon2", partId: "lance" });
  const s = weaponCoreFixture({ progress: p, targetIds: [boss], offsets: [{ x: 2, y: 0 }] }), weakened = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, weaponDebuffs: [{ stat: "ranged", delta: -10 }] } : u.id === boss ? { ...u, weaponDebuffs: [{ stat: "def", delta: -8 }] } : u) });
  const owner = unit(s, "p1"), plan = getRobotWeaponComboPlan({ partId: "corrosion-rifle", level: 1 }, { partId: "lance", level: 1 });
  const base = getRobotWeaponDamageEstimate({ weaponId: "corrosion-rifle", weaponLevel: 1, attackStats: { melee: owner.stats.melee, ranged: owner.stats.ranged - 10 }, targetDef: getRobotPiercingComboDefense(unit(s, boss).stats.def - 8), mode: "normal" }).baseDamage;
  const after = commitRobotBattleWeaponCombo(weakened, { ...identity(weakened), primaryWeaponId: "corrosion-rifle", secondaryWeaponId: "lance", targetIds: [boss] });
  expect(after.latest!.damage.map(d => d.damage)).toEqual([Math.max(1, floorRobotDamageProduct(base, [plan.rangedNormalDamageMultiplier!]))]); expect(unit(after, boss).weaponDebuffs).toEqual(unit(weakened, boss).weaponDebuffs); expect(unit(after, "p1").weaponDebuffs).toBeUndefined();
});
it("clears debuffs on enemy/allied defeat and does not restore them with allied respawn", () => {
  const base = weaponNormalCoreFixture("corrosion-rifle"), dying = altered(base, boss, { hp: 1, weaponDebuffs: [{ stat: "def", delta: -8 }] }), after = fire(dying, "corrosion-rifle");
  expect(unit(after, boss).hp).toBe(0); expect(unit(after, boss).weaponDebuffs).toBeUndefined();
  let s = weaponCoreFixture({ mission: 2, openTurn: false }); s = altered(s, "p1", { weaponDebuffs: [{ stat: "def", delta: -8 }] }); s = beginRobotBattleTurn(s, "commander");
  s = fixtureCommit(s, [fixtureAttack(s, "commander", "p1", 10000)]); expect(unit(s, "p1").weaponDebuffs).toBeUndefined(); s = fixtureNextRound(fixtureNextRound(s)); expect(unit(s, "p1").hp).toBeGreaterThan(0); expect(unit(s, "p1").weaponDebuffs).toBeUndefined();
});
it("keeps legacy omissions unchanged and rejects corrupt, duplicate or non-adopted debuff records", () => {
  const s = weaponNormalCoreFixture("corrosion-rifle"); expect(unit(decodeRobotBattleCore(s), "p1").weaponDebuffs).toBeUndefined(); expect(clearRobotBattleWeaponDebuffs(unit(s, "p1"))).toBe(unit(s, "p1"));
  for (const weaponDebuffs of [null, {}, [{ stat: "def", delta: -16 }], [{ stat: "def", delta: 8 }], [{ stat: "mov", delta: -2 }], [{ stat: "spd", delta: -8, turns: 2 }], [{ stat: "def", delta: -8 }, { stat: "def", delta: -8 }]]) expect(() => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === boss ? { ...u, weaponDebuffs } : u) })).toThrow("weapon debuff");
});

class Storage implements RobotOfflineStorage {
  raw: string; fail = false;
  constructor(kind: "normal-corrosion" | "normal-emp") { this.raw = JSON.stringify({ ...createRobotOfflineSave(), progress: weaponProgressForCase(kind) }); }
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale"); this.raw = next; }
}
for (const kind of ["normal-corrosion", "normal-emp"] as const) it(`${kind} saves damage/effect once, preserves failed writes and resumes target expiry without replay`, async () => {
  const storage = new Storage(kind), runtime = createWeaponFixtureRuntime(kind); let id = 0; const session = new RobotOfflineSession(storage, runtime, () => "assault-save-" + ++id); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" });
  const before = session.state, raw = storage.raw, core = decodeRobotBattleCore(before.battle!.snapshot), request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-assault", action: { kind: "normal", targetId: boss, energyDrain: 999, debuffs: [] } };
  storage.fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
  storage.fail = false; await session.act(request); const shot = session.state, resolved = decodeRobotBattleCore(shot.battle!.snapshot); expect(resolved.turn.actorId).toBe(boss); expect(shot.battle!.sequence).toBe(1);
  if (kind === "normal-corrosion") expect(unit(resolved, boss).weaponDebuffs).toEqual([{ stat: "def", delta: -8 }]); else expect(unit(resolved, boss).energy.en).toBe(unit(core, boss).energy.en + 3 - 25);
  const resumed = new RobotOfflineSession(storage, runtime, () => "unused"); await resumed.load(); await resumed.act(request); expect(resumed.state).toEqual(shot);
  await resumed.act({ battleId: request.battleId, expectedSequence: 1, actionId: "target-wait", action: { kind: "assault-fixture-wait" } }); const ended = resumed.state, done = decodeRobotBattleCore(ended.battle!.snapshot); expect(ended.battle!.sequence).toBe(2); expect(unit(done, boss).weaponDebuffs).toBeUndefined(); expect(done.turn.actorId).toBe("p2"); expect(ended.progress).toEqual(before.progress);
  await resumed.retry(true); expect(decodeRobotBattleCore(resumed.state.battle!.snapshot).units).toEqual(core.units); expect(resumed.state.battle!.departure.party).toEqual(before.battle!.departure.party);
});
it("rejects a corrupted new effect checkpoint without overwriting its stored bytes", async () => {
  const storage = new Storage("normal-corrosion"), runtime = createWeaponFixtureRuntime("normal-corrosion"), session = new RobotOfflineSession(storage, runtime, () => "corrupt-effect-fixture"); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" });
  const save = JSON.parse(storage.raw), core = decodeRobotBattleCore(save.battle.snapshot); save.battle.snapshot = { ...core, units: core.units.map(u => u.id === boss ? { ...u, weaponDebuffs: [{ stat: "def", delta: -999 }] } : u) }; storage.raw = JSON.stringify(save); const raw = storage.raw;
  const resumed = new RobotOfflineSession(storage, runtime, () => "unused"); await expect(resumed.load()).rejects.toThrow("weapon debuff"); expect(storage.raw).toBe(raw);
});
