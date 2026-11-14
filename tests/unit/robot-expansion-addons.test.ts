import { expect, it } from "vitest";
import catalog from "../../docs/design/robot-tactics/addons.json";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";
import { commitRobotBattleNormalAttack, commitRobotBattleSlashAttack, commitRobotExpansionSpecial } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotDamageFactors } from "../../src/games/robot-tactics/battleEffects";
import { commitRobotBattleDefend, decodeRobotBattleCore, getRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState, type RobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { createRobotOfflineProgress, getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";

const identity = (s: RobotBattleCoreState) => ({ actionId: "test-action", turnId: robotBattleTurnId(s) });
const boss = "enemy-supreme-commander";
function actor(s: RobotBattleCoreState, update: (unit: RobotBattleUnit) => RobotBattleUnit) {
  return decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? update(u) : u) });
}

it("records first-clear rewards at the adopted CAP without changing existing ownership", () => {
  const rows = catalog.parts.filter(p => p.acquisition.difficulty === "hardest");
  expect(rows.map(p => [p.name, p.cap, p.acquisition.type, p.acquisition.mission])).toEqual([
    ["高効率戦闘回収回路", 35, "first-clear", 2],
    ["重装固定防御機構", 35, "first-clear", 4],
    ["不屈の装甲", 30, "first-clear", 6],
    ["高精度弱点追撃回路", 40, "first-clear", 8],
  ]);
  expect(getRobotOfflineAvailability(createRobotOfflineProgress()).addons).toEqual([]);
});

it("applies recovery once on an EN-consuming triple hit and stacks legacy recovery on a normal hit", () => {
  const fixture = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [boss] });
  const state = (ids: string[], special = false) => actor(fixture, u => ({
    ...u, addons: ids.map(partId => ({ partId })), energy: { ...u.energy, maxEn: 413, en: 200 },
    parts: special ? u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "dual-burst-rifle", level: 1 } : p) : u.parts,
  }));
  const run = (ids: string[]) => {
    const s = state(ids, true);
    return commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "dual-burst-rifle", targetIds: [boss] });
  };
  const triple = run(["efficient-combat-recovery"]);
  expect(triple.latest!.damage).toHaveLength(3);
  expect(getRobotBattleUnit(triple, "p1").energy.en - getRobotBattleUnit(run([]), "p1").energy.en).toBe(16);
  const normal = (ids: string[]) => {
    const s = state(ids);
    return getRobotBattleUnit(commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "light-lance", targetId: boss }), "p1").energy.en;
  };
  expect(normal(["efficient-combat-recovery", "combat-recovery-circuit"]) - normal([])).toBe(24);
});

it("keeps stationary reduction through a checkpoint and uses the strict low-HP threshold", () => {
  const s = actor(weaponCoreFixture(), u => ({
    ...u, hp: 50, maxHp: 100,
    addons: ["heavy-stationary-defense", "stationary-defense", "unyielding-armor"].map(partId => ({ partId })),
  }));
  expect(getRobotDamageFactors(getRobotBattleUnit(s, "p1"))).toEqual([]);
  const defended = commitRobotBattleDefend(s, identity(s));
  const unit = getRobotBattleUnit(decodeRobotBattleCore(JSON.parse(JSON.stringify(defended))), "p1");
  expect(getRobotDamageFactors(unit)).toEqual([.8, .65]);
  expect(getRobotDamageFactors({ ...unit, hp: 49 })).toEqual([.8, .65, .85]);
  expect(getRobotDamageFactors({ ...unit, stationaryDefense: false, energy: { ...unit.energy, moved: true } })).toEqual([.8]);
});

it("boosts each low-HP enemy in a sweep and stacks both circuits on a single normal hit", () => {
  const light = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const fixture = weaponCoreFixture({ offsets: [{ x: 0, y: -1 }, { x: 1, y: -1 }], targetIds: [boss, light] });
  const s = decodeRobotBattleCore({ ...fixture, units: fixture.units.map(u => u.id === boss ? { ...u, hp: Math.floor(u.maxHp / 2) } : u) });
  const ids = ["precision-weakness-finisher", "weakness-finisher"];
  const attack = (parts: string[], sweep: boolean) => {
    const equipped = actor(s, u => ({ ...u, addons: parts.map(partId => ({ partId })) }));
    const after = sweep
      ? commitRobotBattleSlashAttack(equipped, { ...identity(equipped), weaponId: "double-edged-sword", kind: "sweep", targetIds: [boss, light] })
      : commitRobotBattleNormalAttack(equipped, { ...identity(equipped), weaponId: "double-edged-sword", targetId: boss });
    return after.latest!.damage.filter(d => d.targetId === boss || d.targetId === light).map(d => d.damage!);
  };
  const ordinary = attack([], true);
  expect(attack(ids, true)).toEqual([Math.floor(ordinary[0]! * 1.3), ordinary[1]]);
  expect(attack(ids, false)).toEqual([Math.floor(attack([], false)[0]! * 1.55)]);
});
