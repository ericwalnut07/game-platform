import { expect, it } from "vitest";
import { commitRobotAddonStrike, getRobotAddonStrikeOptions, getRobotDeltaOptions } from "../../src/games/robot-tactics/commonCombat";
import { getRobotBattleNormalAttackOptions, commitRobotBattleNormalAttack } from "../../src/games/robot-tactics/battleWeaponActions";
import { decodeRobotBattleCore, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { getRobotLoadoutPlan, resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { applyRobotCustomization } from "../../src/games/robot-tactics/customization";
import { getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotOfflineSave, RobotOfflineSession, type RobotOfflineStorage } from "../../src/games/robot-tactics/offlineSession";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { offlineAddonFixtureProgress } from "../robot-tactics/offlineAddonFixture";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";

const unit = getRobotBattleUnit;
const identity = (s: RobotBattleCoreState) => ({ actionId: "addon-strike", turnId: robotBattleTurnId(s) });
function progress(addons: readonly string[], weapon: string) {
  const p = offlineAddonFixtureProgress();
  return { ...p, party: p.party.map((c, i) => i ? c : { ...c, addons: addons.map(partId => ({ partId })), basic: { ...c.basic, weapon1: { partId: weapon, level: 1 }, weapon2: { partId: weapon === "light-pistol" ? "light-lance" : "light-pistol", level: 1 } } }) };
}
it("exposes real formal M01 Delta with an explicit earned high-level test progression, not injected combat state", async () => {
  let p = offlineAddonFixtureProgress();
  for (const partId of ["opening-capacitor", "emergency-capacitor"]) p = applyRobotCustomization(p, { kind: "addon-equip", coreId: "core-a", partId });
  let raw = JSON.stringify({ ...createRobotOfflineSave(), progress: p });
  const storage: RobotOfflineStorage = { read: async () => raw, replace: async (expected, next) => { expect(expected).toBe(raw); raw = next; } };
  const session = new RobotOfflineSession(storage, robotFormalRuntime, () => "formal-delta"); await session.load(); let save = await session.start({ missionNumber: 1, difficulty: "easy" });
  for (let n = 0; n < 6; n++) {
    const s = decodeRobotBattleCore(save.battle!.snapshot), source = unit(s, s.turn.actorId!);
    if (source.kind === "controlled") {
      const options = getRobotDeltaOptions(s, source.parts.find(p => resolveRobotBasicPart(p.partId, p.level).slot === "weapon")!.partId);
      if (!options.disabledReason) { expect(options.participantSets.length).toBeGreaterThan(0); expect(options.targetIds.length).toBeGreaterThan(2); return; }
    }
    save = await session.act({ battleId: save.battle!.departure.battleId, expectedSequence: save.battle!.sequence, actionId: "test-turn:" + n, action: { kind: source.kind === "controlled" ? "charge" : "npc" } });
  }
  throw new Error("No legal real M01 Delta");
});
it("applies emergency capacitor once to UI/deployment and preserves exact stats on reload", () => {
  const p = progress(["emergency-capacitor"], "light-blade"), plan = getRobotLoadoutPlan(p.party[0]!, getRobotOfflineAvailability(p));
  expect(plan.effectiveStats.hp).toBe(plan.baseStatsBeforeAddons.hp! - 15); expect(plan.effectiveStats.en).toBe(plan.baseStatsBeforeAddons.en! + 30);
  const s = weaponCoreFixture({ progress: p }), after = decodeRobotBattleCore(s);
  expect(unit(after, "p1").maxHp).toBe(plan.effectiveStats.hp); expect(unit(after, "p1").energy.maxEn).toBe(plan.effectiveStats.en); expect(after).toEqual(s);
});
it("extends thrust max range by one without mutating the weapon catalogue", () => {
  const s = weaponCoreFixture({ progress: progress(["extend-lance"], "light-lance"), targetIds: ["enemy-supreme-commander"], offsets: [{ x: 3, y: 0 }] });
  expect(resolveRobotBasicPart("light-lance", 1).range!.max).toBe(2); expect(getRobotBattleNormalAttackOptions(s, "light-lance").targetIds).toContain("enemy-supreme-commander");
  const plain = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, addons: [] } : u) });
  expect(getRobotBattleNormalAttackOptions(plain, "light-lance").targetIds).not.toContain("enemy-supreme-commander");
});
it("applies finisher only at or below half max HP and only to a single normal target", () => {
  const base = weaponCoreFixture({ progress: progress(["weakness-finisher"], "light-blade"), targetIds: ["enemy-supreme-commander"], offsets: [{ x: 1, y: 0 }] });
  const normal = (s: RobotBattleCoreState) => commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "light-blade", targetId: "enemy-supreme-commander" }).latest!.damage[0]!.damage!;
  const low = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "enemy-supreme-commander" ? { ...u, hp: Math.floor(u.maxHp / 2) } : u) });
  const plain = decodeRobotBattleCore({ ...low, units: low.units.map(u => u.id === "p1" ? { ...u, addons: [] } : u) });
  expect(normal(low)).toBe(Math.floor(normal(plain) * 1.25)); expect(normal(base)).toBe(normal(plain));
});
it("bypasses wall LOS for paid normal ranged attacks while preserving on-hit debuff and blocking free EN recovery", () => {
  const base = weaponCoreFixture({ progress: progress(["indirect-fire-control"], "light-pistol"), targetIds: ["enemy-supreme-commander"], offsets: [{ x: 2, y: 0 }] });
  const occupied = base.units.filter(u => !["p1", "enemy-supreme-commander"].includes(u.id)).map(u => u.position!), structures = base.objective.kind === "m30" ? base.objective.state.facility.cells : [];
  const free = (x: number, y: number) => x >= 0 && x < base.board.width && ![...base.board.walls, ...occupied, ...structures].some(c => c.x === x && c.y === y);
  const wall = base.board.walls.find(w => free(w.x - 1, w.y) && free(w.x + 1, w.y))!; expect(wall).toBeDefined();
  const s = decodeRobotBattleCore({ ...base, units: base.units.map(u => u.id === "p1" ? { ...u, position: { x: wall.x - 1, y: wall.y } } : u.id === "enemy-supreme-commander" ? { ...u, position: { x: wall.x + 1, y: wall.y } } : u) });
  const plain = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, addons: [] } : u) });
  expect(getRobotBattleNormalAttackOptions(plain, "light-pistol").targetIds).not.toContain("enemy-supreme-commander"); expect(getRobotBattleNormalAttackOptions(s, "light-pistol").energyCost).toBe(20);
  const after = commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "light-pistol", targetId: "enemy-supreme-commander" });
  expect(unit(after, "p1").energy.action!.energyCost).toBe(20); expect(unit(after, "p1").energy.normalHitRecovered).toBe(false); expect(unit(after, "enemy-supreme-commander").weaponDebuffs).toEqual([{ stat: "spd", delta: -8 }]);
});
it("uses adopted close-sniper 70% damage at distance 1 or 2, costs 20 EN and excludes normal-only addons", () => {
  for (const distance of [1, 2]) {
    const s = weaponCoreFixture({ progress: progress(["close-range-sniper", "normal-attack-assist-medium", "weakness-finisher"], "sniper-rifle"), targetIds: ["enemy-supreme-commander"], offsets: [{ x: distance, y: 0 }] });
    expect(getRobotAddonStrikeOptions(s, "close-sniper", "sniper-rifle").targets.map(t => t.targetId)).toContain("enemy-supreme-commander");
    const after = commitRobotAddonStrike(s, { ...identity(s), kind: "close-sniper", weaponId: "sniper-rifle", targetId: "enemy-supreme-commander" });
    const plain = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? { ...u, addons: [{ partId: "close-range-sniper" }] } : u) });
    expect(after.latest!.damage).toEqual(commitRobotAddonStrike(plain, { ...identity(plain), kind: "close-sniper", weaponId: "sniper-rifle", targetId: "enemy-supreme-commander" }).latest!.damage);
    expect(unit(after, "p1").energy.action).toEqual({ kind: "other", energyCost: 20 }); expect(unit(after, "p1").energy.normalHitRecovered).toBe(false);
  }
});
it("vaults only to a legal opposite empty cell and atomically rejects an occupied landing", () => {
  const s = weaponCoreFixture({ progress: progress(["blade-vault"], "light-blade"), targetIds: ["enemy-supreme-commander"], offsets: [{ x: 1, y: 0 }] });
  const option = getRobotAddonStrikeOptions(s, "blade-vault", "light-blade").targets.find(t => t.targetId === "enemy-supreme-commander")!; expect(option).toBeDefined();
  const after = commitRobotAddonStrike(s, { ...identity(s), kind: "blade-vault", weaponId: "light-blade", targetId: option.targetId });
  expect(unit(after, "p1").position).toEqual(option.landing); expect(unit(after, "p1").energy.usedExtraMove).toBe(true); expect(unit(after, "p1").energy.action!.energyCost).toBe(30);
  const occupied = decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p2" ? { ...u, position: option.landing } : u) });
  expect(() => commitRobotAddonStrike(occupied, { ...identity(occupied), kind: "blade-vault", weaponId: "light-blade", targetId: option.targetId })).toThrow(); expect(unit(occupied, "p1").energy.action).toBeNull();
});
