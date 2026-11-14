import { expect, it } from "vitest";
import { getRobotExpansionEnemyPlan, getRobotExpansionEnemyWeaponLevel } from "../../src/games/robot-tactics/expansionEnemyPresets";
import { getRobotSoloEnemyPlan, listRobotSoloEnemyModelIds } from "../../src/games/robot-tactics/enemyPresets";
import { getRobotLightEnemyPlan, type RobotLightChassis } from "../../src/games/robot-tactics/lightEnemyPresets";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";

const heavy = { kind: "solo", modelId: "heavy-heavy-assault-A" } as const;
const weapons = ["plasma-blade", "pulse-assault"] as const;

it("grows chassis stats across both difficulties and only rounds the final result", () => {
  const hard = getRobotSoloEnemyPlan(heavy.modelId, 40, true);
  const first = getRobotExpansionEnemyPlan({ difficulty: "hardest", missionNumber: 1 }, heavy, weapons);
  expect(first.referenceCoreLevel).toBe(40);
  expect(first.baseStats).toEqual({ hp: 256, melee: 214, ranged: 192, def: 109, spd: 84, en: 233, mov: 3 });
  const end = getRobotExpansionEnemyPlan({ difficulty: "hardest", missionNumber: 30 }, heavy, weapons);
  const infernoStart = getRobotExpansionEnemyPlan({ difficulty: "inferno", missionNumber: 1 }, heavy, weapons);
  const infernoEnd = getRobotExpansionEnemyPlan({ difficulty: "inferno", missionNumber: 30 }, heavy, weapons);
  const hp = hard.baseStats!.hp! * 1.08 * 1.012 ** 29;
  expect(end.baseStats.hp).toBe(Math.round(hp));
  expect(infernoStart.baseStats.hp).toBe(Math.round(hp * 1.08));
  expect(infernoEnd.baseStats).toEqual({
    hp: Math.round(hp * 1.08 * 1.007 ** 29),
    melee: Math.round(hard.baseStats!.melee! * 1.08 * 1.008 ** 29 * 1.05 * 1.005 ** 29),
    ranged: Math.round(hard.baseStats!.ranged! * 1.08 * 1.008 ** 29 * 1.05 * 1.005 ** 29),
    def: Math.round(((hard.baseStats!.def! + 2) * 1.0015 ** 29 + 1) * 1.0008 ** 29),
    spd: Math.round(((hard.baseStats!.spd! + 2) * 1.003 ** 29 + 2) * 1.002 ** 29),
    en: Math.round(hard.baseStats!.en! * 1.05 * 1.005 ** 29 * 1.03 * 1.003 ** 29),
    mov: hard.baseStats!.mov,
  });
});

it("uses the adopted medium HP checkpoints for the expansion reference", () => {
  for (const [archetype, hp] of [["melee",181], ["ranged",133], ["defense",181], ["mobile",163]] as const) {
    const modelId = "medium-" + archetype + "-A";
    const plan = getRobotExpansionEnemyPlan({ difficulty: "hardest", missionNumber: 1 }, { kind: "solo", modelId }, weapons);
    expect(plan.baseStats.hp).toBe(Math.round(hp * 1.08));
  }
  expect(getRobotSoloEnemyPlan("medium-melee-A", 40, true).baseStats!.hp).toBe(128);
});

it.each([["hardest",9], ["inferno",14]] as const)("uses the five %s weapon bands and the shared equipment catalog", (difficulty, first) => {
  for (let missionNumber = 1; missionNumber <= 30; missionNumber++) {
    const key = { difficulty, missionNumber }, expected = first + Math.floor((missionNumber - 1) / 6);
    expect(getRobotExpansionEnemyWeaponLevel(key)).toBe(expected);
    const plan = getRobotExpansionEnemyPlan(key, heavy, weapons);
    expect(plan.weapons).toEqual(weapons.map(id => resolveRobotBasicPart(id, expected)));
    for (const stat of ["hp", "melee", "ranged", "def", "spd", "en", "mov"] as const) {
      const sum = plan.weapons.reduce((n, w) => n + (w.statModifiers[stat] ?? 0), plan.baseStats[stat]);
      expect(plan.stats[stat]).toBe(stat === "mov" ? Math.max(1, sum) : sum);
    }
  }
});

it("keeps every light model at EN0 and protects distinct weapon slots", () => {
  const key = { difficulty: "inferno", missionNumber: 30 } as const;
  for (const chassis of ["melee", "ranged", "defense", "mobile"] as readonly RobotLightChassis[]) {
    for (const model of ["A", "B", "C"] as const) {
      const light = getRobotExpansionEnemyPlan(key, { kind: "light", chassis, model }, ["pulse-assault"]);
      expect(light.baseStats.mov).toBe(getRobotLightEnemyPlan(chassis, model, 40).baseStats!.mov);
      expect([light.baseStats.en, light.stats.en, light.initialEn]).toEqual([0, 0, 0]);
    }
  }
  expect(() => getRobotExpansionEnemyPlan(key, heavy, ["plasma-blade", "plasma-blade"])).toThrow(/weapons/);
  expect(() => getRobotExpansionEnemyPlan(key, heavy, ["double-edged-sword", "plasma-blade"])).toThrow(/weapons/);
  expect(() => getRobotExpansionEnemyPlan(key, heavy, ["superheavy-railgun", "plasma-blade"])).toThrow(/weapons/);
  expect(() => getRobotExpansionEnemyWeaponLevel({ ...key, missionNumber: 31 })).toThrow(/stage/);
});

it("resolves all 21 solo models and keeps each chassis's MOV across both difficulties", () => {
  for (const modelId of listRobotSoloEnemyModelIds()) {
    const model = { kind: "solo", modelId } as const;
    const start = getRobotExpansionEnemyPlan({ difficulty: "hardest", missionNumber: 1 }, model, weapons);
    const end = getRobotExpansionEnemyPlan({ difficulty: "inferno", missionNumber: 30 }, model, weapons);
    expect(end.baseStats.mov).toBe(start.baseStats.mov);
    for (const stat of ["hp", "melee", "ranged", "def", "spd", "en"] as const)
      expect(end.baseStats[stat]).toBeGreaterThan(start.baseStats[stat]);
  }
});
