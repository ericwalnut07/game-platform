import { describe, expect, it } from "vitest";
import rules from "../../docs/design/robot-tactics/rules.json";
import earlyProfiles from "../../docs/design/robot-tactics/normal-hard-early-seven-candidates.json";
import { checkRobotAttackRange, robotChebyshevDistance } from "../../src/games/robot-tactics/attackRange";
import { checkRobotAttackSpatial, resolveRobotTargetDamage } from "../../src/games/robot-tactics/attackResolution";
import { calculateRobotBaseDamage, calculateRobotFinalDamage, floorRobotDamageProduct, getRobotEffectiveDefense } from "../../src/games/robot-tactics/combatMath";
import { getRobotBasicActionModifiers } from "../../src/games/robot-tactics/equipmentEffects";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotCoreUpgradeExp } from "../../src/games/robot-tactics/growth";
import { getRobotStagePlan, listRobotStageKeys, requireApprovedRobotStage } from "../../src/games/robot-tactics/stageCatalog";
import { getRobotLightEnemyPlan, getRobotStageLightEnemyPlans, type RobotLightChassis } from "../../src/games/robot-tactics/lightEnemyPresets";
import { advanceRobotObjectiveTransports, applyRobotObjectiveObjectBatch, createRobotObjectiveObjects } from "../../src/games/robot-tactics/objectiveObjects";
import { applyRobotSwordRecoil, getRobotNormalWeaponEnergyCost, getRobotPiercingComboDefense, getRobotSwordRecoil, getRobotWeaponComboPlan, resolveRobotTwoWeaponHits, type RobotWeaponFamily } from "../../src/games/robot-tactics/weaponActions";

const part = (partId: string, level = 1) => ({ partId, level });
const clear = { canReach: true, reason: "clear", sight: null } as const;
const blocked = { canReach: false, reason: "line-of-sight-blocked", sight: null } as const;
const terms = { attackStat: 100, weaponPower: 50, targetDef: 50, actionMultiplier: 1, areaMultiplier: 1 };

describe("adopted range, DEF, final floor and EXP", () => {
  it("uses Chebyshev for weapon min/max and keeps LOS independent", () => {
    const origin = { x: 0, y: 0 }, target = { x: 3, y: 3 };
    expect(robotChebyshevDistance(origin, target)).toBe(3);
    const range = checkRobotAttackRange({ origin, target, min: 3, max: 5 }); expect(range.status).toBe("in-range");
    expect(checkRobotAttackRange({ origin, target: { x: 2, y: 2 }, min: 3, max: 5 }).status).toBe("out-of-range");
    const spatial = checkRobotAttackSpatial({ kind: "normal", range, sight: { board: { width: 6, height: 6, walls: [{ x: 1, y: 1 }] }, origin, target } });
    expect(spatial).toMatchObject({ canReach: false, reason: "line-of-sight-blocked" });
    expect(resolveRobotTargetDamage({ attackLegal: true, spatial, effect: { kind: "damaging", resolveAfterModifiers: () => 100 } }).damage).toBe(0);
  });
  it("floors effective DEF after all modifiers without clamping each debuff", () => {
    for (const value of [-100, -1, 0, 1, 9, 10]) expect(getRobotEffectiveDefense(value)).toBe(10);
    expect(getRobotEffectiveDefense(10.5)).toBe(10.5);
    expect(calculateRobotBaseDamage({ ...terms, targetDef: -100 })).toBe(150);
    expect(calculateRobotBaseDamage({ ...terms, targetDef: 30 - 40 + 25 })).toBe(100);
    expect(() => getRobotEffectiveDefense(Infinity)).toThrow();
  });
  it("combines post-base factors with exact decimal arithmetic and floors only once", () => {
    expect(floorRobotDamageProduct(57, [0.8, 0.75])).toBe(34);
    expect(floorRobotDamageProduct(100, [0.7, 0.7])).toBe(49);
    const shield = getRobotBasicActionModifiers([resolveRobotBasicPart("shield-support", 10)]);
    expect(floorRobotDamageProduct(160, shield.shieldDamageFactors)).toBe(66);
    expect(calculateRobotFinalDamage({ ...terms, multipliers: [0, 0.8], attackLegal: true, dealsDamage: true })).toBe(1);
    for (const attackLegal of [true, false]) expect(calculateRobotFinalDamage({ ...terms, multipliers: [0], attackLegal, dealsDamage: false })).toBe(0);
    expect(calculateRobotFinalDamage({ ...terms, attackLegal: false, dealsDamage: true })).toBe(0);
    expect(() => floorRobotDamageProduct(1, [-1])).toThrow();
  });
  it("uses all adopted 40 core EXP steps and rejects downgrade or invalid levels", () => {
    expect(getRobotCoreUpgradeExp(1, 41)).toBe(10135); expect(getRobotCoreUpgradeExp(1, 2)).toBe(70);
    expect(getRobotCoreUpgradeExp(40, 41)).toBe(360); expect(getRobotCoreUpgradeExp(11, 11)).toBe(0);
    expect(getRobotCoreUpgradeExp(1, 21) + getRobotCoreUpgradeExp(21, 41)).toBe(10135);
    expect(() => getRobotCoreUpgradeExp(2, 1)).toThrow(); expect(() => getRobotCoreUpgradeExp(1, 42)).toThrow();
    expect([rules.progression.cores.capBase, rules.progression.cores.capPerLevel, rules.progression.cores.capMax]).toEqual([100, 5, 300]);
  });
});

const durability = [
  [4, [[100,22],[140,34],[190,50]]], [5, [[220,35],[300,50],[400,70]]],
  [8, [[260,30],[350,50],[460,75]]], [15, [[320,40],[430,65],[550,90]]], [22, [[380,45],[480,70],[590,95]]], [28, [[440,50],[540,80],[640,105]]],
  [11, [[140,28],[190,40],[260,60]]], [18, [[190,35],[260,50],[340,72]]], [23, [[210,38],[290,55],[380,80]]], [25, [[230,40],[310,60],[400,82]]], [29, [[250,42],[340,65],[430,88]]],
  [12, [[280,40],[370,60],[480,85]]], [19, [[340,45],[450,70],[580,100]]], [24, [[390,50],[510,80],[650,110]]], [26, [[420,55],[550,85],[700,115]]],
  [30, [[500,55],[540,80],[660,110]]]
] as const;
describe("adopted objective values and independent HP pools", () => {
  for (const [missionNumber, values] of durability) for (const [i, difficulty] of (["easy", "normal", "hard"] as const).entries()) it(`M${missionNumber}/${difficulty} uses adopted values over archived nulls`, () => {
    const s = createRobotObjectiveObjects(getRobotStagePlan({ missionNumber, difficulty }));
    expect(s.objects.length).toBe([4,11,18,23,25,29].includes(missionNumber) ? 2 : 1);
    for (const o of s.objects) { expect([o.hp, o.maxHp, o.def]).toEqual([values[i]![0], values[i]![0], values[i]![1]]); expect(o.blocksLineOfSight).toBe(false); }
  });
  it("keeps both depots independent, consolidates footprint hits and rejects malformed batches atomically", () => {
    const s = createRobotObjectiveObjects(getRobotStagePlan({ missionNumber: 11, difficulty: "normal" })), [left,right] = s.objects;
    const attack = { id: "blast", hits: [{ objectId: left!.id, cells: left!.cells, damage: 7 }] };
    const next = applyRobotObjectiveObjectBatch(s, [attack]); expect(next.objects.map(o => o.hp)).toEqual([183,190]);
    expect(applyRobotObjectiveObjectBatch(next, [attack])).toBe(next);
    const both = applyRobotObjectiveObjectBatch(next, [{ id: "both", hits: s.objects.map(o => ({ objectId: o.id, cells: o.cells, damage: 9 })) }]);
    expect(both.objects.map(o => o.hp)).toEqual([174,181]);
    expect(() => applyRobotObjectiveObjectBatch(s, [{ ...attack, hits: [...attack.hits, ...attack.hits] }])).toThrow(/once/);
    expect(() => applyRobotObjectiveObjectBatch(s, [attack, { id: "bad", hits: [{ objectId: right!.id, cells: [{x:0,y:0}], damage: 7 }] }])).toThrow();
    expect(s.objects.map(o => o.hp)).toEqual([190,190]);
  });
  it("moves a living transport at most one route cell per completed round, waits if blocked and never heals", () => {
    const s = createRobotObjectiveObjects(getRobotStagePlan({ missionNumber: 12, difficulty: "normal" })), transport = s.objects[0]!;
    let next = applyRobotObjectiveObjectBatch(s, [{ id: "hit", hits: [{ objectId: transport.id, cells: transport.cells, damage: 50 }] }]);
    next = advanceRobotObjectiveTransports(next, 1, { occupied: [transport.route[1]!], walls: [] }); expect(next.objects[0]!.routeIndex).toBe(0);
    next = advanceRobotObjectiveTransports(next, 2, { occupied: [], walls: [] }); expect(next.objects[0]!.routeIndex).toBe(1); expect(next.objects[0]!.hp).toBe(320);
    expect(advanceRobotObjectiveTransports(next, 2, { occupied: [], walls: [] })).toBe(next);
    expect(() => advanceRobotObjectiveTransports(next, 4, { occupied: [], walls: [] })).toThrow();
    next = applyRobotObjectiveObjectBatch(next, [{ id: "destroy", hits: [{ objectId: transport.id, cells: next.objects[0]!.cells, damage: 1000 }] }]);
    next = advanceRobotObjectiveTransports(next, 3, { occupied: [], walls: [] }); expect(next.objects[0]).toMatchObject({ hp: 0, routeIndex: 1 });
  });
  it("adopts all 66 mid/late settings while retaining the formal-runtime guard and M30's three conditions", () => {
    for (const key of listRobotStageKeys().filter(k => k.missionNumber >= 8)) {
      const stage = getRobotStagePlan(key); expect(stage.designStatus).toBe("adopted-mission-spec");
      expect(stage.blockingIssues.some(b => /Candidate stage|Composite victory|Unresolved durability/.test(b))).toBe(false);
      expect(stage.isReadyForFormalPlay).toBe(false); expect(() => requireApprovedRobotStage(key)).toThrow();
      if (key.missionNumber >= 22) expect(stage.objective.conditionKinds).toHaveLength(key.missionNumber === 30 ? 3 : 2);
    }
    expect(getRobotStagePlan({ missionNumber: 6, difficulty: "normal" }).objective.specification).toMatchObject({ requiredAlliedControlledBaseCount: 2, requiredConsecutiveRounds: 2, occupancyRule: { friendlyAiCountsAsAlly: true, ownershipPersistsWhenVacated: false } });
    expect(getRobotStagePlan({ missionNumber: 7, difficulty: "hard" }).objective.specification).toMatchObject({ pickupActionCost: 1, transmitActionCost: 1, friendlyAiMayPickupCarryOrTransmit: false });
  });
});

const expectedLight = {
  melee: ["light-blade", "standard-sword", "lance"], ranged: ["light-pistol", "assault-rifle", "sniper-rifle"],
  defense: ["suppression-mace", "binding-hammer", "quake-hammer"], mobile: ["light-blade", "standard-sword", "armor-pile"]
} as const;
describe("adopted 12 light enemy weapons", () => {
  for (const chassis of Object.keys(expectedLight) as RobotLightChassis[]) for (const [i, model] of (["A", "B", "C"] as const).entries()) it(`${chassis}/${model} uses the canonical weapon and one set of modifiers at Lv1-41`, () => {
    for (let level = 1; level <= 41; level++) {
      const p = getRobotLightEnemyPlan(chassis, model, level); expect(p.weaponId).toBe(expectedLight[chassis][i]); expect(p.weaponLevel).toBeLessThanOrEqual(8);
      for (const stat of ["hp","melee","ranged","def","spd"] as const) expect(p.stats![stat]).toBe(p.baseStats![stat] + (p.weapon!.statModifiers[stat] ?? 0));
      expect(p.readyForStatUse).toBe(true);
    }
  });
  it("applies quake MOV-1/SPD-10, no binding MOV penalty, and no invented armor-pile DEF-ignore", () => {
    const c = getRobotLightEnemyPlan("defense", "C", 41), b = getRobotLightEnemyPlan("defense", "B", 41);
    expect(c.stats!.mov).toBe(1); expect(c.stats!.spd).toBe(c.baseStats!.spd - 10); expect(b.stats!.mov).toBe(2);
    expect(getRobotLightEnemyPlan("mobile", "C", 41).weapon!.effect).toBeNull();
    expect(getRobotLightEnemyPlan("defense", "A", null).stats).toBeNull();
  });
  it("matches all 36 early Normal/Hard squads and enforces C eligibility", () => {
    let count = 0;
    for (const profile of earlyProfiles.profiles) {
      const key = { missionNumber: profile.number, difficulty: profile.difficulty as "normal" | "hard" }, stage = getRobotStagePlan(key);
      const plans = getRobotStageLightEnemyPlans(stage);
      for (const squad of profile.lightSquads) { const result = plans.find(p => p.unit.id === squad.id)!; expect(result.plan!.weaponId).toBe(squad.weaponId); count++; }
    }
    expect(count).toBe(36);
    const stage = getRobotStagePlan({ missionNumber: 8, difficulty: "normal" });
    expect(() => getRobotStageLightEnemyPlans({ ...stage, initialEnemies: stage.initialEnemies.map(u => u.kind === "light-squad" ? { ...u, model: "C" } : u) })).toThrow(/not allowed/);
    for (const key of listRobotStageKeys()) expect(() => getRobotStageLightEnemyPlans(getRobotStagePlan(key))).not.toThrow();
  });
});

describe("21-pair combo parameters, railgun EN and sword drawback", () => {
  const weapons: Record<RobotWeaponFamily, readonly [string,string]> = { slash: ["light-blade","double-edged-sword"], blunt: ["heavy-hammer","binding-hammer"], thrust: ["light-lance","lance"], assault: ["light-pistol","assault-rifle"], sniper: ["sniper-rifle","superheavy-railgun"], blast: ["howitzer","heavy-missile-cannon"] };
  it("covers all 21 unordered family pairs symmetrically with adopted costs and no normal-only extras", () => {
    const families = Object.keys(weapons) as RobotWeaponFamily[], counts: Record<string,number> = {};
    for (let i = 0; i < 6; i++) for (let j = i; j < 6; j++) {
      const a = part(weapons[families[i]!]![0]), b = part(weapons[families[j]!]![i === j ? 1 : 0]);
      const p = getRobotWeaponComboPlan(a,b); expect(getRobotWeaponComboPlan(b,a)).toEqual(p); counts[p.kind] = (counts[p.kind] ?? 0) + 1;
      expect(p).toMatchObject({ normalAttackEffects: false, normalAttackAddonEffects: false, normalHitEnergyRecovery: false, railgunExtraEnergy: 0 });
      expect(p.energyCost).toBe(({ "same-family":40,"melee-melee":50,"ranged-ranged":50,"slash-ranged":55,"thrust-ranged":45,"blunt-ranged":40 } as const)[p.kind]);
    }
    expect(counts).toEqual({"same-family":6,"melee-melee":3,"ranged-ranged":3,"slash-ranged":3,"thrust-ranged":3,"blunt-ranged":3});
    expect(() => getRobotWeaponComboPlan(part("light-blade"),part("light-blade"))).toThrow();
  });
  it("uses the ten exact railgun EN costs only for standalone normal weapon attacks", () => {
    expect(Array.from({length:10},(_,i)=>getRobotNormalWeaponEnergyCost(part("superheavy-railgun",i+1)))).toEqual([12,14,16,18,20,22,24,26,28,30]);
    for (const [other,en] of [["sniper-rifle",40],["assault-rifle",50],["standard-sword",55],["lance",45],["heavy-hammer",40]] as const) expect(getRobotWeaponComboPlan(part("superheavy-railgun",10),part(other,10)).energyCost).toBe(en);
    const w = resolveRobotBasicPart("superheavy-railgun",10); expect(w).toMatchObject({ weaponPower:280, cap:56, range:{min:3,max:5}, statModifiers:{mov:-1,spd:-10} });
  });
  it("uses the adopted temporary DEF30 penetration and leaves target DEF unchanged", () => {
    const values = [20,30,40,50,60,80,100,140]; expect(values.map(getRobotPiercingComboDefense)).toEqual([20,30,35,40,45,55,65,85]);
    expect(getRobotPiercingComboDefense(-100)).toBe(10); expect(values).toEqual([20,30,40,50,60,80,100,140]);
  });
  it("resolves the explicit two-hit formula sequentially and skips hit2 when hit1 kills", () => {
    const input = { primary:part("double-edged-sword"), secondary:part("light-lance"), attackStat:100, targetDef:50, targetHp:100, spatial:[clear,clear] as const };
    const result = resolveRobotTwoWeaponHits(input); expect(result.hits.map(h=>h.resolution.damage)).toEqual([37,12]);
    const killed = resolveRobotTwoWeaponHits({...input,targetHp:1}); expect(killed.hits).toHaveLength(1); expect(killed.hits[0]!.actualHpDamage).toBe(1);
    expect(resolveRobotTwoWeaponHits({...input,spatial:[blocked,blocked]}).hits.map(h=>h.actualHpDamage)).toEqual([0,0]);
  });
  it("sums actual HP damage before one recoil floor; only the attacking sword owner takes it", () => {
    const input = { attackWeaponIds:["double-edged-sword"], actingAsSupporter:false, actualHpDamage:[9,9] };
    expect(getRobotSwordRecoil({...input,attack:"sweep"})).toBe(3);
    for (const attack of ["weapon-combo","line","pincer","delta"] as const) expect(getRobotSwordRecoil({...input,attack})).toBe(1);
    expect(getRobotSwordRecoil({...input,attack:"delta",actualHpDamage:[73]})).toBe(7);
    expect(getRobotSwordRecoil({...input,attack:"delta",actingAsSupporter:true})).toBe(0);
    for (const attack of ["pair-defense","protection"] as const) expect(getRobotSwordRecoil({...input,attack})).toBe(0);
    expect(getRobotSwordRecoil({...input,attack:"normal",attackWeaponIds:["light-blade"]})).toBe(0);
    expect(applyRobotSwordRecoil(2,{...input,attack:"normal"})).toEqual({recoil:3,hp:0,defeated:true});
    expect(getRobotSwordRecoil({...input,attack:"normal",actualHpDamage:[0]})).toBe(0);
  });
});
