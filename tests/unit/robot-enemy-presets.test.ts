import { describe, expect, it } from "vitest";
import modelCatalog from "../../docs/design/robot-tactics/medium-heavy-models.json";
import groupRules from "../../docs/design/robot-tactics/current-group-combat.json";
import { getRobotSoloEnemyBaseStats, getRobotSoloEnemyPlan, getRobotStageSoloEnemyPlans, listRobotSoloEnemyModelIds, type RobotSoloEnemyWeight } from "../../src/games/robot-tactics/enemyPresets";
import { getRobotEncounterPartLevel } from "../../src/games/robot-tactics/growth";
import { getRobotStagePlan, listRobotStageKeys, requireApprovedRobotStage } from "../../src/games/robot-tactics/stageCatalog";
import { getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";

describe("adopted ordinary solo enemy growth", () => {
  it("uses exactly the adopted 12 medium and 9 heavy models", () => {
    const ids = listRobotSoloEnemyModelIds();
    expect(ids).toHaveLength(21); expect(new Set(ids).size).toBe(21);
    expect(ids.filter(id => id.startsWith("medium-"))).toHaveLength(12);
    expect(ids.filter(id => id.startsWith("heavy-"))).toHaveLength(9);
    expect(() => getRobotSoloEnemyPlan("M02-boss", 21)).toThrow();
    expect(() => getRobotSoloEnemyPlan("light-melee-A", 21)).toThrow();
  });
  // Independent adopted table anchors, with no player core or weapon contribution.
  const anchors: readonly [RobotSoloEnemyWeight, string, readonly (readonly number[])[]][] = [
    ["medium", "melee", [[55, 74, 74, 33, 3, 56, 70], [95, 126, 126, 52, 4, 75, 108], [130, 165, 165, 64, 4, 90, 150]]],
    ["medium", "ranged", [[58, 54, 54, 43, 3, 46, 100], [98, 100, 120, 62, 4, 63, 145], [135, 138, 160, 74, 4, 75, 195]]],
    ["medium", "defense", [[66, 44, 44, 50, 3, 35, 75], [115, 88, 88, 79, 4, 49, 118], [160, 123, 123, 103, 4, 60, 165]]],
    ["medium", "mobile", [[48, 44, 44, 30, 4, 87, 75], [86, 105, 105, 50, 5, 111, 120], [122, 145, 145, 63, 5, 130, 165]]],
    ["heavy", "heavy-assault", [[105, 90, 75, 55, 3, 50, 105], [175, 150, 135, 82, 3, 69, 165], [240, 200, 180, 108, 3, 83, 225]]],
    ["heavy", "heavy-artillery", [[100, 65, 100, 58, 2, 40, 120], [167, 118, 171, 85, 2, 58, 189], [230, 165, 229, 110, 2, 71, 259]]],
    ["heavy", "heavy-armor", [[135, 70, 60, 74, 2, 30, 110], [220, 121, 112, 112, 2, 44, 175], [300, 168, 148, 145, 2, 55, 245]]]
  ];
  const columns = ["hp", "melee", "ranged", "def", "mov", "spd", "en"] as const;
  for (const [weight, chassis, expected] of anchors) it(weight + "/" + chassis + " preserves Lv1/21/41 base anchors", () => {
    expect([1, 21, 41].map(lv => {
      const stats = getRobotSoloEnemyBaseStats(weight, chassis, lv);
      return columns.map(stat => stats[stat]);
    })).toEqual(expected);
  });
  it("interpolates six numeric stats with the adopted integer half-up rule", () => {
    expect(getRobotSoloEnemyBaseStats("medium", "melee", 3)).toEqual({ hp: 59, melee: 78, ranged: 78, def: 35, mov: 3, spd: 58, en: 73 });
    expect(getRobotSoloEnemyBaseStats("medium", "ranged", 8)).toEqual({ hp: 70, melee: 68, ranged: 76, def: 49, mov: 3, spd: 52, en: 114 });
    expect(getRobotSoloEnemyBaseStats("heavy", "heavy-artillery", 16)).toEqual({ hp: 148, melee: 103, ranged: 152, def: 78, mov: 2, spd: 54, en: 171 });
  });
  it("steps medium MOV only at Lv21 and never interpolates heavy MOV", () => {
    expect([20, 21, 41].map(lv => getRobotSoloEnemyBaseStats("medium", "melee", lv).mov)).toEqual([3, 4, 4]);
    expect([20, 21, 41].map(lv => getRobotSoloEnemyBaseStats("medium", "mobile", lv).mov)).toEqual([4, 5, 5]);
    expect([1, 20, 21, 41].map(lv => getRobotSoloEnemyBaseStats("heavy", "heavy-armor", lv).mov)).toEqual([2, 2, 2, 2]);
  });
  it("uses the same chassis base for A/B/C with no model-specific scalar", () => {
    for (const model of modelCatalog.models) {
      const p = getRobotSoloEnemyPlan(model.id, 21);
      expect(p.baseStats).toEqual(getRobotSoloEnemyBaseStats(p.weightClass, p.archetype, 21));
      expect(p.stats?.hp).toBe(p.baseStats?.hp);
      expect(p.stats?.melee).toBe(p.baseStats?.melee);
      expect(p.stats?.ranged).toBe(p.baseStats?.ranged);
    }
  });
  it("rejects invalid reference levels and unknown chassis", () => {
    for (const lv of [0, 42, 2.5, NaN, Infinity]) expect(() => getRobotSoloEnemyPlan("medium-melee-A", lv)).toThrow();
    expect(() => getRobotSoloEnemyBaseStats("medium", "unknown", 21)).toThrow(/chassis/);
  });
});

describe("two-weapon NPC stat composition", () => {
  it("keeps the enemy light/solo and friendly-part level catalogs consistent", () => {
    const solo = groupRules.enemies.soloEnemies.weaponLevelCommonPolicy.weaponLevelByEnemyReferenceCoreLevel;
    expect(groupRules.enemies.lightSquads.modelRules.weaponLevelByEnemyReferenceCoreLevel).toEqual(solo);
    expect(groupRules.allies.presetGrowth.partLevelByReferenceCoreLevel.map(b => ({ core: b.core, weapon: b.part }))).toEqual(solo);
  });
  it("retains the adopted two different weapon IDs at one common level", () => {
    for (const model of modelCatalog.models) for (const coreLevel of [1, 6, 11, 16, 21, 26, 31, 36, 41]) {
      const p = getRobotSoloEnemyPlan(model.id, coreLevel);
      expect(p.weapons?.map(w => w.id)).toEqual(model.weaponIds);
      expect(new Set(p.weapons?.map(w => w.id)).size).toBe(2);
      expect(p.weapons?.map(w => w.level)).toEqual([getRobotEncounterPartLevel(coreLevel), getRobotEncounterPartLevel(coreLevel)]);
    }
  });
  it("adds each weapon's explicit stat modifiers once, without adding weapon power to attack stats", () => {
    const melee = getRobotSoloEnemyPlan("medium-melee-A", 1);
    expect(melee.baseStats?.spd).toBe(56); expect(melee.stats?.spd).toBe(62);
    expect(melee.stats?.melee).toBe(74); expect(melee.stats?.ranged).toBe(74);
    const mobile = getRobotSoloEnemyPlan("medium-mobile-A", 1);
    expect(mobile.baseStats?.spd).toBe(87); expect(mobile.stats?.spd).toBe(99);
    const ranged = getRobotSoloEnemyPlan("medium-ranged-B", 21);
    expect(ranged.stats).toMatchObject({ hp: 98, melee: 100, ranged: 120, mov: 3, spd: 55 });
  });
  it("stacks the actual heavy-C MOV penalties then applies the existing MOV minimum1", () => {
    const p = getRobotSoloEnemyPlan("heavy-heavy-artillery-C", 1);
    expect(p.baseStats?.mov).toBe(2);
    expect(p.weapons?.map(w => w.statModifiers.mov)).toEqual([-1, -1]);
    expect(p.stats?.mov).toBe(1);
    expect(p.stats?.spd).toBe(22); expect(p.stats?.en).toBe(120); expect(p.initialEn).toBe(36);
  });
  it("uses the PR72 current powers for reward weapons without changing enemy chassis HP", () => {
    expect(getRobotSoloEnemyPlan("medium-melee-B", 21).weapons?.[0]?.weaponPower).toBe(68);
    expect(getRobotSoloEnemyPlan("medium-defense-B", 21).weapons?.[0]?.weaponPower).toBe(74);
    expect(getRobotSoloEnemyPlan("heavy-heavy-artillery-B", 21).weapons?.[0]?.weaponPower).toBe(64);
    expect(getRobotSoloEnemyPlan("medium-mobile-C", 41).weapons?.[0]?.weaponPower).toBe(121);
    expect(getRobotSoloEnemyPlan("medium-defense-B", 21).stats?.hp).toBe(115);
  });
  it("does not apply player unlock/CAP/core-ID restrictions to fixed enemy weapons", () => {
    const p = getRobotSoloEnemyPlan("medium-defense-B", 1);
    expect(p.weapons?.[0]?.id).toBe("suppression-mace");
    expect(p.readyForStatUse).toBe(true);
    expect(p).not.toHaveProperty("coreId"); expect(p).not.toHaveProperty("capLimit");
  });
  it("leaves unknown encounter levels unresolved rather than using Lv1 or a boss prototype", () => {
    const p = getRobotSoloEnemyPlan("medium-melee-A", null);
    expect(p.weaponLevel).toBeNull(); expect(p.weapons).toBeNull(); expect(p.stats).toBeNull(); expect(p.initialEn).toBeNull();
    expect(p.readyForStatUse).toBe(false); expect(p.blockingIssues).toContain("Enemy reference core level is unresolved");
  });
  it("resolves all 21 models at every Lv1-41 without mutating the source tables", () => {
    const before = JSON.stringify([groupRules, modelCatalog]);
    for (const id of listRobotSoloEnemyModelIds()) for (let level = 1; level <= 41; level++) {
      const p = getRobotSoloEnemyPlan(id, level);
      expect(p.readyForStatUse).toBe(true); expect(p.blockingIssues).toEqual([]);
      for (const stat of Object.values(p.stats!)) expect(Number.isSafeInteger(stat)).toBe(true);
      expect(p.stats?.mov).toBeGreaterThanOrEqual(1);
      expect(p.initialEn).toBeLessThanOrEqual(p.stats!.en!);
    }
    expect(JSON.stringify([groupRules, modelCatalog])).toBe(before);
  });
});

describe("stage-to-solo-enemy adapter", () => {
  it("selects the adopted Normal A / Hard B models for M03-M07 and preserves Easy unknown models", () => {
    for (let missionNumber = 3; missionNumber <= 7; missionNumber++) {
      for (const difficulty of ["normal", "hard"] as const) {
        const p = getRobotStageSoloEnemyPlans(getRobotStagePlan({ missionNumber, difficulty }));
        expect(p.enemies.length).toBeGreaterThan(0);
        for (const e of p.enemies) { expect(e.plan?.model).toBe(difficulty === "normal" ? "A" : "B"); expect(e.plan?.readyForStatUse).toBe(true); }
      }
      const easy = getRobotStageSoloEnemyPlans(getRobotStagePlan({ missionNumber, difficulty: "easy" }));
      for (const e of easy.enemies) { expect(e.plan).toBeNull(); expect(e.blockingIssues.some(s => s.includes("model is unresolved"))).toBe(true); }
    }
  });
  it("leaves adopted M02 bosses to the dedicated boss Core instead of an ordinary model", () => {
    const p = getRobotStageSoloEnemyPlans(getRobotStagePlan({ missionNumber: 2, difficulty: "hard" }));
    expect(p.enemies).toEqual([]);
  });
  it("rejects inconsistent stage weapon-level bands", () => {
    const stage = getRobotStagePlan({ missionNumber: 3, difficulty: "hard" });
    const initialEnemies = stage.initialEnemies.map(u => u.kind === "medium" ? { ...u, weaponLevel: 8 } : u);
    expect(() => getRobotStageSoloEnemyPlans({ ...stage, initialEnemies })).toThrow(/band mismatch/);
  });
  it("adapts all90 plans without promoting candidates or changing the formal stage guards", () => {
    for (const key of listRobotStageKeys()) {
      const stage = getRobotStagePlan(key), p = getRobotStageSoloEnemyPlans(stage);
      expect(p.isReadyForFormalPlay).toBe(false);
      expect(p.enemies.map(e => e.unit.id)).toEqual(stage.initialEnemies.filter(u => u.kind !== "light-squad" && u.kind !== "boss").map(u => u.id));
      expect(() => requireApprovedRobotStage(key)).toThrow();
    }
  });
});

it("smokes adopted enemy stats + current reward weapon -> shared sight -> final damage", () => {
  const enemy = getRobotSoloEnemyPlan("medium-defense-B", 21);
  const weapon = enemy.weapons![0]!;
  expect(enemy.initialEn).toBe(36);
  const estimate = getRobotWeaponDamageEstimate({ weaponId: weapon.id, weaponLevel: weapon.level, attackStats: { melee: enemy.stats!.melee!, ranged: enemy.stats!.ranged! }, targetDef: 50, mode: "normal" });
  const spatial = checkRobotAttackSpatial({ kind: "normal", range: { status: "in-range", distance: 1 }, sight: { board: { width: 5, height: 5, walls: [] }, origin: { x: 0, y: 0 }, target: { x: 1, y: 0 } } });
  // Range is an internal fixture: no formal distance metric is adopted here.
  expect(resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => estimate.baseDamage } }).damage).toBe(32);
});
