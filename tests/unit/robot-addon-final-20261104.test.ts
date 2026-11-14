import { describe, expect, it } from "vitest";
import catalog from "../../docs/design/robot-tactics/addons.json";
import final from "../../docs/design/robot-tactics/addons-final-policy-2026-11-04.json";
import constraints from "../fixtures/robot-addon-constraints-20261104.json";
import { weaponAreaCoreFixture, weaponAreaFixtureProgress } from "../robot-tactics/weaponAreaFixture";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";
import { createRobotRoundInitiative } from "../../src/games/robot-tactics/initiative";
import { getRobotBattleBlastOptions, commitRobotBattleBlast, type RobotBlastLocation } from "../../src/games/robot-tactics/battleBlast";
import { getRobotBlastSelectionCost, type RobotBlastMode } from "../../src/games/robot-tactics/blastAddons";
import { decodeRobotBattleCore, getRobotBattleUnit as unit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotWeaponDamageEstimate } from "../../src/games/robot-tactics/combatMath";
import { getRobotBattleNormalAttackOptions, getRobotBattleSpreadOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotActiveCombatOptions, commitRobotActiveCombat } from "../../src/games/robot-tactics/activeCombat";
import { getRobotShieldActionPlan } from "../../src/games/robot-tactics/equipmentEffects";
import { getRobotSweepPlan } from "../../src/games/robot-tactics/sweep";
import { projectRobotBattleCore } from "../../src/client/games/robot-tactics/BattleCoreView";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { assertRobotBattleViewModel } from "../../src/client/games/robot-tactics/BattleViewModel";
import { RobotOfflineSession, createRobotOfflineSave, type RobotOfflineRuntime, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { getRobotAddonCost, getRobotNormalActionCost } from "../../src/games/robot-tactics/combatAddons";
import { getRobotPerformanceReport, createRobotPerformanceDraft } from "../../src/games/robot-tactics/performanceCheck";

const weapon = "heavy-missile-cannon", boss = "enemy-supreme-commander", three = ["empty-tile-targeting", "blast-target-expander", "double-detonation-control"];
const identity = (s: RobotBattleCoreState, actionId = "final-blast") => ({ actionId, turnId: robotBattleTurnId(s) });
function progress(ids: readonly string[] = three, weaponId = weapon) {
  const p = weaponAreaFixtureProgress([weaponId, "light-lance"]);
  return { ...p, party: p.party.map((c, i) => i ? c : { ...c, addons: ids.map(partId => ({ partId })) }) };
}
function scene(ids: readonly string[] = three, en = 100, weaponId = weapon) { return weaponAreaCoreFixture({ progress: progress(ids, weaponId), en }); }
function denseScene(en = 100) {
  const seed = scene(), ids = [boss, ...seed.units.filter(u => !["controlled", "friendly-ai"].includes(u.kind) && u.id !== boss).slice(0, 5).map(u => u.id)];
  const s = weaponCoreFixture({ progress: progress(), targetIds: ids, offsets: [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 3, y: -1 }, { x: 3, y: 1 }, { x: 4, y: -1 }, { x: 4, y: 1 }] });
  return decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, energy: { ...u.energy, en } } : u) });
}
const options = (s: RobotBattleCoreState, mode: RobotBlastMode = "burst", weaponId = weapon) => getRobotBattleBlastOptions(s, weaponId, mode);
const center = (s: RobotBattleCoreState) => options(s).centers.find(c => c.targetId === boss)!;
const hit = (s: RobotBattleCoreState, locations: readonly RobotBlastLocation[], mode: RobotBlastMode = "burst", weaponId = weapon) => commitRobotBattleBlast(s, { ...identity(s), weaponId, mode, locations });

describe("final addon costs and unchanged equipment constraints", () => {
  it("preserves the CAP, acquisition, weapon scope, rarity and equipment restrictions of all 60 parts", () => {
    const legacy = catalog.parts.filter(p => p.acquisition.type === "first-subobjective");
    expect(legacy.map(({ effect: _effect, description: _description, ...p }) => p)).toEqual(constraints);
    expect(legacy).toHaveLength(60);
  });
  for (const [id, adopted] of Object.entries(final.energy)) it(`${id} uses the adopted ${adopted.kind} EN${adopted.value}`, () => {
    expect(getRobotAddonCost(id, adopted.field)).toBe(adopted.value);
  });
  it("keeps fuse as an independent action and free shield/sweep modifiers preserve their base costs", () => {
    expect(catalog.parts.find(a => a.id === "delayed-fuse")!.effect).toMatchObject({ energyCost: 10, attachmentDamage: 0, centerMultiplier: 1, neighborMultiplier: 0.4 });
    expect(getRobotShieldActionPlan([], [{ partId: "shield-amplifier" }]).energyCost).toBe(45);
    expect(getRobotSweepPlan({ partId: "light-blade", level: 1 }, [{ partId: "sweep-target-expander" }]).energyCost).toBe(0);
    expect(getRobotNormalActionCost({ partId: "light-pistol", level: 1 }, [{ partId: "indirect-fire-control" }])).toBe(5);
  });
  it("uses the new dedicated burn/overwatch/heal costs in execution and performance, including zero-EN normal options", () => {
    const s = scene(["burning-round", "overwatch-amplifier", "self-repair-unit"], 15);
    expect(getRobotActiveCombatOptions(s, "burning-round", weapon).energyCost).toBe(15);
    const result = commitRobotActiveCombat(s, { ...identity(s), kind: "burning-round", weaponId: weapon, targetIds: [boss] });
    expect(unit(result, "p1").energy.action!.energyCost).toBe(15);
    const zero = scene(["empty-tile-targeting"], 0);
    expect(getRobotBattleNormalAttackOptions(zero, weapon).disabledReason).toBeNull();
    expect(options(zero).disabledReason).toBeNull();
    const p = progress(["overwatch-amplifier"]), d = createRobotPerformanceDraft(p);
    expect(getRobotPerformanceReport(p, { ...d, attack: "overwatch", currentEn: 25 }).dealt).toMatchObject({ requiredEn: 25, canInitiate: true });
    expect(getRobotPerformanceReport(p, { ...d, attack: "overwatch", currentEn: 24 }).dealt).toMatchObject({ requiredEn: 25, canInitiate: false });
  });
});
describe("manual blast locations, conditional EN and overlap", () => {
  it("requires the empty-center part and at least one neighbor, never creates a fake minimum-one center hit", () => {
    const s = scene(), empty = options(s).centers.find(c => c.targetId === null)!;
    expect(empty).toBeDefined(); expect(() => hit(s, [{ cell: empty.cell, neighborIds: [] }])).toThrow();
    expect(options(scene([])).centers.every(c => c.targetId !== null)).toBe(true);
    const after = hit(s, [{ cell: empty.cell, neighborIds: [empty.neighborIds[0]!] }]);
    expect(after.latest!.damage).toHaveLength(1); expect(after.latest!.damage[0]!.targetId).toBe(empty.neighborIds[0]);
    expect(after.latest!.blastEmptyCenters).toEqual([empty.cell]);
    expect(projectRobotBattleCore(after, { battleId: after.id, sequence: 1 }).visualCues).toContainEqual({ id: "final-blast:empty-blast:0", effect: "blast", cell: empty.cell });
    expect(decodeRobotBattleCore(after)).toEqual(after);
  });
  it("excludes wall/ally/facility cells from empty centers and applies range and LOS to every center", () => {
    const s = scene(), o = options(s), excluded = [...s.board.walls, ...s.units.filter(u => ["controlled", "friendly-ai"].includes(u.kind)).flatMap(u => u.position ? [u.position] : []), ...(s.objective.kind === "m30" ? s.objective.state.facility.cells : [])];
    for (const p of excluded) expect(o.centers.some(c => c.cell.x === p.x && c.cell.y === p.y)).toBe(false);
    const first = o.centers[0]!;
    for (const p of [{ x: -1, y: 0 }, { x: s.board.width, y: 0 }, unit(s, "p1").position!, s.board.walls[0]!]) expect(() => hit(s, [{ cell: p, neighborIds: [first.neighborIds[0] ?? boss] }])).toThrow();
    const far = { x: unit(s, "p1").position!.x, y: Math.min(s.board.height - 1, unit(s, "p1").position!.y + 6) };
    expect(o.centers.some(c => c.cell.x === far.x && c.cell.y === far.y)).toBe(false);
  });
  for (const count of [0, 1, 2, 3, 4]) it(`ordinary blast with ${count} manually chosen neighbors pays ${count > 2 ? 5 : 0} exactly once`, () => {
    const s = scene(), c = center(s), ids = c.neighborIds.slice(0, count), after = hit(s, [{ cell: c.cell, neighborIds: ids }]);
    expect(ids).toHaveLength(count); expect(unit(after, "p1").energy.action!.energyCost).toBe(count > 2 ? 5 : 0);
    expect(after.latest!.damage.map(d => d.targetId)).toEqual([boss, ...ids]);
    for (const d of after.latest!.damage) expect(d.damage).toBe(getRobotWeaponDamageEstimate({ weaponId: weapon, weaponLevel: 1, attackStats: unit(s, "p1").stats, targetDef: unit(s, d.targetId).stats.def, mode: d.targetId === boss ? "burst-center" : "burst-neighbor" }).baseDamage);
    expect(unit(after, "p1").energy.normalHitRecovered).toBe(count <= 2);
  });
  it("retains each weapon's own cross/eight-cell footprint and caps neighbors without the expander", () => {
    for (const id of ["howitzer", "wide-grenade-cannon"]) {
      const s = scene(["empty-tile-targeting", "blast-target-expander"], 5, id), o = options(s, "burst", id);
      expect(o.centers.find(c => c.targetId === boss)!.areaCells).toHaveLength(id === "howitzer" ? 4 : 8);
    }
    const s = scene(["empty-tile-targeting"]), c = center(s); expect(() => hit(s, [{ cell: c.cell, neighborIds: c.neighborIds.slice(0, 3) }])).toThrow();
  });
  it("denies conditional EN4 and base double EN24 atomically, while EN0 center/2-neighbor actions remain legal", () => {
    const s = scene(undefined, 4), c = center(s), raw = JSON.stringify(s);
    expect(() => hit(s, [{ cell: c.cell, neighborIds: c.neighborIds.slice(0, 3) }])).toThrow("EN不足"); expect(JSON.stringify(s)).toBe(raw);
    const zero = scene(undefined, 0), z = center(zero); expect(unit(hit(zero, [{ cell: z.cell, neighborIds: z.neighborIds.slice(0, 2) }]), "p1").energy.action!.energyCost).toBe(0);
    expect(options(scene(undefined, 24), "double").disabledReason).toBe("EN不足");
  });
  it("two-point requires the part, rarity3, two different legal centers and per-empty-center neighbors", () => {
    expect(() => options(scene([]), "double")).toThrow(); expect(() => options(scene(three, 30, "howitzer"), "double", "howitzer")).toThrow("★3");
    const s = scene(), c = center(s), empty = options(s, "double").centers.find(c => c.targetId === null)!;
    expect(() => hit(s, [{ cell: c.cell, neighborIds: [] }], "double")).toThrow();
    expect(() => hit(s, [{ cell: c.cell, neighborIds: [] }, { cell: c.cell, neighborIds: [] }], "double")).toThrow();
    expect(() => hit(s, [{ cell: c.cell, neighborIds: [] }, { cell: empty.cell, neighborIds: [] }], "double")).toThrow();
    const both = options(s, "double").centers.filter(c => c.targetId === null).slice(0, 2).map(c => ({ cell: c.cell, neighborIds: [c.neighborIds[0]!] }));
    const out = hit(s, both, "double"); expect(unit(out, "p1").energy.action!.energyCost).toBe(25); expect(out.latest!.blastEmptyCenters).toHaveLength(2);
  });
  it("charges EN30 once if either/both centers use expansion; EN29 cannot commit", () => {
    const s = denseScene(), a = center(s), b = options(s, "double").centers.find(c => c.targetId !== null && c.targetId !== boss && c.neighborIds.length >= 3)!;
    expect(b).toBeDefined();
    for (const counts of [[3, 0], [0, 3], [3, 3]]) {
      const locations = [a, b].map((c, i) => ({ cell: c.cell, neighborIds: c.neighborIds.slice(0, Math.max(counts[i]!, c.minimumNeighbors)) }));
      expect(unit(hit(s, locations, "double"), "p1").energy.action!.energyCost).toBe(30);
      expect(() => hit(denseScene(29), locations, "double")).toThrow("EN不足");
    }
    expect(getRobotBlastSelectionCost(options(s, "double").plan, [4, 4])).toBe(30);
  });
  it("merges center+neighbor to70 once and neighbor+neighbor to40 once, with one ordered receipt per enemy", () => {
    const s = scene(), all = options(s, "double").centers, a = center(s), b = all.find(c => c.targetId !== null && c.targetId !== boss && a.neighborIds.includes(c.targetId))!;
    const overlap = all.filter(c => c.targetId === null).flatMap((c, i, list) => list.slice(i + 1).flatMap(d => c.neighborIds.filter(id => d.neighborIds.includes(id)).map(id => ({ c, d, id })))).find(Boolean)!;
    expect(overlap).toBeDefined();
    const one = hit(s, [{ cell: a.cell, neighborIds: [b.targetId!] }, { cell: b.cell, neighborIds: [boss] }], "double");
    expect(one.latest!.damage).toHaveLength(2);
    for (const d of one.latest!.damage) expect(d.damage).toBe(getRobotWeaponDamageEstimate({ weaponId: weapon, weaponLevel: 1, attackStats: unit(s, "p1").stats, targetDef: unit(s, d.targetId).stats.def, mode: "burst-center" }).baseDamage);
    const two = hit(s, [{ cell: overlap.c.cell, neighborIds: [overlap.id] }, { cell: overlap.d.cell, neighborIds: [overlap.id] }], "double");
    expect(two.latest!.damage).toHaveLength(1); expect(two.latest!.damage[0]!.damage).toBe(getRobotWeaponDamageEstimate({ weaponId: weapon, weaponLevel: 1, attackStats: unit(s, "p1").stats, targetDef: unit(s, overlap.id).stats.def, mode: "burst-neighbor" }).baseDamage);
    expect(hit(one, [], "double")).toBe(one); expect(new Set(one.attackIds).size).toBe(one.attackIds.length);
  });
  it("rejects duplicate/friendly/dead/outside selections without changing resources or HP", () => {
    const s = scene(), c = center(s), id = c.neighborIds[0]!, before = JSON.stringify(s);
    for (const ids of [[id, id], ["p2"], ["allied-final-relay"], ["missing"], [boss]]) expect(() => hit(s, [{ cell: c.cell, neighborIds: ids }])).toThrow();
    const dead = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === id ? { ...u, hp: 0 } : u) }); expect(() => hit(dead, [{ cell: c.cell, neighborIds: [id] }])).toThrow(); expect(JSON.stringify(s)).toBe(before);
  });
  it("does not add new targeting or EN to ordinary single attacks and spread", () => {
    const s = scene(), normal = getRobotBattleNormalAttackOptions(s, weapon); expect(normal.energyCost).toBe(0);
    const p = progress(three), spread = scene(three); expect(() => getRobotBattleSpreadOptions(spread, weapon, "light-lance")).toThrow();
    expect(getRobotPerformanceReport(p, { ...createRobotPerformanceDraft(p), attack: "burst-center", currentEn: 0 }).dealt).toMatchObject({ requiredEn: 0, canInitiate: true });
  });
  it("projects staged production commands without enumerating a two-center Cartesian product", () => {
    const original = scene(), seed = { ...original, units: original.units.map(u => u.id === "p1" ? { ...u, stats: { ...u.stats, spd: 999 } } : u) };
    const initiative = createRobotRoundInitiative({ ...seed, turn: { ...seed.turn, actorId: null, actedActorIds: [] } });
    const s = { ...seed, initiative }, battle = { departure: { battleId: s.id }, sequence: 0, snapshot: s } as unknown as Parameters<typeof robotFormalBattleAdapter.project>[0];
    const m = robotFormalBattleAdapter.project(battle); expect(() => assertRobotBattleViewModel(m)).not.toThrow();
    expect(m.commands.find(c => c.id === "double:" + weapon)?.blast?.plan).toMatchObject({ centerCount: 2, neighborCap: 4, baseEnergyCost: 25 });
    expect(m.choices.some(c => c.commandId === "double:" + weapon)).toBe(false);
  });
});

it("saves both explosions/EN once across failed write, resume, resubmission and retry", async () => {
  const p = progress(), initial = scene(), a = center(initial), b = options(initial, "double").centers.find(c => c.targetId && c.targetId !== boss)!;
  const locations = [{ cell: a.cell, neighborIds: a.neighborIds.slice(0, 3) }, { cell: b.cell, neighborIds: [] }];
  let raw: string | null = JSON.stringify({ ...createRobotOfflineSave(), progress: p }), fail = false;
  const storage: RobotOfflineStorage = { read: async () => raw, replace: async (before, next) => { if (fail) throw new Error("disk-full"); if (before !== raw) throw new Error("stale"); raw = next; } };
  const json = (s: unknown) => JSON.parse(JSON.stringify(s));
  const runtime: RobotOfflineRuntime = { id: "test-final-blast", version: 1, readiness: () => [], create: d => json({ ...initial, id: d.battleId }), validate: s => { decodeRobotBattleCore(s); }, act: (snapshot, action) => { const s = decodeRobotBattleCore(snapshot); if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error("Action required"); const after = commitRobotBattleBlast(s, { ...identity(s), weaponId: weapon, mode: "double", locations: action.locations as unknown as RobotBlastLocation[] }); return { snapshot: json(after), actorKind: "controlled", summary: after.latest!.summary, outcome: null }; } };
  let id = 0; const session = new RobotOfflineSession(storage, runtime, () => "final-" + ++id); await session.load(); await session.start({ missionNumber: 30, difficulty: "normal" });
  const before = session.state, request = { battleId: before.battle!.departure.battleId, expectedSequence: 0, actionId: "one-double", action: { kind: "blast", locations: json(locations) } };
  fail = true; await expect(session.act(request)).rejects.toThrow("disk-full"); expect(session.state).toEqual(before);
  fail = false; await session.act(request); const saved = session.state, after = decodeRobotBattleCore(saved.battle!.snapshot); expect(unit(after, "p1").energy.action!.energyCost).toBe(30); expect(after.actionIds).toHaveLength(1);
  const resumed = new RobotOfflineSession(storage, runtime, () => "unused"); await resumed.load(); await resumed.act(request); expect(resumed.state).toEqual(saved); await resumed.retry(true); expect(decodeRobotBattleCore(resumed.state.battle!.snapshot).units).toEqual(initial.units);
});
