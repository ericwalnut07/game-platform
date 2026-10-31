import { describe, expect, it } from "vitest";
import { applyRobotCustomization, previewRobotCustomization, type RobotCustomizationChange } from "../../src/games/robot-tactics/customization";
import { applyRobotOfflineOutcome, applyRobotSharedPartLevels, createRobotOfflineProgress, getRobotOfflineAvailability, validateRobotOfflineProgress, type RobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotOfflineSave, decodeRobotOfflineSave, RobotOfflineSession, type RobotOfflineSave, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { getRobotLoadoutPlan } from "../../src/games/robot-tactics/equipment";
import { getRobotPartUpgradeExp } from "../../src/games/robot-tactics/growth";
import { createRobotPerformanceDraft, getRobotPerformanceReport, setRobotPerformancePart } from "../../src/games/robot-tactics/performanceCheck";
import { offlineFixtureRuntime as runtime } from "../robot-tactics/offlineFixtureRuntime";
const key = { missionNumber: 1, difficulty: "easy" as const };
const upgrade = { kind: "part-upgrade", coreId: "core-a", partId: "light-blade" } as const;
const equip = (coreId: "core-a" | "core-b" | "core-c", partId: string) => ({ kind: "part-equip" as const, coreId, slot: "weapon1" as const, partId });
function funded(exp = 1000) { return { ...createRobotOfflineProgress(), exp }; }
function atLevel(id: string, level: number, coreLevels = [41, 41, 41]): RobotOfflineProgress {
  const p = funded(20000), partLevels = { ...p.partLevels, [id]: level };
  return validateRobotOfflineProgress({ ...p, partLevels, party: applyRobotSharedPartLevels(p.party.map((c, i) => ({ ...c, coreLevel: coreLevels[i]! })), partLevels) });
}
function legacyRaw(save: RobotOfflineSave): string {
  const data = JSON.parse(JSON.stringify(save)); data.version = 1; delete data.progress.partLevels; return JSON.stringify(data);
}
class MemoryStorage implements RobotOfflineStorage {
  raw: string | null; fail = false;
  constructor(save: string | null = null) { this.raw = save; }
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale-write"); this.raw = next; }
}
async function setup(raw = JSON.stringify({ ...createRobotOfflineSave(), progress: funded() })) {
  const storage = new MemoryStorage(raw); let id = 0;
  const session = new RobotOfflineSession(storage, runtime, () => "shared-battle-" + ++id); await session.load();
  return { session, storage };
}
async function change(session: RobotOfflineSession, change: RobotCustomizationChange) { return session.customize({ expectedRevision: session.state.revision, change }); }

describe("adopted basic-part ID levels shared by the controlled cores", () => {
  it("initializes exactly the owned IDs at Lv1 and validates materialized equipment", () => {
    const p = createRobotOfflineProgress(); expect(Object.keys(p.partLevels).sort()).toEqual([...getRobotOfflineAvailability(p).basicParts].sort());
    expect(Object.values(p.partLevels).every(l => l === 1)).toBe(true); expect(validateRobotOfflineProgress(p)).toEqual(p);
  });
  it("charges one upgrade and updates all three equipped projections and abilities", () => {
    const p = funded(80), before = JSON.stringify(p), plans = p.party.map(c => getRobotLoadoutPlan(c, getRobotOfflineAvailability(p)));
    const preview = previewRobotCustomization(p, upgrade), next = applyRobotCustomization(p, upgrade);
    expect(preview).toMatchObject({ expCost: 80, canApply: true }); expect(next.exp).toBe(0); expect(next.partLevels["light-blade"]).toBe(2);
    expect(next.party.map(c => c.basic.weapon1.level)).toEqual([2, 2, 2]);
    const after = next.party.map(c => getRobotLoadoutPlan(c, getRobotOfflineAvailability(next)));
    expect(after.map((a, i) => a.baseStatsBeforeAddons.spd! - plans[i]!.baseStatsBeforeAddons.spd!)).toEqual([1, 1, 1]);
    expect(next.party.map(c => c.basic.weapon2)).toEqual(p.party.map(c => c.basic.weapon2)); expect(JSON.stringify(p)).toBe(before);
  });
  it("retains unequipped levels, permits training an unequipped part, and reequips its stored level", () => {
    let p = applyRobotCustomization(funded(), upgrade);
    for (const coreId of ["core-a", "core-b", "core-c"] as const) p = applyRobotCustomization(p, equip(coreId, "standard-sword"));
    expect(p.partLevels["light-blade"]).toBe(2); const beforeParty = p.party, beforeExp = p.exp;
    p = applyRobotCustomization(p, upgrade); expect(p.party).toEqual(beforeParty); expect(p.partLevels["light-blade"]).toBe(3);
    expect(p.exp).toBe(beforeExp - 120); expect(p.partLevels["standard-sword"]).toBe(1);
    p = applyRobotCustomization(p, equip("core-b", "light-blade")); expect(p.party[1]!.basic.weapon1).toEqual({ partId: "light-blade", level: 3 });
  });
  for (const partId of ["standard-engine", "standard-armor", "standard-control", "general-support"]) it("shares non-weapon growth: " + partId, () => {
    const p = applyRobotCustomization(funded(), { ...upgrade, partId });
    expect(p.partLevels[partId]).toBe(2);
    expect(p.party.flatMap(c => Object.values(c.basic).filter(p => p.partId === partId).map(p => p.level))).toEqual([2, 2, 2]);
    expect(p.exp).toBe(920);
  });
  it("uses the adopted 9 costs exactly and stops at Lv10", () => {
    let p = atLevel("light-blade", 1), beforeExp = p.exp;
    for (let lv = 1; lv < 10; lv++) {
      expect(previewRobotCustomization(p, upgrade).expCost).toBe(getRobotPartUpgradeExp(lv, lv + 1)); p = applyRobotCustomization(p, upgrade);
    }
    expect(beforeExp - p.exp).toBe(2450); expect(p.party.map(c => c.basic.weapon1.level)).toEqual([10, 10, 10]);
    expect(previewRobotCustomization(p, upgrade)).toMatchObject({ canApply: false, expCost: 0, reasons: ["最大Lvです。"] });
    expect(() => applyRobotCustomization(p, upgrade)).toThrow("最大Lv");
  });
  it("checks CAP on another equipped core, then allows training after that core unequips", () => {
    const p = atLevel("light-blade", 3, [41, 1, 41]), before = JSON.stringify(p);
    expect(previewRobotCustomization(p, upgrade).reasons.join()).toContain("CAP上限"); expect(() => applyRobotCustomization(p, upgrade)).toThrow("CAP上限"); expect(JSON.stringify(p)).toBe(before);
    const changed = applyRobotCustomization(p, equip("core-b", "assault-rifle")), next = applyRobotCustomization(changed, upgrade);
    expect(next.partLevels["light-blade"]).toBe(4); expect(next.party[1]!.basic.weapon1.partId).toBe("assault-rifle");
  });
  it("rejects insufficient EXP, locked/unknown parts, wrong slots and duplicate weapons", () => {
    const p = funded(79); expect(() => applyRobotCustomization(p, upgrade)).toThrow("EXP");
    for (const change of [{ ...upgrade, partId: "superheavy-railgun" }, equip("core-a", "superheavy-railgun")]) expect(() => applyRobotCustomization(funded(), change)).toThrow("未解放");
    expect(() => applyRobotCustomization(p, { ...upgrade, partId: "unknown" })).toThrow();
    expect(() => applyRobotCustomization(p, { ...equip("core-a", "light-blade"), slot: "engine" })).toThrow("装備部位");
    expect(() => applyRobotCustomization(p, equip("core-a", "light-pistol"))).toThrow("同じ武器");
  });
  it("ignores injected client levels/costs and keeps distinct IDs independent", () => {
    const injected = { ...upgrade, level: 10, expCost: -9999 }, p = applyRobotCustomization(funded(), injected);
    const swap = { ...equip("core-a", "standard-sword"), level: 10, expCost: -9999 };
    const next = applyRobotCustomization(p, swap); expect(next.party[0]!.basic.weapon1.level).toBe(1); expect(next.exp).toBe(920);
    expect(next.partLevels["light-blade"]).toBe(2);
  });
  it("initializes newly rewarded parts at Lv1 without losing unequipped trained levels", () => {
    let p = applyRobotCustomization(funded(), { ...upgrade, partId: "standard-sword" });
    const r = applyRobotOfflineOutcome(p, key, { result: "won", endedRound: 1, subobjectiveAchieved: false }); p = r.progress;
    expect(p.partLevels["light-lance"]).toBe(1); expect(p.partLevels["standard-sword"]).toBe(2); expect(validateRobotOfflineProgress(p)).toEqual(p);
    expect(applyRobotOfflineOutcome(p, key, { result: "won", endedRound: 1, subobjectiveAchieved: false }).progress.partLevels).toEqual(p.partLevels);
  });
  it("keeps arbitrary sandbox levels non-destructive but flags a shared-level mismatch", () => {
    const p = createRobotOfflineProgress(), before = JSON.stringify(p), d = setRobotPerformancePart(createRobotPerformanceDraft(p), "weapon1", { partId: "light-blade", level: 2 });
    const r = getRobotPerformanceReport(p, d); expect(r.equipmentIssues).toContain("Shared part level mismatch"); expect(r.dealt).not.toBeNull(); expect(JSON.stringify(p)).toBe(before);
  });
});

describe("inventory codecs, migration and atomic checkpoints", () => {
  it("persists one shared upgrade and retains it through reload, backup and cross-store import", async () => {
    const { session, storage } = await setup(); await change(session, upgrade);
    const loaded = new RobotOfflineSession(storage, runtime, () => "unused"); await loaded.load(); expect(loaded.state).toEqual(session.state);
    const target = await setup(); await target.session.importBackup(session.exportBackup(), true); expect(target.session.state.progress).toEqual(session.state.progress);
    expect(target.session.state.version).toBe(2);
  });
  it("preserves the whole old checkpoint on failed writes and retries only one charge", async () => {
    const { session, storage } = await setup(), before = session.state, raw = storage.raw;
    storage.fail = true; await expect(change(session, upgrade)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
    storage.fail = false; await change(session, upgrade); expect(session.state.progress.exp).toBe(920); expect(session.state.progress.party.map(c => c.basic.weapon1.level)).toEqual([2, 2, 2]);
  });
  it("rejects simultaneous/replayed and stale cross-window upgrades", async () => {
    const { session, storage } = await setup(), other = new RobotOfflineSession(storage, runtime, () => "other"); await other.load();
    const input = { expectedRevision: session.state.revision, change: upgrade };
    const results = await Promise.allSettled([session.customize(input), session.customize(input)]); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(session.customize(input)).rejects.toThrow("更新"); await expect(other.customize(input)).rejects.toThrow("stale-write");
    expect(decodeRobotOfflineSave(storage.raw!, runtime).progress.exp).toBe(920);
  });
  it("starts and retries with the shared build but never permits battle-time editing", async () => {
    const { session } = await setup(); await change(session, upgrade); await session.start(key); const before = session.state;
    expect(before.battle!.departure.party.map(c => c.basic.weapon1.level)).toEqual([2, 2, 2]);
    for (const c of [upgrade, equip("core-a", "standard-sword")]) await expect(change(session, c)).rejects.toThrow("戦闘中");
    expect(session.state).toEqual(before); await session.retry(true); expect(session.state.battle!.departure.party).toEqual(before.progress.party);
  });
  it("rejects missing/unknown/locked/bad levels and divergent equipped projections without overwriting", async () => {
    const { session, storage } = await setup(), before = storage.raw, save = session.state;
    const missing = { ...save.progress.partLevels }; delete missing["light-blade"];
    for (const levels of [missing, { ...save.progress.partLevels, unknown: 1 }, { ...save.progress.partLevels, "superheavy-railgun": 2 }, ...[0, 11, 1.5, null].map(l => ({ ...save.progress.partLevels, "light-blade": l }))]) {
      await expect(session.importBackup(JSON.stringify({ ...save, progress: { ...save.progress, partLevels: levels } }), true)).rejects.toThrow(); expect(storage.raw).toBe(before);
    }
    const divergent = { ...save, progress: { ...save.progress, partLevels: { ...save.progress.partLevels, "light-blade": 2 } } };
    await expect(session.importBackup(JSON.stringify(divergent), true)).rejects.toThrow("shared inventory"); expect(storage.raw).toBe(before);
  });
  it("reads a v1 snapshot without rewriting or reexecuting it, then checkpoints v2 once", async () => {
    const source = await setup(); await source.session.start(key); const raw = legacyRaw(source.session.state), target = await setup(raw);
    expect(target.session.state.version).toBe(2); expect(target.storage.raw).toBe(raw);
    expect(target.session.state.battle).toEqual(source.session.state.battle); const b = target.session.state.battle!;
    await target.session.act({ battleId: b.departure.battleId, expectedSequence: b.sequence, actionId: "migrated-action", action: {} });
    expect(JSON.parse(target.storage.raw!).version).toBe(2); expect(target.session.state.battle!.sequence).toBe(1);
    const loaded = new RobotOfflineSession(target.storage, runtime, () => "unused"); await loaded.load(); expect(loaded.state).toEqual(target.session.state);
  });
  it("migrates consistent old high levels and never grants guessed levels to unequipped parts", () => {
    const p = atLevel("light-blade", 10), raw = legacyRaw({ ...createRobotOfflineSave(), progress: p }), s = decodeRobotOfflineSave(raw, null);
    expect(s.progress.partLevels["light-blade"]).toBe(10); expect(s.progress.partLevels["standard-sword"]).toBe(1); expect(s.progress.party).toEqual(p.party);
  });
  it("rejects contradictory v1 levels and a v2 inventory mislabeled as v1, preserving both stores", async () => {
    const target = await setup(), before = target.storage.raw, old = JSON.parse(legacyRaw(createRobotOfflineSave()));
    old.progress.party[0].coreLevel = 41; old.progress.party[0].basic.weapon1.level = 5; const raw = JSON.stringify(old);
    await expect(target.session.importBackup(raw, true)).rejects.toThrow("Lvが異なります"); expect(target.storage.raw).toBe(before);
    const store = new MemoryStorage(raw), session = new RobotOfflineSession(store, runtime, () => "unused"); await expect(session.load()).rejects.toThrow("Lvが異なります"); expect(store.raw).toBe(raw);
    await expect(target.session.importBackup(JSON.stringify({ ...target.session.state, version: 1 }), true)).rejects.toThrow("Version 1"); expect(target.storage.raw).toBe(before);
  });
  it("a failed reload cannot poison CAS and overwrite an unreadable file with prior memory", async () => {
    const { session, storage } = await setup(), before = session.state; storage.raw = "{broken";
    await expect(session.load()).rejects.toThrow(); expect(session.state).toEqual(before);
    await expect(change(session, upgrade)).rejects.toThrow("stale-write"); expect(storage.raw).toBe("{broken");
  });
  it("keeps the original v1 bytes when the first migration/training checkpoint fails", async () => {
    const raw = legacyRaw({ ...createRobotOfflineSave(), progress: funded(80) }), { session, storage } = await setup(raw), before = session.state;
    storage.fail = true; await expect(change(session, upgrade)).rejects.toThrow("disk-full"); expect(storage.raw).toBe(raw); expect(session.state).toEqual(before);
    storage.fail = false; await change(session, upgrade); expect(session.state.progress.exp).toBe(0); expect(JSON.parse(storage.raw!).version).toBe(2);
    expect(session.state.progress.partLevels["light-blade"]).toBe(2);
  });
});
