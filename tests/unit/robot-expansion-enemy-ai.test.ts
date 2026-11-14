import { expect, it } from "vitest";
import { commitRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { beginRobotBattleTurn, decodeRobotBattleCore, getRobotBattleUnit, robotBattleTurnId } from "../../src/games/robot-tactics/battleState";
import { commitRobotExpansionSpecial, getRobotEnemySpecialOptions } from "../../src/games/robot-tactics/battleWeaponActions";
import { getRobotExpansionEnemyPlan } from "../../src/games/robot-tactics/expansionEnemyPresets";
import { getRobotStagePlan } from "../../src/games/robot-tactics/stageCatalog";
import { createRobotExpansionStageEnemyUnits } from "../../src/games/robot-tactics/stageDeployment";
import { getRobotSoloEnemyPlan, listRobotSoloEnemyModelIds } from "../../src/games/robot-tactics/enemyPresets";
import { getRobotLightEnemyPlan } from "../../src/games/robot-tactics/lightEnemyPresets";
import { getRobotNormalWeaponEnergyCost } from "../../src/games/robot-tactics/weaponActions";
import { weaponCoreFixture } from "../robot-tactics/weaponCoreFixture";

const hard = { missionNumber: 30, difficulty: "hard" } as const;
const expansion = { ...hard, difficulty: "inferno" } as const;
const stage = getRobotStagePlan(hard);
const fixture = () => weaponCoreFixture({ openTurn: false });
const shot = (length: number, vertical = 0) => ({ x: length, y: vertical });
const bombCell = { x: 4, y: 4 };

function scene(weapon: string, offsets: readonly { x: number; y: number }[], en: number, tier: "medium" | "heavy" = "medium") {
  const original = fixture();
  const group = { id: "test-enemy", kind: tier, model: "A", chassisOrArchetype: tier === "medium" ? "ranged" : "heavy-artillery",
    enemyCoreLevel: null, weaponLevel: null, cells: [] } as const;
  const [enemy] = createRobotExpansionStageEnemyUnits(stage, expansion, group, [bombCell]);
  const equipped = { ...enemy!, movement: null, parts: [{ partId: weapon, level: 18 }, { partId: "light-pistol", level: 18 }],
    energy: { ...enemy!.energy, en } };
  const targets = ["p1", "p2", "p3"];
  const units = original.units.map(u => {
    const offset = offsets[targets.indexOf(u.id)];
    return offset ? { ...u, hp: 400, maxHp: 400,
      position: { x: bombCell.x + offset.x, y: bombCell.y + offset.y } } : u;
  });
  return beginRobotBattleTurn(decodeRobotBattleCore({
    ...original, units: [...units, equipped], actors: [...original.actors, { id: equipped.id, unitIds: [equipped.id] }],
  }), equipped.id);
}

const input = (s: ReturnType<typeof scene>) => ({ actionId: "enemy-special", turnId: robotBattleTurnId(s) });

it("compares all 33 model assignments with Hard families across both expansion difficulty bands", () => {
  for (const difficulty of ["hardest", "inferno"] as const) for (const missionNumber of [1, 15, 30]) {
    const key = { difficulty, missionNumber };
    for (const modelId of listRobotSoloEnemyModelIds()) {
      const previous = getRobotSoloEnemyPlan(modelId, 40, true);
      const plan = getRobotExpansionEnemyPlan(key, { kind: "solo", modelId });
      expect(plan.weapons.map(w => w.weaponFamily)).toEqual(previous.weapons!.map(w => w.weaponFamily));
      expect(new Set(plan.weapons.map(w => w.id)).size).toBe(2);
      expect(plan.weapons.every(w => w.range && w.weaponPower! > 0 && w.id !== "double-edged-sword" && w.id !== "superheavy-railgun")).toBe(true);
    }
    for (const chassis of ["melee", "ranged", "defense", "mobile"] as const) for (const model of ["A", "B", "C"] as const) {
      const plan = getRobotExpansionEnemyPlan(key, { kind: "light", chassis, model });
      const weapon = plan.weapons[0]!;
      expect(weapon.weaponFamily).toBe(getRobotLightEnemyPlan(chassis, model, 40, true).weapon!.weaponFamily);
      expect(getRobotNormalWeaponEnergyCost({ partId: weapon.id, level: weapon.level })).toBe(0);
      expect(plan.stats.en).toBe(0);
    }
  }
});

it("selects pulse fire on a worthwhile target, pays EN once and reloads without replaying", () => {
  const s = scene("pulse-assault", [shot(1)], 15);
  expect(() => commitRobotExpansionSpecial(s, { ...input(s), weaponId: "pulse-assault", targetIds: ["p1"] })).toThrow(/controlled actor/);
  const next = commitRobotNpcTurn(s, input(s));
  expect(next.latest?.damage.map(hit => hit.targetId)).toEqual(["p1", "p1"]);
  expect(getRobotBattleUnit(next, "test-enemy").energy.action?.energyCost).toBe(15);
  const loaded = decodeRobotBattleCore(JSON.parse(JSON.stringify(next)));
  expect(commitRobotNpcTurn(loaded, input(s))).toBe(loaded);
  const distant = scene("pulse-assault", [shot(4)], 15);
  expect(getRobotEnemySpecialOptions(distant, "pulse-assault")).toEqual([]);
  const blocked = scene("pulse-assault", [shot(2)], 15);
  expect(getRobotEnemySpecialOptions({ ...blocked, board: { ...blocked.board,
    walls: [...blocked.board.walls, { x: bombCell.x + 1, y: bombCell.y }] } }, "pulse-assault")).toEqual([]);
  const short = scene("pulse-assault", [shot(1)], 14);
  expect(getRobotEnemySpecialOptions(short, "pulse-assault")).toEqual([]);
  expect(getRobotBattleUnit(commitRobotNpcTurn(short, input(short)), "test-enemy").energy.action?.energyCost).toBe(0);
});

it("selects phase lance only for a legal line and reuses cluster splash and impact slow", () => {
  const line = scene("phase-lance", [shot(1), shot(2)], 15);
  expect(getRobotEnemySpecialOptions(line, "phase-lance").map(o => o.targetIds)).toContainEqual(["p1", "p2"]);
  const split = scene("phase-lance", [shot(1), shot(2, 1)], 15);
  expect(getRobotEnemySpecialOptions(split, "phase-lance")).toEqual([]);
  const phased = commitRobotNpcTurn(line, input(line));
  expect(phased.latest?.damage.map(hit => hit.targetId)).toEqual(["p1", "p2"]);
  const cluster = scene("cluster-cannon", [shot(2), shot(2, 1)], 20, "heavy");
  const blasted = commitRobotNpcTurn(cluster, input(cluster));
  expect(blasted.latest?.damage.map(hit => hit.targetId).sort()).toEqual(["p1", "p2"]);
  expect(getRobotBattleUnit(blasted, "test-enemy").energy.action?.energyCost).toBe(20);
  const impact = scene("impact-breaker", [shot(1)], 15);
  const slowed = commitRobotNpcTurn(impact, input(impact));
  expect(getRobotBattleUnit(slowed, "p1").weaponDebuffs).toContainEqual(expect.objectContaining({ stat: "mov", delta: -1 }));
});

it("allows an EN0 plasma squad to land normal hits and apply the shared burn", () => {
  const initial = fixture();
  const unit = { id: "plasma-squad", kind: "light-squad", model: "A", chassisOrArchetype: "melee",
    enemyCoreLevel: null, weaponLevel: null, cells: [] } as const;
  const members = createRobotExpansionStageEnemyUnits(stage, expansion, unit, [
    bombCell, { x: 3, y: 4 }, { x: 3, y: 5 },
  ]).map(member => ({ ...member, movement: null }));
  const s = beginRobotBattleTurn(decodeRobotBattleCore({ ...initial,
    units: [...initial.units.map(u => u.id === "p1" ? { ...u, hp: 400, maxHp: 400, position: { x: 5, y: 4 } } : u), ...members],
    actors: [...initial.actors, { id: unit.id, unitIds: members.map(u => u.id) }],
  }), unit.id);
  const next = commitRobotNpcTurn(s, input(s));
  expect(getRobotBattleUnit(next, "p1").burning).toMatchObject({ sourceId: members[0]!.id, ticksRemaining: 3 });
  expect(getRobotBattleUnit(next, members[0]!.id).energy).toMatchObject({ en: 0, maxEn: 0, action: { kind: "normal-attack", energyCost: 0 } });
});
