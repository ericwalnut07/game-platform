import { expect, it } from "vitest";
import { getRobotFixedAttackCost } from "../../src/games/robot-tactics/combatAddons";
import { getRobotExpansionSpecialOptions, getRobotFullCoreReleaseOptions, commitRobotFullCoreRelease } from "../../src/games/robot-tactics/battleWeaponActions";
import catalog from "../../docs/design/robot-tactics/addons.json";
import { floorRobotDamageProduct } from "../../src/games/robot-tactics/combatMath";
import { getRobotLoadoutPlan, listRobotFrameIds, resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";
import { fixtureNextRound } from "../robot-tactics/coreFixture";
import { commitRobotBattleNormalAttack, commitRobotBattleWeaponCombo, commitRobotBattleSlashAttack, commitRobotExpansionSpecial } from "../../src/games/robot-tactics/battleWeaponActions";
import { applyRobotPhaseDamage, applyRobotReactions, getRobotBattleDefense, getRobotDamageFactors, getRobotReactiveDefense } from "../../src/games/robot-tactics/battleEffects";
import { beginRobotBattleTurn, commitRobotBattleDefend, decodeRobotBattleCore, getRobotBattleFacilities, getRobotBattleLegalMoves, getRobotBattleUnit, moveRobotBattleUnit, robotBattleTurnId, type RobotBattleCoreState, type RobotBattleUnit } from "../../src/games/robot-tactics/battleState";
import { createRobotOfflineProgress, getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";

const identity = (s: RobotBattleCoreState) => ({ actionId: "test-action", turnId: robotBattleTurnId(s) });
const boss = "enemy-supreme-commander";
function actor(s: RobotBattleCoreState, update: (unit: RobotBattleUnit) => RobotBattleUnit) {
  return decodeRobotBattleCore({ ...s, units: s.units.map(u => u.id === "p1" ? update(u) : u) });
}

it("records first-clear rewards at the adopted CAP without changing existing ownership", () => {
  const rows = catalog.parts.filter(p => p.acquisition.difficulty === "hardest").sort((a, b) => a.acquisition.mission - b.acquisition.mission);
  expect(rows.map(p => [p.name, p.cap, p.acquisition.type, p.acquisition.mission])).toEqual([
    ["高効率戦闘回収回路", 35, "first-clear", 2],
    ["重装固定防御機構", 35, "first-clear", 4],
    ["不屈の装甲", 30, "first-clear", 6],
    ["高精度弱点追撃回路", 40, "first-clear", 8],
    ["緊急修復ユニット", 35, "first-clear", 10],
    ["戦術適応ユニット", 25, "first-clear", 12],
    ["過充填コンデンサ", 40, "first-clear", 14],
    ["高速再照準ユニット", 35, "first-clear", 15],
    ["反応装甲", 45, "first-clear", 16],
    ["防護共有装置", 40, "first-clear", 17],
    ["戦術指揮モジュール", 40, "first-clear", 18],
    ["突撃姿勢制御装置", 35, "first-clear", 19],
    ["防御反撃補助装置", 40, "first-clear", 21],
    ["被弾蓄積リアクター", 60, "first-clear", 22],
    ["高速回避スラスター", 40, "first-clear", 23],
    ["弱点解析ユニット", 40, "first-clear", 27],
    ["慣性衝撃ユニット", 65, "first-clear", 28],
    ["闘気増幅ユニット", 65, "first-clear", 29],
    ["炉心全解放ユニット", 75, "first-clear", 30],
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

it("repairs a surviving hit at exactly 25%, remembers the use on reload, and never revives a lethal hit", () => {
  const s = actor(weaponCoreFixture(), u => ({ ...u, hp: 40, maxHp: 100, addons: [{ partId: "emergency-repair-unit" }] }));
  const hit = (state: RobotBattleCoreState, damage: number, id: string) => applyRobotPhaseDamage(state, boss, "p1", damage, id, "slash");
  const repaired = hit(s, 15, "repair");
  expect(repaired.event.damage).toBe(15);
  const saved = decodeRobotBattleCore(JSON.parse(JSON.stringify(repaired.state)));
  expect(getRobotBattleUnit(saved, "p1")).toMatchObject({ hp: 45, emergencyRepairUsed: true });
  expect(getRobotBattleUnit(hit(saved, 20, "spent").state, "p1").hp).toBe(25);
  expect(getRobotBattleUnit(hit(s, 14, "too-early").state, "p1").emergencyRepairUsed).toBeUndefined();
  expect(getRobotBattleUnit(hit(s, 40, "lethal").state, "p1")).toMatchObject({ hp: 0 });
  expect(getRobotBattleUnit(hit(s, 40, "lethal").state, "p1").emergencyRepairUsed).toBeUndefined();
});

it("applies emergency repair through an atomic ordinary attack", () => {
  const light = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const fixture = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [light] });
  const strike = (s: RobotBattleCoreState) => commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "light-lance", targetId: light });
  const damage = strike(fixture).latest!.damage[0]!.damage!;
  const maxHp = Math.max(100, damage + 1);
  const s = decodeRobotBattleCore({ ...fixture, units: fixture.units.map(u => u.id === light
    ? { ...u, hp: damage + 1, maxHp, addons: [{ partId: "emergency-repair-unit" }] } : u) });
  const after = strike(s);
  expect(getRobotBattleUnit(after, light)).toMatchObject({ hp: 1 + Math.floor(maxHp / 5), emergencyRepairUsed: true });
  expect(after.latest!.damage[0]!.damage).toBe(damage);
});

it("limits rapid retargeting to ranged normal attacks after a move", () => {
  const fixture = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [boss] });
  const attack = (equip: boolean, moved: boolean, special: boolean) => {
    const s = actor(fixture, u => ({ ...u,
      addons: equip ? [{ partId: "rapid-retargeting-unit" }] : [],
      energy: { ...u.energy, moved },
      parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "dual-burst-rifle", level: 1 } : p),
    }));
    const after = special
      ? commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "dual-burst-rifle", targetIds: [boss] })
      : commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "dual-burst-rifle", targetId: boss });
    return after.latest!.damage[0]!.damage!;
  };
  expect(attack(true, false, false)).toBe(attack(false, false, false));
  expect(attack(true, true, true)).toBe(attack(false, true, true));
  expect(attack(true, true, false)).toBe(floorRobotDamageProduct(attack(false, true, false), [1.15]));
});

it("checks the addon frame families and extends only the fortress counter", () => {
  const initial = createRobotOfflineProgress();
  const available = getRobotOfflineAvailability(initial);
  const ids = ["rapid-retargeting-unit", "defensive-counter-assist"];
  const plan = (frameId: string, partId: string) => getRobotLoadoutPlan(
    { ...initial.party[0]!, frameId, addons: [{ partId }] },
    { ...available, frames: listRobotFrameIds(), addons: ids },
  );
  expect(plan("attack-1", ids[0]!).blockingIssues).toContain("Wrong addon frame family: " + ids[0]);
  expect(plan("mobile-1", ids[0]!).customizationBlockingIssues).toEqual([]);
  expect(plan("mobile-1", ids[1]!).blockingIssues).toContain("Wrong addon frame family: " + ids[1]);
  expect(plan("defense-1", ids[1]!).customizationBlockingIssues).toEqual([]);
  const counter = (distance: number, equip: boolean) => {
    const fixture = weaponCoreFixture({ offsets: [{ x: distance, y: 0 }], targetIds: [boss] });
    const s = actor(fixture, u => ({
      ...u,
      addons: equip ? [{ partId: "defensive-counter-assist" }] : [],
      parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "fortress-mace", level: 14 } : p),
    }));
    const guarded = commitRobotBattleDefend(s, identity(s));
    return applyRobotReactions(guarded, { kind: "attacked", hits: [{ sourceId: boss, targetId: "p1" }] }, "counter");
  };
  expect(counter(2, false).events).toEqual([]);
  expect(counter(2, true).events).toHaveLength(1);
  expect(counter(1, true).events[0]!.damage!).toBeGreaterThan(counter(1, false).events[0]!.damage!);
});

it("adapts to repeated rifle hits within a salvo and retains each family until the next own turn", () => {
  const light = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const fixture = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [light] });
  const setup = (equip: boolean) => decodeRobotBattleCore({ ...fixture, units: fixture.units.map(u =>
    u.id === light ? { ...u, hp: 10000, maxHp: 10000, addons: equip ? [{ partId: "tactical-adaptation-unit" }] : [] } :
    u.id === "p1" ? { ...u, parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "dual-burst-rifle", level: 14 } : p) } : u) });
  const fire = (s: RobotBattleCoreState) => commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "dual-burst-rifle", targetIds: [light] });
  const baseline = fire(setup(false)).latest!.damage[0]!.damage!;
  const salvo = fire(setup(true));
  const hits = salvo.latest!.damage.map(e => e.damage!);
  expect(hits).toHaveLength(3);
  expect(hits[0]).toBe(baseline);
  expect(hits.slice(1)).toEqual([hits[1], hits[1]]);
  expect(hits[1]).toBeLessThan(hits[0]!);
  const reloaded = decodeRobotBattleCore(JSON.parse(JSON.stringify(salvo)));
  expect(getRobotBattleUnit(reloaded, light).adaptedWeaponFamilies).toEqual(["assault"]);
  const otherFamily = applyRobotPhaseDamage(reloaded, "p1", light, 10, "other-family", "slash", "reaction").state;
  expect(getRobotBattleUnit(otherFamily, light).adaptedWeaponFamilies).toEqual(["assault", "slash"]);
  const dot = applyRobotPhaseDamage(otherFamily, "p1", light, 10, "dot", "special:dot", "dot").state;
  expect(getRobotBattleUnit(dot, light).adaptedWeaponFamilies).toEqual(["assault", "slash"]);
  const turn = beginRobotBattleTurn(dot, dot.actors.find(a => a.unitIds.includes(light))!.id);
  expect(getRobotBattleUnit(turn, light).adaptedWeaponFamilies).toBeUndefined();
});

it("uses adaptation when deciding whether to stop an ordered rifle salvo", () => {
  const light = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const fixture = actor(weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [light] }), u => ({
    ...u, parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "dual-burst-rifle", level: 14 } : p),
  }));
  const fire = (s: RobotBattleCoreState) => commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "dual-burst-rifle", targetIds: [light] });
  const targetHp = (hp: number, equip: boolean) => decodeRobotBattleCore({ ...fixture, units: fixture.units.map(u =>
    u.id === light ? { ...u, hp, maxHp: 10000, addons: equip ? [{ partId: "tactical-adaptation-unit" }] : [] } : u) });
  const first = fire(targetHp(10000, false)).latest!.damage[0]!.damage!;
  expect(fire(targetHp(first * 2, false)).latest!.damage).toHaveLength(2);
  expect(fire(targetHp(first * 2, true)).latest!.damage).toHaveLength(3);
});

it("boosts another ally's normal attack within two diagonal cells, once even with two providers", () => {
  const fixture = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [boss] });
  const origin = getRobotBattleUnit(fixture, "p1").position!;
  const providers = fixture.units.filter(u => u.kind === "controlled" && u.id !== "p1");
  const blocked = [...fixture.board.walls, ...getRobotBattleFacilities(fixture).flatMap(f => f.cells),
    ...fixture.units.filter(u => !providers.includes(u)).flatMap(u => u.position ? [u.position] : [])];
  const cells = (distance: number, diagonal = false) => Array.from({ length: fixture.board.height }, (_, y) =>
    Array.from({ length: fixture.board.width }, (_, x) => ({ x, y }))).flat().filter(c =>
    Math.max(Math.abs(c.x - origin.x), Math.abs(c.y - origin.y)) === distance &&
    (!diagonal || Math.abs(c.x - origin.x) === Math.abs(c.y - origin.y)) &&
    !blocked.some(b => b.x === c.x && b.y === c.y));
  const near = [...cells(2, true), ...cells(1)];
  const far = cells(3)[0]!;
  expect(near.length).toBeGreaterThanOrEqual(2);
  expect(cells(2, true).length).toBeGreaterThan(0);
  const aura = [{ partId: "tactical-command-module" }];
  const setup = (count: number, distant = false, self = false) => decodeRobotBattleCore({ ...fixture, units: fixture.units.map(u => {
    if (u.id === "p1" && self) return { ...u, addons: aura };
    const index = providers.indexOf(u);
    return index < 0 ? u : { ...u, position: distant && index === 0 ? far : near[index]!, addons: index < count ? aura : [] };
  }) });
  const hit = (s: RobotBattleCoreState) => commitRobotBattleNormalAttack(s, { ...identity(s), weaponId: "light-lance", targetId: boss }).latest!.damage[0]!.damage!;
  const normal = hit(setup(0));
  expect(hit(setup(0, false, true))).toBe(normal);
  expect(hit(setup(1, true))).toBe(normal);
  expect(hit(setup(1))).toBe(floorRobotDamageProduct(normal, [1.1]));
  expect(hit(setup(2))).toBe(hit(setup(1)));

  const sweep = (s: RobotBattleCoreState) => commitRobotBattleSlashAttack(s, {
    ...identity(s), weaponId: "double-edged-sword", kind: "sweep", targetIds: [boss],
  }).latest!.damage[0]!.damage!;
  const restored = decodeRobotBattleCore(JSON.parse(JSON.stringify(setup(1))));
  expect(sweep(restored)).toBe(floorRobotDamageProduct(sweep(setup(0)), [1.1]));

  const special = (count: number) => {
    const s = actor(setup(count), u => ({ ...u, parts: u.parts.map(p =>
      p.partId === "double-edged-sword" ? { partId: "dual-burst-rifle", level: 14 } : p) }));
    return commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "dual-burst-rifle", targetIds: [boss] }).latest!.damage;
  };
  expect(special(1)).toEqual(special(0));
});

it("discounts fixed attacks at 60% EN, rounds the saving down and leaves percentage costs intact", () => {
  const addons = [{ partId: "overcharge-capacitor" }];
  expect(getRobotFixedAttackCost(13, { en: 60, maxEn: 100 }, addons)).toBe(11);
  expect(getRobotFixedAttackCost(13, { en: 59, maxEn: 100 }, addons)).toBe(13);
  const fixture = weaponCoreFixture({ offsets: [{ x: 3, y: 0 }], targetIds: [boss] });
  const state = (en: number, weaponId: string) => actor(fixture, u => ({
    ...u, addons, energy: { ...u.energy, en, maxEn: 100 },
    parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: weaponId, level: 14 } : p),
  }));
  const aether = state(60, "aether-rail-cannon");
  expect(getRobotExpansionSpecialOptions(aether, "aether-rail-cannon").cost).toBe(24);
  expect(getRobotExpansionSpecialOptions(aether, "aether-rail-cannon", true).cost).toBe(40);
  const shot = commitRobotExpansionSpecial(aether, { ...identity(aether), weaponId: "aether-rail-cannon", boosted: true, targetIds: [boss] });
  expect(getRobotBattleUnit(shot, "p1").energy.action?.energyCost).toBe(40);
  expect(getRobotExpansionSpecialOptions(state(59, "aether-rail-cannon"), "aether-rail-cannon", true).cost).toBe(50);
  const meteor = state(60, "meteor-buster");
  expect(getRobotExpansionSpecialOptions(meteor, "meteor-buster").cost).toBe(50);
  const blast = commitRobotExpansionSpecial(meteor, { ...identity(meteor), weaponId: "meteor-buster", targetIds: [boss] });
  expect(getRobotBattleUnit(blast, "p1").energy.action?.energyCost).toBe(50);
});

it("restricts the overcharge capacitor to reactor frames", () => {
  const progress = createRobotOfflineProgress();
  const addons = [{ partId: "overcharge-capacitor" }];
  const available = { ...getRobotOfflineAvailability(progress), addons: ["overcharge-capacitor"] };
  expect(getRobotLoadoutPlan({ ...progress.party[0]!, addons }, available).customizationBlockingIssues)
    .toContain("Wrong addon frame family: overcharge-capacitor");
  expect(getRobotLoadoutPlan({ ...progress.party[1]!, addons }, available).customizationBlockingIssues).toEqual([]);
});

it("uses reactive armor on the first hit of a salvo and refreshes it next round", () => {
  const light = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const fixture = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [light] });
  const fire = (equip: boolean) => {
    const state = decodeRobotBattleCore({ ...fixture, units: fixture.units.map(u =>
      u.id === light ? { ...u, hp: 10000, maxHp: 10000, addons: equip ? [{ partId: "reactive-armor" }] : [] } :
      u.id === "p1" ? { ...u, parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "dual-burst-rifle", level: 14 } : p) } : u) });
    return commitRobotExpansionSpecial(state, { ...identity(state), weaponId: "dual-burst-rifle", targetIds: [light] });
  };
  const baseline = fire(false).latest!.damage.map(e => e.damage!);
  const after = decodeRobotBattleCore(JSON.parse(JSON.stringify(fire(true))));
  const hits = after.latest!.damage.map(e => e.damage!);
  expect(hits[0]!).toBeLessThan(baseline[0]!);
  expect(hits.slice(1)).toEqual(baseline.slice(1));
  const target = getRobotBattleUnit(after, light);
  expect(target.reactiveArmorRound).toBe(1);
  expect(getRobotReactiveDefense(after, target).factors).toEqual([]);
  expect(getRobotReactiveDefense({ ...after, allied: { ...after.allied, round: 2 } }, target).factors).toEqual([.65]);
});

it("uses the evasion thrusters only after two voluntary steps, and only on the first incoming hit", () => {
  const fixture = actor(weaponCoreFixture(), u => ({ ...u, addons: [{ partId: "high-speed-evasion-thrusters" }] }));
  const walk = (steps: number) => {
    const move = getRobotBattleLegalMoves(fixture, "p1").find(m => m.path.length === steps)!;
    return moveRobotBattleUnit(fixture, { ...identity(fixture), unitId: "p1", destination: move.destination });
  };
  const hit = (s: RobotBattleCoreState) => applyRobotPhaseDamage(s, boss, "p1", 10, "evasion", "slash");
  expect(hit(walk(1)).event.damage).toBe(10);
  const moved = decodeRobotBattleCore(JSON.parse(JSON.stringify(walk(2))));
  expect(getRobotBattleUnit(moved, "p1").evasionProgress).toBe(2);
  const first = hit(moved);
  expect(first.event.damage).toBe(7);
  expect(hit(first.state).event.damage).toBe(10);
});

it("shares protection with adjacent allies once, excludes the wearer and ignores an off-board provider", () => {
  const fixture = weaponCoreFixture();
  const origin = getRobotBattleUnit(fixture, "p1").position!;
  const addons = [{ partId: "shared-protection-device" }];
  const state = { ...fixture, units: fixture.units.map(u => u.id === "p1" ? { ...u, addons } :
    u.kind === "controlled" ? { ...u, addons, position: { x: origin.x + 1, y: origin.y + (u.number === 2 ? 0 : 1) } } : u) };
  const hit = (s: RobotBattleCoreState) => applyRobotPhaseDamage(s, boss, "p1", 10, "protection", "slash").event.damage;
  expect(hit(state)).toBe(8);
  const offBoard = { ...state, units: state.units.map(u => u.kind === "controlled" && u.id !== "p1" ? { ...u, position: null } : u) };
  expect(hit(offBoard)).toBe(10);
});

it("applies assault posture to melee specials after a two-step voluntary move", () => {
  const fixture = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [boss] });
  const state = (equipped: boolean) => actor(fixture, u => ({
    ...u, addons: equipped ? [{ partId: "assault-posture-control" }] : [],
    parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "impact-breaker", level: 14 } : p),
  }));
  const position = getRobotBattleUnit(fixture, boss).position!;
  const walk = (s: RobotBattleCoreState, steps: number) => {
    const move = getRobotBattleLegalMoves(s, "p1").find(m => m.path.length === steps &&
      Math.max(Math.abs(m.destination.x - position.x), Math.abs(m.destination.y - position.y)) === 1)!;
    return moveRobotBattleUnit(s, { ...identity(s), actionId: "posture-move", unitId: "p1", destination: move.destination });
  };
  const attack = (s: RobotBattleCoreState) => commitRobotExpansionSpecial(s, {
    ...identity(s), weaponId: "impact-breaker", targetIds: [boss],
  }).latest!.damage[0]!.damage!;
  expect(attack(walk(state(true), 1))).toBe(attack(walk(state(false), 1)));
  const moved = decodeRobotBattleCore(JSON.parse(JSON.stringify(walk(state(true), 2))));
  const baseline = attack(walk(state(false), 2));
  expect(getRobotBattleUnit(moved, "p1").assaultPostureSteps).toBe(2);
  expect(attack(moved)).toBeGreaterThan(baseline);
  const restored = beginRobotBattleTurn(fixtureNextRound(commitRobotBattleDefend(moved, identity(moved))), "p1");
  expect(getRobotBattleUnit(restored, "p1").assaultPostureSteps).toBeUndefined();
});

it("keeps weakness analysis at 10% across repeated targets, and resets on a target switch", () => {
  const light = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const fixture = actor(weaponCoreFixture({ offsets: [{ x: 1, y: 0 }, { x: 0, y: 1 }], targetIds: [boss, light] }),
    u => ({ ...u, addons: [{ partId: "weakness-analysis-unit" }] }));
  const attack = (s: RobotBattleCoreState, id: string) => commitRobotBattleNormalAttack(s, {
    ...identity(s), actionId: "analysis-" + s.allied.round, weaponId: "light-lance", targetId: id,
  });
  const damage = (s: RobotBattleCoreState) => s.latest!.damage[0]!.damage!;
  const next = (s: RobotBattleCoreState) => beginRobotBattleTurn(fixtureNextRound(s), "p1");
  const first = attack(fixture, boss);
  expect(getRobotBattleUnit(first, "p1").analyzedTargets).toEqual([boss]);
  const second = attack(next(decodeRobotBattleCore(JSON.parse(JSON.stringify(first)))), boss);
  expect(damage(second)).toBeGreaterThan(damage(first));
  const third = attack(next(second), boss);
  expect(damage(third)).toBe(damage(second));
  const switched = attack(next(third), light);
  expect(getRobotBattleUnit(switched, "p1").analyzedTargets).toEqual([light]);
  expect(damage(attack(next(switched), boss))).toBe(damage(first));
});

const quadraticAddons = [{ partId: "spirit-amplification-unit" }, { partId: "inertial-impact-unit" }];
const quadratic = (k: number, value: number, def: number) => Math.floor(k * (value / 100) ** 2 / (def / 100));

it("adds each quadratic once to an EN-consuming rifle salvo and leaves EN0 attacks alone", () => {
  const s = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [boss] });
  const state = (equipped: boolean, moved: boolean) => actor(s, u => ({ ...u,
    addons: equipped ? quadraticAddons : [], stats: { ...u.stats, ranged: 500, spd: 430 },
    energy: { ...u.energy, moved },
    parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "dual-burst-rifle", level: 14 } : p),
  }));
  const def = getRobotBattleDefense(s, getRobotBattleUnit(s, boss));
  const power = resolveRobotBasicPart("dual-burst-rifle", 14).weaponPower!;
  const spirit = quadratic(2, 500 + power / 4, def), inertia = quadratic(6, 430, def);
  const fire = (equipped: boolean, moved: boolean) => {
    const ready = state(equipped, moved);
    return commitRobotExpansionSpecial(ready, { ...identity(ready), weaponId: "dual-burst-rifle", targetIds: [boss] }).latest!.damage.map(e => e.damage!);
  };
  const baseline = fire(false, true);
  expect(baseline).toHaveLength(3);
  expect(fire(true, true)).toEqual([baseline[0]! + spirit + inertia, ...baseline.slice(1)]);
  expect(fire(true, false)).toEqual([baseline[0]! + spirit, ...baseline.slice(1)]);
  const normal = (equipped: boolean) => {
    const ready = state(equipped, true);
    return commitRobotBattleNormalAttack(ready, { ...identity(ready), weaponId: "light-lance", targetId: boss }).latest!.damage;
  };
  expect(normal(true)).toEqual(normal(false));
});

it("allocates 70% and 30% using the weapon of each melee combo hit", () => {
  const s = weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [boss] });
  const def = getRobotBattleDefense(s, getRobotBattleUnit(s, boss));
  const weapons = ["double-edged-sword", "light-lance"] as const;
  const fire = (equipped: boolean) => {
    const ready = actor(s, u => ({ ...u, addons: equipped ? quadraticAddons : [], stats: { ...u.stats, melee: 500, spd: 430 },
      energy: { ...u.energy, moved: true } }));
    return commitRobotBattleWeaponCombo(ready, { ...identity(ready), primaryWeaponId: weapons[0], secondaryWeaponId: weapons[1], targetIds: [boss] })
      .latest!.damage.filter(e => e.targetId === boss).map(e => e.damage!);
  };
  const baseline = fire(false);
  expect(baseline).toHaveLength(2);
  expect(fire(true)).toEqual(weapons.map((weapon, i) => {
    const share = i === 0 ? .7 : .3;
    return baseline[i]! + floorRobotDamageProduct(quadratic(2, 500 + resolveRobotBasicPart(weapon, 1).weaponPower! / 4, def), [share]) +
      floorRobotDamageProduct(quadratic(6, 430, def), [share]);
  }));
});

it("adds Meteor's two quadratic bonuses independently using each target's DEF and area share", () => {
  const light = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const fixture = weaponCoreFixture({ offsets: [{ x: 3, y: 0 }, { x: 4, y: 1 }], targetIds: [boss, light] });
  const fire = (addons = quadraticAddons) => {
    const s = actor(fixture, u => ({ ...u, addons, stats: { ...u.stats, ranged: 570, spd: 430 },
      energy: { ...u.energy, moved: true, maxEn: 181, en: 100 },
      parts: u.parts.map(p => p.partId === "double-edged-sword" ? { partId: "meteor-buster", level: 14 } : p),
    }));
    return commitRobotExpansionSpecial(s, { ...identity(s), weaponId: "meteor-buster", targetIds: [boss, light] }).latest!.damage.map(e => e.damage!);
  };
  const power = resolveRobotBasicPart("meteor-buster", 14).weaponPower!;
  const baseline = fire([]);
  expect(fire()).toEqual([boss, light].map((id, i) => {
    const def = getRobotBattleDefense(fixture, getRobotBattleUnit(fixture, id));
    const share = i === 0 ? .7 : .4;
    return floorRobotDamageProduct(quadratic(20, 91, def), [share]) +
      floorRobotDamageProduct(quadratic(2, 570 + power / 4, def), [share]) +
      floorRobotDamageProduct(quadratic(6, 430, def), [share]);
  }));
  expect(fire()[0]!).toBeGreaterThan(baseline[0]!);
});

it("spends all current EN for a single full core release and adds independent bonuses", () => {
  const s = actor(weaponCoreFixture({ offsets: [{ x: 1, y: 0 }], targetIds: [boss] }), u => ({
    ...u, addons: [...quadraticAddons, { partId: "full-core-release-unit" }, { partId: "overcharge-capacitor" }],
    energy: { ...u.energy, en: 90, maxEn: 100, moved: true }, stats: { ...u.stats, melee: 500, spd: 430 },
  }));
  const def = getRobotBattleDefense(s, getRobotBattleUnit(s, boss));
  const weaponId = "light-lance", power = resolveRobotBasicPart(weaponId, 1).weaponPower!;
  expect(getRobotFullCoreReleaseOptions(s, weaponId).cost).toBe(90);
  const fired = commitRobotFullCoreRelease(s, { ...identity(s), weaponId, targetId: boss });
  expect(getRobotBattleUnit(fired, "p1").energy.action?.energyCost).toBe(90);
  expect(fired.latest!.damage.map(e => e.damage)).toEqual([
    quadratic(25, 90, def) + quadratic(2, 500 + power / 4, def) + quadratic(6, 430, def),
  ]);
  expect(getRobotFullCoreReleaseOptions(actor(s, u => ({ ...u, energy: { ...u.energy, en: 0 } })), weaponId).disabledReason).toBe("EN不足");
});

it("stores actual damage per attacker up to 150 and counters at the next own turn after reload", () => {
  const light = weaponCoreFixture().actors.find(a => a.unitIds.length === 3)!.unitIds[0]!;
  const s = actor(weaponCoreFixture({ offsets: [{ x: 1, y: 0 }, { x: 0, y: 1 }], targetIds: [boss, light] }), u => ({
    ...u, hp: 500, maxHp: 500, addons: [{ partId: "damage-storage-reactor" }],
  }));
  const defended = commitRobotBattleDefend(s, identity(s));
  const first = applyRobotPhaseDamage(defended, boss, "p1", 110, "hit-a", "slash", "reaction").state;
  const second = applyRobotPhaseDamage(first, light, "p1", 90, "hit-b", "slash", "reaction").state;
  const restored = decodeRobotBattleCore(JSON.parse(JSON.stringify(second)));
  expect(getRobotBattleUnit(restored, "p1").storedReactorDamage).toEqual([
    { sourceId: boss, amount: 110 }, { sourceId: light, amount: 40 },
  ]);
  const next = fixtureNextRound(restored);
  const countered = beginRobotBattleTurn(next, "p1");
  expect(countered.latest!.damage.map(e => [e.targetId, e.damage])).toEqual([[boss, 165], [light, 60]]);
  expect(getRobotBattleUnit(countered, "p1").storedReactorDamage).toBeUndefined();
  expect(getRobotBattleUnit(countered, "p1").energy.en).toBe(getRobotBattleUnit(next, "p1").energy.en);
  expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(countered)))).toEqual(countered);
});
