import { describe, expect, it } from "vitest";
import frames from "../../docs/design/robot-tactics/frames.json";
import { getRobotCoreHp, getRobotFrameStatPlan, getRobotPartUpgradeExp, interpolateRobotValue } from "../../src/games/robot-tactics/growth";
import { getRobotCoreCap, getRobotLoadoutPlan, listRobotAddonIds, listRobotBasicPartIds, listRobotFrameIds, resolveRobotBasicPart, type RobotLoadout } from "../../src/games/robot-tactics/equipment";
import { applyRobotBasicEndTurnRecovery, getRobotBasicActionModifiers, resolveRobotEquipmentEffect } from "../../src/games/robot-tactics/equipmentEffects";

const levels = [1, 5, 8, 10];
// Independent expectations from the adopted PR #72 tables, not derived from the runtime catalog.
const modifiers: Record<string, Record<string, readonly number[]>> = {
  "standard-engine": { en: [7, 18, 29, 38] },
  "high-mobility-engine": { mov: [1, 1, 1, 1], spd: [-4, -1, 2, 5], en: [-6, 2, 10, 18] },
  "high-output-engine": { mov: [-1, -1, -1, -1], en: [25, 40, 55, 70] },
  "standard-armor": { hp: [7, 17, 26, 34], def: [3, 5, 7, 9] },
  "light-armor": { hp: [3, 12, 19, 26], spd: [5, 8, 11, 13] },
  "heavy-armor": { hp: [12, 24, 34, 44], def: [6, 9, 12, 15], mov: [-1, -1, -1, -1], spd: [-8, -8, -8, -8] },
  "standard-control": { melee: [4, 14, 24, 32], ranged: [4, 14, 24, 32] },
  "melee-control": { melee: [8, 22, 37, 50], ranged: [-4, -7, -10, -12] },
  "ranged-control": { ranged: [8, 22, 37, 50], melee: [-4, -7, -10, -12] },
  "general-support": { en: [8, 18, 30, 40] },
  "shield-support": { en: [0, 7, 14, 20] },
  "boost-support": { en: [0, 6, 12, 18] },
  "light-engine": { spd: [10, 16, 23, 30], hp: [-8, -6, -4, -2], en: [0, 8, 14, 20] },
  "heavy-defense-armor": { hp: [16, 30, 43, 56], def: [12, 18, 25, 32], mov: [-1, -1, -1, -1], spd: [-12, -12, -12, -12] },
  "guardian-control": { def: [5, 11, 17, 23], en: [10, 20, 30, 40], mov: [-1, -1, -1, -1] },
  "storage-support": { en: [4, 12, 22, 32] },
  "variable-output-engine": { en: [12, 29, 45, 55], spd: [3, 10, 15, 18] },
  "functional-armor": { hp: [18, 34, 46, 54], def: [7, 13, 17, 21], spd: [-4, -4, -4, -4] },
  "hybrid-control": { melee: [8, 22, 35, 42], ranged: [8, 22, 35, 42], en: [3, 10, 16, 20] },
  "regenerative-support": { en: [6, 16, 27, 34] },
  "advanced-mobility-engine": { mov: [1, 1, 1, 1], spd: [3, 11, 16, 20], en: [10, 25, 34, 42] },
  "self-repair-armor": { hp: [20, 37, 49, 60], def: [10, 15, 19, 22] },
  "limit-control": { melee: [15, 36, 56, 70], ranged: [15, 36, 56, 70], en: [-15, -15, -15, -15] },
  "efficient-regeneration": { en: [18, 35, 49, 60] }
};
const powers: Record<string, readonly number[]> = {
  "light-lance": [45, 68, 90, 110], "light-grenade-launcher": [25, 42, 59, 74],
  "howitzer": [36, 64, 84, 101], "whirlwind-saber": [47, 84, 121, 155],
  "suppression-mace": [42, 74, 103, 132], "wide-grenade-cannon": [40, 80, 109, 140]
};

describe("adopted October 30 growth tables", () => {
  for (const [id, expected] of Object.entries(modifiers)) it(id + " preserves all four adopted modifier anchors", () => {
    for (const [stat, values] of Object.entries(expected)) expect(levels.map(lv => (resolveRobotBasicPart(id, lv).statModifiers as Record<string, number>)[stat])).toEqual(values);
  });
  for (const [id, expected] of Object.entries(powers)) it(id + " preserves all four adopted power anchors", () => {
    expect(levels.map(lv => resolveRobotBasicPart(id, lv).weaponPower)).toEqual(expected);
  });
  it("uses the new five core HP anchors and their own intermediate growth", () => {
    expect([1, 11, 21, 31, 41].map(getRobotCoreHp)).toEqual([45, 72, 105, 137, 170]);
    expect([6, 16, 26, 36].map(getRobotCoreHp)).toEqual([59, 89, 121, 154]);
    for (const lv of [0, 42, 1.5, NaN]) expect(() => getRobotCoreHp(lv)).toThrow();
  });
  it("preserves all ten inclusive frame HP anchors without adding core HP twice", () => {
    const expected: Record<string, readonly number[]> = {
      "attack-1": [48, 108, 173], "reactor-1": [51, 111, 176], "defense-1": [63, 138, 207],
      "mobile-1": [45, 105, 170], "defense-2": [54, 127, 196], "attack-2-a": [48, 108, 173],
      "attack-2-b": [48, 108, 173], "reactor-2": [51, 111, 176], "mobile-2": [49, 111, 178], "all-rounder": [49, 117, 190]
    };
    for (const [id, values] of Object.entries(expected)) expect([1, 21, 41].map(lv => getRobotFrameStatPlan(id, lv).stats.hp)).toEqual(values);
    expect(getRobotFrameStatPlan("attack-1", 11).stats.hp).toBe(75);
    expect(getRobotFrameStatPlan("attack-1", 31).stats.hp).toBe(140);
  });
  it("interpolates non-HP/MOV frame totals but preserves the core-level MOV step", () => {
    expect(getRobotFrameStatPlan("mobile-1", 11).stats.melee).toBe(65);
    expect(getRobotFrameStatPlan("mobile-1", 31).stats.ranged).toBe(100);
    expect(getRobotFrameStatPlan("mobile-1", 20).stats.mov).toBe(4);
    expect(getRobotFrameStatPlan("mobile-1", 21).stats.mov).toBe(5);
    for (const f of frames.frames) for (let lv = 1; lv <= 41; lv++) {
      const p = getRobotFrameStatPlan(f.id, lv);
      for (const stat of ["hp", "melee", "ranged", "def", "spd", "en", "mov"] as const) expect(Number.isInteger(p.stats[stat])).toBe(true);
      expect(p.blockingIssues).toEqual([]);
    }
  });
  it("interpolates frame-only HP bonuses separately from the adopted core HP curve", () => {
    const p = getRobotFrameStatPlan("defense-1", 11);
    expect(p.coreHp).toBe(72);
    expect(p.frameHpBonus).toBe(26);
    expect(p.stats.hp).toBe(98);
    expect(p.blockingIssues).toEqual([]);
    expect(getRobotFrameStatPlan("defense-1", 31).stats.hp).toBe(172);
    expect(getRobotFrameStatPlan("defense-2", 11).stats.hp).toBe(88);
    expect(getRobotFrameStatPlan("mobile-2", 11).stats.hp).toBe(77);
    expect(getRobotFrameStatPlan("all-rounder", 11).stats.hp).toBe(80);
  });
  it("applies signed half-up rounding, keeps nulls unknown, and does not round fractions", () => {
    expect(interpolateRobotValue([{ level: 1, value: -4 }, { level: 5, value: -1 }], 3)).toBe(-2);
    expect(interpolateRobotValue([{ level: 1, value: null }, { level: 5, value: 10 }], 3)).toBeNull();
    expect(interpolateRobotValue([{ level: 1, value: 0.1 }, { level: 5, value: 0.15 }], 3, false)).toBeCloseTo(0.125);
    expect(() => interpolateRobotValue([{ level: 5, value: 1 }, { level: 1, value: 2 }], 3)).toThrow();
  });
  it("preserves eight newly specified Lv8 CAP values and all upgrade EXP costs", () => {
    const ids = ["variable-output-engine", "functional-armor", "hybrid-control", "regenerative-support", "advanced-mobility-engine", "self-repair-armor", "limit-control", "efficient-regeneration"];
    expect(ids.map(id => resolveRobotBasicPart(id, 8).cap)).toEqual([39, 43, 31, 32, 42, 46, 36, 35]);
    expect(Array.from({ length: 9 }, (_, i) => getRobotPartUpgradeExp(i + 1, i + 2))).toEqual([80, 120, 170, 235, 275, 330, 360, 415, 465]);
    expect(getRobotPartUpgradeExp(1, 10)).toBe(2450);
    expect(getRobotPartUpgradeExp(5, 5)).toBe(0);
    expect([1, 21, 41].map(getRobotCoreCap)).toEqual([100, 200, 300]);
    expect(() => getRobotPartUpgradeExp(5, 4)).toThrow();
  });
  it("assembles attack I Lv41 plus armor Lv10 as HP207 and does not mutate catalogs", () => {
    const loadout: RobotLoadout = {
      coreId: "core-a", coreLevel: 41, frameId: "attack-1", addons: [], basic: {
        engine: { partId: "standard-engine", level: 1 }, weapon1: { partId: "light-blade", level: 1 }, weapon2: { partId: "light-pistol", level: 1 },
        armor: { partId: "standard-armor", level: 10 }, control: { partId: "standard-control", level: 1 }, special: { partId: "general-support", level: 1 }
      }
    };
    const available = { frames: listRobotFrameIds(), basicParts: listRobotBasicPartIds(), addons: listRobotAddonIds() };
    const before = JSON.stringify(loadout);
    const p = getRobotLoadoutPlan(loadout, available);
    expect(p.baseStatsBeforeAddons.hp).toBe(207);
    expect(p.baseStatBlockingIssues).toEqual([]);
    expect(p.capUsed).toBe(111);
    expect(p.canEquip).toBe(true);
    expect(JSON.stringify(loadout)).toBe(before);
  });
});

describe("level-dependent basic equipment effects", () => {
  it("multiplies shield support reduction and keeps fractional combat values", () => {
    const reductions = levels.map(lv => resolveRobotBasicPart("shield-support", lv).effect);
    expect(reductions).toEqual([0.1, 0.15, 0.2, 0.25].map(extraReduction => ({ kind: "shield", extraReduction })));
    const level3 = resolveRobotBasicPart("shield-support", 3);
    expect(level3.effect).toEqual({ kind: "shield", extraReduction: 0.125 });
    const p = getRobotBasicActionModifiers([level3]);
    expect(p.shieldDamageMultiplier).toBeCloseTo(0.48125);
    expect(p.shieldReductionPercentForDisplay).toBe(51.88);
    expect(getRobotBasicActionModifiers([resolveRobotBasicPart("shield-support", 10)]).shieldDamageMultiplier).toBeCloseTo(0.4125);
  });
  it("keeps boosted movement at four cells and decreases its integer EN cost", () => {
    expect(levels.map(lv => resolveRobotBasicPart("boost-support", lv).effect)).toEqual([40, 35, 30, 25].map(energyCost => ({ kind: "boost", distance: 4, energyCost })));
    const p = getRobotBasicActionModifiers([resolveRobotBasicPart("boost-support", 6)]);
    expect([p.extraMoveDistance, p.extraMoveEnergyCost]).toEqual([4, 33]);
    expect(getRobotBasicActionModifiers([]).extraMoveDistance).toBe(3);
  });
  it("uses stationary storage recovery and counts extra movement as movement", () => {
    const p = [resolveRobotBasicPart("storage-support", 10)];
    const state = { hp: 60, maxHp: 100, en: 20, maxEn: 100, moved: false, usedExtraMove: false };
    expect(applyRobotBasicEndTurnRecovery(p, state).recoveredEn).toBe(22);
    expect(applyRobotBasicEndTurnRecovery(p, { ...state, moved: true }).recoveredEn).toBe(0);
    expect(applyRobotBasicEndTurnRecovery(p, { ...state, usedExtraMove: true }).recoveredEn).toBe(0);
    expect(applyRobotBasicEndTurnRecovery(p, { ...state, en: 95 }).recoveredEn).toBe(5);
  });
  it("interpolates passive regeneration and stationary repair, clips maxima and never revives", () => {
    const parts = [resolveRobotBasicPart("efficient-regeneration", 6), resolveRobotBasicPart("self-repair-armor", 6)];
    const state = { hp: 98, maxHp: 100, en: 20, maxEn: 100, moved: false, usedExtraMove: false };
    expect(applyRobotBasicEndTurnRecovery(parts, state)).toEqual({ hp: 100, en: 26, recoveredHp: 2, recoveredEn: 6 });
    expect(applyRobotBasicEndTurnRecovery(parts, { ...state, moved: true }).recoveredHp).toBe(0);
    expect(applyRobotBasicEndTurnRecovery(parts, { ...state, hp: 0 })).toEqual({ hp: 0, en: 20, recoveredHp: 0, recoveredEn: 0 });
    expect(levels.map(lv => resolveRobotBasicPart("regenerative-support", lv).effect)).toEqual([1, 2, 3, 4].map(amount => ({ kind: "energy-regeneration", amount })));
    expect(() => resolveRobotEquipmentEffect({ kind: "extra-move-boost", fixedMove: 4, energyCostAt: [1, 10], values: [null, 25] }, 5)).toThrow(/Unresolved/);
  });
});
