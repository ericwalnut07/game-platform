import { createRobotRoundInitiative } from "../../src/games/robot-tactics/initiative";
import { describe, expect, it } from "vitest";
import { offlineAddonFixtureProgress } from "../robot-tactics/offlineAddonFixture";
import { weaponCoreFixture, weaponTargetIds } from "../robot-tactics/weaponCoreFixture";
import { fixtureNextRound, fixtureAttack, fixtureCommit } from "../robot-tactics/coreFixture";
import { beginRobotBattleTurn, commitRobotBattlePassive, commitRobotBattleShield, decodeRobotBattleCore, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotFormation, getRobotFormationOptions } from "../../src/games/robot-tactics/formations";
import { commitRobotActiveCombat, getRobotActiveCombatOptions } from "../../src/games/robot-tactics/activeCombat";
import { commitRobotBattleNormalAttack, commitRobotBattleWeaponCombo, getRobotBattleBurstOptions, commitRobotBattleBurstAttack } from "../../src/games/robot-tactics/battleWeaponActions";
import { applyRobotDisplacement } from "../../src/games/robot-tactics/displacement";
import { applyRobotPhaseDamage, applyRobotReactions, getRobotBattleDefense, getRobotDamageFactors } from "../../src/games/robot-tactics/battleEffects";
import { applyRobotBurning } from "../../src/games/robot-tactics/burning";
import { getRobotLoadoutPlan, resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";
import { commitRobotSupport } from "../../src/games/robot-tactics/commonCombat";
import { roundRobotStatProduct } from "../../src/games/robot-tactics/combatMath";
const unit = getRobotBattleUnit;
const identity = (s: RobotBattleCoreState, id = "adopted") => ({ actionId: id, turnId: robotBattleTurnId(s) });
function progress(addons: readonly string[] = [], weapons: readonly [string, string] = ["light-blade", "light-lance"]) {
  const p = offlineAddonFixtureProgress(); return { ...p, party: p.party.map((c, i) => i ? c : { ...c, addons: addons.map(partId => ({ partId })), basic: { ...c.basic, weapon1: { partId: weapons[0], level: 1 }, weapon2: { partId: weapons[1], level: 1 } } }) };
}
function scenario(addons: readonly string[] = [], weapons: readonly [string, string] = ["light-blade", "light-lance"], offset = { x: 0, y: -1 }) {
  return weaponCoreFixture({ progress: progress(addons, weapons), targetIds: ["enemy-supreme-commander"], offsets: [offset] });
}
function formationScene(addons: readonly string[] = ["formation-extension-unlock"], pincer = false) {
  const s = scenario(addons), o = unit(s, "p1").position!;
  return decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p2" ? { ...u, position: { x: o.x, y: o.y + (pincer ? -2 : 1) } } : u.id === "f1" ? { ...u, position: { x: o.x + 1, y: o.y } } : u) });
}
const form = (s: RobotBattleCoreState, kind: "line" | "pair-defense" | "protection" | "pincer", participants = ["p2"]) => commitRobotFormation(s, { ...identity(s), kind, weaponId: "light-blade", participantIds: participants, targetIds: kind === "line" || kind === "pincer" ? ["enemy-supreme-commander"] : [] });

describe("adopted formation geometry and independent defense ledgers", () => {
  it("requires orthogonal rear support, respects weapon range and ignores unit facing for line", () => {
    const s = formationScene(), after = form(s, "line"); expect(unit(after, "p1").energy.action!.energyCost).toBe(40); expect(unit(after, "p2")).toEqual(unit(s, "p2")); expect(after.latest!.damage[0]!.effectKind).toBe("line");
    const wrong = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p2" ? { ...u, position: { x: u.position!.x + 1, y: u.position!.y } } : u) });
    expect(() => form(wrong, "line")).toThrow(); expect(getRobotFormationOptions(s, "line", "light-lance").selections.length).toBeGreaterThan(0);
  });
  it("requires adjacent opposite orthogonal sides plus the team unlock for pincer", () => {
    const s = formationScene(undefined, true), after = form(s, "pincer"); expect(after.latest!.damage[0]!.effectKind).toBe("pincer"); expect(unit(after, "p1").energy.action!.energyCost).toBe(50);
    expect(() => form(formationScene([], true), "pincer")).toThrow("拡張"); expect(() => form(formationScene(), "pincer")).toThrow();
  });
  it("buffs only the pair initiator and expires at its next own-turn start", () => {
    const s = formationScene(), after = form(s, "pair-defense"); expect(unit(after, "p2").formationDefense).toBeUndefined(); expect(unit(after, "p1").formationDefense![0]!.increase).toBe(unit(s, "p2").stats.def * .75);
    expect(unit(after, "p1").energy.action!.energyCost).toBe(35); const expired = beginRobotBattleTurn(fixtureNextRound(after), "p1"); expect(unit(expired, "p1").formationDefense).toBeUndefined();
  });
  it("protects all L participants even after moving, preserves support actions and caps each technique separately", () => {
    const s = formationScene(), after = form(s, "protection", ["p2", "f1"]); for (const id of ["p1", "p2", "f1"]) expect(unit(after, id).formationDefense![0]!.kind).toBe("protection");
    expect(unit(after, "p2").energy).toEqual(unit(s, "p2").energy);
    const u = unit(after, "p1"), base = u.stats.def;
    const both = { ...u, formationDefense: [{ kind: "pair-defense" as const, increase: 999, cap: .6, ownerId: "p2", expiresOwnTurn: 1 }, ...u.formationDefense!] };
    expect(getRobotBattleDefense(after, both)).toBeCloseTo(base / .4); expect(getRobotBattleDefense(after, { ...u, formationDefense: [{ ...u.formationDefense![0]!, increase: 999 }] })).toBe(base * 2);
  });
  it("applies combined formation amplifiers only to the increase, then multiplies independent reduction factors", () => {
    const s = formationScene(["formation-amplifier-light", "formation-amplifier-medium"]), after = form(s, "pair-defense"), u = unit(after, "p1"); expect(u.formationDefense![0]!.increase).toBe(unit(s, "p2").stats.def * .75 * 1.25); expect(u.energy.action!.energyCost).toBe(50);
    expect(getRobotDamageFactors({ ...u, defended: true, shielded: true, stationaryDefense: true })).toEqual([.8, .55, .85]);
  });
  it("allows railgun formations without any standalone weapon surcharge", () => {
    const s = scenario([], ["superheavy-railgun", "light-lance"]), o = unit(s, "p1").position!;
    const l = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p2" ? { ...u, position: { x: o.x + 1, y: o.y } } : u.id === "f1" ? { ...u, position: { x: o.x, y: o.y + 1 } } : u) });
    const after = commitRobotFormation(l, { ...identity(l), kind: "delta", weaponId: "superheavy-railgun", participantIds: ["p2", "f1"], targetIds: ["enemy-supreme-commander"] }); expect(unit(after, "p1").energy.action!.energyCost).toBe(75);
  });
});

describe("stepwise displacement and collision damage", () => {
  function scene(addons: readonly string[] = [], otherKind: "enemy" | "ally" | null = null) {
    const s = scenario(addons, ["binding-hammer", "light-pistol"], { x: 1, y: 0 }), o = unit(s, "p1").position!, otherId = otherKind === "ally" ? "p2" : weaponTargetIds(s)[0]!;
    return { s: otherKind ? decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === otherId ? { ...u, position: { x: o.x + 2, y: o.y } } : u) }) : s, otherId };
  }
  it("moves one tile at a time, ignores movement type, does not alter action/EN and stops without chain pushing", () => {
    const { s, otherId } = scene([], "enemy"), before = unit(s, "enemy-supreme-commander"), out = applyRobotDisplacement(s, { sourceId: "p1", targetId: before.id, distance: 2 }, "push");
    expect(unit(out.state, before.id).position).toEqual(before.position); expect(out.events).toEqual([]); expect(unit(out.state, otherId)).toEqual(unit(s, otherId)); expect(unit(out.state, before.id).energy).toEqual(before.energy);
  });
  it("adds exact fixed 20 to both colliding enemies once, unaffected by DEF or shield", () => {
    const { s, otherId } = scene(["wall-collision-breaker"], "enemy"), out = applyRobotDisplacement(s, { sourceId: "p1", targetId: "enemy-supreme-commander", distance: 2 }, "push"); expect(out.events.map(e => e.damage)).toEqual([20, 20]); expect(unit(out.state, otherId).hp).toBe(Math.max(0, unit(s, otherId).hp - 20));
  });
  it("does not damage allies or apply breaker damage to pulls", () => {
    const { s } = scene(["wall-collision-breaker"], "ally"); expect(applyRobotDisplacement(s, { sourceId: "p1", targetId: "enemy-supreme-commander", distance: 2 }, "push").events).toEqual([]);
    expect(applyRobotDisplacement(s, { sourceId: "p1", targetId: "enemy-supreme-commander", distance: 1, pull: true }, "pull").events).toEqual([]);
  });
  it("connects all three impact family pairs as one EN40 action and reuses the normal ranged hit", () => {
    for (const ranged of ["light-pistol", "sniper-rifle", "light-grenade-launcher"]) {
      const s = scenario([], ["binding-hammer", ranged], { x: ranged === "sniper-rifle" ? 3 : ranged === "light-grenade-launcher" ? 2 : 1, y: 0 }), after = commitRobotBattleWeaponCombo(s, { ...identity(s), primaryWeaponId: "binding-hammer", secondaryWeaponId: ranged, targetIds: ["enemy-supreme-commander"] }); expect(unit(after, "p1").energy.action!.energyCost).toBe(40); expect(unit(after, "p1").energy.normalHitRecovered).toBe(false); expect(after.actionIds.length).toBe(s.actionIds.length + 1); expect(decodeRobotBattleCore(after)).toEqual(after);
    }
  });
});

describe("reaction receipts, costs and charge", () => {
  it("pays overwatch only at stance start, prioritizes it over thrust interception, remembers each target and serializes receipts", () => {
    const s = scenario(["thrust-interception"], ["light-pistol", "light-lance"], { x: 2, y: 0 });
    const stance = commitRobotActiveCombat(s, { ...identity(s), kind: "overwatch", weaponId: "light-pistol", targetIds: [] }), paid = unit(stance, "p1").energy;
    const hit = applyRobotReactions(stance, { kind: "move", unitId: "enemy-supreme-commander" }, "one"); expect(hit.events.length).toBe(1); expect(unit(hit.state, "p1").energy).toEqual(paid); expect(unit(hit.state, "p1").interceptionRound).toBeUndefined(); expect(unit(hit.state, "p1").overwatch!.hitUnitIds).toEqual(["enemy-supreme-commander"]);
    const second = applyRobotReactions(hit.state, { kind: "move", unitId: "enemy-supreme-commander" }, "two"); expect(second.events.length).toBe(1); expect(unit(second.state, "p1").interceptionRound).toBe(1);
    expect(applyRobotReactions(second.state, { kind: "move", unitId: "enemy-supreme-commander" }, "three").events).toEqual([]); expect(decodeRobotBattleCore(stance)).toEqual(stance);
  });
  it("counterattacks after direct damage and its debuff, costs zero and does not consume another action or chain", () => {
    let s = weaponCoreFixture({ mission: 2, progress: progress(["melee-counter-drive"]), targetIds: ["commander"], offsets: [{ x: 0, y: -1 }] });
    s = commitRobotBattlePassive(s, { ...identity(s, "wait"), kind: "wait" }); s = beginRobotBattleTurn(s, "commander"); const ownAction = unit(s, "p1").energy.action;
    const after = commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "assault-rifle", targetId: "p1" });
    expect(after.latest!.damage.length).toBe(2); expect(after.latest!.damage[1]!.sourceId).toBe("p1"); expect(unit(after, "p1").counterRound).toBe(1); expect(unit(after, "p1").energy.action).toEqual(ownAction); expect(unit(after, "p1").weaponDebuffs!.length).toBeGreaterThan(0);
  });
  it("requires actual ordinary movement and base melee max range 1 for charges", () => {
    const s = scenario([], ["light-blade", "light-lance"], { x: 2, y: 0 }); expect(getRobotActiveCombatOptions(s, "charge-strike", "light-blade").disabledReason).toContain("通常移動後");
    const moved = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, moved: true } } : u) });
    expect(getRobotActiveCombatOptions(moved, "charge-strike", "light-lance").disabledReason).toContain("基本最大射程1");
    const after = commitRobotActiveCombat(moved, { ...identity(moved), kind: "charge-strike", weaponId: "light-blade", targetIds: ["enemy-supreme-commander"] }); expect(unit(after, "p1").energy.action).toEqual({ kind: "normal-attack", energyCost: 0 }); expect(unit(after, "p1").energy.normalHitRecovered).toBe(true); expect(unit(after, "p1").position!.x).toBe(unit(s, "p1").position!.x + 1);
  });
  it("uses super-charge EN25, no normal-hit EN, and excludes attack assist from both charge modes", () => {
    const s = scenario(["super-charge-thruster", "normal-attack-assist-small"], ["light-blade", "light-lance"], { x: 3, y: 0 }), moved = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, moved: true } } : u) });
    const after = commitRobotActiveCombat(moved, { ...identity(moved), kind: "super-charge", weaponId: "light-blade", targetIds: ["enemy-supreme-commander"] }); expect(unit(after, "p1").energy.action!.energyCost).toBe(25); expect(unit(after, "p1").energy.normalHitRecovered).toBe(false);
    const plain = { ...moved, units: moved.units.map(u => u.id === "p1" ? { ...u, addons: [{ partId: "super-charge-thruster" }] } : u) }; expect(commitRobotActiveCombat(plain, { ...identity(plain), kind: "super-charge", weaponId: "light-blade", targetIds: ["enemy-supreme-commander"] }).latest!.damage).toEqual(after.latest!.damage);
  });
});

describe("burning lifecycle, healing and stat rounding", () => {
  function burned(addons: readonly string[] = [], hp = 100) { const s = weaponCoreFixture({ progress: progress(addons), sourceHp: hp, targetIds: ["enemy-supreme-commander"], offsets: [{ x: 2, y: 0 }] }); return decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, burning: applyRobotBurning(null, "enemy-supreme-commander", 10, 0) } : u) }); }
  it("connects ranged half damage, stores the strongest owner on refresh and restores a legal checkpoint", () => {
    const s = scenario(["burning-round"], ["light-pistol", "light-lance"], { x: 2, y: 0 }), after = commitRobotActiveCombat(s, { ...identity(s), kind: "burning-round", weaponId: "light-pistol", targetIds: ["enemy-supreme-commander"] });
    expect(unit(after, "enemy-supreme-commander").burning).toMatchObject({ sourceId: "p1", sourceCoreLevel: 41, ticksRemaining: 3 }); expect(unit(after, "p1").energy.action!.energyCost).toBe(30); expect(unit(after, "p1").energy.normalHitRecovered).toBe(false); expect(unit(after, "enemy-supreme-commander").weaponDebuffs).toBeUndefined(); expect(decodeRobotBattleCore(after)).toEqual(after);
    expect(() => decodeRobotBattleCore({ ...after, units: after.units.map(u => u.burning ? { ...u, burning: { ...u.burning, sourceCoreLevel: 1 } } : u) })).toThrow("owner core level");
  });
  it("ticks after recovery, bypasses DEF, honors percentage reduction and never grants damage EN", () => {
    const s = burned(), after = commitRobotBattleShield(s, identity(s)); expect(unit(after, "p1").hp).toBe(96); expect(unit(after, "p1").energy.damagedRecovered).toBe(false); expect(unit(after, "p1").burning!.ticksRemaining).toBe(2); expect(after.latest!.damage[0]!.effectKind).toBe("special:dot"); expect(decodeRobotBattleCore(after)).toEqual(after);
  });
  it("heals before burn, cleanses it before ticking and removes it on defeat/respawn with owner EN+5", () => {
    const s = burned(["self-repair-unit"], 1), healed = commitRobotActiveCombat(s, { ...identity(s), kind: "self-heal", targetIds: ["p1"] }); expect(unit(healed, "p1").hp).toBe(1 + Math.floor(unit(s, "p1").maxHp / 4) - 8);
    const cleanse = burned(["status-repair"], 1), clean = commitRobotSupport(cleanse, { ...identity(cleanse), kind: "cleanse", targetId: "p1" }); expect(unit(clean, "p1").hp).toBe(1); expect(unit(clean, "p1").burning).toBeUndefined(); expect(clean.latest!.damage).toEqual([]);
    const lethal = burned([], 1), after = commitRobotBattlePassive(lethal, { ...identity(lethal), kind: "wait" }); expect(unit(after, "p1").hp).toBe(0); expect(unit(after, "p1").burning).toBeUndefined(); expect(unit(after, "enemy-supreme-commander").energy.en).toBe(unit(lethal, "enemy-supreme-commander").energy.en + 5); expect(unit(after, "enemy-supreme-commander").dotKillRound).toBe(1);
    const returned = fixtureNextRound(fixtureNextRound(after)); expect(unit(returned, "p1").hp).toBe(unit(returned, "p1").maxHp); expect(unit(returned, "p1").burning).toBeUndefined();
  });
  it("applies fixed EN first and multiplies both ratios before one exact half-up, independent of equip order", () => {
    const p = progress(["emergency-capacitor", "overload-propulsion", "circular-controller"]), plan = getRobotLoadoutPlan(p.party[0]!, getRobotOfflineAvailability(p)); expect(plan.effectiveStats.en).toBe(Math.floor(((plan.baseStatsBeforeAddons.en! + 30) * 56 + 50) / 100));
    const reverse = getRobotLoadoutPlan({ ...p.party[0]!, addons: [...p.party[0]!.addons].reverse() }, getRobotOfflineAvailability(p)); expect(reverse.effectiveStats).toEqual(plan.effectiveStats); expect(roundRobotStatProduct(90, [1.15])).toBe(104);
  });
  it("allows area attacks with normal assist equipped while excluding its damage bonus", () => {
    const s = scenario(["normal-attack-assist-small"], ["light-grenade-launcher", "light-lance"], { x: 2, y: 0 }), center = getRobotBattleBurstOptions(s, "light-grenade-launcher").centers[0]!;
    const input = { ...identity(s), weaponId: "light-grenade-launcher", centerId: center.centerId, neighborIds: [] };
    const plain = { ...s, units: s.units.map(u => u.id === "p1" ? { ...u, addons: [] } : u) }; expect(commitRobotBattleBurstAttack(s, input).latest!.damage).toEqual(commitRobotBattleBurstAttack(plain, input).latest!.damage); expect(resolveRobotBasicPart("light-lance", 1).range!.max).toBe(2);
  });
});

it("blocks diagonal displacement only when both side cells are blocked and treats the board edge as one collision", () => {
  const base = scenario(["wall-collision-breaker"], ["binding-hammer", "light-pistol"]);
  const scene = (walls: { x: number; y: number }[], origin = { x: 5, y: 5 }, target = { x: 6, y: 6 }) => ({ ...base, board: { ...base.board, walls }, units: base.units.map(u => u.id === "p1" ? { ...u, position: origin } : u.id === "enemy-supreme-commander" ? { ...u, position: target } : u) });
  const both = applyRobotDisplacement(scene([{ x: 7, y: 6 }, { x: 6, y: 7 }]), { sourceId: "p1", targetId: "enemy-supreme-commander", distance: 1 }, "corner"); expect(unit(both.state, "enemy-supreme-commander").position).toEqual({ x: 6, y: 6 }); expect(both.events.map(e => e.damage)).toEqual([20]);
  const one = applyRobotDisplacement(scene([{ x: 7, y: 6 }]), { sourceId: "p1", targetId: "enemy-supreme-commander", distance: 1 }, "corner"); expect(unit(one.state, "enemy-supreme-commander").position).toEqual({ x: 7, y: 7 }); expect(one.events).toEqual([]);
  const edge = applyRobotDisplacement(scene([], { x: base.board.width - 2, y: 5 }, { x: base.board.width - 1, y: 5 }), { sourceId: "p1", targetId: "enemy-supreme-commander", distance: 3 }, "edge"); expect(edge.events.map(e => e.damage)).toEqual([20]);
});
it("does not push a target already killed by the impact attack", () => {
  const s = scenario([], ["binding-hammer", "light-pistol"], { x: 1, y: 0 }), target = unit(s, "enemy-supreme-commander");
  const weak = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === target.id ? { ...u, hp: 1 } : u) });
  const after = commitRobotBattleWeaponCombo(weak, { ...identity(weak), primaryWeaponId: "binding-hammer", secondaryWeaponId: "light-pistol", targetIds: [target.id] }); expect(unit(after, target.id).hp).toBe(0); expect(unit(after, target.id).position).toEqual(target.position); expect(after.latest!.damage.length).toBe(1);
});
it("processes all three target-own-turn burn ticks, with duration and ownership surviving each checkpoint", () => {
  let s = scenario(), hp = unit(s, "p1").hp;
  s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, burning: applyRobotBurning(null, "enemy-supreme-commander", 10, 0) } : u) });
  for (let i = 1; i <= 3; i++) {
    s = commitRobotBattlePassive(s, { ...identity(s, "burn-end:" + i), kind: "wait" }); hp -= 8; expect(unit(s, "p1").hp).toBe(hp); expect(unit(s, "p1").energy.damagedRecovered).toBe(false); expect(decodeRobotBattleCore(s)).toEqual(s);
    if (i < 3) { expect(unit(s, "p1").burning!.ticksRemaining).toBe(3 - i); s = beginRobotBattleTurn(fixtureNextRound(s), "p1"); }
  }
  expect(unit(s, "p1").burning).toBeUndefined();
});
it("resolves lethal arrival interception before the prepaid super-charge attack and saves no partial attack", () => {
  const s = weaponCoreFixture({ progress: progress(["super-charge-thruster"]), sourceHp: 1, targetIds: ["enemy-supreme-commander"], offsets: [{ x: 3, y: 0 }] }), o = unit(s, "p1").position!, template = unit(s, "f1");
  // Explicit medium-unit test fixture, never a formal M01 roster or a new encounter default.
  const enemy = { ...template, id: "reaction-fixture", name: "reaction fixture", kind: "medium" as const, number: null, squadId: null, position: { x: o.x + 1, y: o.y + 1 }, energy: { ...template.energy, ownTurn: 1, turnOpen: false, en: 75, maxEn: 100, action: { kind: "other" as const, energyCost: 25 } }, parts: [{ partId: "light-pistol", level: 1 }, { partId: "light-lance", level: 1 }], overwatch: { weaponId: "light-pistol", hitUnitIds: [], multiplier: .7 } };
  const ready = decodeRobotBattleCore({ ...s, units: [...s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, moved: true } } : u), enemy], actors: [...s.actors, { id: enemy.id, unitIds: [enemy.id] }] });
  const after = commitRobotActiveCombat(ready, { ...identity(ready), kind: "super-charge", weaponId: "light-blade", targetIds: ["enemy-supreme-commander"] }); expect(unit(after, "p1").hp).toBe(0); expect(unit(after, "p1").energy.action!.energyCost).toBe(25); expect(unit(after, "enemy-supreme-commander").hp).toBe(unit(s, "enemy-supreme-commander").hp); expect(after.latest!.damage.every(e => e.sourceId === enemy.id)).toBe(true); expect(decodeRobotBattleCore(after)).toEqual(after);
});

it("normal heavy and quake hammer attacks reuse the adopted one/two-tile displacement without normal status suppression", () => {
  for (const [weapon, distance] of [["heavy-hammer", 1], ["quake-hammer", 2]] as const) {
    const s = scenario([], [weapon, "light-pistol"], { x: 1, y: 0 }), position = unit(s, "enemy-supreme-commander").position!;
    const after = commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: weapon, targetId: "enemy-supreme-commander" }); expect(unit(after, "enemy-supreme-commander").position).toEqual({ x: position.x + distance, y: position.y }); expect(unit(after, "p1").energy.normalHitRecovered).toBe(true);
  }
});
it("quake-hammer epicenter uses its existing push distance and resolves fixed 25 around the stop after any breaker collision", () => {
  const s = scenario(["epicenter-echo", "wall-collision-breaker"], ["quake-hammer", "light-pistol"], { x: 1, y: 0 }), o = unit(s, "p1").position!, other = weaponTargetIds(s)[0]!;
  const ready = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === other ? { ...u, position: { x: o.x + 2, y: o.y } } : u) });
  const after = commitRobotActiveCombat(ready, { ...identity(ready), kind: "epicenter-echo", weaponId: "quake-hammer", targetIds: ["enemy-supreme-commander"] }); expect(unit(after, "p1").energy.action!.energyCost).toBe(50); expect(after.latest!.damage.filter(e => e.effectKind === "special:collision").map(e => e.damage)).toEqual([20, 20]); expect(after.latest!.damage.find(e => e.effectKind === "special:echo")!.damage).toBe(25);
});

it("uses saved round SPD for multiple reactors, skips later shots after defeat and limits reaction kill EN across distinct enemies", () => {
  const s = scenario([], ["light-pistol", "light-lance"], { x: 2, y: 0 }), o = unit(s, "p1").position!, victim2 = weaponTargetIds(s)[0]!;
  const closed = { ...s, turn: { ...s.turn, actorId: null }, units: s.units.map(u => u.id === "p1" ? { ...u, stats: { ...u.stats, spd: 999 }, energy: { ...u.energy, turnOpen: false, en: 50 } } : u.id === "p2" ? { ...u, stats: { ...u.stats, spd: 1 }, position: { x: o.x + 2, y: o.y + 2 }, addons: [{ partId: "thrust-interception" }], parts: [...u.parts.filter(p => resolveRobotBasicPart(p.partId, p.level).slot !== "weapon"), { partId: "light-lance", level: 1 }, { partId: "light-blade", level: 1 }] } : u.id === "enemy-supreme-commander" || u.id === victim2 ? { ...u, hp: 1, ...(u.id === victim2 ? { position: { x: o.x + 2, y: o.y + 1 } } : {}) } : u) };
  const snapshot = createRobotRoundInitiative(closed);
  let ready = beginRobotBattleTurn(decodeRobotBattleCore({ ...closed, initiative: snapshot }), "p1");
  ready = commitRobotActiveCombat(ready, { ...identity(ready), kind: "overwatch", weaponId: "light-pistol", targetIds: [] });
  // Live SPD changes do not reorder the already saved round snapshot.
  ready = { ...ready, units: ready.units.map(u => u.id === "p1" ? { ...u, stats: { ...u.stats, spd: 1 } } : u.id === "p2" ? { ...u, stats: { ...u.stats, spd: 999 } } : u) };
  const before = unit(ready, "p1").energy.en, first = applyRobotReactions(ready, { kind: "move", unitId: "enemy-supreme-commander" }, "priority"); expect(first.events.map(e => e.sourceId)).toEqual(["p1"]); expect(unit(first.state, "p2").interceptionRound).toBeUndefined(); expect(unit(first.state, "p1").energy.en).toBe(before + 5);
  const second = applyRobotReactions(first.state, { kind: "move", unitId: victim2 }, "second-enemy"); expect(second.events.map(e => e.sourceId)).toEqual(["p1"]); expect(unit(second.state, "p1").energy.en).toBe(before + 5); expect(unit(second.state, "p1").overwatch!.hitUnitIds).toEqual(["enemy-supreme-commander", victim2]);
});
it("limits DOT kill EN to the living effect owner once per round and never gives damage EN", () => {
  const s = scenario(), victim2 = weaponTargetIds(s)[0]!;
  const ready = { ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 40 } } : u.id === "enemy-supreme-commander" || u.id === victim2 ? { ...u, hp: 1 } : u) };
  const first = applyRobotPhaseDamage(ready, "p1", "enemy-supreme-commander", 1, "dot-one", "special:dot", "dot"); expect(unit(first.state, "p1").energy.en).toBe(45); expect(unit(first.state, "enemy-supreme-commander").energy.damagedRecovered).toBe(false);
  const second = applyRobotPhaseDamage(first.state, "p1", victim2, 1, "dot-two", "special:dot", "dot"); expect(unit(second.state, "p1").energy.en).toBe(45);
  const deadOwner = { ...ready, units: ready.units.map(u => u.id === "p1" ? { ...u, hp: 0 } : u) }; expect(unit(applyRobotPhaseDamage(deadOwner, "p1", victim2, 1, "dead-owner-dot", "special:dot", "dot").state, "p1").energy.en).toBe(40);
});

it("uses effective weapon range for line and pull while charge eligibility continues to use the base range", () => {
  const s = scenario(["extend-lance", "lance-pull-strike"], ["lance", "light-pistol"], { x: 0, y: 3 }), o = unit(s, "p1").position!;
  const ready = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p2" ? { ...u, position: { x: o.x, y: o.y - 1 } } : u) });
  expect(getRobotFormationOptions(ready, "line", "lance").selections.some(c => c.targetIds.includes("enemy-supreme-commander"))).toBe(true); expect(getRobotActiveCombatOptions(ready, "pull-strike", "lance").targetIds).toContain("enemy-supreme-commander");
  const plain = { ...ready, units: ready.units.map(u => u.id === "p1" ? { ...u, addons: [{ partId: "lance-pull-strike" }], energy: { ...u.energy, moved: true } } : u) }; expect(getRobotFormationOptions(plain, "line", "lance").selections).toEqual([]); expect(getRobotActiveCombatOptions(plain, "pull-strike", "lance").targetIds).toEqual([]); expect(getRobotActiveCombatOptions(plain, "charge-strike", "lance").disabledReason).toContain("基本最大射程1");
});

it("settles facility destruction and an end-turn DOT boss defeat once, preserving the immediate loss condition", () => {
  let s = weaponCoreFixture({ openTurn: false }); s = beginRobotBattleTurn(s, "enemy-supreme-commander");
  s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "enemy-supreme-commander" ? { ...u, hp: 1, burning: applyRobotBurning(null, "p1", 41, 0) } : u) });
  const after = fixtureCommit(s, [fixtureAttack(s, "enemy-supreme-commander", "allied-final-relay", 9999)]);
  expect(after.objective.kind === "m30" && after.objective.state).toMatchObject({ result: "lost", resultReason: "facility-destroyed", bossDefeated: true }); expect(unit(after, "enemy-supreme-commander").hp).toBe(0); expect(after.latest!.damage.at(-1)!.effectKind).toBe("special:dot"); expect(decodeRobotBattleCore(after)).toEqual(after);
});
