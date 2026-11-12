import { describe, expect, it } from "vitest";
import { createRobotOfflineProgress, getRobotOfflineAvailability } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotPerformanceDraft, getRobotPerformanceReport, setRobotPerformancePart, type RobotPerformanceDraft } from "../../src/games/robot-tactics/performanceCheck";
import { getRobotBasicPartComparison } from "../../src/games/robot-tactics/partComparison";
import { getRobotWeaponDamageEstimate, calculateRobotFinalDamage, floorRobotDamageProduct } from "../../src/games/robot-tactics/combatMath";
import { getRobotBasicActionModifiers } from "../../src/games/robot-tactics/equipmentEffects";
import { commitRobotBattleSlashAttack, commitRobotBattleWeaponCombo } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { weaponCoreFixture, weaponFixtureProgress, weaponTargetIds } from "../robot-tactics/weaponCoreFixture";
const p = createRobotOfflineProgress();
const report = (draft: RobotPerformanceDraft) => getRobotPerformanceReport(p, draft);
function weapons(a: string, b: string): RobotPerformanceDraft {
  let s = createRobotPerformanceDraft(p); s = setRobotPerformancePart(s, "weapon1", { partId: a, level: 1 });
  return setRobotPerformancePart(s, "weapon2", { partId: b, level: 1 });
}
it.each(["heavy-hammer", "quake-hammer", "binding-hammer", "suppression-mace"])(
  "%s displays the standard one-tile push and collision damage",
  partId => {
    const selection = { partId, level: 1 };
    const effect = getRobotBasicPartComparison(selection, selection).find(row => row.label === "固有効果")!;
    expect(effect.value).toContain("通常攻撃：1マス押し出し・追突時に固定10");
    expect(effect.value).not.toContain("2マス押し出し");
    if (partId === "suppression-mace") expect(effect.value).toContain("反応攻撃を抑止");
  },
);
describe("isolated performance sandbox and adopted common arithmetic", () => {
  it("copies current cores, never modifies progress and keeps temporary levels outside ownership", () => {
    const before = JSON.stringify(p), draft = createRobotPerformanceDraft(p);
    expect(draft.party).toEqual(p.party); expect(draft.party).not.toBe(p.party);
    const changed = setRobotPerformancePart(draft, "weapon1", { partId: "double-edged-sword", level: 10 });
    expect(changed.party[0]!.basic.weapon1.level).toBe(10); expect(draft.party[0]!.basic.weapon1.level).toBe(1);
    report(changed); expect(JSON.stringify(p)).toBe(before); expect(getRobotOfflineAvailability(p).basicParts).not.toContain("double-edged-sword");
  });
  it("uses current equipped bonuses and Core's normal and incoming calculations", () => {
    const d = createRobotPerformanceDraft(p), r = report(d), stats = r.plan.baseStatsBeforeAddons;
    const expected = getRobotWeaponDamageEstimate({ weaponId: "light-blade", weaponLevel: 1, attackStats: { melee: stats.melee!, ranged: stats.ranged! }, targetDef: 50, mode: "normal" });
    expect(r.dealt?.totalDamage).toBe(calculateRobotFinalDamage({ ...expected.terms, attackLegal: true, dealsDamage: true }));
    expect(r.received?.totalDamage).toBe(calculateRobotFinalDamage({ attackStat: 50, weaponPower: 30, targetDef: stats.def!, actionMultiplier: 1, areaMultiplier: 1, attackLegal: true, dealsDamage: true }));
  });
  it("allows locked/CAP-exceeded trial stats and shows real equipment illegality", () => {
    const d = setRobotPerformancePart(createRobotPerformanceDraft(p), "weapon1", { partId: "superheavy-railgun", level: 10 });
    const r = report(d); expect(r.equipmentIssues).toContain("Locked basic part: superheavy-railgun");
    expect(r.equipmentIssues.some(s => s.startsWith("CAP exceeded:"))).toBe(true); expect(r.dealt).not.toBeNull();
  });
  it("rejects wrong slots and invalid levels without editing the source", () => {
    const d = createRobotPerformanceDraft(p); expect(() => setRobotPerformancePart(d, "armor", { partId: "light-blade", level: 1 })).toThrow("部位");
    for (const level of [0, 11, 1.5]) expect(() => setRobotPerformancePart(d, "weapon1", { partId: "light-blade", level })).toThrow();
    expect(d).toEqual(createRobotPerformanceDraft(p));
  });
  it("fails closed when a current/imported addon effect is not included", () => {
    const d = createRobotPerformanceDraft(p), r = report({ ...d, party: d.party.map((c, i) => i ? c : { ...c, addons: [{ partId: "proximity-mine" }] }) });
    expect(r.dealt).toBeNull(); expect(r.received).toBeNull(); expect(r.unsupported.join()).toContain("追加パーツ");
  });
  it("uses the actual shield-support interpolation and separate exact factors", () => {
    let d = setRobotPerformancePart(createRobotPerformanceDraft(p), "special", { partId: "shield-support", level: 3 });
    d = { ...d, ownShield: true, enemyShield: true };
    const r = report(d), stats = r.plan.baseStatsBeforeAddons;
    const factors = getRobotBasicActionModifiers(Object.values(r.plan.basic)).shieldDamageFactors;
    expect(factors).toEqual([0.55, 0.875]);
    expect(r.received?.totalDamage).toBe(calculateRobotFinalDamage({ attackStat: 50, weaponPower: 30, targetDef: stats.def!, actionMultiplier: 1, areaMultiplier: 1, multipliers: factors, attackLegal: true, dealsDamage: true }));
    const estimate = getRobotWeaponDamageEstimate({ weaponId: "light-blade", weaponLevel: 1, attackStats: { melee: stats.melee!, ranged: stats.ranged! }, targetDef: 50, mode: "normal" });
    expect(r.dealt?.totalDamage).toBe(Math.max(1, floorRobotDamageProduct(estimate.baseDamage, [0.55])));
  });
  it("applies minimum one after reductions, but never to invalid or non-damaging effects", () => {
    const d = { ...createRobotPerformanceDraft(p), enemyShield: true, enemy: { ...createRobotPerformanceDraft(p).enemy, melee: 0, ranged: 0, weaponPower: 0, def: 100000 } };
    expect(report(d).dealt?.totalDamage).toBe(1); expect(report(d).received?.totalDamage).toBe(1);
    for (const hitCondition of ["out-of-range", "wall", "non-damaging"] as const) {
      const r = report({ ...d, hitCondition }); expect(r.dealt?.totalDamage).toBe(0); expect(r.received?.totalDamage).toBe(0); expect(r.dealt?.recoil).toBe(0);
    }
  });
  it("applies the adopted DEF10 floor to zero/negative enemy DEF", () => {
    const d = createRobotPerformanceDraft(p), a = report({ ...d, enemy: { ...d.enemy, def: 10 } });
    for (const def of [0, -100, 5]) expect(report({ ...d, enemy: { ...d.enemy, def } }).dealt).toEqual(a.dealt);
  });
  it("uses incoming melee/ranged stats from the chosen virtual family", () => {
    const d = { ...createRobotPerformanceDraft(p), enemy: { ...createRobotPerformanceDraft(p).enemy, melee: 100, ranged: 20 } };
    const values = ["slash", "blunt", "thrust", "assault", "sniper", "blast"].map(family => report({ ...d, enemy: { ...d.enemy, family: family as "slash" } }).received?.totalDamage);
    expect(new Set(values.slice(0, 3)).size).toBe(1); expect(new Set(values.slice(3)).size).toBe(1); expect(values[0]!).toBeGreaterThan(values[3]!);
  });
  it("uses common burst and overwatch coefficients for the selected legal damage mode", () => {
    const d = weapons("light-grenade-launcher", "light-pistol");
    for (const attack of ["burst-center", "burst-neighbor"] as const) {
      const r = report({ ...d, attack, enemyShield: true }), stats = r.plan.baseStatsBeforeAddons;
      const estimate = getRobotWeaponDamageEstimate({ weaponId: "light-grenade-launcher", weaponLevel: 1, attackStats: { melee: stats.melee!, ranged: stats.ranged! }, targetDef: d.enemy.def, mode: attack });
      expect(r.dealt?.totalDamage).toBe(Math.max(1, floorRobotDamageProduct(estimate.baseDamage, [0.55])));
    }
    const overwatch = report({ ...createRobotPerformanceDraft(p), weaponSlot: "weapon2", attack: "overwatch" });
    expect(overwatch.dealt?.requiredEn).toBe(25); expect(overwatch.dealt?.canInitiate).toBe(true);
    const low = report({ ...createRobotPerformanceDraft(p), weaponSlot: "weapon2", attack: "overwatch", currentEn: 24 }); expect(low.dealt?.totalDamage).toBe(0);
  });
  it("quotes railgun normal EN by level, denies an unaffordable hit, and does not stack combo EN", () => {
    for (const [level, cost] of [[1, 12], [5, 20], [10, 30]]) {
      const d = setRobotPerformancePart(createRobotPerformanceDraft(p), "weapon1", { partId: "superheavy-railgun", level: level! });
      expect(report(d).dealt?.requiredEn).toBe(cost);
      const poor = report({ ...d, currentEn: cost! - 1 }); expect(poor.dealt).toMatchObject({ totalDamage: 0, recoil: 0, reason: "EN不足", canInitiate: false });
    }
    const d = { ...weapons("light-lance", "superheavy-railgun"), attack: "combo" as const };
    expect(report({ ...d, currentEn: 45 }).dealt?.requiredEn).toBe(45); expect(report({ ...d, currentEn: 45 }).dealt?.canInitiate).toBe(true);
  });
  it("caps recoil by actual HP loss and preserves 20% sweep versus 10% combo", () => {
    let d = weapons("double-edged-sword", "light-lance"); d = { ...d, enemy: { ...d.enemy, hp: 7 } };
    expect(report(d).dealt).toMatchObject({ actualHpDamage: 7, recoil: 1 });
    expect(report({ ...d, attack: "sweep", targetCount: 2 }).dealt).toMatchObject({ actualHpDamage: 14, recoil: 2 });
    const combo = report({ ...d, attack: "combo" }); expect(combo.dealt).toMatchObject({ actualHpDamage: 7, recoil: 0 }); expect(combo.dealt?.hits).toHaveLength(1);
  });
  it("enforces sweep family/cap and single-target damage mode boundaries", () => {
    expect(report({ ...weapons("whirlwind-saber", "light-lance"), attack: "sweep", targetCount: 3 }).dealt?.hits).toHaveLength(3);
    const r = report({ ...weapons("double-edged-sword", "light-lance"), attack: "sweep", targetCount: 3 }); expect(r.dealt).toBeNull(); expect(r.unsupported.join()).toContain("対象数");
    expect(report({ ...createRobotPerformanceDraft(p), attack: "sweep", weaponSlot: "weapon2" }).dealt).toBeNull();
    expect(report({ ...createRobotPerformanceDraft(p), targetCount: 2 }).dealt).toBeNull();
  });
  it("does not replace unsupported geometry/formation/on-hit effects with fabricated damage", () => {
    for (const d of [weapons("heavy-hammer", "assault-rifle")]) {
      const r = report({ ...d, attack: "combo" }); expect(r.dealt).toBeNull(); expect(r.unsupported.join()).toContain("衝撃"); expect(r.received).not.toBeNull();
    }
    expect(report({ ...weapons("heavy-missile-cannon", "light-lance"), attack: "normal" }).dealt?.hits).toHaveLength(1);
    expect(report({ ...weapons("superheavy-railgun", "light-lance"), attack: "overwatch" }).dealt?.requiredEn).toBe(25);
  });
  it("rejects invalid numeric input instead of silently changing rules", () => {
    const d = createRobotPerformanceDraft(p);
    for (const hp of [0, -1, NaN, Infinity, 1.5]) expect(() => report({ ...d, enemy: { ...d.enemy, hp } })).toThrow();
    expect(() => report({ ...d, currentEn: 100000 })).toThrow("最大EN");
    expect(() => report({ ...d, enemy: { ...d.enemy, weaponPower: Number.MAX_SAFE_INTEGER + 1 } })).toThrow();
  });
});

describe("performance agrees with real adopted weapon action commits", () => {
  const pairs = [
    ["light-blade", "standard-sword"], ["heavy-hammer", "binding-hammer"], ["light-lance", "lance"], ["light-pistol", "assault-rifle"], ["sniper-rifle", "superheavy-railgun"], ["light-grenade-launcher", "howitzer"],
    ["double-edged-sword", "heavy-hammer"], ["double-edged-sword", "light-lance"], ["heavy-hammer", "light-lance"],
    ["double-edged-sword", "assault-rifle"], ["double-edged-sword", "sniper-rifle"], ["double-edged-sword", "howitzer"],
    ["light-lance", "assault-rifle"], ["light-lance", "sniper-rifle"], ["light-lance", "howitzer"]
  ] as const;
  for (const pair of pairs) it(pair.join(" + "), () => {
    const progress = weaponFixtureProgress(pair), base = weaponCoreFixture({ progress }), ids = weaponTargetIds(base);
    const mixed = pair[0] === "double-edged-sword" && ["assault-rifle", "sniper-rifle", "howitzer"].includes(pair[1]);
    const source = getRobotBattleUnit(base, "p1"), target = getRobotBattleUnit(base, ids[0]!);
    // Same as weapon fixture, with a safe LOS/range cluster for ranged weapons.
    const hasLongRange = pair.some(id => ["sniper-rifle", "superheavy-railgun", "howitzer"].includes(id));
    const offsets = mixed ? [{ x: -1, y: -1 }, { x: -3, y: 0 }, { x: 1, y: -1 }] : hasLongRange ? [{ x: -3, y: 0 }, { x: 0, y: -1 }, { x: 1, y: -1 }] : undefined;
    const s = offsets ? weaponCoreFixture({ progress, offsets }) : base;
    const input = { actionId: "performance-comparison", turnId: robotBattleTurnId(s), primaryWeaponId: pair[0], secondaryWeaponId: pair[1], targetIds: mixed ? ids.slice(0, 2) : [ids[0]!] };
    const after = commitRobotBattleWeaponCombo(s, input);
    const d = createRobotPerformanceDraft(progress), simulated = getRobotPerformanceReport(progress, { ...d, attack: "combo", enemy: { ...d.enemy, hp: target.hp, def: target.stats.def } });
    const hits = after.latest!.damage.filter(e => e.sourceId === source.id && e.targetId !== source.id);
    expect(simulated.dealt?.hits.map(h => h.damage)).toEqual(hits.map(h => h.damage));
    expect(simulated.dealt?.recoil).toBe(after.latest!.damage.find(e => e.targetId === source.id)?.damage ?? 0);
  });
  it("matches an actual multi-target sweep and final recoil", () => {
    const progress = weaponFixtureProgress(), s = weaponCoreFixture({ progress }), ids = weaponTargetIds(s), target = getRobotBattleUnit(s, ids[0]!);
    const after = commitRobotBattleSlashAttack(s, { actionId: "sweep-match", turnId: robotBattleTurnId(s), weaponId: "double-edged-sword", kind: "sweep", targetIds: ids.slice(0, 2) });
    const d = createRobotPerformanceDraft(progress), r = getRobotPerformanceReport(progress, { ...d, attack: "sweep", targetCount: 2, enemy: { ...d.enemy, hp: target.hp, def: target.stats.def } });
    expect(r.dealt?.hits.map(h => h.damage)).toEqual(after.latest!.damage.filter(e => e.targetId !== "p1").map(e => e.damage));
    expect(r.dealt?.recoil).toBe(after.latest!.damage.find(e => e.targetId === "p1")?.damage);
  });
});

describe("one part-performance / signed-difference table", () => {
  it("keeps weapon power, stat bonuses, CAP and penalties as distinct values", () => {
    const rows = getRobotBasicPartComparison({ partId: "superheavy-railgun", level: 5 }, { partId: "light-pistol", level: 1 });
    expect(rows.find(r => r.label === "武器威力")?.value).not.toBe("0"); expect(rows.find(r => r.label === "必要CAP")?.tone).toBe("worse");
    expect(rows.find(r => r.label === "MOV補正")).toMatchObject({ value: "-1", tone: "worse" });
    expect(rows.find(r => r.label === "固有効果")?.value).toContain("追加EN20");
    expect(rows.every(r => !/[()]/.test(r.difference))).toBe(true);
  });
  it("compares shield growth and lower boost costs with meaningful colors", () => {
    const shield = getRobotBasicPartComparison({ partId: "shield-support", level: 3 }, { partId: "shield-support", level: 1 });
    expect(shield.find(r => r.label === "シールド追加軽減率 %")).toMatchObject({ value: "12.5", difference: "+2.5", tone: "better" });
    const boost = getRobotBasicPartComparison({ partId: "boost-support", level: 5 }, { partId: "boost-support", level: 1 });
    expect(boost.find(r => r.label === "追加移動EN")).toMatchObject({ value: "25", difference: "-5", tone: "better" });
  });
  it("uses adopted non-weapon interpolation/effects and refuses unlike slots", () => {
    const rows = getRobotBasicPartComparison({ partId: "shield-support", level: 3 }, { partId: "general-support", level: 1 });
    expect(rows.find(r => r.label === "固有効果")?.value).toContain("12.5%");
    expect(() => getRobotBasicPartComparison({ partId: "shield-support", level: 3 }, { partId: "standard-armor", level: 1 })).toThrow("同じ部位");
  });
});
