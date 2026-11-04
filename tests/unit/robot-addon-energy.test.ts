import { describe, expect, it } from "vitest";
import { createRobotAddonEnergyState, endRobotAddonEnergyTurn, getRobotAddonEnergyPlan, recordRobotAddonNormalHit } from "../../src/games/robot-tactics/addonEnergy";
import { beginRobotEnergyTurn, commitRobotEnergyAction, getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { beginRobotBattleTurn, commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { commitRobotBattleSlashAttack, commitRobotBattleWeaponCombo } from "../../src/games/robot-tactics/battleWeaponActions";
import { createRobotPerformanceDraft, getRobotPerformanceReport } from "../../src/games/robot-tactics/performanceCheck";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import type { RobotAddonSelection } from "../../src/games/robot-tactics/equipment";
import { createWeaponFixtureRuntime } from "../robot-tactics/weaponFixtureRuntime";
import { weaponCoreFixture, weaponEnergyFixtureProgress, weaponFixtureProgress, weaponTargetIds } from "../robot-tactics/weaponCoreFixture";
import { fixtureAttack, fixtureCommit, fixtureNextRound } from "../robot-tactics/coreFixture";
import group from "../../docs/design/robot-tactics/current-group-combat.json";
const addons = [{ partId: "opening-capacitor" }, { partId: "fast-charge" }, { partId: "combat-recovery-circuit" }];
const unit = getRobotBattleUnit;
const identity = (s: ReturnType<typeof weaponCoreFixture>, actionId = "addon-action") => ({ actionId, turnId: robotBattleTurnId(s) });
function progress(weapons: readonly [string, string] = ["light-blade", "light-lance"]) {
  const p = weaponEnergyFixtureProgress();
  return { ...p, party: p.party.map((c, i) => i ? c : { ...c, basic: { ...c.basic, weapon1: { partId: weapons[0], level: 1 }, weapon2: { partId: weapons[1], level: 1 } } }) };
}
const passive = (kind: "charge" | "other", en = 0) => commitRobotEnergyAction({ ...beginRobotEnergyTurn(createRobotAddonEnergyState(200, addons)), en }, { kind, energyCost: 0 });

describe("adopted EN addons use the common ledger", () => {
  it("reads the exact 25/15/8 effects, accepts movement choices and reports pending effects", () => {
    expect(getRobotAddonEnergyPlan(addons)).toEqual({ startingBonus: 25, chargeExtra: 15, normalHitExtra: 8, unsupported: [] });
    expect(getRobotAddonEnergyPlan([{ partId: "movement-type-add", movementType: "diagonal" }]).unsupported).toEqual([]);
    expect(getRobotAddonEnergyPlan([{ partId: "proximity-mine" }]).unsupported).toEqual(["感応地雷"]);
  });
  it("adds opening EN after the existing ceil and caps at max, including small and zero maxima", () => {
    expect(createRobotAddonEnergyState(101, addons).en).toBe(56);
    expect(createRobotAddonEnergyState(20, addons).en).toBe(20);
    expect(createRobotAddonEnergyState(0, addons).en).toBe(0);
    expect(createRobotAddonEnergyState(101, []).en).toBe(31);
  });
  it("adds fast charge only to charge, after ordinary charge and action-end recovery", () => {
    expect(endRobotAddonEnergyTurn(passive("charge"), addons).en).toBe(54); // charge30 + end9 + addon15
    expect(endRobotAddonEnergyTurn(passive("other"), addons).en).toBe(9);
    const closed = endRobotAddonEnergyTurn(passive("charge"), addons);
    expect(() => endRobotAddonEnergyTurn(closed, addons)).toThrow("open own turn");
  });
  it("extends one normal-hit recovery by 8, never one per target/hit", () => {
    const action = commitRobotEnergyAction({ ...beginRobotEnergyTurn(createRobotAddonEnergyState(200, addons)), en: 0 }, { kind: "normal-attack", energyCost: 0 });
    const hit = recordRobotAddonNormalHit(action, addons);
    expect(hit.en).toBe(19); expect(hit.normalHitRecovered).toBe(true);
    expect(recordRobotAddonNormalHit(hit, addons)).toEqual(hit);
  });
  it("does not enable normal-hit recovery for EN-cost attacks or combo/formation actions", () => {
    for (const action of [{ kind: "normal-attack" as const, energyCost: 12 }, { kind: "other" as const, energyCost: 50 }]) {
      const state = commitRobotEnergyAction({ ...beginRobotEnergyTurn(createRobotAddonEnergyState(200, addons)), en: 80 }, action);
      expect(recordRobotAddonNormalHit(state, addons)).toEqual(state);
    }
  });
  it("caps both extra recoveries without modifying max EN or the event allowance", () => {
    expect(endRobotAddonEnergyTurn(passive("charge", 199), addons)).toMatchObject({ en: 200, maxEn: 200 });
    const state = commitRobotEnergyAction({ ...beginRobotEnergyTurn(createRobotAddonEnergyState(200, addons)), en: 199 }, { kind: "normal-attack", energyCost: 0 });
    expect(recordRobotAddonNormalHit(state, addons)).toMatchObject({ en: 200, normalHitRecovered: true });
  });
  it("rejects malformed/duplicate/leveled choices and refuses to ignore an unsupported effect", () => {
    for (const choices of [null, [null], [{ partId: "unknown" }], [addons[0], addons[0]], [{ partId: "fast-charge", level: 2 }], [{ partId: "fast-charge", movementType: "omni" }], [{ partId: "movement-type-add" }]]) expect(() => createRobotAddonEnergyState(200, choices as unknown as RobotAddonSelection[])).toThrow();
    expect(() => createRobotAddonEnergyState(200, [{ partId: "proximity-mine" }])).toThrow("未接続");
  });
});

describe("real battle actions retain addon identity and recover once", () => {
  it("preserves opening EN exactly across decoding and leaves old omitted-addon snapshots intact", () => {
    const s = weaponCoreFixture({ progress: progress(), fillSourceEn: false });
    expect(unit(s, "p1").energy.en).toBe(Math.min(unit(s, "p1").energy.maxEn, Math.ceil(unit(s, "p1").energy.maxEn * 0.3) + 25));
    expect(unit(s, "p1").addons).toEqual(addons); expect(decodeRobotBattleCore(s)).toEqual(s);
    expect(() => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, addons: [{ partId: "proximity-mine" }] } : u) })).toThrow("未接続");
    expect(() => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.boss ? { ...u, addons: [{ partId: "fast-charge" }] } : u) })).toThrow("Boss addons");
    const old = weaponCoreFixture({ progress: weaponFixtureProgress() }); expect(unit(old, "p1").addons).toBeUndefined(); expect(decodeRobotBattleCore(old)).toEqual(old);
  });
  it("recovers the normal-hit bonus once for a three-target sweep and keeps damage unchanged", () => {
    const p = progress(["whirlwind-saber", "light-lance"]), base = weaponCoreFixture({ progress: p });
    const s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 20 } } : u) });
    const input = { ...identity(s), weaponId: "whirlwind-saber", kind: "sweep" as const, targetIds: weaponTargetIds(s) };
    const after = commitRobotBattleSlashAttack(s, input), amounts = getRobotEnergyRecoveryAmounts(unit(s, "p1").energy.maxEn);
    expect(unit(after, "p1").energy.en).toBe(20 + amounts.normalHit + 8 + amounts.actionEnd);
    const noAddon = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, addons: [] } : u) });
    const ordinary = commitRobotBattleSlashAttack(noAddon, input);
    expect(after.latest!.damage).toEqual(ordinary.latest!.damage); expect(unit(after, "p1").energy.en - unit(ordinary, "p1").energy.en).toBe(8);
    expect(commitRobotBattleSlashAttack(after, input)).toBe(after);
  });
  it("uses only the adopted combo EN and ordinary action-end recovery", () => {
    const base = weaponCoreFixture({ progress: progress(), targetIds: ["enemy-supreme-commander"], offsets: [{ x: -1, y: 0 }] });
    const s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 80 } } : u) });
    const after = commitRobotBattleWeaponCombo(s, { ...identity(s), primaryWeaponId: "light-blade", secondaryWeaponId: "light-lance", targetIds: ["enemy-supreme-commander"] });
    expect(unit(after, "p1").energy.en).toBe(80 - 50 + getRobotEnergyRecoveryAmounts(unit(s, "p1").energy.maxEn).actionEnd);
    expect(unit(after, "p1").energy.normalHitRecovered).toBe(false);
  });
  it("leaves out-of-range attacks without any EN recovery or state mutation", () => {
    const s = weaponCoreFixture({ progress: progress(), targetIds: ["enemy-supreme-commander"], offsets: [{ x: -3, y: 0 }] }), raw = JSON.stringify(s);
    expect(() => commitRobotBattleSlashAttack(s, { ...identity(s), weaponId: "light-blade", kind: "normal", targetIds: ["enemy-supreme-commander"] })).toThrow("射程外"); expect(JSON.stringify(s)).toBe(raw);
  });
  it("charges through the common turn close and never re-adds opening EN after a respawn", () => {
    let s = weaponCoreFixture({ progress: progress(), fillSourceEn: false, openTurn: false });
    s = beginRobotBattleTurn(s, "p2"); const before = unit(s, "p2").energy, amounts = getRobotEnergyRecoveryAmounts(before.maxEn);
    s = commitRobotBattlePassive(s, { ...identity(s), kind: "charge" }); expect(unit(s, "p2").energy.en).toBe(Math.min(before.maxEn, before.en + amounts.charge + amounts.actionEnd + 15));
    s = beginRobotBattleTurn(s, "enemy-supreme-commander"); s = fixtureCommit(s, [fixtureAttack(s, "enemy-supreme-commander", "p1", 9999)]);
    s = fixtureNextRound(fixtureNextRound(s)); const returned = unit(s, "p1");
    expect(returned.hp).toBe(returned.maxHp); expect(returned.addons).toEqual(addons);
    expect(returned.energy.en).toBe(Math.ceil(returned.energy.maxEn * group.defeatAndRespawn.alliedRespawn.enFractionCeil));
  });
  it("stacks fast charge with existing stationary basic recovery, without bypassing its movement condition", () => {
    const p = progress(), withStorage = { ...p, party: p.party.map((c, i) => i ? c : { ...c, basic: { ...c.basic, special: { partId: "storage-support", level: 1 } } }) };
    const base = weaponCoreFixture({ progress: withStorage });
    for (const moved of [false, true]) {
      const s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 0, moved } } : u) });
      const after = commitRobotBattlePassive(s, { ...identity(s), kind: "charge" }), amounts = getRobotEnergyRecoveryAmounts(unit(s, "p1").energy.maxEn);
      expect(unit(after, "p1").energy.en).toBe(amounts.charge + amounts.actionEnd + 15 + (moved ? 0 : 7));
    }
  });
  it("keeps EN-only/movement addons in the non-destructive damage sandbox and names unsupported effects", () => {
    const p = progress(), raw = JSON.stringify(p), d = createRobotPerformanceDraft(p), a = getRobotPerformanceReport(p, d);
    const b = getRobotPerformanceReport(p, { ...d, party: d.party.map(c => ({ ...c, addons: [] })) });
    expect(a.unsupported).toEqual([]); expect(a.dealt).toEqual(b.dealt); expect(a.received).toEqual(b.received); expect(JSON.stringify(p)).toBe(raw);
    const moving = getRobotPerformanceReport(p, { ...d, party: d.party.map((c, i) => i ? c : { ...c, addons: [...c.addons, { partId: "movement-type-add", movementType: "diagonal" as const }] }) });
    expect(moving.unsupported).toEqual([]); expect(moving.dealt).toEqual(a.dealt);
    const pending = getRobotPerformanceReport(p, { ...d, party: d.party.map((c, i) => i ? c : { ...c, addons: [{ partId: "proximity-mine" }] }) }); expect(pending.dealt).toBeNull(); expect(pending.unsupported.join()).toContain("感応地雷");
  });
});

class Storage implements RobotOfflineStorage {
  raw = JSON.stringify({ ...createRobotOfflineSave(), progress: weaponEnergyFixtureProgress() }); fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale"); this.raw = next; }
}
async function setup() { let id = 0; const storage = new Storage(), runtime = createWeaponFixtureRuntime("addon-energy"), session = new RobotOfflineSession(storage, runtime, () => "addon-energy-save-" + ++id); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" }); return { session, storage, runtime }; }
describe("EN addon checkpoint smoke", () => {
  it("retries one complete attack recovery, resumes without opening bonus and ignores duplicate delivery", async () => {
    const { session, storage, runtime } = await setup(), before = session.state, raw = storage.raw;
    const request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-normal-hit", action: { kind: "normal" } };
    storage.fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
    storage.fail = false; await session.act(request); const saved = session.state;
    const resumed = new RobotOfflineSession(storage, runtime, () => "unused"); await resumed.load(); await resumed.act(request); expect(resumed.state).toEqual(saved);
    const core = decodeRobotBattleCore(saved.battle!.snapshot), prior = decodeRobotBattleCore(before.battle!.snapshot), amount = getRobotEnergyRecoveryAmounts(unit(prior, "p1").energy.maxEn);
    expect(unit(core, "p1").energy.en).toBe(unit(prior, "p1").energy.en + amount.normalHit + 8 + amount.actionEnd);
    expect(saved.progress).toEqual(before.progress); expect(saved.battle!.sequence).toBe(1);
  });
  it("binds saved addons to departure and preserves rejected bytes, while retry constructs opening EN once", async () => {
    const { session, storage, runtime } = await setup(), before = session.state;
    await session.retry(true); expect(unit(decodeRobotBattleCore(session.state.battle!.snapshot), "p1").energy.en).toBe(unit(decodeRobotBattleCore(before.battle!.snapshot), "p1").energy.en);
    const bad = JSON.parse(storage.raw); bad.battle.snapshot.units.find((u: { id: string }) => u.id === "p1").addons = []; storage.raw = JSON.stringify(bad); const raw = storage.raw;
    await expect(new RobotOfflineSession(storage, runtime, () => "unused").load()).rejects.toThrow("equipment mismatch"); expect(storage.raw).toBe(raw);
  });
});
