import { describe, expect, it } from "vitest";
import rules from "../../docs/design/robot-tactics/rules.json";
import { calculateRobotBaseDamage, finalizeRobotDamage, getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";
import type { RobotLineOfSightQuery } from "../../src/games/robot-tactics/lineOfSight";
import { getRobotBasicActionModifiers } from "../../src/games/robot-tactics/equipmentEffects";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";

const sight: RobotLineOfSightQuery = { board: { width: 5, height: 5, walls: [] }, origin: { x: 0, y: 0 }, target: { x: 2, y: 0 } };
const spatial = checkRobotAttackSpatial({ kind: "normal", sight, range: { status: "in-range", distance: 2 } });

describe("adopted final minimum1 damage", () => {
  it("preserves the base floor result0 and applies the minimum at the final stage", () => {
    const base = calculateRobotBaseDamage({ attackStat: 1, weaponPower: 1, targetDef: 100, actionMultiplier: 1, areaMultiplier: 1 });
    expect(base).toBe(0);
    const p = resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => base } });
    expect(p).toEqual({ damage: 1, damageBeforeMinimum: 0, reason: "hit" });
    expect(rules.combat.finalDamage.minimumPerValidDamagingTarget).toBe(1);
  });
  it("applies all defined modifiers before the minimum, never clamping the base first", () => {
    let seenBase: number | null = null;
    const base = calculateRobotBaseDamage({ attackStat: 1, weaponPower: 1, targetDef: 100, actionMultiplier: 1, areaMultiplier: 1 });
    const p = resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => { seenBase = base; return base * 5; } } });
    expect(seenBase).toBe(0);
    expect(p.damage).toBe(1); // a premature minimum would incorrectly give5
    expect(finalizeRobotDamage({ attackLegal: true, dealsDamage: true, damageAfterModifiers: 12 })).toBe(12);
  });
  it("handles fully reduced and sub-one hits with the adopted final floor", () => {
    const shield = getRobotBasicActionModifiers([resolveRobotBasicPart("shield-support", 10)]);
    const p = resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => 1 * shield.shieldDamageMultiplier } });
    expect(p.damageBeforeMinimum).toBeCloseTo(0.4125);
    expect(p.damage).toBe(1);
    for (const amount of [-5, 0, 0.001, 0.5, 1]) expect(finalizeRobotDamage({ attackLegal: true, dealsDamage: true, damageAfterModifiers: amount })).toBe(1);
  });
  it("never turns a deliberately non-damaging push into damage", () => {
    expect(resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "non-damaging" } })).toEqual({ damage: 0, damageBeforeMinimum: null, reason: "non-damaging" });
    expect(finalizeRobotDamage({ attackLegal: true, dealsDamage: false, damageAfterModifiers: 0 })).toBe(0);
  });
  it("never computes or applies damage when the attack is not legal", () => {
    const p = resolveRobotTargetDamage({ attackLegal: false, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => { throw new Error("must not compute"); } } });
    expect(p).toEqual({ damage: 0, damageBeforeMinimum: null, reason: "invalid-attack" });
    expect(finalizeRobotDamage({ attackLegal: false, dealsDamage: true, damageAfterModifiers: 10 })).toBe(0);
  });
  it("never inflicts minimum1 through walls, outside range, or with an unresolved distance metric", () => {
    const checks = [
      checkRobotAttackSpatial({ kind: "normal", sight, range: { status: "out-of-range", distance: 2 } }),
      checkRobotAttackSpatial({ kind: "normal", sight, range: { status: "unresolved", distance: null } }),
      checkRobotAttackSpatial({ kind: "normal", sight: { ...sight, board: { ...sight.board, walls: [{ x: 1, y: 0 }] } }, range: { status: "in-range", distance: 2 } })
    ];
    for (const check of checks) {
      const p = resolveRobotTargetDamage({ attackLegal: true, spatial: check, effect: { kind: "damaging", resolveAfterModifiers: () => { throw new Error("must not compute"); } } });
      expect(p.damage).toBe(0); expect(p.damageBeforeMinimum).toBeNull();
    }
  });
  it("applies the minimum independently to each valid area/formation target", () => {
    const values = [0, 0.4, 8];
    const damage = values.map(amount => resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => amount } }).damage);
    expect(damage).toEqual([1, 1, 8]);
    const delta = checkRobotAttackSpatial({ kind: "delta", range: { status: "unresolved", distance: null }, sight: { ...sight, board: { ...sight.board, walls: [{ x: 1, y: 0 }] } } });
    expect(resolveRobotTargetDamage({ attackLegal: true, spatial: delta, effect: { kind: "damaging", resolveAfterModifiers: () => 0 } }).damage).toBe(1);
    // The exception is spatial only; an invalid delta formation still has no damage.
    expect(resolveRobotTargetDamage({ attackLegal: false, spatial: delta, effect: { kind: "damaging", resolveAfterModifiers: () => 0 } }).damage).toBe(0);
  });
  it("uses adopted DEF10 and final floor, rejecting nonfinite or unsafe results", () => {
    for (const targetDef of [0, -1]) expect(calculateRobotBaseDamage({ attackStat: 1, weaponPower: 1, targetDef, actionMultiplier: 1, areaMultiplier: 1 })).toBe(2);
    expect(finalizeRobotDamage({ attackLegal: true, dealsDamage: true, damageAfterModifiers: 1.4 })).toBe(1);
    for (const value of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => finalizeRobotDamage({ attackLegal: true, dealsDamage: true, damageAfterModifiers: value })).toThrow();
    expect(rules.combat.rangeDistance.metric).toBe("Chebyshev");
  });
});

it("smokes current PR72 weapon power -> shared LOS/range gate -> final target minimum", () => {
  const estimate = getRobotWeaponDamageEstimate({ weaponId: "light-lance", weaponLevel: 5, attackStats: { melee: 100, ranged: 60 }, targetDef: 50, mode: "normal" });
  expect(estimate.terms.weaponPower).toBe(68);
  expect(resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => estimate.baseDamage } }).damage).toBe(33);
  const weak = getRobotWeaponDamageEstimate({ weaponId: "howitzer", weaponLevel: 5, attackStats: { melee: 1, ranged: 1 }, targetDef: 10000, mode: "burst-neighbor" });
  expect(weak.terms.weaponPower).toBe(64); expect(weak.baseDamage).toBe(0);
  expect(resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => weak.baseDamage } }).damage).toBe(1);
});
