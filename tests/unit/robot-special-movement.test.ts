import { describe, expect, it } from "vitest";
import { getRobotLegalMoves } from "../../src/games/robot-tactics/movement";
import { robotBattleMotionOpacity, robotBattleMotionPosition } from "../../src/client/games/robot-tactics/BattleMovement";
import { planRobotBattleSpecialMovement } from "../../src/client/games/robot-tactics/BattleSpecialMovement";
import type { RobotBattleViewModel, RobotBattleUnitView, RobotBattleHitView } from "../../src/client/games/robot-tactics/BattleViewModel";

const movement = { types: ["omni"] as const, mov: 3, facing: "north" as const };
const unit = (id: string, kind: RobotBattleUnitView["kind"], x: number, y: number): RobotBattleUnitView => ({
  id, name: id, kind, cell: { x, y }, movement, extraMoveDistance: 2,
  hp: 100, maxHp: 100, en: 40, maxEn: 40, weapons: [],
});
const hit = (x: number, y: number): RobotBattleHitView => ({ cell: { x, y }, kind: "slash", damage: 13, impact: "light", pulse: 0 });
function view(sequence: number, units: readonly RobotBattleUnitView[], summary: string, action: string | null, actorIds: readonly string[] = ["p"]): RobotBattleViewModel {
  return {
    checkpoint: { battleId: "test-battle", sequence }, turnId: "t1", round: 1, roundLimit: 8,
    board: { width: 8, height: 8, walls: [] }, units, structures: [],
    queue: [{ id: "actor", name: "actor", kind: "controlled", unitIds: actorIds }],
    choices: [], commands: [], blocked: [],
    latestSummary: summary,
    latestAction: action ? { id: action, hits: [] } : null,
    ai: { mode: "auto", instructions: {} },
  } as RobotBattleViewModel;
}
const withHits = (model: RobotBattleViewModel, hits: readonly RobotBattleHitView[]): RobotBattleViewModel =>
  ({ ...model, latestAction: { ...model.latestAction!, hits } });

describe("committed special movement visualization", () => {
  it("uses the real extra-move footprint/route and does not record a forced motion", () => {
    const p = unit("p", "controlled", 1, 1), next = { ...p, cell: { x: 3, y: 1 } };
    const a = view(0, [p], "開始", null), b = view(1, [next], "p：追加移動", "extra-1");
    const phases = planRobotBattleSpecialMovement(a, b);
    const route = getRobotLegalMoves({
      ...movement, mov: 2, board: a.board, origin: p.cell, occupied: [], structures: [],
    }).find(m => m.destination.x === 3 && m.destination.y === 1)!;
    expect(phases.before.movers).toMatchObject([{ unitId: "p", kind: "controlled", style: "extra", route: [p.cell, ...route.path] }]);
    expect(phases.before.durationMs).toBeGreaterThan(0);
    expect(phases.after.movers).toHaveLength(0);
  });
  it("shows a real two-cell knockback after the hit, not during the attacking phase", () => {
    const p = unit("p", "controlled", 1, 1), e = unit("e", "enemy", 2, 1);
    const a = view(0, [p,e], "開始", null);
    const b = withHits(view(1, [p,{ ...e, cell: { x: 4, y: 1 } }], "p：衝撃射撃", "push-1"), [hit(2,1)]);
    const phases = planRobotBattleSpecialMovement(a,b);
    expect(phases.before.movers).toHaveLength(0);
    expect(phases.after.movers).toMatchObject([{unitId:"e",style:"push",route:[{x:2,y:1},{x:3,y:1},{x:4,y:1}]}]);
    expect(phases.after.durationMs).toBe(420);
    expect(robotBattleMotionPosition(phases.after.movers[0]!, 100).x).toBeGreaterThan(2);
  });
  it("recognizes a pull and differentiates its speed curve", () => {
    const p=unit("p","controlled",1,1),e=unit("e","enemy",4,1);
    const a=view(0,[p,e],"開始",null);
    const b=withHits(view(1,[p,{...e,cell:{x:3,y:1}}],"p：引戻し槍撃","pull"),[hit(4,1)]);
    const phases=planRobotBattleSpecialMovement(a,b);
    expect(phases.after.movers[0]!.style).toBe("pull");
    expect(robotBattleMotionPosition(phases.after.movers[0]!, 75).x).toBeGreaterThan(3.5);
  });
  it("replays a committed charging advance BEFORE the attack", () => {
    const p=unit("p","controlled",1,1),enemy=unit("e","enemy",4,1);
    const a=view(0,[p,enemy],"開始",null);
    const b=withHits(view(1,[{...p,cell:{x:3,y:1}},enemy],"p：超特攻","charge"),[hit(4,1)]);
    const phases=planRobotBattleSpecialMovement(a,b);
    expect(phases.before.movers).toMatchObject([{style:"charge",route:[{x:1,y:1},{x:2,y:1},{x:3,y:1}]}]);
    expect(phases.after.movers).toHaveLength(0);
  });
  it("animates blade vault over its actual target AFTER the attack with a visible arc", () => {
    const p=unit("p","controlled",1,1),e=unit("e","enemy",2,1);
    const a=view(0,[p,e],"開始",null);
    const b=withHits(view(1,[{...p,cell:{x:3,y:1}},e],"p：刃渡り","vault"),[hit(2,1)]);
    const phases=planRobotBattleSpecialMovement(a,b);
    expect(phases.before.movers).toHaveLength(0);
    expect(phases.after.movers[0]).toMatchObject({style:"vault",route:[{x:1,y:1},{x:2,y:1},{x:3,y:1}]});
    expect(robotBattleMotionPosition(phases.after.movers[0]!, phases.after.durationMs/2).y).toBeLessThan(1);
  });
  it("only creates a warp visual when an explicit teleport-like action is already committed", () => {
    const p=unit("p","controlled",0,0);
    const a=view(0,[p],"開始",null), b=view(1,[{...p,cell:{x:6,y:5}}],"p：空間転移","warp");
    const phases=planRobotBattleSpecialMovement(a,b);
    expect(phases.before.movers[0]!.style).toBe("blink");
    expect(robotBattleMotionPosition(phases.before.movers[0]!,0)).toEqual({x:0,y:0});
    expect(robotBattleMotionPosition(phases.before.movers[0]!,phases.before.durationMs)).toEqual({x:6,y:5});
    expect(robotBattleMotionOpacity(phases.before.movers[0]!,phases.before.durationMs/2)).toBe(0);
    expect(planRobotBattleSpecialMovement(a,{...b,latestSummary:"p：防御"}).before.movers).toHaveLength(0);
  });
  it("never invents a route through a blocking wall or from unrelated target motion", () => {
    const p=unit("p","controlled",1,1),e=unit("e","enemy",2,1);
    const a=view(0,[p,e],"開始",null), b=withHits(view(1,[p,{...e,cell:{x:4,y:1}}],"p：衝撃射撃","push"),[hit(2,1)]);
    const blocked={...a,board:{...a.board,walls:[{x:3,y:1}]}};
    expect(planRobotBattleSpecialMovement(blocked,b).after.movers).toHaveLength(0);
    const noHit={...b,latestAction:{...b.latestAction!,hits:[]}};
    expect(planRobotBattleSpecialMovement(a,noHit).after.movers).toHaveLength(0);
    expect(planRobotBattleSpecialMovement(a,b,"skip").after.movers).toHaveLength(0);
    expect(planRobotBattleSpecialMovement(a,{...b,checkpoint:{battleId:"other",sequence:1}}).after.movers).toHaveLength(0);
  });
  it("animates multiple knocked targets distinctly without moving the acting squad twice", () => {
    const p=unit("p","controlled",1,1),a=unit("a","enemy",2,1),b=unit("b","enemy",1,2);
    const before=view(0,[p,a,b],"開始",null);
    const after=withHits(view(1,[p,{...a,cell:{x:3,y:1}},{...b,cell:{x:1,y:3}}],"p：連携射撃","multi"),[hit(2,1),hit(1,2)]);
    const phases=planRobotBattleSpecialMovement(before,after);
    expect(phases.after.movers.map(m=>m.unitId)).toEqual(["a","b"]);
    expect(phases.after.movers.every(m=>m.style==="push")).toBe(true);
    expect(phases.after.durationMs).toBe(300);
  });
});
