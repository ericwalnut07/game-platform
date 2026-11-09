import { describe, expect, it } from "vitest";
import {
  ROBOT_FACILITY_ATLAS_CELL, ROBOT_FACILITY_ATLAS_COLUMNS, ROBOT_FACILITY_ATLAS_INDEX,
  ROBOT_MISSION_ART_DIMENSIONS, ROBOT_FACILITY_VISIBLE_BOTTOM_PX,
  robotMissionArtUrl, robotIsMissionObjectSprite, robotFacilityVisibleBottomInset,
  robotFacilityAtlasUrl, robotFacilityPlacement,
  robotFacilitySpriteForMarker, robotFacilitySpriteForStructure,
} from "../../src/client/games/robot-tactics/BattleFacilityArt";
import { projectRobotIsoPoint } from "../../src/client/games/robot-tactics/BattleIsoProjection";

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
    for (const id of ["depot-left", "depot-right"]) {
      expect(robotFacilitySpriteForStructure(id, 4, 60)).toBe("depot");
      expect(robotFacilitySpriteForStructure(id, 4, 0)).toBe("depot-wreck");
    }
    for (const id of ["depot-west", "depot-east"]) {
      expect(robotFacilitySpriteForStructure(id, 11, 62)).toBe("depot");
      expect(robotFacilitySpriteForStructure(id, 11, 0)).toBe("depot-wreck");
    }
    expect(robotFacilitySpriteForStructure("facility", 14)).toBeNull();
    expect(robotFacilitySpriteForStructure("convoy", 5, 169)).toBe("convoy");
    expect(robotFacilitySpriteForStructure("convoy", 12, 169)).toBe("convoy");
    expect(robotFacilitySpriteForStructure("decoy-1", 30)).toBeNull();
    expect(robotFacilitySpriteForStructure("depot-left", 6)).toBeNull();
  });

  it("embeds exactly the three approved, transparent stage-2 objects offline", () => {
    expect(ROBOT_MISSION_ART_DIMENSIONS).toEqual({
      depot: { width: 208, height: 144 },
      "depot-wreck": { width: 208, height: 144 },
      convoy: { width: 152, height: 152 },
    });
    for (const kind of ["depot", "depot-wreck", "convoy"] as const) {
      expect(robotIsMissionObjectSprite(kind)).toBe(true);
      expect(robotMissionArtUrl(kind)).toMatch(/^data:image\/webp;base64,UklG/);
    }
    expect(robotIsMissionObjectSprite("crate")).toBe(false);
    expect(robotFacilityPlacement([{ x: 3, y: 2 }, { x: 4, y: 2 }], "depot"))
      .toEqual(robotFacilityPlacement([{ x: 3, y: 2 }, { x: 4, y: 2 }], "depot-wreck"));
    expect(robotFacilityPlacement([{ x: 3, y: 2 }], "convoy").width).toBeLessThan(1);
  });

  it("only illustrates real mission markers, not enemy targets or depot overlays", () => {
    for (const key of ["data-upload", "m30-data-upload"]) expect(robotFacilitySpriteForMarker(key)).toBe("console");
    for (const key of ["data-floor", "m30-data-floor"]) expect(robotFacilitySpriteForMarker(key)).toBe("crate");
    for (const key of ["base:0", "convoy-goal", "m12-convoy-goal", "breakthrough:3", "m10-breakthrough:3"])
      expect(robotFacilitySpriteForMarker(key)).toBe("beacon");
    for (const key of ["commander-target", "m11-depot:depot-west:0", "nonexistent", "target"])
      expect(robotFacilitySpriteForMarker(key)).toBeNull();
  });

  it("anchors each sprite at the center of the actual Core footprint, with its height above the ground", () => {
    const a = [{ x: 9, y: 12 }, { x: 10, y: 12 }];
    const first = robotFacilityPlacement(a, "antenna");
    expect(first.anchor).toEqual({ x: 10, y: 12.5 });
    expect(first.contact).toEqual({ x: 10.75, y: 13.25 });
    expect(first.depth).toBe(22);
    expect(first.width).toBeGreaterThan(1);
    expect(first.height).toBeGreaterThan(1);
    // Reverse cell ordering cannot shift the sprite (one image per HP pool).
    expect(robotFacilityPlacement([...a].reverse(), "antenna")).toEqual(first);
    const vertical = robotFacilityPlacement([{ x: 8, y: 13 }, { x: 8, y: 14 }], "crate");
    expect(vertical.anchor).toEqual({ x: 8.5, y: 14 });
    expect(vertical.contact).toEqual({ x: 9.25, y: 14.75 });
    expect(vertical.width).toBeGreaterThan(1);
    const marker = robotFacilityPlacement([{ x: 8, y: 13 }], "console", true);
    expect(marker.anchor).toEqual({ x: 8.5, y: 13.5 });
    expect(marker.contact).toEqual({ x: 9, y: 14 });
    expect(marker.width).toBeLessThan(first.width);
    expect(marker.height).toBeLessThan(first.height);
    expect(() => robotFacilityPlacement([], "antenna")).toThrow("footprint");
  });

  it("places visible opaque artwork at the true lower diamond corner without horizontal drift", () => {
    const examples = [
      [{ x: 3, y: 2 }],
      [{ x: 3, y: 2 }, { x: 4, y: 2 }],
      [{ x: 3, y: 2 }, { x: 3, y: 3 }],
      [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }],
    ];
    for (const cells of examples) {
      const placement = robotFacilityPlacement(cells, "depot");
      const mid = projectRobotIsoPoint(placement.anchor, 24);
      const contact = projectRobotIsoPoint(placement.contact, 24);
      const bottomCorner = projectRobotIsoPoint({
        x: Math.max(...cells.map(c => c.x)) + 1,
        y: Math.max(...cells.map(c => c.y)) + 1,
      }, 24);
      expect(contact.x).toBeCloseTo(mid.x);
      expect(contact.y).toBeCloseTo(bottomCorner.y);
    }
  });

  it("compensates for each approved PNG/WebP's measured alpha bottom and SVG aspect ratio", () => {
    expect(ROBOT_FACILITY_VISIBLE_BOTTOM_PX).toEqual({
      turret: 88, console: 88, antenna: 89, beacon: 75, crate: 76, radar: 80,
      depot: 136, "depot-wreck": 136, convoy: 144,
    });
    const depot = robotFacilityPlacement([{ x: 3, y: 2 }, { x: 4, y: 2 }], "depot");
    const wreck = robotFacilityPlacement([{ x: 3, y: 2 }, { x: 4, y: 2 }], "depot-wreck");
    expect(robotFacilityVisibleBottomInset("depot", depot.width, depot.height))
      .toBeCloseTo(robotFacilityVisibleBottomInset("depot-wreck", wreck.width, wreck.height));
    expect(robotFacilityVisibleBottomInset("depot", depot.width, depot.height)).toBeCloseTo(8 * 1.07 / 144);
    const truck = robotFacilityPlacement([{ x: 4, y: 2 }], "convoy");
    expect(robotFacilityVisibleBottomInset("convoy", truck.width, truck.height)).toBeCloseTo(8 * .90 / 152);
    const beacon = robotFacilityPlacement([{ x: 3, y: 2 }], "beacon", true);
    expect(robotFacilityVisibleBottomInset("beacon", beacon.width, beacon.height)).toBeGreaterThan(.2);
    const crate = robotFacilityPlacement([{ x: 3, y: 2 }, { x: 4, y: 2 }], "crate");
    expect(robotFacilityVisibleBottomInset("crate", crate.width, crate.height, false))
      .toBeCloseTo(crate.height * 20 / 96);
    // Crate's two-cell rectangle is height-limited, so stretching does
    // not alter its vertical inset. Beacon's taller viewport does letterbox.
    expect(robotFacilityVisibleBottomInset("crate", crate.width, crate.height))
      .toBeCloseTo(robotFacilityVisibleBottomInset("crate", crate.width, crate.height, false));
    expect(robotFacilityVisibleBottomInset("beacon", beacon.width, beacon.height))
      .not.toBeCloseTo(robotFacilityVisibleBottomInset("beacon", beacon.width, beacon.height, false));
  });

  it("does not change placement when the footprint order is shuffled", () => {
    const footprint = [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 3 }, { x: 5, y: 3 }];
    const expected = robotFacilityPlacement(footprint, "crate");
    expect(expected.anchor).toEqual({ x: 5, y: 3 });
    expect(expected.contact).toEqual({ x: 6, y: 4 });
    expect(expected.depth).toBe(8);
    expect(robotFacilityPlacement([...footprint].reverse(), "crate")).toEqual(expected);
  });
});
