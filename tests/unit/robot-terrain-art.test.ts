import { describe, expect, it } from "vitest";
import { ROBOT_TERRAIN_ATLAS_CELL, ROBOT_TERRAIN_ATLAS_INDEX, robotTerrainAtlasUrl, robotTerrainFloor, robotTerrainPlacement, robotTerrainWall } from "../../src/client/games/robot-tactics/BattleTerrainArt";

const wallSet = (...coords: [number, number][]) => new Set(coords.map(([x, y]) => `${x},${y}`));

describe("approved isometric terrain is purely view-derived", () => {
  it("embeds the approved eight-sprite atlas in the offline app", () => {
    const src = robotTerrainAtlasUrl();
    expect(ROBOT_TERRAIN_ATLAS_CELL).toBe(80);
    expect(src?.startsWith("data:image/webp;base64,UklG")).toBe(true);
    expect(src?.length).toBe("data:image/webp;base64,".length + 19720);
    expect(Object.values(ROBOT_TERRAIN_ATLAS_INDEX).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it("uses only approved floor variants and never affects a logical cell", () => {
    for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) {
      expect(["floor-metal", "floor-warning"]).toContain(robotTerrainFloor(x, y));
      expect(robotTerrainFloor(x, y)).toBe(robotTerrainFloor(x, y));
      expect(robotTerrainPlacement(robotTerrainFloor(x, y)).height).toBeGreaterThan(0);
    }
    expect(robotTerrainFloor(0, 0)).toBe("floor-warning");
    expect(robotTerrainFloor(1, 0)).toBe("floor-metal");
  });
  it("renders straight and corner walls only where original collision walls exist", () => {
    const lineX = wallSet([2, 2], [3, 2], [4, 2]);
    expect(robotTerrainWall({ x: 3, y: 2 }, lineX)).toBe("wall-x");
    expect(robotTerrainWall({ x: 3, y: 3 }, lineX)).toBeNull();
    const lineY = wallSet([2, 2], [2, 3], [2, 4]);
    expect(robotTerrainWall({ x: 2, y: 3 }, lineY)).toBe("wall-y");
    const corner = wallSet([2, 2], [3, 2], [2, 3]);
    expect(robotTerrainWall({ x: 2, y: 2 }, corner)).toBe("wall-corner");
  });
  it("represents isolated existing obstructions as low equipment, not new obstacles", () => {
    for (const [x, y, type] of [[0, 0, "container"], [0, 2, "barricade"], [1, 1, "utility"]] as const) {
      expect(robotTerrainWall({ x, y }, wallSet([x, y]))).toBe(type);
      expect(robotTerrainWall({ x: x + 1, y }, wallSet([x, y]))).toBeNull();
      const placement = robotTerrainPlacement(type);
      expect(placement.height).toBeLessThan(1);
    }
  });
});
