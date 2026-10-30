import { describe, expect, it } from "vitest";
import { calculateRobotBaseDamage, getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotFrameStatPlan } from "../../src/games/robot-tactics/growth";
import { advanceRobotEnergyRound, beginRobotEnergyTurn, commitRobotEnergyAction, createRobotEnergyState, endRobotEnergyTurn, getRobotEnergyRecoveryAmounts, recordRobotEnergyCombatEvent, recordRobotEnergyMove } from "../../src/games/robot-tactics/energy";
import { applyRobotBasicEndTurnRecovery } from "../../src/games/robot-tactics/equipmentEffects";

describe("adopted base damage arithmetic", () => {
  const estimate = (weaponId: string, mode: Parameters<typeof getRobotWeaponDamageEstimate>[0]["mode"] = "normal") =>
    getRobotWeaponDamageEstimate({ weaponId, weaponLevel: 5, attackStats: { melee: 100, ranged: 60 }, targetDef: 50, mode });

  it("selects melee/ranged from all six weapon families", () => {
    for (const id of ["standard-sword", "heavy-hammer", "light-lance"]) expect(estimate(id).attackStatKind).toBe("melee");
    for (const id of ["assault-rifle", "sniper-rifle", "howitzer"]) expect(estimate(id).attackStatKind).toBe("ranged");
    expect(estimate("standard-sword").baseDamage).toBe(33);
    expect(estimate("assault-rifle").baseDamage).toBe(19);
  });
  it("uses the adopted new reward weapon power and floors each target separately", () => {
    expect(estimate("light-lance").terms.weaponPower).toBe(68);
    expect(estimate("howitzer", "burst-center").baseDamage).toBe(17);
    expect(estimate("howitzer", "burst-neighbor").baseDamage).toBe(9);
    expect(estimate("standard-sword", "sweep").baseDamage).toBe(23);
    expect(estimate("standard-sword", "overwatch").baseDamage).toBe(23);
  });
  it("rejects an incompatible area mode rather than silently treating it as normal", () => {
    expect(() => estimate("assault-rifle", "sweep")).toThrow(/slash/);
    expect(() => estimate("standard-sword", "burst-center")).toThrow(/blast/);
    expect(() => estimate("standard-engine")).toThrow(/weapon/);
    expect(() => estimate("missing-weapon")).toThrow();
  });
  it("keeps zero base damage before the adopted final minimum and rejects the unadopted DEF floor", () => {
    const terms = { attackStat: 1, weaponPower: 1, targetDef: 100, actionMultiplier: 1, areaMultiplier: 1 };
    expect(calculateRobotBaseDamage(terms)).toBe(0);
    for (const targetDef of [0, -1, NaN, Infinity]) expect(() => calculateRobotBaseDamage({ ...terms, targetDef })).toThrow();
    for (const attackStat of [-1, NaN, Infinity]) expect(() => calculateRobotBaseDamage({ ...terms, attackStat })).toThrow();
    expect(() => calculateRobotBaseDamage({ ...terms, attackStat: Number.MAX_VALUE, targetDef: 1 })).toThrow();
  });
  it("preserves fractional effective DEF without inventing a DEF rounding rule", () => {
    expect(calculateRobotBaseDamage({ attackStat: 100, weaponPower: 68, targetDef: 57.5, actionMultiplier: 1, areaMultiplier: 1 })).toBe(29);
  });
  it("floors decimal coefficients exactly at integer boundaries", () => {
    expect(calculateRobotBaseDamage({ attackStat: 5, weaponPower: 4, targetDef: 3, actionMultiplier: 1, areaMultiplier: 0.7 })).toBe(21);
    expect(calculateRobotBaseDamage({ attackStat: 5, weaponPower: 4, targetDef: 7, actionMultiplier: 1, areaMultiplier: 0.7 })).toBe(9);
    expect(calculateRobotBaseDamage({ attackStat: 0, weaponPower: 0, targetDef: 1e-7, actionMultiplier: 0.7, areaMultiplier: 0.4 })).toBe(0);
  });
});

describe("base EN ledger", () => {
  it("starts at ceil 30 percent and uses floor for fractional recovery terms", () => {
    expect([0, 1, 79, 80, 100, 101, 200].map(n => createRobotEnergyState(n).en)).toEqual([0, 1, 24, 24, 30, 31, 60]);
    expect(getRobotEnergyRecoveryAmounts(79)).toEqual({ actionEnd: 5, normalHit: 7, charge: 23 });
    expect(getRobotEnergyRecoveryAmounts(80)).toEqual({ actionEnd: 6, normalHit: 8, charge: 24 });
    for (const maxEn of [-1, 0.5, NaN, Infinity]) expect(() => createRobotEnergyState(maxEn)).toThrow();
  });
  it("combines ordinary move, normal hit, kill and action-end recovery once each", () => {
    const original = createRobotEnergyState(100);
    let s = beginRobotEnergyTurn(original);
    s = recordRobotEnergyMove(s, "ordinary");
    expect(s.en).toBe(33);
    expect(recordRobotEnergyMove(s, "ordinary")).toBe(s);
    s = commitRobotEnergyAction(s, { kind: "normal-attack", energyCost: 0 });
    s = recordRobotEnergyCombatEvent(s, "normal-hit");
    expect(s.en).toBe(41);
    expect(recordRobotEnergyCombatEvent(s, "normal-hit")).toBe(s);
    s = recordRobotEnergyCombatEvent(s, "kill");
    expect(s.en).toBe(46);
    expect(recordRobotEnergyCombatEvent(s, "kill")).toBe(s);
    s = endRobotEnergyTurn(s);
    expect(s.en).toBe(52);
    expect(original.en).toBe(30);
    expect(original.action).toBeNull();
    expect(() => endRobotEnergyTurn(s)).toThrow(/open own turn/);
  });
  it("consumes EN before recovery and never funds an unaffordable action with future recovery", () => {
    let s = beginRobotEnergyTurn(createRobotEnergyState(100));
    expect(() => commitRobotEnergyAction(s, { kind: "other", energyCost: 31 })).toThrow(/Insufficient/);
    const action = { kind: "normal-attack" as const, energyCost: 20 };
    s = commitRobotEnergyAction(s, action);
    action.energyCost = 0;
    expect(s.action?.energyCost).toBe(20);
    expect(s.en).toBe(10);
    expect(recordRobotEnergyCombatEvent(s, "normal-hit")).toBe(s);
    expect(endRobotEnergyTurn(s).en).toBe(16);
    expect(() => commitRobotEnergyAction(s, { kind: "charge", energyCost: 0 })).toThrow(/one action/);
  });
  it("grants no normal-hit recovery for a special action even when its EN cost is zero", () => {
    const s = commitRobotEnergyAction(beginRobotEnergyTurn(createRobotEnergyState(100)), { kind: "other", energyCost: 0 });
    expect(recordRobotEnergyCombatEvent(s, "normal-hit")).toBe(s);
  });
  it("stacks charge with move and end recovery without a next-attack buff", () => {
    let s = recordRobotEnergyMove(beginRobotEnergyTurn(createRobotEnergyState(101)), "ordinary");
    s = commitRobotEnergyAction(s, { kind: "charge", energyCost: 0 });
    expect(endRobotEnergyTurn(s).en).toBe(65); // 31 + 3 + (20+5) + (4+2)
  });
  it("recovers on damage only once per round, including before and after its own turn", () => {
    let s = recordRobotEnergyCombatEvent(createRobotEnergyState(100), "damaged");
    expect(s.en).toBe(33);
    s = beginRobotEnergyTurn(s);
    expect(recordRobotEnergyCombatEvent(s, "damaged")).toBe(s);
    s = endRobotEnergyTurn(commitRobotEnergyAction(s, { kind: "other", energyCost: 20 }));
    expect(recordRobotEnergyCombatEvent(s, "damaged")).toBe(s);
    s = advanceRobotEnergyRound(s);
    expect(s.round).toBe(2);
    expect(recordRobotEnergyCombatEvent(s, "damaged").en).toBe(22);
  });
  it("resets own-turn hit/kill allowances without resetting the round allowance", () => {
    let s = beginRobotEnergyTurn(createRobotEnergyState(200));
    s = commitRobotEnergyAction(s, { kind: "normal-attack", energyCost: 0 });
    s = recordRobotEnergyCombatEvent(recordRobotEnergyCombatEvent(recordRobotEnergyCombatEvent(s, "normal-hit"), "kill"), "damaged");
    s = beginRobotEnergyTurn(advanceRobotEnergyRound(endRobotEnergyTurn(s)));
    expect([s.ownTurn, s.round, s.normalHitRecovered, s.killRecovered, s.damagedRecovered]).toEqual([2, 2, false, false, false]);
  });
  it("caps every recovery and consumes its allowance even when already full", () => {
    let s = createRobotEnergyState(1);
    s = recordRobotEnergyCombatEvent(s, "damaged");
    expect(s.en).toBe(1);
    s = beginRobotEnergyTurn(s);
    s = commitRobotEnergyAction(s, { kind: "normal-attack", energyCost: 1 });
    expect(recordRobotEnergyCombatEvent(s, "damaged").en).toBe(0);
    expect(endRobotEnergyTurn(s).en).toBe(1);
  });
  it("extra movement consumes its action cost and does not grant ordinary move EN", () => {
    let s = beginRobotEnergyTurn(createRobotEnergyState(200));
    s = recordRobotEnergyMove(s, "ordinary");
    s = commitRobotEnergyAction(s, { kind: "extra-move", energyCost: 40 });
    s = recordRobotEnergyMove(s, "extra");
    expect(s.en).toBe(23);
    expect(s.usedExtraMove).toBe(true);
    expect(recordRobotEnergyMove(s, "extra")).toBe(s);
    expect(endRobotEnergyTurn(s).en).toBe(32);
  });
  it("rejects invalid phase ordering and fractional or negative costs", () => {
    const s = createRobotEnergyState(100), open = beginRobotEnergyTurn(s);
    expect(() => recordRobotEnergyMove(s, "ordinary")).toThrow();
    expect(() => recordRobotEnergyCombatEvent(s, "kill")).toThrow();
    expect(() => recordRobotEnergyCombatEvent(open, "normal-hit")).toThrow();
    expect(() => endRobotEnergyTurn(open)).toThrow();
    expect(() => beginRobotEnergyTurn(open)).toThrow();
    expect(() => advanceRobotEnergyRound(open)).toThrow();
    expect(() => recordRobotEnergyMove(open, "extra")).toThrow();
    for (const energyCost of [-1, 0.5, NaN, Infinity]) expect(() => commitRobotEnergyAction(open, { kind: "other", energyCost })).toThrow();
  });
});

describe("short equipment-to-combat smoke", () => {
  it("uses the new frame/part stats, damage and ordinary-then-equipment recovery together", () => {
    const frame = getRobotFrameStatPlan("attack-1", 21).stats;
    const control = resolveRobotBasicPart("standard-control", 5);
    const attackStats = { melee: frame.melee! + control.statModifiers.melee!, ranged: frame.ranged! + control.statModifiers.ranged! };
    const estimate = getRobotWeaponDamageEstimate({ weaponId: "light-lance", weaponLevel: 5, attackStats, targetDef: 50, mode: "normal" });
    expect(attackStats.melee).toBe(149);
    expect(estimate.baseDamage).toBe(43);
    let s = beginRobotEnergyTurn(createRobotEnergyState(100));
    s = commitRobotEnergyAction(s, { kind: "charge", energyCost: 0 });
    s = endRobotEnergyTurn(s);
    expect(s.en).toBe(61);
    const extras = applyRobotBasicEndTurnRecovery([resolveRobotBasicPart("storage-support", 5), resolveRobotBasicPart("self-repair-armor", 5)], { hp: 90, maxHp: 100, en: s.en, maxEn: s.maxEn, moved: s.moved, usedExtraMove: s.usedExtraMove });
    expect(extras).toEqual({ hp: 94, en: 73, recoveredHp: 4, recoveredEn: 12 });
  });
});
