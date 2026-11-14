import { createRobotRoundInitiative } from "../../src/games/robot-tactics/initiative";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { robotBattleJson, robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { expect, it } from "vitest";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";
import { commitRobotBattleNormalAttack, commitRobotExpansionSpecial, commitRobotHitAndAway, getRobotExpansionSpecialOptions, getRobotHitAndAwayOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { decodeRobotBattleCore, getRobotBattleLegalMoves, getRobotBattleUnit, moveRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { applyRobotReactions, getRobotBattleDefense } from "../../src/games/robot-tactics/battleEffects";

const boss = "enemy-supreme-commander";
const identity = (s: RobotBattleCoreState) => ({ actionId: "inferno", turnId: robotBattleTurnId(s) });
const lights = () => weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds;
function scene(weaponId: string, offsets = [{ x: 1, y: 0 }], targetIds = [boss]) {
  const s = weaponCoreFixture({ offsets, targetIds });
  return decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? {
    ...u, parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: weaponId, level: 14 } : p),
  } : u) });
}

it("offers a single overdrive follow-up only when the initial hit defeats its target", () => {
  const other = lights()[0]!;
  const s = scene("overdrive-saber", [{ x: 1, y: 0 }, { x: 0, y: 1 }], [boss, other]);
  expect(getRobotExpansionSpecialOptions(s, "overdrive-saber").choices.some(c => c.targets.length === 2 && c.targets[0]!.target.id === boss)).toBe(false);
  const weak = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === boss ? { ...u, hp: 1 } : u) });
  const after = commitRobotExpansionSpecial(weak, { ...identity(weak), weaponId: "overdrive-saber", targetIds: [boss, other] });
  expect(after.latest!.damage.map(d => d.targetId)).toEqual([boss, other]);
  expect(getRobotBattleUnit(after, "p1").energy.action?.energyCost).toBe(25);
});

it("charges once for three rifle hits and stops at the lethal hit", () => {
  const s = scene("dual-burst-rifle");
  const fire = (state: RobotBattleCoreState) => commitRobotExpansionSpecial(state, { ...identity(state), weaponId: "dual-burst-rifle", targetIds: [boss] });
  const out = fire(s);
  expect(out.latest!.damage).toHaveLength(3);
  expect(getRobotBattleUnit(out, "p1").energy.action?.energyCost).toBe(25);
  const threshold = out.latest!.damage[0]!.damage! + 1;
  expect(fire(decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === boss ? { ...u, hp: threshold } : u) })).latest!.damage).toHaveLength(2);
});

it("uses separate aether rail options and requires 50 EN for boosted output", () => {
  const s = scene("aether-rail-cannon", [{ x: 3, y: 0 }]);
  const fire = (state: RobotBattleCoreState, boosted: boolean) => commitRobotExpansionSpecial(state, {
    ...identity(state), weaponId: "aether-rail-cannon", targetIds: [boss], boosted,
  });
  const ordinary = fire(s, false), boosted = fire(s, true);
  expect(getRobotBattleUnit(ordinary, "p1").energy.action?.energyCost).toBe(30);
  expect(getRobotBattleUnit(boosted, "p1").energy.action?.energyCost).toBe(50);
  expect(boosted.latest!.damage[0]!.damage!).toBeGreaterThan(ordinary.latest!.damage[0]!.damage!);
  const limited = { ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en: 49 } } : u) };
  expect(() => fire(limited, true)).toThrow("EN不足");
});

it("calculates meteor from rounded-up half of maximum EN and each target's DEF alone", () => {
  const neighbor = lights()[0]!;
  const s = scene("meteor-buster", [{ x: 3, y: 0 }, { x: 4, y: 1 }], [boss, neighbor]);
  const source = getRobotBattleUnit(s, "p1");
  const energy = { ...source.energy, maxEn: 181, en: 100 };
  const build = (level: number) => ({ ...s, units: s.units.map(u => u.id === source.id ? { ...u, energy,
    parts: u.parts.map(p => p.partId === "meteor-buster" ? { ...p, level } : p),
  } : u) });
  const fire = (level: number) => {
    const state = build(level);
    return commitRobotExpansionSpecial(state, { ...identity(state), weaponId: "meteor-buster", targetIds: [boss, neighbor] });
  };
  const result = fire(14);
  expect(getRobotBattleUnit(result, source.id).energy.action?.energyCost).toBe(91);
  expect(result.latest!.damage.map(d => d.damage)).toEqual([boss, neighbor].map((id, i) => {
    const def = getRobotBattleDefense(s, getRobotBattleUnit(s, id));
    return Math.max(1, Math.floor(Math.floor(20 * 91 ** 2 / (100 * def)) * (i === 0 ? .7 : .4)));
  }));
  expect(fire(20).latest!.damage).toEqual(result.latest!.damage);
});

it("keeps the fortress counter allowance independent, pays 10 EN and requires active defense", () => {
  const s = scene("fortress-mace");
  const hit = { kind: "attacked", hits: [{ sourceId: boss, targetId: "p1" }] } as const;
  expect(applyRobotReactions(s, hit, "idle").events).toEqual([]);
  const defended = { ...s, units: s.units.map(u => u.id === "p1" ? { ...u, defended: true } : u) };
  const response = applyRobotReactions(defended, hit, "first");
  expect(response.events).toContainEqual(expect.objectContaining({ sourceId: "p1", targetId: boss }));
  const reactor = getRobotBattleUnit(response.state, "p1");
  expect(reactor.energy.en).toBe(getRobotBattleUnit(s, "p1").energy.en - 10);
  expect(reactor.fortressCounterRound).toBe(s.allied.round);
  expect(reactor.counterRound).toBeUndefined();
  expect(applyRobotReactions(response.state, hit, "again").events).toEqual([]);
});

it("preserves the accel movement origin through save and returns only for hit-and-away", () => {
  const s = scene("accel-lancer");
  expect(getRobotHitAndAwayOptions(s).targetIds).toEqual([]);
  const origin = getRobotBattleUnit(s, "p1").position!;
  const candidate = getRobotBattleLegalMoves(s, "p1").find(move => {
    const { x, y } = getRobotBattleUnit(s, boss).position!;
    const p = move.destination;
    return Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 2;
  })!;
  const moved = moveRobotBattleUnit(s, { ...identity(s), actionId: "move", unitId: "p1", destination: candidate.destination });
  const saved = decodeRobotBattleCore(JSON.parse(JSON.stringify(moved)));
  expect(getRobotBattleUnit(saved, "p1").accelOrigin).toEqual(origin);
  expect(getRobotHitAndAwayOptions(saved).targetIds).toContain(boss);
  const normal = commitRobotBattleNormalAttack(saved, { ...identity(saved), weaponId: "accel-lancer", targetId: boss });
  const returned = commitRobotHitAndAway(saved, { ...identity(saved), targetId: boss });
  expect(getRobotBattleUnit(normal, "p1").position).toEqual(candidate.destination);
  expect(getRobotBattleUnit(returned, "p1").position).toEqual(origin);
  expect(getRobotBattleUnit(returned, "p1").energy.action?.energyCost).toBe(0);
  expect(getRobotBattleUnit(returned, "p1").accelOrigin).toBeUndefined();
  expect(returned.latest!.damage[0]!.damage).toBe(normal.latest!.damage[0]!.damage);
});

it("projects both aether commands through the formal battle adapter", () => {
  const s = scene("aether-rail-cannon", [{ x: 3, y: 0 }]);
  const fresh = { ...s, turn: { ...s.turn, actorId: null },
    units: s.units.map(u => u.id === "p1" ? { ...u, stats: { ...u.stats, spd: 999 } } : u) };
  const departure = { battleId: s.id, key: s.key, party: [] };
  const snapshot = robotBattleJson({ ...s, initiative: createRobotRoundInitiative(fresh) });
  const view = robotFormalBattleAdapter.project({
    departure, snapshot, runtimeId: robotFormalRuntime.id, runtimeVersion: robotFormalRuntime.version,
    sequence: 0, committedActionIds: [], latestSummary: "",
  });
  expect(view.commands).toContainEqual(expect.objectContaining({ id: "expansion-special:aether-rail-cannon", label: expect.stringContaining("EN30") }));
  expect(view.commands).toContainEqual(expect.objectContaining({ id: "expansion-boosted:aether-rail-cannon", label: expect.stringContaining("EN50") }));
  const out = robotFormalRuntime.act(snapshot, { kind: "expansion-special", weaponId: "aether-rail-cannon", targetIds: [boss], boosted: true }, departure);
  expect(getRobotBattleUnit(decodeRobotBattleCore(out.snapshot), "p1").energy.action?.energyCost).toBe(50);
});
