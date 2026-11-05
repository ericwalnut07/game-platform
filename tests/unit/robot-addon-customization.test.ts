import { describe, expect, it } from "vitest";
import catalog from "../../docs/design/robot-tactics/addons.json";
import { getRobotAddonComparison, getRobotAddonDefinition } from "../../src/games/robot-tactics/addonEquipment";
import { applyRobotCustomization, previewRobotCustomization, type RobotCustomizationChange } from "../../src/games/robot-tactics/customization";
import { createRobotOfflineProgress, getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotOfflineSave, decodeRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { getRobotLoadoutPlan } from "../../src/games/robot-tactics/equipment";
import { getRobotLegalMoves } from "../../src/games/robot-tactics/movement";
import { offlineAddonFixtureProgress } from "../robot-tactics/offlineAddonFixture";
import { offlineFixtureRuntime as runtime } from "../robot-tactics/offlineFixtureRuntime";
const equip = (partId: string, coreId: "core-a" | "core-b" | "core-c" = "core-a") => ({ kind: "addon-equip" as const, coreId, partId });
const remove = (partId: string) => ({ kind: "addon-remove" as const, coreId: "core-a" as const, partId });
const shape = (p: ReturnType<typeof offlineAddonFixtureProgress>) => getRobotLoadoutPlan(p.party[0]!, getRobotOfflineAvailability(p)).movement!;
class MemoryStorage implements RobotOfflineStorage {
  raw: string | null; fail = false;
  constructor() { this.raw = JSON.stringify({ ...createRobotOfflineSave(), progress: offlineAddonFixtureProgress() }); }
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale-write"); this.raw = next; }
}
async function setup() { const storage = new MemoryStorage(); let id = 0; const session = new RobotOfflineSession(storage, runtime, () => "addon-battle-" + ++id); await session.load(); return { session, storage }; }
async function change(session: RobotOfflineSession, change: RobotCustomizationChange) { return session.customize({ expectedRevision: session.state.revision, change }); }

describe("adopted addon equipment metadata and constraints", () => {
  it("equips all 60 catalog IDs through the common plan without changing numeric effects", () => {
    const p = offlineAddonFixtureProgress(), before = JSON.stringify(p);
    for (const row of catalog.parts) {
      const definition = getRobotAddonDefinition(row.id), selected = definition.movementChoices ? { ...equip(row.id), movementType: "diagonal" as const } : equip(row.id);
      const preview = previewRobotCustomization(p, selected), after = applyRobotCustomization(p, selected);
      expect(preview.canApply).toBe(true); expect(after.party[0]!.addons).toHaveLength(1);
      expect(getRobotLoadoutPlan(after.party[0]!, getRobotOfflineAvailability(after)).capUsed! - getRobotLoadoutPlan(p.party[0]!, getRobotOfflineAvailability(p)).capUsed!).toBe(row.cap);
      expect(after.exp).toBe(p.exp); expect(after.partLevels).toEqual(p.partLevels);
    }
    expect(JSON.stringify(p)).toBe(before);
  });
  it("allows multiple different IDs within CAP and the same ID on separate cores", () => {
    let p = offlineAddonFixtureProgress();
    for (const id of ["normal-attack-assist-small", "fast-charge", "extend-lance", "formation-extension-unlock"]) p = applyRobotCustomization(p, equip(id));
    expect(p.party[0]!.addons).toHaveLength(4); p = applyRobotCustomization(p, equip("fast-charge", "core-b"));
    expect(p.party[1]!.addons).toEqual([{ partId: "fast-charge" }]); expect(p.party[2]!.addons).toEqual([]);
  });
  it("allows CAP overflow but rejects locked/unknown IDs and duplicate delivery", () => {
    expect(() => applyRobotCustomization(createRobotOfflineProgress(), equip("fast-charge"))).toThrow("未解放");
    expect(applyRobotCustomization(offlineAddonFixtureProgress(true), equip("fast-charge")).party[0]!.addons).toContainEqual({ partId: "fast-charge" });
    expect(() => applyRobotCustomization(offlineAddonFixtureProgress(), equip("unknown"))).toThrow("不明な追加");
    const p = applyRobotCustomization(offlineAddonFixtureProgress(), equip("fast-charge")); expect(() => applyRobotCustomization(p, equip("fast-charge"))).toThrow("装備中"); expect(p.party[0]!.addons).toHaveLength(1);
    expect(() => applyRobotCustomization(p, remove("extend-lance"))).toThrow("装備していません");
  });
  it("does not invent equip bans for missing weapon scope/rarity matches", () => {
    const p = applyRobotCustomization(offlineAddonFixtureProgress(), equip("chain-slash-reactor"));
    const plan = getRobotLoadoutPlan(p.party[0]!, getRobotOfflineAvailability(p)); expect(plan.canEquip).toBe(true); expect(plan.addons[0]!.eligibleWeaponSlots).toEqual([]);
  });
  it("requires an explicit valid movement choice, and rejects choices on ordinary addons", () => {
    const p = offlineAddonFixtureProgress();
    expect(() => applyRobotCustomization(p, equip("movement-type-replace"))).toThrow("移動タイプ");
    expect(() => applyRobotCustomization(p, { ...equip("movement-type-add"), movementType: "invalid" as "omni" })).toThrow("移動タイプ");
    expect(() => applyRobotCustomization(p, { ...equip("fast-charge"), movementType: "omni" })).toThrow("移動タイプを選択しません");
    expect(() => applyRobotCustomization(p, { ...equip("movement-type-add"), movementType: "straight" })).toThrow("同じ");
  });
  it("reconfigures a movement ID in place without duplicating it or charging CAP twice", () => {
    const original = offlineAddonFixtureProgress(), p = applyRobotCustomization(original, { ...equip("movement-type-replace"), movementType: "omni" });
    const next = applyRobotCustomization(p, { ...equip("movement-type-replace"), movementType: "forward" });
    expect(next.party[0]!.addons).toEqual([{ partId: "movement-type-replace", movementType: "forward" }]);
    expect(getRobotLoadoutPlan(next.party[0]!, getRobotOfflineAvailability(next)).capUsed).toBe(getRobotLoadoutPlan(p.party[0]!, getRobotOfflineAvailability(p)).capUsed);
    expect(next.exp).toBe(original.exp); expect(shape(next).types).toEqual(["forward"]);
  });
  it("preserves the common union movement, rejects an invalid removal and permits an explicit repair", () => {
    let p = offlineAddonFixtureProgress(); p = applyRobotCustomization(p, { ...equip("movement-type-replace"), movementType: "omni" });
    p = applyRobotCustomization(p, { ...equip("movement-type-add"), movementType: "straight" }); const before = JSON.stringify(p);
    expect(shape(p).types).toEqual(["omni", "straight"]);
    expect(() => applyRobotCustomization(p, remove("movement-type-replace"))).toThrow("同じ"); expect(JSON.stringify(p)).toBe(before);
    p = applyRobotCustomization(p, { ...equip("movement-type-add"), movementType: "diagonal" }); p = applyRobotCustomization(p, remove("movement-type-replace"));
    expect(shape(p).types).toEqual(["straight", "diagonal"]);
    const movement = shape(p), query = { ...movement, origin: { x: 8, y: 8 }, facing: "north" as const, board: { width: 17, height: 17, walls: [] }, occupied: [], structures: [] };
    const union = getRobotLegalMoves(query), separate = movement.types.flatMap(type => getRobotLegalMoves({ ...query, types: [type] }));
    expect(new Set(union.map(m => JSON.stringify(m.destination)))).toEqual(new Set(separate.map(m => JSON.stringify(m.destination))));
  });
  it("removes only the requested ID, keeps shared levels/basic parts and never refunds EXP", () => {
    const original = offlineAddonFixtureProgress(), p = applyRobotCustomization(applyRobotCustomization(original, equip("fast-charge")), equip("normal-attack-assist-small"));
    const next = applyRobotCustomization(p, remove("fast-charge")); expect(next.party[0]!.addons).toEqual([{ partId: "normal-attack-assist-small" }]);
    expect(next.exp).toBe(original.exp); expect(next.partLevels).toEqual(original.partLevels); expect(next.party.map(c => c.basic)).toEqual(original.party.map(c => c.basic));
  });
  it("rejects invented addon levels and ignores client CAP/EXP overrides", () => {
    const p = offlineAddonFixtureProgress(), bad = { ...equip("fast-charge"), level: 10 };
    expect(() => applyRobotCustomization(p, bad)).toThrow("Lvがありません");
    const injected = { ...equip("fast-charge"), cap: -9999, expCost: -9999 }, next = applyRobotCustomization(p, injected);
    expect(next.exp).toBe(p.exp); expect(next.party[0]!.addons).toEqual([{ partId: "fast-charge" }]);
    expect(getRobotLoadoutPlan(next.party[0]!, getRobotOfflineAvailability(next)).capUsed! - getRobotLoadoutPlan(p.party[0]!, getRobotOfflineAvailability(p)).capUsed!).toBe(16);
  });
  it("shows source descriptions and signed CAP deltas for addition/removal", () => {
    const p = offlineAddonFixtureProgress(), rows = getRobotAddonComparison("fast-charge", p.party[0]!);
    expect(rows.find(r => r.label === "必要CAP")).toMatchObject({ value: "16", difference: "+16", tone: "worse" });
    const equipped = applyRobotCustomization(p, equip("fast-charge"));
    expect(getRobotAddonComparison("fast-charge", equipped.party[0]!).find(r => r.label === "必要CAP")).toMatchObject({ difference: "-16", tone: "better" });
    expect(rows.find(r => r.label === "効果")!.value).toBe(catalog.parts.find(p => p.id === "fast-charge")!.description);
    expect(rows.every(r => !/[()]/.test(r.difference))).toBe(true);
  });
});

describe("addon progression checkpoints and battle boundaries", () => {
  it("persists multiple IDs/choices through reload and backup import without changing format", async () => {
    const { session, storage } = await setup(); await change(session, equip("fast-charge")); await change(session, { ...equip("movement-type-replace"), movementType: "omni" });
    const after = session.state, loaded = new RobotOfflineSession(storage, runtime, () => "unused"); await loaded.load(); expect(loaded.state).toEqual(after);
    const target = await setup(); await target.session.importBackup(session.exportBackup(), true); expect(target.session.state.progress).toEqual(after.progress); expect(target.session.state.version).toBe(2);
  });
  it("rolls back a failed equip/reconfigure/remove and retries one durable update", async () => {
    const { session, storage } = await setup();
    for (const command of [{ ...equip("movement-type-replace"), movementType: "omni" as const }, { ...equip("movement-type-replace"), movementType: "forward" as const }, remove("movement-type-replace")]) {
      const before = session.state, raw = storage.raw; storage.fail = true; await expect(change(session, command)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
      storage.fail = false; await change(session, command); expect(session.state.revision).toBe(before.revision + 1); expect(session.state.progress.exp).toBe(before.progress.exp);
    }
  });
  it("rejects double taps/replays/stale windows and never creates duplicate IDs", async () => {
    const { session, storage } = await setup(), other = new RobotOfflineSession(storage, runtime, () => "other"); await other.load();
    const input = { expectedRevision: session.state.revision, change: equip("fast-charge") };
    const results = await Promise.allSettled([session.customize(input), session.customize(input)]); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(session.customize(input)).rejects.toThrow("更新"); await expect(other.customize(input)).rejects.toThrow("stale-write");
    expect(decodeRobotOfflineSave(storage.raw!, runtime).progress.party[0]!.addons).toHaveLength(1);
  });
  it("keeps departure/retry configurations and blocks edits in battle and pending results", async () => {
    const { session } = await setup(); await change(session, { ...equip("movement-type-replace"), movementType: "omni" }); await session.start({ missionNumber: 1, difficulty: "easy" }); const before = session.state;
    for (const command of [equip("fast-charge"), remove("movement-type-replace")]) await expect(change(session, command)).rejects.toThrow("戦闘中"); expect(session.state).toEqual(before);
    await session.retry(true); expect(session.state.battle!.departure.party).toEqual(before.battle!.departure.party);
    const b = session.state.battle!; await session.act({ battleId: b.departure.battleId, expectedSequence: 0, actionId: "done", action: { finish: true } }); await expect(change(session, equip("fast-charge"))).rejects.toThrow("リザルト");
  });
  it("rejects malformed saved choices, duplicates and addon levels without overwriting current data", async () => {
    const { session, storage } = await setup(), before = storage.raw, s = session.state;
    for (const addons of [[{ partId: "movement-type-replace" }], [{ partId: "fast-charge", level: 2 }], [{ partId: "fast-charge" }, { partId: "fast-charge" }]]) {
      const bad = { ...s, progress: { ...s.progress, party: s.progress.party.map((c, i) => i ? c : { ...c, addons }) } };
      await expect(session.importBackup(JSON.stringify(bad), true)).rejects.toThrow(); expect(storage.raw).toBe(before);
    }
  });
});
