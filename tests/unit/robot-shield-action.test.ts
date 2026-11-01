import { describe, expect, it } from "vitest";
import { getRobotConnectedAddonPlan } from "../../src/games/robot-tactics/addonEffects";
import { getRobotShieldActionPlan } from "../../src/games/robot-tactics/equipmentEffects";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { floorRobotDamageProduct, getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { beginRobotBattleTurn, commitRobotBattleShield, decodeRobotBattleCore, getRobotBattleUnit, moveRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotBattlePostBaseModifiers } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { getRobotLegalMoves } from "../../src/games/robot-tactics/movement";
import { createRobotPerformanceDraft, getRobotPerformanceReport } from "../../src/games/robot-tactics/performanceCheck";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { commitWeaponShieldFixtureEnemyAttack, weaponShieldCoreFixture, weaponShieldFixtureProgress } from "../robot-tactics/weaponShieldFixture";
import { createWeaponFixtureRuntime } from "../robot-tactics/weaponFixtureRuntime";
import { fixtureAttack, fixtureCommit, fixtureNextRound } from "../robot-tactics/coreFixture";
const amp = [{ partId: "shield-amplifier" }], unit = getRobotBattleUnit;
const identity = (s: RobotBattleCoreState, actionId = "shield-action") => ({ actionId, turnId: robotBattleTurnId(s) });
const shield = (s: RobotBattleCoreState) => commitRobotBattleShield(s, identity(s));
const shoot = (s: RobotBattleCoreState) => { const next = beginRobotBattleTurn(s, "commander"); return commitWeaponShieldFixtureEnemyAttack(next, identity(next, "enemy-shot")); };

describe("adopted shield action and amplifier", () => {
  it("uses EN45/45% by default and EN60/55% with the amplifier", () => {
    expect(getRobotShieldActionPlan([])).toEqual({ energyCost: 45, damageFactors: [0.55] });
    expect(getRobotShieldActionPlan([], amp)).toEqual({ energyCost: 60, damageFactors: [0.45] });
    expect(getRobotConnectedAddonPlan(amp).unsupported).toEqual([]);
  });
  it("keeps the base/amplifier and interpolated support as separate exact factors", () => {
    const p = getRobotShieldActionPlan([resolveRobotBasicPart("shield-support", 3)], amp);
    expect(p.damageFactors).toEqual([0.45, 0.875]); expect(floorRobotDamageProduct(57, p.damageFactors)).toBe(22);
    expect(getRobotShieldActionPlan([resolveRobotBasicPart("shield-support", 10)], amp).damageFactors).toEqual([0.45, 0.75]);
  });
  for (const amplified of [false, true]) it(`commits one ${amplified ? 60 : 45} EN action, no attack and ordinary end-turn recovery`, () => {
    const s = weaponShieldCoreFixture(amplified), before = unit(s, "p1"), after = shield(s), u = unit(after, "p1"), cost = amplified ? 60 : 45;
    expect(u.energy.en).toBe(before.energy.en - cost + getRobotEnergyRecoveryAmounts(before.energy.maxEn).actionEnd);
    expect(u.energy.action).toEqual({ kind: "other", energyCost: cost }); expect(u.shielded).toBe(true); expect(u.energy.normalHitRecovered).toBe(false);
    expect(u.stats).toEqual(before.stats); expect(after.latest!.damage).toEqual([]); expect(after.attackIds).toEqual(s.attackIds); expect(after.units.filter(u => u.id !== "p1")).toEqual(s.units.filter(u => u.id !== "p1"));
    expect(after.turn.actorId).toBeNull(); expect(after.actionIds).toEqual([...s.actionIds, "shield-action"]);
  });
  it("denies insufficient EN atomically and ignores an injected client cost", () => {
    const base = weaponShieldCoreFixture(), s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 59 } } : u) }), raw = JSON.stringify(s);
    expect(() => commitRobotBattleShield(s, { ...identity(s), energyCost: 0 } as Parameters<typeof commitRobotBattleShield>[1])).toThrow("Insufficient EN"); expect(JSON.stringify(s)).toBe(raw);
  });
  it("allows legal movement before shielding, but cannot move or act again after it", () => {
    let s = weaponShieldCoreFixture(), u = unit(s, "p1");
    const destination = getRobotLegalMoves({ ...u.movement!, board: s.board, origin: u.position!, occupied: s.units.filter(x => x.hp > 0 && x.id !== u.id).map(x => x.position!), structures: [] }).find(m => m.path.length > 0)!.destination;
    s = moveRobotBattleUnit(s, { ...identity(s, "move-before-shield"), unitId: u.id, destination }); const moved = unit(s, u.id); const after = shield(s);
    expect(unit(after, u.id).energy.moved).toBe(true); expect(unit(after, u.id).position).toEqual(destination);
    expect(unit(after, u.id).energy.en).toBe(moved.energy.en - 60 + getRobotEnergyRecoveryAmounts(moved.energy.maxEn).actionEnd);
    expect(() => moveRobotBattleUnit(after, { ...identity(s, "move-after-shield"), unitId: u.id, destination })).toThrow("Stale");
  });
  it("deduplicates the same command and rejects a second action in that completed turn", () => {
    const s = weaponShieldCoreFixture(), input = identity(s), after = commitRobotBattleShield(s, input);
    expect(commitRobotBattleShield(after, input)).toBe(after); expect(() => commitRobotBattleShield(after, { ...input, actionId: "second-shield" })).toThrow("Stale");
  });
  it("survives decode/round changes and clears exactly at the next own-turn start", () => {
    const after = shield(weaponShieldCoreFixture()), raw = JSON.stringify(after); expect(decodeRobotBattleCore(after)).toEqual(after); expect(JSON.stringify(after)).toBe(raw);
    const nextRound = fixtureNextRound(after); expect(unit(nextRound, "p1").shielded).toBe(true);
    const nextOwn = beginRobotBattleTurn(nextRound, "p1"); expect(unit(nextOwn, "p1").shielded).toBeUndefined(); expect(unit(nextOwn, "p1").energy.en).toBe(unit(nextRound, "p1").energy.en);
  });
  it("applies the common shield factors once to a real legal enemy hit", () => {
    for (const amplified of [false, true]) {
      const s = shield(weaponShieldCoreFixture(amplified)), source = unit(s, "commander"), target = unit(s, "p1"), weapon = source.parts.find(p => p.partId === "assault-rifle")!;
      const base = getRobotWeaponDamageEstimate({ weaponId: weapon.partId, weaponLevel: weapon.level, attackStats: source.stats, targetDef: target.stats.def, mode: "normal" }).baseDamage;
      const factors = [amplified ? 0.45 : 0.55, 0.875], expected = Math.max(1, floorRobotDamageProduct(base, factors)), after = shoot(s);
      expect(getRobotBattlePostBaseModifiers(s, source, target)).toEqual(factors); expect(target.hp - unit(after, target.id).hp).toBe(expected); expect(after.latest!.damage[0]!.damage).toBe(expected); expect(unit(after, "p1").shielded).toBe(true);
      expect(unit(after, "p1").energy.action).toEqual(target.energy.action); expect(unit(after, "p1").energy.en).toBe(Math.min(target.energy.maxEn, target.energy.en + 3));
    }
  });
  it("preserves minimum one after shield reduction and gives no damage to shield activation", () => {
    const base = weaponShieldCoreFixture(), s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, stats: { ...u.stats, def: 1000000 } } : u) }), guarded = shield(s), after = shoot(guarded);
    expect(guarded.latest!.damage).toEqual([]); expect(after.latest!.damage[0]!.damage).toBe(1);
  });
  it("does not invent a shield combination with unresolved pair/other active statuses", () => {
    const base = weaponShieldCoreFixture(), s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, statuses: ["pair-defense-unresolved"] } : u) });
    expect(() => shield(s)).toThrow("not yet connected");
    const guarded = shield(base), target = { ...unit(guarded, "p1"), statuses: ["pair-defense-unresolved"] };
    expect(() => getRobotBattlePostBaseModifiers(guarded, unit(guarded, "commander"), target, { postBaseMultipliers: () => [0.8] })).toThrow("not yet connected");
  });
  it("clears shield on defeat and keeps it off after the existing respawn", () => {
    let s = beginRobotBattleTurn(shield(weaponShieldCoreFixture()), "commander"); s = fixtureCommit(s, [fixtureAttack(s, "commander", "p1", 9999)]);
    expect(unit(s, "p1").hp).toBe(0); expect(unit(s, "p1").shielded).toBeUndefined();
    s = fixtureNextRound(fixtureNextRound(s)); expect(unit(s, "p1").hp).toBe(unit(s, "p1").maxHp); expect(unit(s, "p1").shielded).toBeUndefined();
  });
  it("validates shield type, cost and active-turn/death compatibility while preserving old omission", () => {
    const base = weaponShieldCoreFixture(), guarded = shield(base); expect(unit(decodeRobotBattleCore(base), "p1").shielded).toBeUndefined();
    for (const patch of [{ shielded: "yes" }, { shielded: true, hp: 0 }, { shielded: true, energy: { ...unit(guarded, "p1").energy, turnOpen: true } }, { shielded: true, energy: { ...unit(guarded, "p1").energy, action: { kind: "other", energyCost: 0 } } }]) expect(() => decodeRobotBattleCore({ ...guarded, units: guarded.units.map(u => u.id === "p1" ? { ...u, ...patch } : u) })).toThrow();
  });
  it("projects shield to the map/summary without manufacturing an attack effect", () => {
    const s = shield(weaponShieldCoreFixture()), view = projectRobotBattleCore(s, { battleId: s.id, sequence: 1 });
    expect(view.units.find(u => u.id === "p1")!.shielded).toBe(true); expect(view.latestAction!.hits).toEqual([]); expect(view.latestSummary).toContain("EN60");
  });
  it("uses the same shield in the non-destructive sandbox, including an already-active shield at low EN", () => {
    const p = weaponShieldFixtureProgress(), raw = JSON.stringify(p), s = shield(weaponShieldCoreFixture()), source = unit(s, "commander"), w = resolveRobotBasicPart("assault-rifle", source.parts.find(p => p.partId === "assault-rifle")!.level), draft = createRobotPerformanceDraft(p);
    const report = getRobotPerformanceReport(p, { ...draft, ownShield: true, currentEn: 0, enemy: { ...draft.enemy, melee: source.stats.melee, ranged: source.stats.ranged, weaponPower: w.weaponPower!, family: "assault" } });
    expect(report.shield?.energyCost).toBe(60); expect(report.received!.totalDamage).toBe(shoot(s).latest!.damage[0]!.damage); expect(JSON.stringify(p)).toBe(raw);
    expect(getRobotPerformanceReport(p, draft).dealt).toEqual(getRobotPerformanceReport(p, { ...draft, party: draft.party.map(c => ({ ...c, addons: [] })) }).dealt);
  });
});

class Storage implements RobotOfflineStorage {
  raw = JSON.stringify({ ...createRobotOfflineSave(), progress: weaponShieldFixtureProgress() }); fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale"); this.raw = next; }
}
async function setup() { let id = 0; const storage = new Storage(), runtime = createWeaponFixtureRuntime("shield"), session = new RobotOfflineSession(storage, runtime, () => "shield-save-" + ++id); await session.load(); await session.start({ missionNumber: 2, difficulty: "normal" }); return { storage, runtime, session }; }
describe("shield durable checkpoint smoke", () => {
  it("publishes shield/EN only after a successful save, resumes once and saves the real enemy hit separately", async () => {
    const { session, storage, runtime } = await setup(), before = session.state, raw = storage.raw;
    const request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-shield", action: { kind: "shield" } };
    storage.fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
    storage.fail = false; await session.act(request); const saved = session.state; expect(unit(decodeRobotBattleCore(saved.battle!.snapshot), "p1").shielded).toBe(true);
    const resumed = new RobotOfflineSession(storage, runtime, () => "unused"); await resumed.load(); await resumed.act(request); expect(resumed.state).toEqual(saved);
    await resumed.act({ ...request, expectedSequence: 1, actionId: "one-enemy-shot", action: { kind: "shield-fixture-attack" } }); const after = resumed.state;
    expect(after.battle!.sequence).toBe(2); expect(after.progress).toEqual(before.progress); expect(unit(decodeRobotBattleCore(after.battle!.snapshot), "p1").hp).toBeLessThan(150);
  });
  it("retry clears the stance and restores departure; corrupted cost is rejected without erasing bytes", async () => {
    const { session, storage, runtime } = await setup(); await session.act({ battleId: session.state.battle!.departure.battleId, expectedSequence: 0, actionId: "shield", action: { kind: "shield" } }); const goodRaw = storage.raw, data = JSON.parse(storage.raw);
    data.battle.snapshot.units.find((u: { id: string }) => u.id === "p1").energy.action.energyCost = 0; storage.raw = JSON.stringify(data); const raw = storage.raw;
    await expect(new RobotOfflineSession(storage, runtime, () => "unused").load()).rejects.toThrow("Shield cost"); expect(storage.raw).toBe(raw);
    storage.raw = goodRaw; await session.retry(true); expect(unit(decodeRobotBattleCore(session.state.battle!.snapshot), "p1").shielded).toBeUndefined(); expect(session.state.battle!.sequence).toBe(0);
  });
});
