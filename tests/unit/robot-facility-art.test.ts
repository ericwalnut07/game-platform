import { describe, expect, it } from "vitest";
import {
  ROBOT_FACILITY_ATLAS_CELL, ROBOT_FACILITY_ATLAS_COLUMNS, ROBOT_FACILITY_ATLAS_INDEX,
  robotFacilityAtlasUrl, robotFacilityPlacement,
  robotFacilitySpriteForMarker, robotFacilitySpriteForStructure,
} from "../../src/client/games/robot-tactics/BattleFacilityArt";

describe("Stage 5-3 canonical facility presentation", () => {
  it("bundles all six sprites of the approved second image sheet offline", () => {
    expect(ROBOT_FACILITY_ATLAS_CELL).toBe(96);
    expect(ROBOT_FACILITY_ATLAS_COLUMNS).toBe(3);
    expect(Object.values(ROBOT_FACILITY_ATLAS_INDEX).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(robotFacilityAtlasUrl()).toMatch(/^data:image\/webp;base64,UklG/);
  });

  it("uses only adopted structure IDs and mission contexts", () => {
    expect(robotFacilitySpriteForStructure("facility", 1)).toBe("turret");
    expect(robotFacilitySpriteForStructure("facility", 8)).toBe("radar");
    expect(robotFacilitySpriteForStructure("allied-final-relay", 30)).toBe("antenna");
    expect(robotFacilitySpriteForStructure("relay", 30)).toBe("antenna");
    for (const id of ["depot-left", "depot-right"]) expect(robotFacilitySpriteForStructure(id, 4)).toBe("crate");
    for (const id of ["depot-west", "depot-east"]) expect(robotFacilitySpriteForStructure(id, 11)).toBe("crate");
    expect(robotFacilitySpriteForStructure("facility", 14)).toBeNull();
    expect(robotFacilitySpriteForStructure("convoy", 5)).toBeNull();
    expect(robotFacilitySpriteForStructure("convoy", 12)).toBeNull();
    expect(robotFacilitySpriteForStructure("decoy-1", 30)).toBeNull();
    expect(robotFacilitySpriteForStructure("depot-left", 6)).toBeNull();
  });

  it("only illustrates real mission markers, not enemy targets or depot overlays", () => {
    for (const key of ["data-upload", "m30-data-upload"]) expect(robotFacilitySpriteForMarker(key)).toBe("console");
    for (const key of ["data-floor", "m30-data-floor"]) expect(robotFacilitySpriteForMarker(key)).toBe("crate");
    for (const key of ["base:0", "convoy-goal", "m12-convoy-goal", "breakthrough:1", "m10-breakthrough:0"])
      expect(robotFacilitySpriteForMarker(key)).toBe("beacon");
    for (const key of ["commander-target", "m11-depot:depot-west:0", "nonexistent", "target"])
      expect(robotFacilitySpriteForMarker(key)).toBeNull();
  });

  it("anchors a two-cell facility once at its shared footprint, not once per cell", () => {
    const first = robotFacilityPlacement([{ x: 9, y: 12 }, { x: 10, y: 12 }], "antenna");
    expect(first.anchor).toEqual({ x: 10, y: 12.86 });
    expect(first.width).toBeGreaterThan(1);
    expect(first.height).toBeGreaterThan(1);
    const marker = robotFacilityPlacement([{ x: 8, y: 13 }], "console", true);
    expect(marker.anchor).toEqual({ x: 8.5, y: 13.76 });
    expect(marker.width).toBeLessThan(first.width);
    expect(marker.height).toBeLessThan(first.height);
    expect(() => robotFacilityPlacement([], "antenna")).toThrow("footprint");
  });
});
