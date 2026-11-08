import { describe, expect, it } from "vitest";
import { robotArtPlacement, robotFrameArt, robotUnitArtUrl, robotArtPalette } from "../../src/client/games/robot-tactics/RobotVisualArt";
import { ROBOT_REAR_ART_CANVAS, ROBOT_REAR_ART_SHAPES, robotRearArtUrl } from "../../src/client/games/robot-tactics/RobotRearArt";

describe("Stage 5-4 six adopted allied rear-view sprites", () => {
  it("embeds all six transparent WebP map assets with no remote URLs", () => {
    expect(ROBOT_REAR_ART_CANVAS).toEqual({ size: 96, centerX: 48, feetY: 91 });
    expect(ROBOT_REAR_ART_SHAPES).toEqual(["attack", "defense", "reactor", "mobile", "all-rounder", "friendly-ai"]);
    for (const frameId of ["attack-1", "defense-1", "reactor-1", "mobile-1", "all-rounder", "friendly-ai"]) {
      const url = robotRearArtUrl(frameId);
      expect(url).toMatch(/^data:image\/webp;base64,UklG/);
      expect(url?.length).toBeGreaterThan(1500);
    }
  });
  it("shares exactly one rear silhouette across each same-type frame; palettes remain separate", () => {
    for (const ids of [
      ["attack-1", "attack-2-a", "attack-2-b"],
      ["defense-1", "defense-2"],
      ["reactor-1", "reactor-2"],
      ["mobile-1", "mobile-2"],
    ]) {
      expect(new Set(ids.map(robotRearArtUrl)).size).toBe(1);
      expect(new Set(ids.map(id => robotArtPalette(id))).size).toBe(ids.length);
      expect(ids.every(id => robotFrameArt(id) !== null)).toBe(true);
    }
    expect(robotRearArtUrl("enemy-light")).toBeNull();
    expect(robotRearArtUrl("enemy-medium")).toBeNull();
    expect(robotRearArtUrl("enemy-heavy")).toBeNull();
    expect(robotRearArtUrl("enemy-boss")).toBeNull();
    expect(robotRearArtUrl("unknown-frame")).toBeNull();
  });
  it("moves only the allied weapon grip to the right side of the new projection", () => {
    for (const frameId of ["attack-1", "defense-1", "reactor-1", "mobile-1", "all-rounder", "friendly-ai"]) {
      const front = robotArtPlacement(frameId, "front");
      const rear = robotArtPlacement(frameId, "right-rear");
      expect(rear.body).toEqual(front.body);
      expect(rear.weapon).toEqual(front.weapon);
      expect(rear.hand.x).toBeGreaterThan(.5);
      expect(rear.hand.x).toBeGreaterThan(front.hand.x);
      expect(rear.hand.y).toBeGreaterThan(.4);
      expect(rear.hand.y).toBeLessThan(.6);
      expect(robotUnitArtUrl(frameId)).toMatch(/^data:image\/png;base64,/); // Front source unchanged.
    }
    for (const id of ["enemy-light", "enemy-medium", "enemy-heavy", "enemy-boss"]) {
      expect(robotArtPlacement(id, "right-rear")).toEqual(robotArtPlacement(id, "front"));
    }
  });
});
