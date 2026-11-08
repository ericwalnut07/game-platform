import { describe, expect, it } from "vitest";
import {
  projectRobotIsoPoint, robotIsoBillboardTransform, robotIsoHitCell,
  robotIsoViewBox, robotIsoWorldMatrix, unprojectRobotIsoPoint,
} from "../../src/client/games/robot-tactics/BattleIsoProjection";

const board = { width: 19, height: 15 };
const near = (a: number, b: number, tolerance = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance);

describe("view-only tactical isometric projection", () => {
  it("turns every logical square into a diamond with centered corners", () => {
    const at = { x: 5, y: 7 };
    const left = projectRobotIsoPoint({ x: at.x, y: at.y + 1 }, board.height);
    const top = projectRobotIsoPoint(at, board.height);
    const right = projectRobotIsoPoint({ x: at.x + 1, y: at.y }, board.height);
    const bottom = projectRobotIsoPoint({ x: at.x + 1, y: at.y + 1 }, board.height);
    near(top.x, bottom.x);
    near(left.y, right.y);
    near(right.x - left.x, 1);
    near(bottom.y - top.y, .56);
    near((top.x + bottom.x) / 2, (left.x + right.x) / 2);
    near((top.y + bottom.y) / 2, (left.y + right.y) / 2);
  });
  it("exactly restores logical coordinates across every board edge and intermediate movement point", () => {
    for (let x = 0; x <= board.width; x += .25) for (let y = 0; y <= board.height; y += .5) {
      const point = unprojectRobotIsoPoint(projectRobotIsoPoint({ x, y }, board.height), board.height);
      near(point.x, x);
      near(point.y, y);
    }
  });
  it("maps diamond centers to exactly the intended cell, not a neighboring bounding-box cell", () => {
    for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) {
      const projected = projectRobotIsoPoint({ x: x + .5, y: y + .5 }, board.height);
      expect(robotIsoHitCell(projected, board)).toEqual({ x, y });
    }
    for (const point of [{ x: -.1, y: .5 }, { x: 19.01, y: 6 }, { x: 7, y: 15.02 }]) {
      expect(robotIsoHitCell(projectRobotIsoPoint(point, board.height), board)).toBeNull();
    }
  });
  it("keeps the entire focused/overview projected grid in a landscape-aspect camera", () => {
    for (const logical of [
      { x: 0, y: 0, width: 19, height: 15 },
      { x: 4, y: 5, width: 10, height: 6 },
      { x: 1, y: 8, width: 6, height: 5 },
    ]) for (const aspect of [640 / 360, 844 / 390, 1280 / 800]) {
      const view = robotIsoViewBox(logical, board.height, aspect);
      near(view.width / view.height, aspect, 1e-6);
      for (const p of [
        { x: logical.x, y: logical.y },
        { x: logical.x + logical.width, y: logical.y },
        { x: logical.x, y: logical.y + logical.height },
        { x: logical.x + logical.width, y: logical.y + logical.height },
      ]) {
        const px = projectRobotIsoPoint(p, board.height);
        expect(px.x).toBeGreaterThan(view.x);
        expect(px.x).toBeLessThan(view.x + view.width);
        expect(px.y).toBeGreaterThan(view.y);
        expect(px.y).toBeLessThan(view.y + view.height);
      }
    }
  });
  it("counter-shears sprites without changing their anchor, so movement remains a screen-space diagonal", () => {
    expect(robotIsoWorldMatrix(board.height)).toBe("matrix(0.5 0.28 -0.5 0.28 7.5 0)");
    const compensated = robotIsoBillboardTransform({ x: 6.5, y: 8.5 });
    expect(compensated).toContain("matrix(1 -1 ");
    expect(compensated).toContain("translate(-6.5 -8.5)");
    const before = projectRobotIsoPoint({ x: 6.5, y: 8.5 }, board.height);
    const after = projectRobotIsoPoint({ x: 7.5, y: 8.5 }, board.height);
    near(after.x - before.x, .5);
    near(after.y - before.y, .28);
  });
});
