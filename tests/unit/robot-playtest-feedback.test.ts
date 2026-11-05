import { describe, expect, it } from "vitest";
import { applyRobotCustomization, previewRobotCustomization } from "../../src/games/robot-tactics/customization";
import { createRobotOfflineProgress, getRobotOfflineAvailability, validateRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotLoadoutPlan, getRobotPartyCapBlock, resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { createRobotOfflineSave, decodeRobotOfflineSave, RobotOfflineSession, type RobotJson, type RobotOfflineBattle, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { getRobotBasicActionModifiers } from "../../src/games/robot-tactics/equipmentEffects";
import { getRobotBattleUnit, decodeRobotBattleCore } from "../../src/games/robot-tactics/battleState";
import { createRobotRoundInitiative } from "../../src/games/robot-tactics/initiative";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { offlineAddonFixtureProgress } from "../robot-tactics/offlineAddonFixture";
import { offlineFixtureRuntime } from "../robot-tactics/offlineFixtureRuntime";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";

const register = (name = "標準構成") => ({ kind: "favorite-save", coreId: "core-a", name } as const);
const recall = { kind: "favorite-apply", coreId: "core-a", sourceCoreId: "core-a", index: 0 } as const;
class Storage implements RobotOfflineStorage {
  raw: string | null = null; fail = false;
  async read() { return this.raw; }
  async replace(old: string | null, next: string) { if (this.fail || old !== this.raw) throw new Error("write failed"); this.raw = next; }
}
describe("playtest customization, saved identity and departure boundaries", () => {
  it("stores all slots, addon movement choices and a name, then recalls current shared levels", () => {
    let p = offlineAddonFixtureProgress();
    p = applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-a", partId: "movement-type-add", movementType: "diagonal" });
    p = applyRobotCustomization(p, register("<速攻> Ａ"));
    const favorite = p.favorites!["core-a"]![0]!;
    expect(favorite.name).toBe("<速攻> Ａ"); expect(favorite.basic.weapon1).toBe("light-blade");
    expect(favorite.addons).toEqual([{ partId: "movement-type-add", movementType: "diagonal" }]);
    expect(JSON.stringify(favorite)).not.toContain("level");
    p = applyRobotCustomization(p, { kind: "part-upgrade", coreId: "core-b", partId: "light-blade" });
    p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot: "weapon1", partId: "heavy-hammer" });
    p = applyRobotCustomization(p, { kind: "addon-remove", coreId: "core-a", partId: "movement-type-add" });
    const exp = p.exp, after = applyRobotCustomization(p, recall);
    expect(after.exp).toBe(exp); expect(after.party[0]!.basic.weapon1).toEqual({ partId: "light-blade", level: 2 });
    expect(after.party[0]!.addons).toEqual(favorite.addons); expect(after.favorites).toEqual(p.favorites);
  });
  it("limits each core to five and supports rename, replacement and deletion independently", () => {
    let p = createRobotOfflineProgress(); for (let i = 0; i < 5; i++) p = applyRobotCustomization(p, register("構成" + i));
    expect(() => applyRobotCustomization(p, register())).toThrow("5件");
    p = applyRobotCustomization(p, { ...register("B"), coreId: "core-b" });
    p = applyRobotCustomization(p, { kind: "favorite-rename", coreId: "core-a", index: 2, name: "改名" });
    p = applyRobotCustomization(p, { kind: "frame", coreId: "core-a", frameId: "mobile-1" });
    p = applyRobotCustomization(p, { ...register("上書き"), index: 2 });
    expect(p.favorites!["core-a"]![2]).toMatchObject({ name: "上書き", frameId: "mobile-1" });
    p = applyRobotCustomization(p, { kind: "favorite-delete", coreId: "core-a", index: 0 });
    expect(p.favorites!["core-a"]).toHaveLength(4); expect(p.favorites!["core-b"]).toHaveLength(1);
    expect(() => applyRobotCustomization(p, register(" "))).toThrow();
  });
  it("copies all equipment with target core Lv preserved and swaps only an occupied frame", () => {
    let p = offlineAddonFixtureProgress();
    p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot: "weapon1", partId: "standard-sword" });
    p = applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-a", partId: "fast-charge" }); p = applyRobotCustomization(p, register());
    const after = applyRobotCustomization(p, { ...recall, coreId: "core-b" });
    expect(after.party[1]).toEqual({ ...p.party[1]!, frameId: "attack-1", basic: p.party[0]!.basic, addons: p.party[0]!.addons });
    expect(after.party[0]).toEqual({ ...p.party[0]!, frameId: "reactor-1" }); expect(after.party[2]).toEqual(p.party[2]);
    expect(after.exp).toBe(p.exp); expect(after.favorites).toEqual(p.favorites);
  });
  it("rejects a low-CAP target copy atomically but permits same-core over-CAP recall and saving", () => {
    let p = offlineAddonFixtureProgress(true);
    p = applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-b", partId: "fast-charge" });
    p = applyRobotCustomization(p, { kind: "favorite-save", coreId: "core-b", name: "高CAP" });
    const raw = JSON.stringify(p), copy = { ...recall, sourceCoreId: "core-b" as const };
    expect(previewRobotCustomization(p, copy).reasons).toContain("CAP不足によりコピーできません");
    expect(() => applyRobotCustomization(p, copy)).toThrow("CAP不足によりコピーできません"); expect(JSON.stringify(p)).toBe(raw);
    p = applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-a", partId: "fast-charge" }); p = applyRobotCustomization(p, register());
    expect(getRobotPartyCapBlock(p.party, getRobotOfflineAvailability(p))).toBe("合計CAPオーバーのため出撃できません");
    const recalled = applyRobotCustomization(p, recall); expect(validateRobotOfflineProgress(recalled)).toEqual(recalled);
  });
  it("exchanges different-level cores and refuses raw MOV below one on either side", () => {
    let p = offlineAddonFixtureProgress(true);
    const after = applyRobotCustomization(p, { kind: "frame", coreId: "core-a", frameId: "reactor-1" });
    expect(after.party.map(c => c.frameId)).toEqual(["reactor-1", "attack-1", "defense-1"]);
    expect(after.party.map(c => c.coreLevel)).toEqual([1, 41, 41]); expect(after.party.map(c => c.basic)).toEqual(p.party.map(c => c.basic));
    p = applyRobotCustomization(p, { kind: "frame", coreId: "core-a", frameId: "mobile-1" });
    for (const [slot, partId] of [["engine", "high-output-engine"], ["armor", "heavy-armor"], ["weapon1", "heavy-hammer"]] as const) p = applyRobotCustomization(p, { kind: "part-equip", coreId: "core-a", slot, partId });
    expect(getRobotLoadoutPlan(p.party[0]!, getRobotOfflineAvailability(p)).movementBeforeMinimum).toBe(1);
    for (const coreId of ["core-a", "core-b"] as const) expect(() => applyRobotCustomization(p, { kind: "frame", coreId, frameId: coreId === "core-a" ? "reactor-1" : "mobile-1" })).toThrow("MOVが1未満");
  });
  it("keeps over-CAP saves/backup valid, blocks direct session departure, then unblocks after repair", async () => {
    const storage = new Storage(); storage.raw = JSON.stringify({ ...createRobotOfflineSave(), progress: offlineAddonFixtureProgress(true) });
    const session = new RobotOfflineSession(storage, offlineFixtureRuntime, () => "departure"); await session.load();
    await session.customize({ expectedRevision: session.state.revision, change: { kind: "addon-equip", coreId: "core-a", partId: "fast-charge" } });
    const p = session.state.progress;
    await session.customize({ expectedRevision: session.state.revision, change: { kind: "part-upgrade", coreId: "core-b", partId: "standard-engine" } });
    expect(session.state.progress.party.map(c => c.basic.engine.level)).toEqual([2, 2, 2]); expect(session.state.progress.exp).toBeLessThan(p.exp);
    expect(decodeRobotOfflineSave(session.exportBackup(), offlineFixtureRuntime).progress).toEqual(session.state.progress);
    const before = session.state; await expect(session.start({ missionNumber: 1, difficulty: "easy" })).rejects.toThrow("合計CAPオーバー"); expect(session.state).toEqual(before);
    await session.customize({ expectedRevision: session.state.revision, change: { kind: "addon-remove", coreId: "core-a", partId: "fast-charge" } });
    await session.start({ missionNumber: 1, difficulty: "easy" }); expect(session.state.battle).not.toBeNull();
  });
  it("does not publish a failed favorite write and rejects stale revisions, invalid favorite fields and old-save changes", async () => {
    const storage = new Storage(), session = new RobotOfflineSession(storage, offlineFixtureRuntime, () => "unused"); await session.load();
    const before = session.state; storage.fail = true;
    await expect(session.customize({ expectedRevision: before.revision, change: register() })).rejects.toThrow("write failed"); expect(session.state).toEqual(before);
    storage.fail = false; await session.customize({ expectedRevision: before.revision, change: register() });
    await expect(session.customize({ expectedRevision: before.revision, change: register() })).rejects.toThrow("更新");
    const saved = session.state, f = saved.progress.favorites!["core-a"]![0]!;
    for (const invalid of [{ ...f, level: 10 }, { ...f, basic: { ...f.basic, weapon1: "superheavy-railgun" } }, { ...f, addons: [{ partId: "fast-charge", level: 10 }] }]) {
      expect(() => decodeRobotOfflineSave(JSON.stringify({ ...saved, progress: { ...saved.progress, favorites: { "core-a": [invalid] } } }), null)).toThrow();
    }
    const old = createRobotOfflineSave(); expect(decodeRobotOfflineSave(JSON.stringify(old), null)).toEqual(old);
    expect(decodeRobotOfflineSave(JSON.stringify({ ...old, version: 1, progress: { exp: 0, party: old.progress.party, cleared: [], subobjectives: [] } }), null).progress).toEqual(old.progress);
  });
});

function view(weapons: readonly [string, string], addons: readonly string[] = [], lowEnergy = false) {
  const p = offlineAddonFixtureProgress();
  const progress = { ...p, party: p.party.map((c, i) => i ? { ...c, coreLevel: 1 } : { ...c, basic: { ...c.basic, weapon1: { partId: weapons[0], level: 1 }, weapon2: { partId: weapons[1], level: 1 } }, addons: addons.map(partId => ({ partId })) }) };
  let s = weaponCoreFixture({ progress });
  // This component fixture opens p1 explicitly. Give it explicit test-only SPD
  // so the production adapter also receives a consistent saved initiative.
  s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, stats: { ...u.stats, spd: 1000 } } : u) });
  if (lowEnergy) s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 0 } } : u) });
  s = decodeRobotBattleCore({ ...s, initiative: createRobotRoundInitiative({ ...s, turn: { ...s.turn, actorId: null, actedActorIds: [] } }) });
  const battle: RobotOfflineBattle = { runtimeId: "test", runtimeVersion: 1, departure: { battleId: s.id, key: s.key, party: progress.party }, snapshot: JSON.parse(JSON.stringify(s)) as RobotJson, sequence: 0, committedActionIds: [], latestSummary: "検証" };
  return { model: robotFormalBattleAdapter.project(battle), source: getRobotBattleUnit(s, "p1") };
}
describe("equipment-only battle command visibility", () => {
  it("hides absent/incompatible specials and expanded formations, keeps regular charge under attack", () => {
    const { model } = view(["light-blade", "light-pistol"]);
    expect(model.commands.find(c => c.id === "charge-strike:light-blade")).toMatchObject({ category: "attack", disabledReason: "通常移動後に使用できます" });
    expect(model.commands.some(c => c.id === "charge-strike:light-pistol" || c.id === "overwatch:light-blade" || c.id.startsWith("super-charge:") || c.id.startsWith("hp-heal:") || c.id.startsWith("pincer:") || c.id.startsWith("protection:"))).toBe(false);
    expect(model.commands.find(c => c.id === "overwatch:light-pistol")).toBeDefined();
    expect(model.commands.find(c => c.id === "combo")!.label).toBe("武装コンボ：双対象攻撃（EN55）");
  });
  it("keeps equipped commands visible through EN shortage and invalid formations with reasons and no choices", () => {
    const { model } = view(["light-blade", "howitzer"], ["burning-round", "formation-extension-unlock", "super-charge-thruster"], true);
    for (const id of ["burning-round:howitzer", "super-charge:light-blade", "pincer:light-blade", "protection:howitzer", "combo"]) {
      expect(model.commands.find(c => c.id === id)?.disabledReason).toContain("EN不足"); expect(model.choices.filter(c => c.commandId === id)).toEqual([]);
    }
    expect(model.commands.some(c => c.id === "burning-round:light-blade" || c.id === "super-charge:howitzer")).toBe(false);
    expect(view(["light-blade", "light-pistol"]).model.commands.find(c => c.id === "delta:light-blade")!.disabledReason).not.toBeNull();
  });
  it("uses addon family/rarity eligibility and all six adopted combo names", () => {
    const { model } = view(["light-blade", "howitzer"], ["delayed-fuse", "sniper-penetration", "tactical-marking-attack"]);
    expect(model.commands.some(c => c.id === "delayed-fuse:howitzer")).toBe(true);
    expect(model.commands.some(c => c.id === "delayed-fuse:light-blade" || c.id.startsWith("sniper-penetration:") || c.id === "tactical-marking-attack:light-blade")).toBe(false);
    for (const [a, b, name] of [["light-blade", "standard-sword", "同系統強化コンボ"], ["light-blade", "light-lance", "二武器連撃"], ["light-pistol", "howitzer", "拡散射撃"], ["light-blade", "light-pistol", "双対象攻撃"], ["light-lance", "light-pistol", "貫通射撃"], ["binding-hammer", "light-pistol", "衝撃射撃"]] as const) expect(view([a, b]).model.commands.find(c => c.id === "combo")!.label).toMatch(new RegExp("^武装コンボ：" + name + "（EN\\d+）$"));
  });
  it("retains every intermediate-Lv interpolation and the fixed three/four-cell distances", () => {
    expect(getRobotBasicActionModifiers([])).toMatchObject({ extraMoveDistance: 3, extraMoveEnergyCost: 30 });
    expect(Array.from({ length: 10 }, (_, i) => resolveRobotBasicPart("boost-support", i + 1).effect)).toEqual([30,29,28,26,25,23,22,20,18,15].map(energyCost => ({ kind: "boost", distance: 4, energyCost })));
  });
});
