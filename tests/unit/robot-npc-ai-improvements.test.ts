import { getRobotNpcRouteDistance } from "../../src/games/robot-tactics/npcNavigation";
import { expect, it } from "vitest";
import { beginRobotBattleTurn, commitRobotBattleDefend, decodeRobotBattleCore, getRobotBattleActor, getRobotBattleLegalMoves, getRobotBattleResult, getRobotBattleUnit, robotBattleIsAlly, robotBattleTurnId, type RobotBattleCoreState } from "../../src/games/robot-tactics/battleState";
import { commitRobotNpcTurn, planRobotNpcTurn } from "../../src/games/robot-tactics/battleNpc";
import { robotFormalRuntime, scheduleRobotFormalBattle } from "../../src/games/robot-tactics/formalRuntime";
import { getRobotLegalMoves, getRobotTraversalDistances, robotCellToPosition as cell } from "../../src/games/robot-tactics/movement";
import { createRobotOfflineProgress } from "../../src/games/robot-tactics/offlineProgress";
import { createRobotFormalBattleState } from "../../src/games/robot-tactics/stageDeployment";

const scene = (missionNumber: number, difficulty: "easy" | "normal" | "hard" = "easy") =>
  createRobotFormalBattleState({ battleId: "ai-test", key: { missionNumber, difficulty }, party: createRobotOfflineProgress().party });
const input = (s: RobotBattleCoreState) => ({ actionId: "ai-test:" + s.actionIds.length, turnId: robotBattleTurnId(s) });

it("takes legal steps initially away from the goal to leave a walled pocket", () => {
  const goal = { x: 4, y: 2 }, start = { x: 2, y: 2 };
  const board = { width: 5, height: 5, walls: [{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 1 }, { x: 2, y: 3 }] };
  const distance = getRobotTraversalDistances(board, [], [goal]);
  let position = start;
  const steps = [];
  while (distance(position)! > 0 && steps.length < 12) {
    const moves = getRobotLegalMoves({ board, origin: position, mov: 1, types: ["omni"], facing: "south", structures: [], occupied: [] });
    position = moves.map(m => m.destination).find(p => distance(p) === distance(position)! - 1)!;
    expect(position).toBeDefined();
    steps.push(position);
  }
  expect(steps[0]!.x).toBeLessThan(start.x);
  expect(steps.at(-1)).toEqual(goal);
});

it("handles occupied and sealed goals while retaining shortest travel on open ground", () => {
  const board = { width: 7, height: 5, walls: [] }, goal = { x: 5, y: 2 };
  expect(getRobotTraversalDistances(board, [], [goal])({ x: 1, y: 1 })).toBe(4);
  expect(getRobotTraversalDistances(board, [goal], [goal])({ x: 1, y: 1 })).toBeUndefined();
  const sealed = { ...board, walls: Array.from({ length: board.height }, (_, y) => ({ x: 3, y })) };
  expect(getRobotTraversalDistances(sealed, [goal], [{ x: 4, y: 2 }])({ x: 1, y: 1 })).toBeUndefined();
});

it("routes towards a reachable alternative when an occupied primary target is sealed", () => {
  const base = scene(15), start = { x: 1, y: 1 }, sealedTarget = { x: 6, y: 1 };
  const enemy = base.units.find(u => !robotBattleIsAlly(u))!;
  const source = { ...enemy, position: start, parts: [{ partId: "light-blade", level: 1 }] };
  const s = {
    ...base, board: { ...base.board, walls: Array.from({ length: base.board.height }, (_, y) => ({ x: 4, y })) },
    units: base.units.map(u => u.id === enemy.id ? source : u.id === "core-a" ? { ...u, position: sealedTarget } :
      u.id === "core-b" ? { ...u, position: { x: 1, y: 5 } } : { ...u, hp: 0, position: null }),
  };
  const route = getRobotNpcRouteDistance(s, source, { cell: sealedTarget, hold: false });
  expect(route(start)).toBe(3);
  expect(route({ x: 1, y: 2 })).toBe(2);
  const isolated = { ...s, units: s.units.filter(u => u.id !== "core-b") };
  expect(getRobotNpcRouteDistance(isolated, source, { cell: sealedTarget, hold: false })(start)).toBe(0);
});

it("M15 leaves the H7 corner when I7 and H8 block a diagonal attack on I8", () => {
  const { initiative: _initiative, ...base } = scene(15);
  const id = "east-fast-raid:1", origin = cell("H7"), goal = cell("I8");
  const s = beginRobotBattleTurn({
    ...base, units: base.units.map(u => u.id === id ? { ...u, position: origin } :
      u.id === "core-a" ? { ...u, position: goal } :
      !robotBattleIsAlly(u) ? { ...u, hp: 0, position: null } : u),
  }, "east-fast-raid");
  const legal = getRobotBattleLegalMoves(s, id);
  const plan = planRobotNpcTurn(s);
  const moved = getRobotBattleUnit(plan.stateAfterMoves, id).position!;
  expect(plan.movedIds).toEqual([id]);
  expect(legal.some(m => m.destination.x === moved.x && m.destination.y === moved.y)).toBe(true);
  expect(Math.max(Math.abs(moved.x - goal.x), Math.abs(moved.y - goal.y))).toBeGreaterThan(1);
});

it.each(["easy", "normal", "hard"] as const)("M15 %s original deployment produces an enemy hit within five rounds", difficulty => {
  const departure = { battleId: "ai-test", key: { missionNumber: 15, difficulty }, party: createRobotOfflineProgress().party };
  let s = scheduleRobotFormalBattle(scene(15, difficulty));
  const oldSnapshot = JSON.parse(JSON.stringify(s));
  robotFormalRuntime.validate(oldSnapshot, departure);
  s = decodeRobotBattleCore(oldSnapshot);
  let hit = false;
  let enemyMovementTurns = 0;
  for (let i = 0; i < 80 && s.allied.round <= 5 && getRobotBattleResult(s).result === "ongoing" && !hit; i++) {
    const actor = getRobotBattleActor(s), source = getRobotBattleUnit(s, actor.unitIds[0]!);
    const before = s;
    s = source.kind === "controlled" ? commitRobotBattleDefend(s, input(s)) : commitRobotNpcTurn(s, input(s));
    if (!robotBattleIsAlly(source)) {
      if (actor.unitIds.some(id => {
        const a = getRobotBattleUnit(before, id), b = getRobotBattleUnit(s, id);
        return a.position && b.position && (a.position.x !== b.position.x || a.position.y !== b.position.y);
      })) enemyMovementTurns++;
      hit = s.latest!.damage.some(event => actor.unitIds.includes(event.sourceId) && (event.damage ?? 0) > 0);
    }
    s = scheduleRobotFormalBattle(s);
  }
  expect(enemyMovementTurns).toBeGreaterThan(1);
  expect(hit).toBe(true);
  robotFormalRuntime.validate(JSON.parse(JSON.stringify(s)), departure);
}, 12000);

function friendlyScenario(weapons: readonly [string, string], en: number, targets: readonly string[], formation = false) {
  const { initiative: _initiative, ...base } = scene(1);
  const enemies = base.units.filter(u => !robotBattleIsAlly(u));
  return beginRobotBattleTurn({
    ...base, ai: { ...base.ai, instructions: { ...base.ai.instructions, "friendly-1": { tacticId: "free-action" } }, ...(formation ? { allowFormations: true } : {}) },
    units: base.units.map(u => {
      if (u.id === "friendly-1") return { ...u, position: cell("E7"), energy: { ...u.energy, en, maxEn: 100 }, parts: weapons.map(partId => ({ partId, level: 1 })) };
      if (u.id === "core-a" && formation) return { ...u, position: cell("D7"), stats: { ...u.stats, ranged: 160 }, addons: [{ partId: "friendly-ai-formation-enabler" }] };
      const index = enemies.indexOf(u);
      if (index < 0) return u;
      const target = targets[index];
      return target ? { ...u, position: cell(target) } : { ...u, hp: 0, position: null };
    }),
  }, "friendly-1");
}

it("uses a blast special when an area attack outperforms a normal hit, with exactly one action", () => {
  const s = friendlyScenario(["wide-grenade-cannon", "heavy-hammer"], 65, ["H7", "H6", "I7"]);
  const after = commitRobotNpcTurn(s, input(s));
  expect(after.latest!.summary).toContain("爆撃");
  expect(new Set(after.latest!.damage.map(hit => hit.targetId)).size).toBeGreaterThan(1);
  expect(after.actionIds).toHaveLength(1);
  expect(getRobotBattleUnit(after, "friendly-1").energy.action!.energyCost).toBe(0);
  expect(decodeRobotBattleCore(JSON.parse(JSON.stringify(after)))).toEqual(after);
});

it("selects a spread combo for a large enough group, but uses normal fire against one target or at zero EN", () => {
  const guns = ["assault-rifle", "sniper-rifle"] as const;
  const group = ["H7", "H6", "H8", "I7", "I8"];
  const s = friendlyScenario(guns, 100, group);
  const spread = commitRobotNpcTurn(s, input(s));
  expect(spread.latest!.summary).toContain("拡散射撃");
  for (const [energy, targets] of [[100, ["H7"]], [0, group]] as const) {
    const scenario = friendlyScenario(guns, energy, targets);
    const normal = commitRobotNpcTurn(scenario, input(scenario));
    expect(normal.latest!.summary).toContain("通常攻撃");
    expect(getRobotBattleUnit(normal, "friendly-1").energy.action!.energyCost).toBe(0);
  }
});

it("selects line formation only with permission and preserves the supporter's EN and action", () => {
  const s = friendlyScenario(["assault-rifle", "sniper-rifle"], 90, ["H7"], true);
  const next = commitRobotNpcTurn(s, input(s));
  expect(next.latest!.summary).toContain("ライン連携");
  const support = getRobotBattleUnit(s, "core-a");
  expect(getRobotBattleUnit(next, support.id).energy).toEqual(support.energy);
  const denied = { ...s, ai: { ...s.ai, allowFormations: false } };
  expect(commitRobotNpcTurn(denied, input(denied)).latest!.summary).toContain("通常攻撃");
});

it("keeps the established attack and defense fallback when no paid action is legal", () => {
  const s = friendlyScenario(["heavy-hammer", "light-blade"], 0, []);
  const plan = planRobotNpcTurn(s);
  expect(plan.choices[0]?.attack).toBeNull();
  const next = commitRobotNpcTurn(s, input(s));
  expect(next.latest!.summary).toContain("防御");
  expect(getRobotBattleUnit(next, "friendly-1").defended).toBe(true);
});

it("spends EN on a stationary special attack when a high-DEF target makes it worthwhile", () => {
  const base = friendlyScenario(["superheavy-railgun", "heavy-hammer"], 95, ["I7"]);
  const s = { ...base, units: base.units.map(u => u.id === "friendly-1" ?
    { ...u, addons: [{ partId: "anti-materiel-focus" }], stats: { ...u.stats, ranged: 180 } } :
    !robotBattleIsAlly(u) && u.hp > 0 ? { ...u, stats: { ...u.stats, def: 150 } } : u) };
  const next = commitRobotNpcTurn(s, input(s));
  expect(next.latest!.summary).toContain("対物一点収束");
  expect(getRobotBattleUnit(next, "friendly-1").energy.action!.energyCost).toBe(25);
});

it("chooses the existing shield when incoming fire is likely lethal through ordinary defense", () => {
  const base = friendlyScenario(["sniper-rifle", "heavy-hammer"], 95, ["G7", "G8"]);
  const s = { ...base, units: base.units.map(u => u.id === "friendly-1" ?
    { ...u, hp: 55, energy: { ...u.energy, moved: true }, stats: { ...u.stats, def: 50 } } :
    !robotBattleIsAlly(u) && u.hp > 0 ? { ...u, stats: { ...u.stats, ranged: 125 },
      parts: [{ partId: "assault-rifle", level: 1 }] } : u) };
  const next = commitRobotNpcTurn(s, input(s));
  expect(next.latest!.summary).toContain("シールド");
  expect(getRobotBattleUnit(next, "friendly-1").shielded).toBe(true);
});
