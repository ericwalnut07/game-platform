import { describe, expect, it } from "vitest";
import { getRobotLegalMoves, type RobotPosition } from "../../src/games/robot-tactics/movement";
import { planRobotBattleMovement, robotBattleMotionPosition, robotMovementDurationMs } from "../../src/client/games/robot-tactics/BattleMovement";
import type { RobotBattleUnitView, RobotBattleViewModel } from "../../src/client/games/robot-tactics/BattleViewModel";

const shape = { types: ["omni"] as const, mov: 3, facing: "north" as const };
const unit = (id: string, kind: RobotBattleUnitView["kind"], x: number, y: number): RobotBattleUnitView =>
  ({ id, name: id, kind, cell: { x, y }, movement: shape, hp: 100, maxHp: 100, en: 50, maxEn: 50, weapons: [] });
const board = { width: 6, height: 6, walls: [{ x: 2, y: 1 }] };
function snapshot(sequence: number, units: readonly RobotBattleUnitView[], actorIds: readonly string[], kind: RobotBattleUnitView["kind"], latestSummary: string, actionId: string | null): RobotBattleViewModel {
  return {
    checkpoint: { battleId: "same", sequence }, turnId: "round-1", round: 1, roundLimit: 8,
    board, structures: [], units,
    queue: [{ id: kind === "controlled" ? actorIds[0]! : "enemy-squad", name: "active", kind, unitIds: actorIds }],
    commands: [], choices: [], blocked: [], latestSummary,
    latestAction: actionId ? { id: actionId, hits: [] } : null,
    ai: { mode: "auto", instructions: {} },
  };
}
describe("committed ordinary-movement playback", () => {
  it("uses the existing canonical route around walls rather than drawing a straight teleport", () => {
    const from = unit("p1", "controlled", 1, 1), to = { ...from, cell: { x: 3, y: 1 } };
    const before = snapshot(0, [from], ["p1"], "controlled", "戦闘開始", null);
    const after = snapshot(1, [to], ["p1"], "controlled", "p1：通常移動", "move-1");
    const plan = planRobotBattleMovement(before, after);
    const expected = getRobotLegalMoves({ ...shape, board, origin: from.cell, occupied: [], structures: [] })
      .find(m => m.destination.x === to.cell.x && m.destination.y === to.cell.y)!;
    expect(plan.movers).toHaveLength(1);
    expect(plan.movers[0]!.route).toEqual([from.cell, ...expected.path]);
    expect(plan.movers[0]!.route).not.toContainEqual(board.walls[0]);
    expect(plan.durationMs).toBe(robotMovementDurationMs(expected.path.length));
    expect(robotBattleMotionPosition(plan.movers[0]!, 0)).toEqual(from.cell);
    expect(robotBattleMotionPosition(plan.movers[0]!, plan.durationMs)).toEqual(to.cell);
  });
  it("moves each NPC squad member using its own committed path with shared elapsed time", () => {
    const a = unit("a", "enemy", 1, 3), b = unit("b", "enemy", 1, 4);
    const before = snapshot(4, [a,b], ["a","b"], "enemy", "先行ターン", "prior");
    const after = snapshot(5, [{ ...a, cell: { x: 2, y: 3 } }, { ...b, cell: { x: 2, y: 4 } }], ["a","b"], "enemy", "enemy-squad：移動／通常攻撃", "next");
    const plan = planRobotBattleMovement(before, after);
    expect(plan.movers.map(mover => mover.unitId)).toEqual(["a", "b"]);
    expect(plan.durationMs).toBe(400);
    expect(plan.movers.every(mover => mover.route.length === 2)).toBe(true);
    expect(plan.movers.map(mover => robotBattleMotionPosition(mover, 200).x)).toEqual([1.5, 1.5]);
  });
  it("never animates attack displacement, spawns, or an unrelated battle checkpoint", () => {
    const player = unit("p1","controlled",1,1);
    const before = snapshot(0,[player],["p1"],"controlled","start",null);
    const after = snapshot(1,[{...player,cell:{x:3,y:1}}],["p1"],"controlled","p1：攻撃", "attack");
    expect(planRobotBattleMovement(before,after).durationMs).toBe(0);
    const changedBattle = {...after,checkpoint:{battleId:"different",sequence:1}};
    expect(planRobotBattleMovement(before,changedBattle).movers).toEqual([]);
    expect(planRobotBattleMovement(before,snapshot(1,[],["p1"],"controlled","p1：通常移動","ended")).movers).toEqual([]);
  });
  it("supports 0.4–1.1-second lengths, faster playback, reduced motion and completed final cells", () => {
    expect([1,2,3,4,5].map(steps => robotMovementDurationMs(steps))).toEqual([400,650,850,1000,1100]);
    expect(robotMovementDurationMs(3,"fast")).toBe(468);
    expect(robotMovementDurationMs(3,"skip")).toBe(0);
    const mover = { unitId:"p",kind:"controlled" as const,route:[{x:1,y:1},{x:2,y:1},{x:3,y:1}],durationMs:650 };
    expect(robotBattleMotionPosition(mover,325)).toEqual({x:2,y:1});
    expect(robotBattleMotionPosition(mover,5000)).toEqual({x:3,y:1});
  });
});
