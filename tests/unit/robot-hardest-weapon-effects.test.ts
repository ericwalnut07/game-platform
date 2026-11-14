import { createRobotRoundInitiative } from "../../src/games/robot-tactics/initiative";
import { commitRobotActiveCombat } from "../../src/games/robot-tactics/activeCombat";
import { expect, it } from "vitest";
import { commitRobotBattleNormalAttack, commitRobotBattleSlashAttack, commitRobotExpansionSpecial, getRobotBattleSweepOptions, getRobotExpansionSpecialOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { beginRobotBattleTurn, commitRobotBattlePassive, decodeRobotBattleCore, getRobotBattleEffectiveStats, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { robotBattleJson, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";

const boss = "enemy-supreme-commander";
const identity = (s: RobotBattleCoreState) => ({ actionId: "expansion", turnId: robotBattleTurnId(s) });
function scene(weaponId: string, offsets = [{ x: 1, y: 0 }], targetIds = [boss]) {
  const s = weaponCoreFixture({ offsets, targetIds });
  return decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? {
    ...u, parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: weaponId, level: 14 } : p),
  } : u) });
}

it("applies the saved three-tick burn on plasma hits, including sweep", () => {
  const s = scene("plasma-blade");
  const expected = { sourceId: "p1", sourceCoreLevel: 41, ticksRemaining: 3 };
  const hit = commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "plasma-blade", targetId: boss });
  expect(getRobotBattleUnit(hit, boss).burning).toMatchObject(expected);
  expect(decodeRobotBattleCore(robotBattleJson(hit))).toEqual(hit);
  expect(getRobotBattleSweepOptions(s, "plasma-blade").targetSets).toContainEqual([boss]);
  const sweep = commitRobotBattleSlashAttack(s, { ...identity(s), weaponId: "plasma-blade", kind: "sweep", targetIds: [boss] });
  expect(getRobotBattleUnit(sweep, boss).burning).toMatchObject(expected);
  const staged = scene("plasma-blade", [{ x: 2, y: 0 }]);
  const moved = { ...staged, units: staged.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, moved: true } } : u) };
  const charge = commitRobotActiveCombat(moved, { ...identity(moved), kind: "charge-strike", weaponId: "plasma-blade", targetIds: [boss] });
  expect(getRobotBattleUnit(charge, boss).burning).toMatchObject(expected);
});

it("uses the linear sniper DEF factor only before moving", () => {
  const s = scene("linear-sniper", [{ x: 3, y: 0 }]);
  const fire = (state: RobotBattleCoreState) => commitRobotBattleNormalAttack(state, { ...identity(state), weaponId: "linear-sniper", targetId: boss }).latest!.damage[0]!.damage!;
  for (const key of ["moved", "usedExtraMove"] as const) {
    const moved = { ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, [key]: true } } : u) };
    expect(fire(s)).toBeGreaterThan(fire(moved));
  }
});

it("pays one EN15 action for the impact hit and persists the MOV penalty", () => {
  const s = scene("impact-breaker");
  const after = commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "impact-breaker", targetIds: [boss] });
  expect(getRobotBattleUnit(after, "p1").energy.action).toEqual({ kind: "other", energyCost: 15 });
  const target = getRobotBattleUnit(after, boss);
  expect(target.position).toEqual(getRobotBattleUnit(s, boss).position);
  expect(getRobotBattleEffectiveStats(target).mov).toBe(Math.max(1, target.stats.mov - 1));
  expect(decodeRobotBattleCore(robotBattleJson(after))).toEqual(after);
  const targetTurn = beginRobotBattleTurn(after, boss);
  expect(getRobotBattleEffectiveStats(getRobotBattleUnit(targetTurn, boss)).mov).toBe(Math.max(1, target.stats.mov - 1));
  const waited = commitRobotBattlePassive(targetTurn, { actionId: "target-wait", turnId: robotBattleTurnId(targetTurn), kind: "wait" });
  expect(getRobotBattleEffectiveStats(getRobotBattleUnit(waited, boss)).mov).toBe(target.stats.mov);
});

it("commits two ordered pulse hits once and stops when the first defeats the target", () => {
  const s = scene("pulse-assault", [{ x: 2, y: 0 }]);
  const run = (state: RobotBattleCoreState) => commitRobotExpansionSpecial(state, { ...identity(state), weaponId: "pulse-assault", targetIds: [boss] });
  const after = run(s);
  const withoutEnergy = { ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 14 } } : u) };
  expect(getRobotExpansionSpecialOptions(withoutEnergy, "pulse-assault").choices).toEqual([]);
  expect(() => run(withoutEnergy)).toThrow();
  expect(after.latest!.damage).toHaveLength(2);
  expect(getRobotBattleUnit(after, "p1").energy.action?.energyCost).toBe(15);
  expect(after.actionIds).toHaveLength(s.actionIds.length + 1);
  expect(run(after)).toBe(after);
  const weak = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === boss ? { ...u, hp: 1 } : u) });
  expect(run(weak).latest!.damage).toHaveLength(1);
});

it("projects the phase lance in near/far order and executes through the runtime", () => {
  const front = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const s = scene("phase-lance", [{ x: 1, y: 0 }, { x: 2, y: 0 }], [front, boss]);
  const options = getRobotExpansionSpecialOptions(s, "phase-lance");
  expect(options.choices.some(c => c.targets.map(t => t.target.id).join() === [front, boss].join())).toBe(true);
  expect(() => commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "phase-lance", targetIds: [boss, front] })).toThrow();
  const key = s.key, departure = { battleId: s.id, key, party: [] };
  const fresh = { ...s, turn: { ...s.turn, actorId: null }, units: s.units.map(u => u.id === "p1" ? { ...u, stats: { ...u.stats, spd: 999 } } : u) };
  const snapshot = robotBattleJson({ ...s, initiative: createRobotRoundInitiative(fresh) });
  const battle = { runtimeId: robotFormalRuntime.id, runtimeVersion: robotFormalRuntime.version, departure, sequence: 0, committedActionIds: [], snapshot, latestSummary: "" };
  const projected = robotFormalBattleAdapter.project(battle);
  expect(projected.choices).toContainEqual(expect.objectContaining({ commandId: "expansion-special:phase-lance", orderedTargets: true }));
  const out = robotFormalRuntime.act(snapshot, { kind: "expansion-special", weaponId: "phase-lance", targetIds: [front, boss] }, departure);
  expect(decodeRobotBattleCore(out.snapshot).latest!.damage.map(d => d.targetId)).toEqual([front, boss]);
});

it("centers the cluster burst on a legal target and caps diagonal splash at two neighbors", () => {
  const seed = weaponCoreFixture();
  const ids = seed.actors.find(a => a.unitIds.length === 3)!.unitIds;
  const s = scene("cluster-cannon", [{ x: 3, y: 0 }, { x: 4, y: 1 }, { x: 3, y: -1 }, { x: 4, y: -1 }], [boss, ...ids]);
  const options = getRobotExpansionSpecialOptions(s, "cluster-cannon");
  const set = options.choices.find(c => c.targets[0]?.target.id === boss && c.targets.length === 3)!;
  expect(set.areaCells).toHaveLength(8);
  expect(options.choices.every(c => c.targets.length <= 3)).toBe(true);
  const targetIds = set.targets.map(t => t.target.id);
  const after = commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "cluster-cannon", targetIds: [targetIds[0]!, ...targetIds.slice(1).reverse()] });
  expect(after.latest!.damage.map(d => d.targetId)).toEqual(targetIds);
  expect(after.latest!.areaCells).toHaveLength(9);
  expect(getRobotBattleUnit(after, "p1").energy.action?.energyCost).toBe(20);
  expect(() => commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "cluster-cannon", targetIds: [boss, ...ids] })).toThrow();
});
