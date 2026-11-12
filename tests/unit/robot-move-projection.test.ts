import { expect, it } from "vitest";
import { assertRobotBattleViewModel } from "../../src/client/games/robot-tactics/BattleViewModel";
import { robotFormalBattleAdapter } from "../../src/client/games/robot-tactics/FormalBattleAdapter";
import { robotFormalRuntime } from "../../src/games/robot-tactics/formalRuntime";
import { moveRegressionFixture } from "../robot-tactics/moveRegressionFixture";

it.each([17, 18] as const)("M%i keeps ordinary movement distinct from immediate attack projection", mission => {
  const { save, action, result, normal } = moveRegressionFixture(mission);
  const battle = save.battle;
  const before = robotFormalBattleAdapter.project(battle);
  const move = before.choices.find(c => JSON.stringify(c.payload) === JSON.stringify(action))!;
  expect(move.selection.targetIds).toEqual([]);
  const after = robotFormalBattleAdapter.project({ ...battle, snapshot: result.snapshot });
  assertRobotBattleViewModel(after);
  const attack = robotFormalRuntime.act(result.snapshot, normal.payload, battle.departure);
  expect(attack.summary).toContain("通常");
  if (mission === 18) {
    expect(before.choices.some(c => c.id === "combo:eastern-hub" || c.id === "combo:western-hub")).toBe(false);
    const combo = after.choices.find(c => c.id === "combo:eastern-hub" || c.id === "combo:western-hub")!;
    expect(combo).toBeDefined();
    expect(robotFormalRuntime.act(result.snapshot, combo.payload, battle.departure).summary).toContain("拡散射撃");
  }
});
