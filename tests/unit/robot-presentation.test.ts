import { describe, expect, it } from "vitest";
import { planRobotBattlePresentation, ROBOT_BATTLE_SPEEDS, robotBattleSpeedLabel } from "../../src/client/games/robot-tactics/BattlePresentation";
import { planRobotVfx } from "../../src/client/games/robot-tactics/RobotVfx";
import type { RobotBattleHitView } from "../../src/client/games/robot-tactics/BattleViewModel";

const slash: RobotBattleHitView = { cell: { x: 2, y: 3 }, kind: "slash", damage: 32, pulse: 0, impact: "light" };
describe("battle presentation pacing (visual only)", () => {
  it("stages actor then target before effects and leaves a readable result+gap", () => {
    const plan = planRobotBattlePresentation([slash]);
    const vfxEnd = Math.max(...planRobotVfx([slash]).map(e => e.delayMs + e.durationMs));
    expect(plan).toMatchObject({ scale: 1, actorMs: 200, targetMs: 200, introMs: 400 });
    expect(plan.resultMs).toBeGreaterThanOrEqual(400 + vfxEnd);
    expect(plan.totalMs - plan.resultMs).toBe(580);
    expect(plan.totalMs).toBeGreaterThanOrEqual(1300);
  });
  it("delays sequential blasts or combo pulses until their actual resolved effects have finished", () => {
    const single = planRobotBattlePresentation([slash]);
    const repeated = planRobotBattlePresentation([slash, { ...slash, kind: "blast", pulse: 1 }]);
    expect(repeated.totalMs).toBeGreaterThan(single.totalMs);
  });
  it("supports fast playback and cosmetic skip with no effect on hit data", () => {
    const input = [slash], before = JSON.stringify(input);
    const standard = planRobotBattlePresentation(input, [], true, "standard");
    const fast = planRobotBattlePresentation(input, [], true, "fast");
    const skip = planRobotBattlePresentation(input, [], true, "skip");
    expect(fast.totalMs).toBeLessThan(standard.totalMs);
    expect(fast.actorMs).toBe(110);
    expect(skip).toMatchObject({ actorMs: 0, targetMs: 0, introMs: 0, totalMs: 0 });
    expect(JSON.stringify(input)).toBe(before);
  });
  it("preserves prior movement pacing until its own animation is implemented", () => {
    expect(planRobotBattlePresentation([], [], false, "standard").totalMs).toBe(800);
    expect(planRobotBattlePresentation([], [], false, "skip").totalMs).toBe(0);
    expect(planRobotBattlePresentation([], [], true, "standard")).toMatchObject({ actorMs: 200, targetMs: 0, introMs: 200 });
  });
  it("exposes only the three adopted speed options", () => {
    expect(ROBOT_BATTLE_SPEEDS.map(robotBattleSpeedLabel)).toEqual(["標準", "高速", "スキップ"]);
  });
});
