import { expect, it } from "vitest";
import catalog from "../../docs/design/robot-tactics/legacy-parts-level-20.json";
import { getRobotCoreHp, getRobotFrameStatPlan } from "../../src/games/robot-tactics/growth";
import { getRobotCoreCap, listRobotBasicPartIds, listRobotFrameIds, resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotNormalWeaponEnergyCost } from "../../src/games/robot-tactics/weaponActions";
import { previewRobotCustomization } from "../../src/games/robot-tactics/customization";
import { applyRobotSharedPartLevels, validateRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotOfflineSave, decodeRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { assertRobotBurning, applyRobotBurning } from "../../src/games/robot-tactics/burning";
import { decodeRobotBattleCore, getRobotBattleActor, getRobotBattleUnit } from "../../src/games/robot-tactics/battleState";

it("extends all ten frames from their Lv21–41 totals with one final rounding and fixed MOV", () => {
  const levels = [41, 42, 61, 62, 70, 81, 82, 100];
  expect(levels.map(getRobotCoreHp)).toEqual([170, 172, 219, 220, 233, 251, 252, 267]);
  expect([41, 61, 70, 81, 100].map(getRobotCoreCap)).toEqual([300, 400, 445, 500, 595]);
  for (const id of listRobotFrameIds()) {
    const at21 = getRobotFrameStatPlan(id, 21).stats;
    const at41 = getRobotFrameStatPlan(id, 41).stats;
    for (const [level, growth, enGrowth] of [[61, .75, .25], [81, 1.25, .5], [100, 1.4875, .7375]] as const) {
      const { coreHp, frameHpBonus, stats } = getRobotFrameStatPlan(id, level);
      expect(stats.mov).toBe(at41.mov);
      for (const stat of ["hp", "melee", "ranged", "def", "spd", "en"] as const) {
        expect(stats[stat]).toBe(Math.round(at41[stat]! + (at41[stat]! - at21[stat]!) * (stat === "en" ? enGrowth : growth)));
      }
      expect(coreHp + frameHpBonus!).toBe(stats.hp);
    }
  }
});

it("resolves all existing weapon and basic part endpoints and all intermediate extended levels", () => {
  const legacyIds = [...Object.keys(catalog.weapons), ...Object.keys(catalog.basic)];
  expect(legacyIds).toHaveLength(46);
  expect(listRobotBasicPartIds()).toEqual(expect.arrayContaining(legacyIds));
  for (const [id, [power, cap]] of Object.entries(catalog.weapons)) {
    expect(resolveRobotBasicPart(id, 20)).toMatchObject({ weaponPower: power, cap });
    const base = resolveRobotBasicPart(id, 10);
    expect(resolveRobotBasicPart(id, 15)).toMatchObject({
      weaponPower: Math.round((base.weaponPower! + power!) / 2), cap: Math.round((base.cap! + cap!) / 2),
      statModifiers: base.statModifiers, range: base.range,
    });
  }
  for (const [id, { cap, statModifiers }] of Object.entries(catalog.basic)) {
    expect(resolveRobotBasicPart(id, 20)).toMatchObject({ cap, statModifiers });
  }
  for (const id of legacyIds) {
    for (let level = 11; level <= 20; level++) expect(resolveRobotBasicPart(id, level).blockingIssues).toEqual([]);
  }
  expect(resolveRobotBasicPart("shield-support", 20).effect).toEqual({ kind: "shield", extraReduction: .35 });
  expect(resolveRobotBasicPart("boost-support", 20).effect).toEqual({ kind: "boost", distance: 4, energyCost: 10 });
  expect(resolveRobotBasicPart("self-repair-armor", 15).effect).toEqual({ kind: "stationary-heal", amount: 10 });
  expect(getRobotNormalWeaponEnergyCost({ partId: "superheavy-railgun", level: 20 })).toBe(30);
});

it("loads prior saves and preserves the expanded loadout through backup and a real battle checkpoint", async () => {
  const save = createRobotOfflineSave();
  expect(decodeRobotOfflineSave(JSON.stringify(save), robotFormalRuntime)).toEqual(save);
  const legacy = { ...save, version: 1, progress: { exp: 2350, party: save.progress.party, cleared: ["easy-01"], subobjectives: [] } };
  expect(decodeRobotOfflineSave(JSON.stringify(legacy), robotFormalRuntime).progress).toMatchObject({ exp: 2350, cleared: ["easy-01"] });
  const partLevels = { ...save.progress.partLevels, "light-blade": 20, "standard-engine": 19 };
  const party = applyRobotSharedPartLevels(save.progress.party.map(core => ({ ...core, coreLevel: 100 })), partLevels);
  const progress = { ...save.progress, exp: 2000, party, partLevels };
  let raw = JSON.stringify({ ...save, progress });
  const storage: RobotOfflineStorage = { read: async () => raw, replace: async (expected, next) => {
    expect(expected).toBe(raw);
    raw = next;
  } };
  const session = new RobotOfflineSession(storage, robotFormalRuntime, () => "extended-growth");
  await session.load();
  expect(session.inspectBackup(session.exportBackup()).progress).toEqual(progress);
  await session.start({ missionNumber: 1, difficulty: "easy" });
  const before = session.state.battle!;
  const core = decodeRobotBattleCore(before.snapshot);
  const actor = getRobotBattleUnit(core, getRobotBattleActor(core).unitIds[0]!);
  expect(core.units.filter(u => u.kind === "controlled").map(u => u.coreLevel)).toEqual([100, 100, 100]);
  await session.act({ battleId: before.departure.battleId, expectedSequence: 0, actionId: "first", action: { kind: actor.kind === "controlled" ? "wait" : "npc" } });
  expect(decodeRobotOfflineSave(raw, robotFormalRuntime)).toEqual(session.state);
  expect(session.state.progress).toEqual(progress);
  expect(() => assertRobotBurning(applyRobotBurning(null, "core-a", 100, 0))).not.toThrow();
  expect(() => assertRobotBurning(applyRobotBurning(null, "core-a", 101, 0))).toThrow();
  expect(() => validateRobotOfflineProgress({ ...progress, partLevels: { ...partLevels, "light-blade": 21 } })).toThrow();
});

it("blocks unpriced upgrades without treating them as free or consuming shared EXP", () => {
  const save = createRobotOfflineSave();
  const partLevels = { ...save.progress.partLevels, "light-blade": 10 };
  const party = applyRobotSharedPartLevels(save.progress.party.map(core => ({ ...core, coreLevel: 41 })), partLevels);
  const progress = { ...save.progress, exp: 100000, party, partLevels };
  for (const change of [
    { kind: "core-upgrade", coreId: "core-a" },
    { kind: "part-upgrade", coreId: "core-a", partId: "light-blade" },
  ] as const) {
    const quote = previewRobotCustomization(progress, change);
    expect(quote.canApply).toBe(false);
    expect(quote.reasons).toContain("次のLvの必要EXPは未確定です。");
    expect(quote.partyAfter).toEqual(party);
    expect(quote.partLevelsAfter).toEqual(partLevels);
  }
});
