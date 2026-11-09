import { expect, it } from "vitest";
import rules from "../../docs/design/robot-tactics/rules.json";
import { commitRobotBattleBurstAttack, commitRobotBattleNormalAttack, commitRobotBattleSpreadAttack, commitRobotBattleWeaponCombo, getRobotBattleBurstOptions, getRobotBattleSpreadOptions, getRobotSpecialWeaponPacket } from "../../src/games/robot-tactics/battleWeaponActions";
import { commitRobotBattleBlast, getRobotBattleBlastOptions } from "../../src/games/robot-tactics/battleBlast";
import { decodeRobotBattleCore, getRobotBattleUnit as unit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotWeaponDamageEstimate, floorRobotDamageProduct } from "../../src/games/robot-tactics/combatMath";
import { checkRobotLineOfSight } from "../../src/games/robot-tactics/lineOfSight";
import { getRobotEnergyRecoveryAmounts } from "../../src/games/robot-tactics/energy";
import { getRobotShieldActionPlan } from "../../src/games/robot-tactics/equipmentEffects";
import { createRobotPerformanceDraft, getRobotPerformanceReport } from "../../src/games/robot-tactics/performanceCheck";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { weaponAreaCaseProgress, weaponAreaCoreFixture, weaponAreaFixtureProgress } from "../robot-tactics/weaponAreaFixture";
import { createWeaponFixtureRuntime } from "../robot-tactics/weaponFixtureRuntime";
const boss = "enemy-supreme-commander", primary = "howitzer";
const identity = (s: RobotBattleCoreState, actionId = "one-area") => ({ actionId, turnId: robotBattleTurnId(s) });
const burst = (s: RobotBattleCoreState, ids: readonly string[] = [], weaponId = primary) => commitRobotBattleBurstAttack(s, { ...identity(s), weaponId, centerId: boss, neighborIds: ids });
const spread = (s: RobotBattleCoreState, a = primary, b = "assault-rifle") => commitRobotBattleSpreadAttack(s, { ...identity(s), primaryWeaponId: a, secondaryWeaponId: b, centerId: boss });
const options = (s: RobotBattleCoreState, id = primary) => getRobotBattleBurstOptions(s, id).centers.find(c => c.centerId === boss)!;
const setEn = (s: RobotBattleCoreState, en: number) => decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en } } : u) });

it("inherits updated PR79 targeting while retaining shared part levels and growth", () => {
  const p = rules.combat.weaponFamilies.blast.burst.targetSelection; expect(p.status).toBe("user-adopted-2026-11-01"); expect(p.neighborSelectionCapacity).toBe(2); expect(p.allowNoNeighborSelection).toBe(true);
  const c = rules.combat.actions.weaponFamilyComboMatrix.differentFamilies.categories.find(x => x.id === "ranged-ranged")!;
  expect(c.energyCost).toBe(50); if (typeof c.effect !== "object" || !("targetSelection" in c.effect)) throw new Error("Missing adopted spread selection"); expect(c.effect.targetSelection!.execution).toContain("immediately"); expect(rules.progression.equipment.sharedBasicPartLevels).toBeDefined();
});
for (const id of ["light-grenade-launcher", "howitzer", "heavy-missile-cannon", "wide-grenade-cannon"]) it(`${id} normal100 is one enemy while confirmed burst is center70 plus chosen neighbors40`, () => {
  const s = weaponAreaCoreFixture({ weapons: [id, "double-edged-sword"] }), raw = JSON.stringify(s), source = unit(s, "p1"), center = unit(s, boss), selected = options(s, id).neighborIds.slice(0, 2);
  const normal = commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: id, targetId: boss }); expect(normal.latest!.damage).toHaveLength(1); expect(normal.latest!.damage[0]!.damage).toBe(getRobotWeaponDamageEstimate({ weaponId: id, weaponLevel: 1, attackStats: source.stats, targetDef: center.stats.def, mode: "normal" }).baseDamage);
  const after = burst(s, selected, id), events = after.latest!.damage; expect(events.map(e => e.targetId)).toEqual([boss, ...selected]); expect(after.attackIds).toEqual(["one-area:hit:1"]);
  for (const [i, event] of events.entries()) expect(event.damage).toBe(getRobotWeaponDamageEstimate({ weaponId: id, weaponLevel: 1, attackStats: source.stats, targetDef: unit(s, event.targetId).stats.def, mode: i === 0 ? "burst-center" : "burst-neighbor" }).baseDamage);
  for (const u of s.units.filter(u => u.id !== "p1" && ![boss, ...selected].includes(u.id))) expect(unit(after, u.id).hp).toBe(u.hp);
  expect(unit(after, "p1").hp).toBe(source.hp); expect(unit(after, "p1").energy).toMatchObject({ action: { kind: "normal-attack", energyCost: 0 }, normalHitRecovered: true }); expect(unit(after, "p1").stats).toEqual(source.stats); expect(unit(after, "p1").parts).toEqual(source.parts);
  expect(projectRobotBattleCore(after, { battleId: after.id, sequence: 1 }).latestAction!.hits.every(h => h.pulse === 0)).toBe(true); expect(JSON.stringify(s)).toBe(raw);
});
it("center-only burst is legal, choices are read-only and every advertised subset is executable", () => {
  const s = weaponAreaCoreFixture(), raw = JSON.stringify(s), preview = options(s); expect(preview.neighborIds).toHaveLength(4); expect(preview.neighborSets).toHaveLength(11); expect(preview.neighborSets).toContainEqual([]);
  for (const ids of preview.neighborSets) expect(burst(s, ids).latest!.damage).toHaveLength(1 + ids.length);
  expect(burst(s).latest!.damage.map(e => e.targetId)).toEqual([boss]); expect(JSON.stringify(s)).toBe(raw);
});
it("wide blast adds diagonal candidate but does not auto-select it or increase the two-neighbor limit", () => {
  const narrow = weaponAreaCoreFixture(), wide = weaponAreaCoreFixture({ weapons: ["wide-grenade-cannon", "double-edged-sword"] });
  expect(options(narrow).areaCells).toHaveLength(4); const o = options(wide, "wide-grenade-cannon"); expect(o.areaCells).toHaveLength(8); expect(o.neighborIds).toHaveLength(5); expect(o.neighborSets).toHaveLength(16); expect(o.neighborSets.every(ids => ids.length <= 2)).toBe(true);
  expect(burst(wide, [], "wide-grenade-cannon").latest!.damage).toHaveLength(1);
});
it("neighbors beyond the firing weapon's max range remain eligible around a legal center", () => {
  const s = weaponAreaCoreFixture(), own = unit(s, "p1"), c = unit(s, boss), right = s.units.find(u => u.position?.x === c.position!.x + 1 && u.position.y === c.position!.y)!;
  expect(Math.max(Math.abs(right.position!.x - own.position!.x), Math.abs(right.position!.y - own.position!.y))).toBe(5); expect(options(s).neighborIds).toContain(right.id); expect(burst(s, [right.id]).latest!.damage.map(d => d.targetId)).toEqual([boss, right.id]);
});
it("rejects third/duplicate/center/friendly/facility/outside/dead neighbors and invalid centers atomically", () => {
  const s = weaponAreaCoreFixture(), ids = options(s).neighborIds, raw = JSON.stringify(s);
  for (const bad of [ids.slice(0, 3), [ids[0]!, ids[0]!], [boss], ["p2"], ["allied-final-relay"], ["missing"]]) expect(() => burst(s, bad)).toThrow();
  const center = unit(s, boss), diagonal = s.units.find(u => u.position?.x === center.position!.x + 1 && u.position.y === center.position!.y - 1)!; expect(() => burst(s, [diagonal.id])).toThrow("outside");
  for (const centerId of ["p2", "allied-final-relay", "empty-cell"]) expect(() => commitRobotBattleBurstAttack(s, { ...identity(s), weaponId: primary, centerId, neighborIds: [] })).toThrow();
  const dead = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === ids[0] ? { ...u, hp: 0 } : u) }); expect(() => burst(dead, [ids[0]!])).toThrow("Living"); expect(JSON.stringify(s)).toBe(raw);
});
it("burst area coefficient participates in the base floor, whereas spread uses adopted normal-damage70", () => {
  const p = weaponAreaFixtureProgress(["howitzer", "assault-rifle"]), initial = weaponAreaCoreFixture({ progress: p, en: 50 }), s = decodeRobotBattleCore({ ...initial, units: initial.units.map(u => u.id === "p1" ? { ...u, stats: { ...u.stats, ranged: 14 } } : u) });
  const terms = { weaponId: primary, weaponLevel: 1, attackStats: unit(s, "p1").stats, targetDef: unit(s, boss).stats.def };
  const normal = getRobotWeaponDamageEstimate({ ...terms, mode: "normal" }).baseDamage, center = getRobotWeaponDamageEstimate({ ...terms, mode: "burst-center" }).baseDamage;
  expect(center).not.toBe(Math.floor(normal * 0.7)); expect(burst(s).latest!.damage[0]!.damage).toBe(center); expect(spread(s).latest!.damage[0]!.damage).toBe(Math.max(1, floorRobotDamageProduct(normal, [0.7])));
});
it("applies final minimum per valid burst/spread target after shared post-base factors", () => {
  const s = weaponAreaCoreFixture(), ids = options(s).neighborIds.slice(0, 2), after = commitRobotBattleBurstAttack(s, { ...identity(s), weaponId: primary, centerId: boss, neighborIds: ids }, { postBaseMultipliers: () => [0] }); expect(after.latest!.damage.map(d => d.damage)).toEqual([1, 1, 1]);
  const p = weaponAreaCoreFixture({ progress: weaponAreaCaseProgress("area-spread"), en: 50 }), spreadHit = commitRobotBattleSpreadAttack(p, { ...identity(p), primaryWeaponId: primary, secondaryWeaponId: "assault-rifle", centerId: boss }, { postBaseMultipliers: () => [0] }); expect(spreadHit.latest!.damage.map(d => d.damage)).toEqual(Array(6).fill(1));
});
function wallPair(s: RobotBattleCoreState, weaponId = primary) {
  const neighborId = options(s, weaponId).neighborIds[0]!, reserved = s.units.filter(u => !["p1", boss, neighborId].includes(u.id)).map(u => u.position!);
  const free = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x < s.board.width && p.y < s.board.height && ![...s.board.walls, ...reserved, ...(s.objective.kind === "m30" ? s.objective.state.facility.cells : [])].some(q => q.x === p.x && q.y === p.y);
  for (const wall of s.board.walls) {
    const own = { x: wall.x - 2, y: wall.y - 1 }, center = { x: wall.x + 1, y: wall.y - 1 }, neighbor = { x: wall.x + 1, y: wall.y };
    if ([own, center, neighbor].every(free) && checkRobotLineOfSight({ board: s.board, origin: own, target: center }).clear && !checkRobotLineOfSight({ board: s.board, origin: own, target: neighbor }).clear) return { s: decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, position: own } : u.id === boss ? { ...u, position: center } : u.id === neighborId ? { ...u, position: neighbor } : u) }), neighborId };
  }
  throw new Error("No existing wall fixture pattern");
}
it("lets blast splash hit a wall-shadowed neighbor while the direct impact and normal shot still require LOS", () => {
  const { s, neighborId } = wallPair(weaponAreaCoreFixture());
  const own = unit(s, "p1").position!, center = unit(s, boss).position!, shadow = unit(s, neighborId).position!;
  expect(checkRobotLineOfSight({ board: s.board, origin: own, target: center }).clear).toBe(true);
  expect(checkRobotLineOfSight({ board: s.board, origin: own, target: shadow }).clear).toBe(false);
  expect(options(s).neighborIds).toContain(neighborId);
  const hit = burst(s, [neighborId]);
  expect(hit.latest!.damage.map(d => d.targetId)).toEqual([boss, neighborId]);
  expect(hit.latest!.damage[1]!.damage).toBeGreaterThan(0);
  expect(unit(hit, neighborId).hp).toBeLessThan(unit(s, neighborId).hp);
  expect(getRobotBattleBurstOptions(s, primary).centers.some(c => c.centerId === neighborId)).toBe(false);
  expect(() => commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: primary, targetId: neighborId })).toThrow("壁");

  const profile = weaponAreaCaseProgress("area-spread");
  const pair = wallPair(weaponAreaCoreFixture({ progress: profile, en: 50 }));
  const candidates = getRobotBattleSpreadOptions(pair.s, primary, "assault-rifle").centers;
  expect(candidates.some(c => c.centerId === pair.neighborId)).toBe(false);
  expect(candidates.find(c => c.centerId === boss)?.targetIds).toContain(pair.neighborId);
  const after = spread(pair.s);
  expect(after.latest!.damage.some(d => d.targetId === pair.neighborId)).toBe(true);
  expect(unit(after, pair.neighborId).hp).toBeLessThan(unit(pair.s, pair.neighborId).hp);
});
it("advanced burst/double selection and special burn packet use splash geometry even behind walls", () => {
  const weapon = "heavy-missile-cannon";
  const progress = weaponAreaCaseProgress("area-addon");
  const { s, neighborId } = wallPair(weaponAreaCoreFixture({ progress, en: 50 }), weapon);
  const center = unit(s, boss).position!;
  const burstOptions = getRobotBattleBlastOptions(s, weapon, "burst");
  const entry = burstOptions.centers.find(c => c.targetId === boss)!;
  expect(entry).toBeDefined();
  expect(entry.neighborIds).toContain(neighborId);
  expect(burstOptions.centers.some(c => c.targetId === neighborId)).toBe(false); // Cannot fire directly through the wall.
  const direct = commitRobotBattleBlast(s, {
    ...identity(s, "advanced-burst"), weaponId: weapon, mode: "burst",
    locations: [{ cell: center, neighborIds: [neighborId] }],
  });
  expect(direct.latest!.damage.map(d => d.targetId)).toEqual([boss, neighborId]);
  expect(direct.latest!.damage[1]!.damage).toBeGreaterThan(0);
  const doubleOptions = getRobotBattleBlastOptions(s, weapon, "double");
  const a = doubleOptions.centers.find(c => c.targetId === boss)!;
  expect(a.neighborIds).toContain(neighborId);
  const b = doubleOptions.centers.find(c => c !== a && c.targetId && c.targetId !== neighborId)
    ?? doubleOptions.centers.find(c => c !== a && c.targetId === null && c.neighborIds.length > 0);
  expect(b).toBeDefined();
  const secondary = b!.targetId ? [] : [b!.neighborIds[0]!];
  const doubled = commitRobotBattleBlast(s, {
    ...identity(s, "advanced-double"), weaponId: weapon, mode: "double",
    locations: [{ cell: a.cell, neighborIds: [neighborId] }, { cell: b!.cell, neighborIds: secondary }],
  });
  expect(doubled.latest!.damage.some(d => d.targetId === neighborId && d.damage > 0)).toBe(true);
  const burnPacket = getRobotSpecialWeaponPacket(s, weapon, neighborId, "test-burn", { min: 1, max: 4 }, .5, "burst-neighbor", boss);
  expect(burnPacket.targets[0]!.resolution.reason).toBe("hit");
  expect(burnPacket.targets[0]!.resolution.damage).toBeGreaterThan(0);
  expect(JSON.stringify(s)).toBe(JSON.stringify(wallPair(weaponAreaCoreFixture({ progress, en: 50 }), weapon).s));
});
for (const weapons of [["assault-rifle", "sniper-rifle"], ["assault-rifle", "howitzer"], ["sniper-rifle", "howitzer"]] as const) it(`${weapons.join("+")} spreads automatically to every eligible neighbor, with EN50 once`, () => {
  const s = weaponAreaCoreFixture({ weapons, en: 50 }), source = unit(s, "p1"), result = getRobotBattleSpreadOptions(s, weapons[0], weapons[1]).centers.find(c => c.centerId === boss)!, after = spread(s, weapons[0], weapons[1]);
  expect(result.targetIds).toHaveLength(6); expect(after.latest!.damage.map(d => d.targetId)).toEqual(result.targetIds); expect(after.latest!.damage).toHaveLength(6); expect(after.latest!.areaCells).toHaveLength(9);
  for (const event of after.latest!.damage) { const normal = getRobotWeaponDamageEstimate({ weaponId: weapons[0], weaponLevel: 1, attackStats: source.stats, targetDef: unit(s, event.targetId).stats.def, mode: "normal" }).baseDamage; expect(event.damage).toBe(Math.max(1, floorRobotDamageProduct(normal, [0.7]))); expect(unit(after, event.targetId).weaponDebuffs).toBeUndefined(); }
  expect(unit(after, "p2").hp).toBe(unit(s, "p2").hp); expect(unit(after, "p1").energy).toMatchObject({ action: { kind: "other", energyCost: 50 }, normalHitRecovered: false }); expect(after.actionIds).toEqual(["one-area"]); expect(after.attackIds).toEqual(["one-area:hit:1"]);
  expect(commitRobotBattleWeaponCombo(s, { ...identity(s), primaryWeaponId: weapons[0], secondaryWeaponId: weapons[1], targetIds: [boss] })).toEqual(after);
});
it("railgun spread does not add EN30 or normal-hit recovery, and EN49 has no executable choices", () => {
  const p = weaponAreaCaseProgress("area-railgun"), s = weaponAreaCoreFixture({ progress: p, en: 50 }), after = spread(s, "superheavy-railgun", "howitzer"), source = unit(after, "p1"); expect(source.energy.action!.energyCost).toBe(50); expect(source.energy.normalHitRecovered).toBe(false);
  const recovery = getRobotEnergyRecoveryAmounts(source.energy.maxEn).actionEnd; expect(source.energy.en).toBe(recovery + (source.energy.killRecovered ? 5 : 0));
  const poor = setEn(s, 49), raw = JSON.stringify(poor); expect(getRobotBattleSpreadOptions(poor, "superheavy-railgun", "howitzer")).toMatchObject({ centers: [], disabledReason: "EN不足" }); expect(() => spread(poor, "superheavy-railgun", "howitzer")).toThrow("Insufficient EN"); expect(JSON.stringify(poor)).toBe(raw);
});
it("spread rejects illegal pairs, unheld weapons, extra centers and stale requests without a partial action", () => {
  const s = weaponAreaCoreFixture({ progress: weaponAreaCaseProgress("area-spread"), en: 50 }), raw = JSON.stringify(s);
  for (const pair of [[primary, primary], [primary, "light-blade"], [primary, "sniper-rifle"]]) expect(() => spread(s, pair[0]!, pair[1]!)).toThrow();
  expect(() => commitRobotBattleSpreadAttack(s, { ...identity(s), turnId: "old", primaryWeaponId: primary, secondaryWeaponId: "assault-rifle", centerId: boss })).toThrow(); expect(() => commitRobotBattleWeaponCombo(s, { ...identity(s), primaryWeaponId: primary, secondaryWeaponId: "assault-rifle", targetIds: [boss, options(s).neighborIds[0]!] })).toThrow("One spread center");
  const after = spread(s); expect(spread(after)).toBe(after); expect(JSON.stringify(s)).toBe(raw);
});
it("shared shield factors and isolated performance agree with normal and spread damage", () => {
  const p = weaponAreaCaseProgress("area-spread"), s = weaponAreaCoreFixture({ progress: p, en: 50 }), draft = createRobotPerformanceDraft(p), target = unit(s, boss);
  const report = getRobotPerformanceReport(p, { ...draft, attack: "combo", targetCount: 6, enemy: { ...draft.enemy, hp: target.hp, def: target.stats.def } }); expect(report.dealt!.requiredEn).toBe(50); expect(report.dealt!.hits).toHaveLength(6); expect(report.dealt!.hits[0]!.damage).toBe(spread(s).latest!.damage[0]!.damage);
  const normal = getRobotPerformanceReport(p, { ...draft, attack: "normal", enemy: { ...draft.enemy, hp: target.hp, def: target.stats.def } }); expect(normal.dealt!.totalDamage).toBe(commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: primary, targetId: boss }).latest!.damage[0]!.damage);
  const factors = getRobotShieldActionPlan([]).damageFactors, shielded = commitRobotBattleSpreadAttack(s, { ...identity(s), primaryWeaponId: primary, secondaryWeaponId: "assault-rifle", centerId: boss }, { postBaseMultipliers: () => factors }); const sim = getRobotPerformanceReport(p, { ...draft, attack: "combo", enemyShield: true, enemy: { ...draft.enemy, hp: target.hp, def: target.stats.def } }); expect(shielded.latest!.damage[0]!.damage).toBe(sim.dealt!.totalDamage);
});
it("area display survives codec but rejects duplicate or out-of-board cells without inventing HP hits", () => {
  const s = spread(weaponAreaCoreFixture({ progress: weaponAreaCaseProgress("area-spread"), en: 50 })); expect(decodeRobotBattleCore(s)).toEqual(s); expect(s.latest!.damage).toHaveLength(6); expect(projectRobotBattleCore(s, { battleId: s.id, sequence: 1 }).latestAction!.areaCells).toHaveLength(9);
  for (const areaCells of [[{ x: -1, y: 0 }], [{ x: 1, y: 1 }, { x: 1, y: 1 }]]) expect(() => decodeRobotBattleCore({ ...s, latest: { ...s.latest!, areaCells } })).toThrow();
});
class Storage implements RobotOfflineStorage {
  raw: string; fail = false;
  constructor(kind: "area-burst" | "area-spread") { this.raw = JSON.stringify({ ...createRobotOfflineSave(), progress: weaponAreaCaseProgress(kind) }); }
  async read() { return this.raw; }
  async replace(expected: string | null, next: string) { if (this.fail) throw new Error("disk-full"); if (this.raw !== expected) throw new Error("stale"); this.raw = next; }
}
for (const kind of ["area-burst", "area-spread"] as const) it(`${kind} commits all targets/EN once across failed write, replay, resume and retry`, async () => {
  const storage = new Storage(kind), runtime = createWeaponFixtureRuntime(kind); let id = 0; const session = new RobotOfflineSession(storage, runtime, () => "area-save-" + ++id); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" });
  const before = session.state, raw = storage.raw, initial = decodeRobotBattleCore(before.battle!.snapshot), ids = options(initial).neighborIds.slice(0, 2);
  const action = kind === "area-burst" ? { kind: "burst", centerId: boss, neighborIds: [...ids], energyCost: 999, damage: 9999 } : { kind: "spread", centerId: boss, targetIds: [boss], energyCost: 0, damage: 9999 };
  const request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-area", action }; storage.fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before); expect(storage.raw).toBe(raw);
  storage.fail = false; await session.act(request); const after = session.state, core = decodeRobotBattleCore(after.battle!.snapshot); expect(core.latest!.damage).toHaveLength(kind === "area-burst" ? 3 : 6); expect(core.latest!.damage.every(d => d.damage !== 9999)).toBe(true); expect(unit(core, "p1").energy.action!.energyCost).toBe(kind === "area-burst" ? 0 : 50);
  const restored = new RobotOfflineSession(storage, runtime, () => "unused"); await restored.load(); await restored.act(request); expect(restored.state).toEqual(after); expect(after.progress).toEqual(before.progress); await restored.retry(true); expect(decodeRobotBattleCore(restored.state.battle!.snapshot).units).toEqual(initial.units); expect(restored.state.battle!.departure.party).toEqual(before.battle!.departure.party);
});
