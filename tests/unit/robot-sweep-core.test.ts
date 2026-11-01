import { describe, expect, it } from "vitest";
import { getRobotSweepBands, getRobotSweepPlan, getRobotSweepTargetSets, isRobotSweepSelection } from "../../src/games/robot-tactics/sweep";
import { commitRobotBattleSlashAttack, commitRobotBattleWeaponCombo, getRobotBattleSweepOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { decodeRobotBattleCore, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { createRobotPerformanceDraft, getRobotPerformanceReport } from "../../src/games/robot-tactics/performanceCheck";
import { RobotOfflineSession, createRobotOfflineSave, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { createWeaponFixtureRuntime } from "../robot-tactics/weaponFixtureRuntime";
import { weaponCoreFixture, weaponTargetIds } from "../robot-tactics/weaponCoreFixture";
import { weaponSweepCoreFixture, weaponSweepFixtureProgress } from "../robot-tactics/weaponSweepFixture";
const amp = [{ partId: "sweep-target-expander" }], unit = getRobotBattleUnit;
const identity = (s: ReturnType<typeof weaponSweepCoreFixture>, actionId = "sweep-action") => ({ actionId, turnId: robotBattleTurnId(s) });
const sweep = (s: ReturnType<typeof weaponSweepCoreFixture>, targetIds = weaponTargetIds(s), weaponId = "double-edged-sword") => commitRobotBattleSlashAttack(s, { ...identity(s), kind: "sweep", weaponId, targetIds });

describe("orthogonal sweep bands and direct target sets", () => {
  const origin = { x: 8, y: 8 }, targets = [-1, 0, 1].flatMap(dy => [-1, 0, 1].filter(dx => dx || dy).map(dx => ({ id: `${dx}:${dy}`, position: { x: origin.x + dx, y: origin.y + dy } })));
  it("creates four three-cell bands covering exactly the eight neighbors", () => {
    const bands = getRobotSweepBands(origin); expect(bands).toHaveLength(4); expect(bands.every(b => b.length === 3)).toBe(true);
    expect(new Set(bands.flat().map(p => `${p.x},${p.y}`)).size).toBe(8); expect(bands.flat()).not.toContainEqual(origin);
    expect(isRobotSweepSelection(origin, [{ x: 7, y: 7 }, { x: 9, y: 7 }])).toBe(true);
    expect(isRobotSweepSelection(origin, [{ x: 8, y: 7 }, { x: 8, y: 9 }])).toBe(false);
    expect(isRobotSweepSelection(origin, [])).toBe(false); expect(isRobotSweepSelection(origin, [targets[0]!.position, targets[0]!.position])).toBe(false);
  });
  it("matches an independent line predicate for all 255 nonempty adjacent subsets", () => {
    const before = JSON.stringify(targets);
    for (const cap of [1, 2, 3, 4]) {
      const choices = new Set(getRobotSweepTargetSets(origin, targets, cap).map(ids => JSON.stringify([...ids].sort())));
      for (let mask = 1; mask < 256; mask++) {
        const selected = targets.filter((_, i) => mask & (1 << i)), positions = selected.map(t => t.position);
        const inBand = [-1, 1].some(d => positions.every(p => p.x === origin.x + d) || positions.every(p => p.y === origin.y + d));
        expect(isRobotSweepSelection(origin, positions)).toBe(inBand);
        const selectedKey = JSON.stringify(selected.map(t => t.id).sort());
        expect(choices.has(selectedKey)).toBe(inBand && selected.length <= cap);
      }
    }
    expect(JSON.stringify(targets)).toBe(before);
  });
  it("deduplicates corner choices and never invents a fourth cell when cap becomes four", () => {
    expect(getRobotSweepTargetSets(origin, targets, 2)).toHaveLength(20); expect(getRobotSweepTargetSets(origin, targets, 3)).toHaveLength(24); expect(getRobotSweepTargetSets(origin, targets, 4)).toHaveLength(24);
    expect(getRobotSweepTargetSets(origin, [], 3)).toEqual([]);
    for (const cap of [0, -1, 1.5]) expect(() => getRobotSweepTargetSets(origin, targets, cap)).toThrow();
    expect(() => getRobotSweepTargetSets(origin, [targets[0]!, targets[0]!], 3)).toThrow("Distinct"); expect(() => getRobotSweepBands({ x: NaN, y: 1 })).toThrow();
  });
  it("reads 2/3 base caps and the adopted +1/EN15 without changing geometry", () => {
    expect(getRobotSweepPlan({ partId: "double-edged-sword", level: 1 })).toEqual({ baseTargetCap: 2, targetCap: 2, energyCost: 0 });
    expect(getRobotSweepPlan({ partId: "double-edged-sword", level: 10 }, amp)).toEqual({ baseTargetCap: 2, targetCap: 3, energyCost: 15 });
    expect(getRobotSweepPlan({ partId: "whirlwind-saber", level: 1 }, amp)).toEqual({ baseTargetCap: 3, targetCap: 4, energyCost: 15 });
    expect(() => getRobotSweepPlan({ partId: "assault-rifle", level: 1 }, amp)).toThrow("slash");
  });
});

describe("common sweep command legality, damage, EN and recoil", () => {
  it("rejects three targets without the addon and commits the same band with it", () => {
    const plain = weaponSweepCoreFixture(false), raw = JSON.stringify(plain); expect(() => sweep(plain)).toThrow("cap"); expect(JSON.stringify(plain)).toBe(raw);
    const s = weaponSweepCoreFixture(), after = sweep(s); expect(after.latest!.damage.filter(d => d.sourceId !== d.targetId)).toHaveLength(3);
    expect(unit(after, "p1").energy.action).toEqual({ kind: "normal-attack", energyCost: 15 }); expect(after.actionIds).toEqual([...s.actionIds, "sweep-action"]);
  });
  it("requires one common band even when both enemies are individually in range", () => {
    const initial = weaponSweepCoreFixture(), ids = weaponTargetIds(initial).slice(0, 2), p = weaponSweepFixtureProgress();
    const s = weaponCoreFixture({ progress: p, targetIds: ids, offsets: [{ x: 0, y: -1 }, { x: 0, y: 1 }] }), before = JSON.stringify(s);
    expect(() => sweep(s, ids)).toThrow("同じ直交3マス帯"); expect(JSON.stringify(s)).toBe(before);
    expect(getRobotBattleSweepOptions(s, "double-edged-sword").targetSets.every(set => !ids.every(id => set.includes(id)))).toBe(true);
  });
  it("projects exactly the same executable target combinations and remains a read-only preview", () => {
    const s = weaponSweepCoreFixture(), before = JSON.stringify(s), choices = getRobotBattleSweepOptions(s, "double-edged-sword");
    expect(choices.plan).toMatchObject({ targetCap: 3, energyCost: 15 }); expect(choices.targetSets.some(ids => ids.length === 3)).toBe(true);
    for (const ids of choices.targetSets) expect(sweep(s, ids).actionIds).toHaveLength(s.actionIds.length + 1);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("changes only cap/cost, not the per-target 70% damage or the 20% recoil", () => {
    const plain = weaponSweepCoreFixture(false), expanded = weaponSweepCoreFixture(), ids = weaponTargetIds(plain).slice(0, 2), a = sweep(plain, ids), b = sweep(expanded, ids);
    expect(b.latest!.damage).toEqual(a.latest!.damage); expect(unit(a, "p1").hp).toBe(unit(b, "p1").hp);
    const amounts = getRobotEnergyRecoveryAmounts(unit(plain, "p1").energy.maxEn);
    expect(unit(a, "p1").energy.normalHitRecovered).toBe(true); expect(unit(b, "p1").energy.normalHitRecovered).toBe(false);
    expect(unit(a, "p1").energy.en - unit(b, "p1").energy.en).toBe(15 + amounts.normalHit);
  });
  it("charges EN15 once for one or three targets, denies EN14 and deduplicates replay", () => {
    const initial = weaponSweepCoreFixture();
    for (const count of [1, 3]) {
      const s = decodeRobotBattleCore({ ...initial, units: initial.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 15 } } : u) });
      const ids = weaponTargetIds(s).slice(0, count), after = sweep(s, ids); expect(unit(after, "p1").energy.action!.energyCost).toBe(15);
      expect(sweep(after, ids)).toBe(after);
    }
    const poor = decodeRobotBattleCore({ ...initial, units: initial.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 14 } } : u) }), raw = JSON.stringify(poor);
    expect(getRobotBattleSweepOptions(poor, "double-edged-sword").targetSets).toEqual([]); expect(() => sweep(poor)).toThrow("Insufficient EN"); expect(JSON.stringify(poor)).toBe(raw);
  });
  it("still refuses duplicate/friendly/out-of-range targets without any partial action", () => {
    const s = weaponSweepCoreFixture(), id = weaponTargetIds(s)[0]!, raw = JSON.stringify(s);
    expect(() => sweep(s, [id, id])).toThrow("Distinct"); expect(() => sweep(s, ["p2"])).toThrow("hostile");
    const far = weaponCoreFixture({ progress: weaponSweepFixtureProgress(), targetIds: [id], offsets: [{ x: 0, y: -2 }] }); expect(() => sweep(far, [id])).toThrow("射程外");
    expect(JSON.stringify(s)).toBe(raw);
  });
  it("keeps minimum one per legal target, caps recoil by actual HP and permits recoil defeat", () => {
    const initial = weaponSweepCoreFixture(), ids = weaponTargetIds(initial);
    const s = decodeRobotBattleCore({ ...initial, units: initial.units.map(u => ids.includes(u.id) ? { ...u, hp: 7 } : u.id === "p1" ? { ...u, hp: 1 } : u) });
    const after = sweep(s), actual = ids.reduce((sum, id) => sum + unit(s, id).hp - unit(after, id).hp, 0);
    expect(actual).toBe(21); expect(after.latest!.damage.find(d => d.effectKind === "special:sword-recoil")!.damage).toBe(4); expect(unit(after, "p1").hp).toBe(0);
    const minimum = commitRobotBattleSlashAttack(initial, { ...identity(initial), weaponId: "double-edged-sword", kind: "sweep", targetIds: ids }, { postBaseMultipliers: () => [0] });
    expect(minimum.latest!.damage.map(d => d.damage)).toEqual([1, 1, 1]); expect(unit(minimum, "p1").hp).toBe(unit(initial, "p1").hp);
  });
  it("does not grant normal-hit +8 for EN-consuming expanded sweep", () => {
    const p = weaponSweepFixtureProgress(), extra = { ...p, party: p.party.map((c, i) => i ? c : { ...c, addons: [...c.addons, { partId: "combat-recovery-circuit" }] }) };
    const s = weaponCoreFixture({ progress: extra, sourceHp: 150, fillSourceEn: false }), baseline = weaponSweepCoreFixture();
    expect(unit(sweep(s), "p1").energy.en).toBe(unit(sweep(baseline), "p1").energy.en);
  });
  it("does not add sweep targets or EN15 to normal single attacks or combos", () => {
    const s = weaponSweepCoreFixture(), id = weaponTargetIds(s)[0]!;
    const normal = commitRobotBattleSlashAttack(s, { ...identity(s), weaponId: "double-edged-sword", kind: "normal", targetIds: [id] }); expect(unit(normal, "p1").energy.action!.energyCost).toBe(0);
    const ready = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 50 } } : u) });
    const combo = commitRobotBattleWeaponCombo(ready, { ...identity(ready), primaryWeaponId: "double-edged-sword", secondaryWeaponId: "light-lance", targetIds: [id] }); expect(unit(combo, "p1").energy.action!.energyCost).toBe(50);
    expect(combo.latest!.damage.filter(d => d.targetId !== "p1").every(d => d.targetId === id)).toBe(true);
  });
  it("uses the same cost, hits and recoil in the isolated performance check", () => {
    const p = weaponSweepFixtureProgress(), raw = JSON.stringify(p), s = weaponSweepCoreFixture(), ids = weaponTargetIds(s), target = unit(s, ids[0]!);
    const d = createRobotPerformanceDraft(p), report = getRobotPerformanceReport(p, { ...d, attack: "sweep", targetCount: 3, enemy: { ...d.enemy, hp: target.hp, def: target.stats.def } }), after = sweep(s);
    expect(report.dealt!.requiredEn).toBe(15); expect(report.dealt!.hits.map(h => h.damage)).toEqual(after.latest!.damage.filter(d => d.targetId !== "p1").map(d => d.damage)); expect(report.dealt!.recoil).toBe(after.latest!.damage.find(d => d.targetId === "p1")!.damage);
    const poor = getRobotPerformanceReport(p, { ...d, attack: "sweep", targetCount: 3, currentEn: 14 }); expect(poor.dealt).toMatchObject({ totalDamage: 0, recoil: 0, reason: "EN不足" }); expect(JSON.stringify(p)).toBe(raw);
  });
});

class Storage implements RobotOfflineStorage {
  raw = JSON.stringify({ ...createRobotOfflineSave(), progress: weaponSweepFixtureProgress() }); fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale"); this.raw = next; }
}
async function setup() { let id = 0; const storage = new Storage(), runtime = createWeaponFixtureRuntime("sweep-expanded"), session = new RobotOfflineSession(storage, runtime, () => "sweep-save-" + ++id); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" }); return { session, storage, runtime }; }
describe("expanded sweep checkpoint smoke", () => {
  it("rejects forged targets, then persists all hits/EN/recoil once across failed save, retry and resume", async () => {
    const { session, storage, runtime } = await setup(), before = session.state, raw = storage.raw, core = decodeRobotBattleCore(before.battle!.snapshot), ids = weaponTargetIds(core);
    const request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-sweep", action: { kind: "sweep", targetIds: [...ids], energyCost: 0 } };
    await expect(session.act({ ...request, action: { kind: "sweep", targetIds: [ids[0]!, "p2"], energyCost: 0 } })).rejects.toThrow("hostile"); expect(storage.raw).toBe(raw);
    storage.fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
    storage.fail = false; await session.act(request); const after = session.state, result = decodeRobotBattleCore(after.battle!.snapshot); expect(after.battle!.sequence).toBe(1); expect(result.latest!.damage).toHaveLength(4); expect(unit(result, "p1").energy.action!.energyCost).toBe(15);
    const resumed = new RobotOfflineSession(storage, runtime, () => "unused"); await resumed.load(); await resumed.act(request); expect(resumed.state).toEqual(after); expect(after.progress).toEqual(before.progress);
  });
  it("retry restores the same gear/target arrangement without retaining prior damage or paying EN again", async () => {
    const { session } = await setup(), before = session.state, s = decodeRobotBattleCore(before.battle!.snapshot);
    await session.act({ battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "sweep", action: { kind: "sweep", targetIds: [...weaponTargetIds(s)] } }); await session.retry(true);
    const after = decodeRobotBattleCore(session.state.battle!.snapshot); expect(after.units).toEqual(s.units); expect(session.state.battle!.departure.party).toEqual(before.battle!.departure.party); expect(session.state.battle!.sequence).toBe(0);
  });
});
