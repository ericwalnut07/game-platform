import { describe, expect, it } from "vitest";
import { commitRobotDelta, getRobotDeltaOptions, isRobotFormationL, getRobotExtraMoveOptions, commitRobotExtraMove, getRobotSupportTargets, commitRobotSupport } from "../../src/games/robot-tactics/commonCombat";
import { applyRobotBurning, assertRobotBurning, tickRobotBurning } from "../../src/games/robot-tactics/burning";
import { beginRobotBattleTurn, commitRobotBattlePassive, configureRobotBattleAi, decodeRobotBattleCore, getRobotBattleUnit, moveRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotPartyEquipmentPlan } from "../../src/games/robot-tactics/equipment";
import { getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { commitRobotBattleNormalAttack, commitRobotBattleWeaponCombo } from "../../src/games/robot-tactics/battleWeaponActions";
import { commitRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { weaponCoreFixture, weaponTargetIds } from "../robot-tactics/weaponCoreFixture";
import { fixtureNextRound } from "../robot-tactics/coreFixture";
import { offlineAddonFixtureProgress } from "../robot-tactics/offlineAddonFixture";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";


const unit = getRobotBattleUnit;
const identity = (s: RobotBattleCoreState, actionId = "common-action") => ({ actionId, turnId: robotBattleTurnId(s) });
export function commonProgress(addons: readonly string[] = [], weapons: readonly [string, string] = ["light-blade", "light-lance"]) {
  const p = offlineAddonFixtureProgress();
  return { ...p, party: p.party.map((c, i) => i ? c : { ...c, addons: addons.map(partId => ({ partId })), basic: { ...c.basic, weapon1: { partId: weapons[0], level: 1 }, weapon2: { partId: weapons[1], level: 1 } } }) };
}
function deltaFixture(addons: readonly string[] = [], sword = "double-edged-sword") {
  const base = weaponCoreFixture({ progress: commonProgress(addons, [sword, "light-lance"]) }), origin = unit(base, "p1").position!;
  return decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p2" ? { ...u, position: { x: origin.x + 1, y: origin.y } } : u.id === "f1" ? { ...u, position: { x: origin.x, y: origin.y + 1 } } : u) });
}
const delta = (s: RobotBattleCoreState) => ({ ...identity(s), weaponId: unit(s, "p1").parts.find(p => ["double-edged-sword", "light-blade"].includes(p.partId))!.partId, participantIds: ["p2", "f1"], targetIds: [...weaponTargetIds(s)] });

describe("confirmed common battle actions", () => {
  it("accepts only three distinct corners of a 2x2 square", () => {
    expect(isRobotFormationL([{ position: { x: 0, y: 0 } }, { position: { x: 1, y: 0 } }, { position: { x: 0, y: 1 } }])).toBe(true);
    expect(isRobotFormationL([{ position: { x: 0, y: 0 } }, { position: { x: 2, y: 0 } }, { position: { x: 0, y: 1 } }])).toBe(false);
    expect(isRobotFormationL([{ position: { x: 0, y: 0 } }, { position: { x: 0, y: 0 } }, { position: { x: 1, y: 1 } }])).toBe(false);
  });
  it("pays only source EN/action, preserves supporters, applies actual sword recoil once, deduplicates and resets next round", () => {
    const s = deltaFixture(), input = delta(s), before = unit(s, "p1"), after = commitRobotDelta(s, input);
    expect(unit(after, "p1").energy.action).toEqual({ kind: "other", energyCost: 75 });
    expect(unit(after, "p1").energy.normalHitRecovered).toBe(false);
    expect(unit(after, "p1").energy.en).toBe(before.energy.en - 75 + (unit(after, "p1").energy.killRecovered ? 5 : 0) + (unit(after, "p1").energy.damagedRecovered ? 3 : 0) + getRobotEnergyRecoveryAmounts(before.energy.maxEn).actionEnd);
    for (const id of input.participantIds) expect(unit(after, id)).toEqual(unit(s, id));
    const actualDamage = after.latest!.damage.filter(h => h.effectKind === "delta").reduce((sum, hit) => sum + Math.min(unit(s, hit.targetId).hp, hit.damage ?? 0), 0);
    expect(unit(after, "p1").hp).toBe(before.hp - Math.floor(actualDamage * .1));
    expect(after.spentFormations).toEqual(["delta"]);
    expect(commitRobotDelta(after, input)).toBe(after);
    const other = beginRobotBattleTurn(after, "p2");
    expect(getRobotDeltaOptions(other, "light-blade").disabledReason).toContain("使用済み");
    expect(fixtureNextRound(after).spentFormations).toEqual([]);
    expect(decodeRobotBattleCore(after)).toEqual(after);
  });
  it("rejects stale geometry, repeated targets/supporters and insufficient EN atomically", () => {
    const s = deltaFixture(), raw = JSON.stringify(s), input = delta(s);
    for (const bad of [{ ...input, participantIds: ["p2", "p2"] }, { ...input, targetIds: [input.targetIds[0]!, input.targetIds[0]!] }, { ...input, participantIds: ["p2", "p3"] }]) expect(() => commitRobotDelta(s, bad)).toThrow();
    const low = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 74 } } : u) });
    expect(() => commitRobotDelta(low, delta(low))).toThrow("EN不足"); expect(JSON.stringify(s)).toBe(raw);
  });
  it("adds both adopted source amplifiers once, with no supporter part proc", () => {
    const base = deltaFixture([], "light-blade"), boosted = deltaFixture(["formation-amplifier-light", "formation-amplifier-medium"], "light-blade");
    const a = commitRobotDelta(base, delta(base)), b = commitRobotDelta(boosted, delta(boosted));
    expect(getRobotDeltaOptions(boosted, "light-blade").energyCost).toBe(90);
    expect(unit(b, "p1").energy.action!.energyCost).toBe(90);
    b.latest!.damage.forEach((h, i) => expect(h.damage).toBe(Math.floor(a.latest!.damage[i]!.damage! * 1.25)));
  });
  it("uses existing traversal for extra movement after normal movement and does not charge the ordinary move cost twice", () => {
    const s = weaponCoreFixture({ progress: commonProgress() });
    expect(getRobotExtraMoveOptions(s).disabledReason).toContain("通常移動後");
    const origin = unit(s, "p1").position!, ordinary = { x: origin.x + 1, y: origin.y };
    const moved = moveRobotBattleUnit(s, { ...identity(s, "ordinary"), unitId: "p1", destination: ordinary });
    const choices = getRobotExtraMoveOptions(moved), dest = choices.moves[0]!.destination;
    const after = commitRobotExtraMove(moved, { ...identity(moved), destination: dest });
    expect(unit(after, "p1").position).toEqual(dest); expect(unit(after, "p1").energy.usedExtraMove).toBe(true);
    expect(unit(after, "p1").energy.en).toBe(unit(moved, "p1").energy.en - 40 + getRobotEnergyRecoveryAmounts(unit(s, "p1").energy.maxEn).actionEnd);
    expect(unit(after, "p1").energy.action).toEqual({ kind: "extra-move", energyCost: 40 });
  });
  it("limits stat assist to single normal attacks and keeps combo damage unchanged", () => {
    const base = weaponCoreFixture({ progress: commonProgress() }), boosted = weaponCoreFixture({ progress: commonProgress(["normal-attack-assist-small", "normal-attack-assist-medium"]) }), targetId = weaponTargetIds(base)[0]!;
    const normal = (s: RobotBattleCoreState) => commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "light-blade", targetId });
    expect(normal(boosted).latest!.damage[0]!.damage).toBeGreaterThan(normal(base).latest!.damage[0]!.damage!);
    const combo = (s: RobotBattleCoreState) => commitRobotBattleWeaponCombo(s, { ...identity(s), primaryWeaponId: "light-blade", secondaryWeaponId: "light-lance", targetIds: [targetId] });
    expect(combo(boosted).latest!.damage).toEqual(combo(base).latest!.damage);
  });
  it("supplies 35 EN for 30 EN within weapon range and cleanses only adopted debuffs for 25 EN", () => {
    let s = deltaFixture(["en-supply-round", "status-repair"], "light-blade");
    // Ranged supply uses the real equipped weapon range/LOS and caps at max.
    s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, parts: u.parts.map(p => p.partId === "light-lance" ? { partId: "light-pistol", level: 1 } : p) } : u.id === "p2" ? { ...u, energy: { ...u.energy, en: u.energy.maxEn - 20 } } : u) });
    expect(getRobotSupportTargets(s, "en-supply", "light-pistol").targetIds).toContain("p2");
    const supplied = commitRobotSupport(s, { ...identity(s), kind: "en-supply", weaponId: "light-pistol", targetId: "p2" });
    expect(unit(supplied, "p2").energy.en).toBe(unit(s, "p2").energy.maxEn); expect(unit(supplied, "p2").energy.action).toBeNull();
    const debuffed = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p2" ? { ...u, weaponDebuffs: [{ stat: "spd", delta: -8 }] } : u) });
    const cleaned = commitRobotSupport(debuffed, { ...identity(debuffed), kind: "cleanse", targetId: "p2" });
    expect(unit(cleaned, "p2").weaponDebuffs).toBeUndefined(); expect(unit(cleaned, "p1").energy.action!.energyCost).toBe(25);
  });
  it("requires an equipped team unlock and explicit saved permission for friendly AI to spend its own EN on Delta", () => {
    const locked = deltaFixture(); expect(() => configureRobotBattleAi(locked, { kind: "mode", mode: "auto", allowFormations: true })).toThrow("enabler");
    const equipped = commonProgress(["friendly-ai-formation-enabler"]);
    expect(getRobotPartyEquipmentPlan(equipped.party.map((c, i) => i === 1 ? { ...c, addons: [{ partId: "friendly-ai-formation-enabler" }] } : c), getRobotOfflineAvailability(equipped)).canEquip).toBe(false);
    let s = deltaFixture(["friendly-ai-formation-enabler"], "light-blade");
    expect(() => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p2" ? { ...u, addons: [{ partId: "friendly-ai-formation-enabler" }] } : u) })).toThrow("one per party");
    s = commitRobotBattlePassive(s, { ...identity(s, "source-wait"), kind: "wait" }); s = beginRobotBattleTurn(s, "f1");
    s = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "f1" ? { ...u, energy: { ...u.energy, en: 100, maxEn: 100 } } : u) });
    s = configureRobotBattleAi(s, { kind: "instruction", unitId: "f1", instruction: { tacticId: "defend-location", cell: unit(s, "f1").position! } });
    expect(commitRobotNpcTurn(s, identity(s)).latest!.damage.some(e => e.effectKind === "delta")).toBe(false);
    const on = configureRobotBattleAi(s, { kind: "mode", mode: "auto", allowFormations: true }), after = commitRobotNpcTurn(on, identity(on));
    expect(after.latest!.damage.some(e => e.effectKind === "delta")).toBe(true); expect(unit(after, "f1").energy.action!.energyCost).toBe(75);
    expect(unit(after, "p1").energy).toEqual(unit(on, "p1").energy); expect(decodeRobotBattleCore(on).ai.allowFormations).toBe(true);
  });
  it("preserves atomic CAS, retries, duplicate receipts and reload for formation checkpoints", async () => {
    let raw = JSON.stringify({ ...createRobotOfflineSave(), progress: commonProgress() }), fail = false;
    const storage: RobotOfflineStorage = { read: async () => raw, replace: async (expected, next) => { if (fail || expected !== raw) throw new Error("CAS failure"); raw = next; } };
    const base = { id: "test-common-combat", version: 1, readiness: () => [], validate: (snapshot: import("../../src/games/robot-tactics/offlineSession").RobotJson) => { decodeRobotBattleCore(snapshot); } };
    const runtime = { ...base, create: (departure: import("../../src/games/robot-tactics/offlineSession").RobotOfflineDeparture) => JSON.parse(JSON.stringify({ ...deltaFixture([], "light-blade"), id: departure.battleId })), act: (snapshot: import("../../src/games/robot-tactics/offlineSession").RobotJson) => { const s = decodeRobotBattleCore(snapshot), after = commitRobotDelta(s, delta(s)); return { snapshot: JSON.parse(JSON.stringify(after)), actorKind: "controlled" as const, summary: after.latest!.summary, outcome: null }; } };
    const session = new RobotOfflineSession(storage, runtime, () => "session-common-1"); await session.load(); const started = await session.start({ missionNumber: 30, difficulty: "normal" });
    const request = { battleId: started.battle!.departure.battleId, expectedSequence: 0, actionId: "receipt", action: { kind: "delta" } };
    fail = true; await expect(session.act(request)).rejects.toThrow("CAS"); expect(JSON.parse(raw)).toEqual(started);
    fail = false; const after = await session.act(request); expect(await session.act(request)).toEqual(after);
    const restored = new RobotOfflineSession(storage, runtime, () => "session-common-2"); expect(await restored.load()).toEqual(after); expect(decodeRobotBattleCore(after.battle!.snapshot).spentFormations).toEqual(["delta"]);
    const retry = await restored.retry(true); expect(decodeRobotBattleCore(retry.battle!.snapshot).spentFormations).toBeUndefined();
  });
});

describe("burning ledger only: runtime activation stays blocked pending settlement policy", () => {
  it("ticks on three distinct target turns, survives serialization and deduplicates a repeated tick", () => {
    let ledger = applyRobotBurning(null, "p1", 10, 0), hp = 100;
    for (let turn = 1; turn <= 3; turn++) {
      const tick = tickRobotBurning(JSON.parse(JSON.stringify(ledger)), hp, turn); expect(tick.damage).toBe(8); hp = tick.hp;
      if (tick.burning) { expect(tickRobotBurning(tick.burning, hp, turn).damage).toBe(0); ledger = tick.burning; } else expect(turn).toBe(3);
    }
    expect(hp).toBe(76);
  });
  it("refreshes duration without stacking, refuses uncertain cross-source replacement, and reports lethal damage without assigning rewards", () => {
    const old = applyRobotBurning(null, "p1", 41, 0), tick = tickRobotBurning(old, 100, 1);
    expect(applyRobotBurning(tick.burning, "p1", 41, 1).ticksRemaining).toBe(3);
    expect(() => applyRobotBurning(old, "p2", 1, 0)).toThrow("未確定");
    expect(() => assertRobotBurning({ ...old, ticksRemaining: 4 })).toThrow(); expect(() => tickRobotBurning(old, 100, 2)).toThrow("skipped");
    expect(tickRobotBurning(old, 4, 1)).toEqual({ damage: 4, hp: 0, defeated: true, burning: null });
  });
});
