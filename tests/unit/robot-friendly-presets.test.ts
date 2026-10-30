import { describe, expect, it } from "vitest";
import groupRules from "../../docs/design/robot-tactics/current-group-combat.json";
import { getRobotEncounterPartLevel, getRobotFriendlyPresetPlan, getRobotStageFriendlyPlans, listRobotFriendlyPresetIds } from "../../src/games/robot-tactics/friendlyPresets";
import { getRobotEquipmentBaseStatPlan, getRobotPartyEquipmentPlan, listRobotAddonIds, listRobotBasicPartIds, listRobotFrameIds, resolveRobotBasicPart, type RobotLoadout } from "../../src/games/robot-tactics/equipment";
import { getRobotStagePlan, listRobotStageKeys, requireApprovedRobotStage } from "../../src/games/robot-tactics/stageCatalog";
import { applyRobotAlliedDefeats, beginNextRobotAlliedRound, createRobotAlliedLifecycle } from "../../src/games/robot-tactics/alliedLifecycle";
import { getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";

function party(coreLevel = 1, boosters = 0) {
  const loadouts: RobotLoadout[] = (["core-a", "core-b", "core-c"] as const).map((coreId, i) => ({
    coreId, coreLevel, frameId: ["attack-1", "reactor-1", "defense-1"][i]!,
    basic: { engine: { partId: "standard-engine", level: 1 }, weapon1: { partId: "light-blade", level: 1 }, weapon2: { partId: "light-pistol", level: 1 }, armor: { partId: "standard-armor", level: 1 }, control: { partId: "standard-control", level: 1 }, special: { partId: "general-support", level: 1 } },
    addons: i < boosters ? [{ partId: "friendly-ai-boost" }] : []
  }));
  return getRobotPartyEquipmentPlan(loadouts, { frames: listRobotFrameIds(), basicParts: listRobotBasicPartIds(), addons: listRobotAddonIds() });
}
const unboosted = party();
const get = (presetId: string, referenceCoreLevel: number | null) => getRobotFriendlyPresetPlan({ presetId, referenceCoreLevel, playerParty: unboosted });

describe("adopted friendly AI reference growth", () => {
  it("exposes exactly the three adopted fixed presets", () => {
    expect(listRobotFriendlyPresetIds()).toEqual(["frontline-support", "ranged-support", "mobile-support"]);
    expect(unboosted.canEquip).toBe(true);
    expect(() => get("unknown", 1)).toThrow(/Unknown/);
  });
  it("uses every adopted encounter part-level band and agrees with the enemy mapping", () => {
    expect(Array.from({ length: 41 }, (_, i) => getRobotEncounterPartLevel(i + 1))).toEqual([
      ...Array(5).fill(1), ...Array(5).fill(2), ...Array(5).fill(3), ...Array(5).fill(4), ...Array(5).fill(5), ...Array(5).fill(6), ...Array(5).fill(7), ...Array(6).fill(8)
    ]);
    for (const band of groupRules.enemies.soloEnemies.weaponLevelCommonPolicy.weaponLevelByEnemyReferenceCoreLevel) {
      for (const coreLevel of band.core) expect(getRobotEncounterPartLevel(coreLevel)).toBe(band.weapon);
    }
    for (const level of [0, 42, -1, 2.5, NaN, Infinity]) expect(() => getRobotEncounterPartLevel(level)).toThrow();
  });
  const anchors = {
    "frontline-support": [
      { hp: 70, melee: 44, ranged: 44, def: 53, spd: 36, en: 75, mov: 3 },
      { hp: 155, melee: 94, ranged: 94, def: 70, spd: 54, en: 136, mov: 4 },
      { hp: 233, melee: 124, ranged: 124, def: 76, spd: 66, en: 199, mov: 4 }
    ],
    "ranged-support": [
      { hp: 54, melee: 54, ranged: 54, def: 40, spd: 45, en: 100, mov: 3 },
      { hp: 123, melee: 104, ranged: 104, def: 55, spd: 63, en: 174, mov: 4 },
      { hp: 195, melee: 134, ranged: 134, def: 59, spd: 74, en: 247, mov: 4 }
    ],
    "mobile-support": [
      { hp: 48, melee: 44, ranged: 44, def: 30, spd: 87, en: 75, mov: 4 },
      { hp: 117, melee: 104, ranged: 104, def: 45, spd: 126, en: 136, mov: 5 },
      { hp: 189, melee: 134, ranged: 134, def: 49, spd: 153, en: 199, mov: 5 }
    ]
  };
  // Independent expectations composed from the adopted frame and PR #72 part anchors.
  for (const [id, expected] of Object.entries(anchors)) it(id + " uses current numerical sources at Lv1/21/41", () => {
    expect([1, 21, 41].map(lv => get(id, lv).stats)).toEqual(expected);
    expect([1, 21, 41].map(lv => get(id, lv).partLevel)).toEqual([1, 5, 8]);
  });
  it("does not reuse the pre-rebalance certified higher-level snapshots", () => {
    expect(get("frontline-support", 41).stats?.hp).toBe(233); // old snapshot 235
    expect(get("ranged-support", 41).stats?.en).toBe(247); // old snapshot 234
    expect(get("mobile-support", 21).stats?.melee).toBe(104); // old snapshot 101
    expect(groupRules.allies.presetGrowth.certifiedCheckpoints.snapshotStatus).toContain("historical-before");
  });
  it("uses adopted frame-only HP interpolation and non-weapon intermediate part growth", () => {
    const p = get("frontline-support", 11);
    expect(p.stats).toEqual({ hp: 110, melee: 69, ranged: 69, def: 62, spd: 46, en: 106, mov: 3 });
    expect(p.capUsed).toBe(121);
    expect(p.initialEn).toBe(32);
    expect([get("frontline-support", 20).stats?.mov, get("frontline-support", 21).stats?.mov]).toEqual([3, 4]);
    expect([get("mobile-support", 20).stats?.mov, get("mobile-support", 21).stats?.mov]).toEqual([4, 5]);
  });
  it("fixes all six equipment slots at the common NPC part level", () => {
    const p = get("ranged-support", 31);
    expect(Object.values(p.basic!).map(x => x.level)).toEqual([7, 7, 7, 7, 7, 7]);
    expect(Object.values(p.basic!).map(x => x.id)).toEqual(["standard-engine", "standard-sword", "assault-rifle", "light-armor", "standard-control", "general-support"]);
    expect([get("frontline-support", 41).capUsed, get("ranged-support", 41).capUsed, get("mobile-support", 41).capUsed]).toEqual([172, 179, 170]);
    expect([get("frontline-support", 1).movementType, p.movementType, get("mobile-support", 1).movementType]).toEqual(["omni", "diagonal", "forward"]);
  });
  it("uses the encounter reference rather than the player's level and does not reserve a player core", () => {
    const a = get("frontline-support", 21);
    const b = getRobotFriendlyPresetPlan({ presetId: "frontline-support", referenceCoreLevel: 21, playerParty: party(41) });
    expect(b).toEqual(a);
    expect(a).not.toHaveProperty("coreId");
    expect(a.readyForStatUse).toBe(true); // defense-1 can also be equipped by a player
  });
  it("keeps unknown encounter levels unresolved, with no Lv1 fallback", () => {
    const p = get("frontline-support", null);
    expect(p.partLevel).toBeNull(); expect(p.basic).toBeNull(); expect(p.stats).toBeNull(); expect(p.initialEn).toBeNull();
    expect(p.readyForStatUse).toBe(false);
    expect(p.blockingIssues).toContain("Encounter reference core level is unresolved");
  });
  it("resolves all three presets at all 41 levels without a new difficulty multiplier", () => {
    for (const id of listRobotFriendlyPresetIds()) for (let level = 1; level <= 41; level++) {
      const p = get(id, level);
      expect(p.readyForStatUse).toBe(true); expect(p.blockingIssues).toEqual([]);
      expect(p.capUsed).toBeLessThanOrEqual(p.capLimit!);
      for (const n of Object.values(p.stats!)) expect(Number.isSafeInteger(n)).toBe(true);
    }
  });
});

describe("party boost boundaries and shared composition", () => {
  it("counts actual player boost equipment at 5/10/15 percent and leaves rounding unadopted", () => {
    for (const [count, bonusFraction] of [[1, 0.05], [2, 0.1], [3, 0.15]]) {
      const p = getRobotFriendlyPresetPlan({ presetId: "frontline-support", referenceCoreLevel: 21, playerParty: party(41, count!) });
      expect(p.boost).toEqual({ equippedCount: count, bonusFraction, excludesMovement: true });
      expect(p.statsBeforeBoost?.hp).toBe(155);
      expect(p.statsBeforeBoost?.mov).toBe(4);
      expect(p.stats).toBeNull(); expect(p.initialEn).toBeNull(); expect(p.readyForStatUse).toBe(false);
      expect(p.blockingIssues).toContain("Friendly AI boost integer rounding is not adopted");
    }
  });
  it("rejects an invalid player equipment plan", () => {
    expect(() => getRobotFriendlyPresetPlan({ presetId: "frontline-support", referenceCoreLevel: 21, playerParty: { ...unboosted, canEquip: false } })).toThrow(/valid/);
  });
  it("keeps null equipment modifiers unknown in the shared player/NPC composition helper", () => {
    const p = resolveRobotBasicPart("standard-armor", 1);
    const result = getRobotEquipmentBaseStatPlan("defense-1", 11, [{ ...p, statModifiers: { hp: null } }]);
    expect(result.stats.hp).toBeNull();
    expect(result.stats.def).toBe(58);
    expect(result.blockingIssues).toContain("Unresolved basic equipment statistics");
  });
  it("does not mutate source catalogs or the trusted player party", () => {
    const before = JSON.stringify([groupRules, unboosted]);
    get("frontline-support", 21);
    expect(JSON.stringify([groupRules, unboosted])).toBe(before);
  });
});

describe("friendly preset integration smokes", () => {
  it("adapts 90 stage plans without promoting candidates or missing Easy reference levels", () => {
    for (const key of listRobotStageKeys()) {
      const stage = getRobotStagePlan(key), p = getRobotStageFriendlyPlans(stage, unboosted);
      expect(p.friends).toHaveLength(2);
      expect(p.isReadyForFormalPlay).toBe(false);
      expect(() => requireApprovedRobotStage(key)).toThrow();
      for (const f of p.friends) {
        expect(f.plan.referenceCoreLevel).toBe(stage.referenceEnemyCoreLevel);
        if (stage.referenceEnemyCoreLevel === null) expect(f.plan.stats).toBeNull();
        else expect(f.plan.readyForStatUse).toBe(true);
      }
    }
  });
  it("connects new friendly HP/EN to base damage and R+2 respawn", () => {
    const friendly = get("frontline-support", 41);
    const estimate = getRobotWeaponDamageEstimate({ weaponId: friendly.basic!.weapon1.id, weaponLevel: friendly.basic!.weapon1.level, attackStats: { melee: friendly.stats!.melee!, ranged: friendly.stats!.ranged! }, targetDef: 50, mode: "normal" });
    expect(estimate.baseDamage).toBe(42); // (124 + sword88) / DEF50
    const players = [1, 2, 3].map(number => ({ id: "p" + number, kind: "controlled" as const, number: number as 1 | 2 | 3, hp: 50, maxHp: 50, en: 30, maxEn: 100, position: { x: number, y: 0 }, statuses: [], carriedObjectiveId: null }));
    const ally = { id: "f1", kind: "friendly-ai" as const, number: 1 as const, hp: 233, maxHp: 233, en: friendly.initialEn!, maxEn: friendly.stats!.en!, position: { x: 0, y: 0 }, statuses: ["test-effect"], carriedObjectiveId: null };
    const initial = createRobotAlliedLifecycle([...players, ally]);
    const c = { board: { width: 8, height: 6, walls: [] }, spawnPriority: [{ x: 0, y: 4 }], occupied: [], structures: [] };
    const dead = applyRobotAlliedDefeats(initial, ["f1"]).state;
    const returned = beginNextRobotAlliedRound(beginNextRobotAlliedRound(dead, c).state, c);
    expect(returned.respawnedUnitIds).toEqual(["f1"]);
    expect(returned.state.allies.find(u => u.id === "f1")).toMatchObject({ hp: 233, en: 60, statuses: [] });
    expect(returned.state.lostBySameRoundWipe).toBe(false);
  });
});
