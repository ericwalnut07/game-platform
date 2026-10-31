import { describe, expect, it } from "vitest";
import { applyRobotCustomization, getRobotFrameComparison, previewRobotCustomization, robotNumericComparison } from "../../src/games/robot-tactics/customization";
import { applyRobotOfflineOutcome, createRobotOfflineProgress, getRobotOfflineAvailability, validateRobotOfflineProgress, type RobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotCoreUpgradeExp } from "../../src/games/robot-tactics/growth";
import { getRobotLoadoutPlan } from "../../src/games/robot-tactics/equipment";
import { createRobotOfflineSave, decodeRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { offlineFixtureRuntime as runtime } from "../robot-tactics/offlineFixtureRuntime";

const upgrade = { kind: "core-upgrade", coreId: "core-a" } as const;
function funded(): RobotOfflineProgress {
  return applyRobotOfflineOutcome(createRobotOfflineProgress(), { missionNumber: 1, difficulty: "easy" }, { result: "won", endedRound: 1, subobjectiveAchieved: false }).progress;
}
class MemoryStorage implements RobotOfflineStorage {
  raw: string | null = null; fail = false;
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (expected !== this.raw) throw new Error("stale-write"); this.raw = next; }
}
async function setup() {
  const storage = new MemoryStorage(); storage.raw = JSON.stringify({ ...createRobotOfflineSave(), progress: funded() });
  let id = 0; const session = new RobotOfflineSession(storage, runtime, () => "custom-test-" + ++id); await session.load();
  return { session, storage };
}
describe("adopted core training and frame changes", () => {
  it("quotes actual EXP/CAP/inclusive HP and changes only the selected core", () => {
    const p = funded(), before = structuredClone(p), preview = previewRobotCustomization(p, upgrade);
    expect(preview).toMatchObject({ expCost: 70, canApply: true, capBefore: 100, capAfter: 105 });
    const next = applyRobotCustomization(p, upgrade);
    expect(next.exp).toBe(10); expect(next.party[0]!.coreLevel).toBe(2);
    expect(next.party.slice(1)).toEqual(p.party.slice(1)); expect(next.party[0]!.basic).toEqual(p.party[0]!.basic);
    expect(next.cleared).toEqual(p.cleared); expect(next.subobjectives).toEqual(p.subobjectives); expect(p).toEqual(before);
    const plan = getRobotLoadoutPlan(next.party[0]!, getRobotOfflineAvailability(next));
    expect(preview.statsAfter).toEqual(plan.baseStatsBeforeAddons); expect(preview.capUsed).toBe(plan.capUsed);
    expect(plan.baseStatsBeforeAddons.hp).toBe(58); // Lv2 core HP48 + frame bonus3 + armor7: no second core addition.
  });
  it("never accepts a client-supplied cost/level and refuses insufficient EXP", () => {
    const p = createRobotOfflineProgress(); expect(previewRobotCustomization(p, upgrade).reasons).toContain("共有EXPが不足しています。");
    expect(() => applyRobotCustomization(p, upgrade)).toThrow("共有EXP");
    const injected = { ...upgrade, expCost: -9999, coreLevel: 41 };
    expect(applyRobotCustomization(funded(), injected).party[0]!.coreLevel).toBe(2);
  });
  it("uses all 40 adopted costs exactly, respects Lv21 MOV, and stops at Lv41", () => {
    let p: RobotOfflineProgress = { ...createRobotOfflineProgress(), exp: 10135 };
    for (let level = 1; level <= 40; level++) {
      const preview = previewRobotCustomization(p, upgrade);
      expect(preview.expCost).toBe(getRobotCoreUpgradeExp(level, level + 1));
      if (level === 20) expect([preview.statsBefore.mov, preview.statsAfter.mov]).toEqual([3, 4]);
      p = applyRobotCustomization(p, upgrade);
    }
    expect(p.exp).toBe(0); expect(p.party[0]!.coreLevel).toBe(41);
    expect(previewRobotCustomization(p, upgrade)).toMatchObject({ canApply: false, expCost: 0, reasons: ["最大Lvです。"] });
    expect(() => applyRobotCustomization(p, upgrade)).toThrow("最大Lv");
  });
  it("swaps an initial frame without spending EXP or touching equipped parts", () => {
    const p = createRobotOfflineProgress(), next = applyRobotCustomization(p, { kind: "frame", coreId: "core-a", frameId: "mobile-1" });
    expect(next.exp).toBe(p.exp); expect(next.party[0]!.frameId).toBe("mobile-1"); expect(next.party[0]!.basic).toEqual(p.party[0]!.basic);
    expect(next.party.slice(1)).toEqual(p.party.slice(1));
  });
  it("rejects locked, duplicate-group, same, unknown frames and unknown core", () => {
    const p = funded();
    for (const [frameId, message] of [["all-rounder", "未解放"], ["reactor-1", "フレームグループ"], ["attack-1", "装備中"], ["unknown", "不明"]]) expect(() => applyRobotCustomization(p, { kind: "frame", coreId: "core-a", frameId: frameId! })).toThrow(message!);
    expect(() => applyRobotCustomization(p, { kind: "core-upgrade", coreId: "unknown" as "core-a" })).toThrow("コア");
  });
  it("rejects two distinct models in the same adopted frame group", () => {
    let p = createRobotOfflineProgress();
    for (let missionNumber = 1; missionNumber <= 10; missionNumber++) p = applyRobotOfflineOutcome(p, { missionNumber, difficulty: "easy" }, { result: "won", endedRound: 1, subobjectiveAchieved: false }).progress;
    expect(getRobotOfflineAvailability(p).frames).toEqual(expect.arrayContaining(["attack-2-a", "attack-2-b"]));
    expect(getRobotOfflineAvailability(p).basicParts).not.toContain("attack-2");
    p = applyRobotCustomization(p, { kind: "frame", coreId: "core-a", frameId: "attack-2-a" });
    expect(() => applyRobotCustomization(p, { kind: "frame", coreId: "core-b", frameId: "attack-2-b" })).toThrow("フレームグループ");
  });
  it("compares frame-only modifiers at intermediate Lv, not whole robot stats", () => {
    const rows = getRobotFrameComparison("mobile-1", "attack-1", 2);
    expect(rows.find(r => r.label === "HP補正")).toMatchObject({ value: "0", difference: "-3", tone: "worse" });
    expect(rows.find(r => r.label === "MOV補正")).toMatchObject({ value: "1", difference: "+1", tone: "better" });
    expect(rows.find(r => r.label === "移動タイプ")).toMatchObject({ value: "前方", difference: "直線→前方", tone: "neutral" });
    expect(rows.every(r => !r.difference.includes("("))).toBe(true);
  });
  it("colors CAP increase as unfavorable and distinguishes zero/unresolved", () => {
    expect(robotNumericComparison("CAP", 26, 20, true)).toMatchObject({ difference: "+6", tone: "worse" });
    expect(robotNumericComparison("CAP", 20, 26, true)).toMatchObject({ difference: "-6", tone: "better" });
    expect(robotNumericComparison("攻撃", 30, 20)).toMatchObject({ difference: "+10", tone: "better" });
    expect(robotNumericComparison("攻撃", 20, 20)).toMatchObject({ difference: "—", tone: "neutral" });
    expect(robotNumericComparison("攻撃", null, 20)).toMatchObject({ value: "未確定", difference: "—", tone: "neutral" });
  });
});
describe("customization durable progression checkpoints", () => {
  it("saves training once, rejects replay/stale revisions, reloads and backs up the exact build", async () => {
    const { session, storage } = await setup(), revision = session.state.revision;
    await session.customize({ expectedRevision: revision, change: upgrade }); const committed = session.state;
    expect(committed.revision).toBe(revision + 1); expect(committed.progress.exp).toBe(10);
    await expect(session.customize({ expectedRevision: revision, change: upgrade })).rejects.toThrow("更新");
    expect(session.state).toEqual(committed);
    const loaded = new RobotOfflineSession(storage, runtime, () => "unused"); await loaded.load(); expect(loaded.state).toEqual(committed);
    const target = new RobotOfflineSession(new MemoryStorage(), runtime, () => "target"); await target.load(); await target.importBackup(session.exportBackup(), true);
    expect(target.state.progress).toEqual(committed.progress);
  });
  it("does not expose or charge a failed save; retry spends only once", async () => {
    const { session, storage } = await setup(), before = session.state, raw = storage.raw;
    storage.fail = true; await expect(session.customize({ expectedRevision: before.revision, change: upgrade })).rejects.toThrow("disk-full");
    expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
    storage.fail = false; await session.customize({ expectedRevision: before.revision, change: upgrade }); expect(session.state.progress.exp).toBe(10);
  });
  it("prevents double taps and stale cross-window writers", async () => {
    const { session, storage } = await setup(), second = new RobotOfflineSession(storage, runtime, () => "second"); await second.load();
    const input = { expectedRevision: session.state.revision, change: upgrade };
    const results = await Promise.allSettled([session.customize(input), session.customize(input)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(second.customize(input)).rejects.toThrow("stale-write");
    expect(decodeRobotOfflineSave(storage.raw!, runtime).progress.exp).toBe(10);
  });
  it("blocks edits in battle or pending result and preserves the original departure", async () => {
    const { session } = await setup(); await session.customize({ expectedRevision: session.state.revision, change: upgrade });
    await session.start({ missionNumber: 1, difficulty: "easy" }); const before = session.state, b = before.battle!;
    await expect(session.customize({ expectedRevision: before.revision, change: { kind: "frame", coreId: "core-a", frameId: "mobile-1" } })).rejects.toThrow("戦闘中");
    expect(session.state).toEqual(before); expect(b.departure.party).toEqual(before.progress.party);
    await session.act({ battleId: b.departure.battleId, expectedSequence: 0, actionId: "win", action: { finish: true } });
    await expect(session.customize({ expectedRevision: session.state.revision, change: upgrade })).rejects.toThrow("リザルト");
    await session.dismissResult(); expect(session.state.result).toBeNull();
  });
  it("reads old v1 M10 result group receipts without making the alias equippable", () => {
    let progress = createRobotOfflineProgress();
    for (let missionNumber = 1; missionNumber <= 10; missionNumber++) progress = applyRobotOfflineOutcome(progress, { missionNumber, difficulty: "easy" }, { result: "won", endedRound: 1, subobjectiveAchieved: false }).progress;
    const old = { ...createRobotOfflineSave(), progress, settledBattleIds: ["old-m10"], result: { result: "won", endedRound: 1, subobjectiveAchieved: false, departure: { battleId: "old-m10", key: { missionNumber: 10, difficulty: "easy" }, party: progress.party }, expGained: 170, unlocked: [], equipmentUnlocked: ["attack-2"] } };
    expect(decodeRobotOfflineSave(JSON.stringify(old), null).result?.equipmentUnlocked).toEqual(["attack-2"]);
    expect(getRobotOfflineAvailability(progress).basicParts).not.toContain("attack-2");
    expect(() => decodeRobotOfflineSave(JSON.stringify({ ...old, result: { ...old.result, equipmentUnlocked: ["unknown-group"] } }), null)).toThrow("equipment reward");
  });
  it("legacy v1 saves with high-level equipped parts keep their exact levels through changes", async () => {
    const { session, storage } = await setup(); const p = session.state.progress;
    const advanced = validateRobotOfflineProgress({ ...p, party: p.party.map((c, i) => i ? c : { ...c, coreLevel: 41, basic: { ...c.basic, weapon1: { partId: "light-blade", level: 10 } } }) });
    await session.importBackup(JSON.stringify({ ...createRobotOfflineSave(), progress: advanced }), true);
    await session.customize({ expectedRevision: session.state.revision, change: { kind: "frame", coreId: "core-a", frameId: "mobile-1" } });
    const next = decodeRobotOfflineSave(storage.raw!, runtime); expect(next.version).toBe(1); expect(next.progress.party[0]!.basic.weapon1.level).toBe(10);
  });
});
