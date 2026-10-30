import { describe, expect, it } from "vitest";
import { checkRobotLineOfSight, type RobotLineOfSightQuery } from "../../src/games/robot-tactics/lineOfSight";
import { checkRobotAttackRange } from "../../src/games/robot-tactics/attackRange";
import { checkRobotAttackSpatial, getRobotAttackBlockReasonText } from "../../src/games/robot-tactics/attackResolution";
import { resolveRobotBasicPart } from "../../src/games/robot-tactics/equipment";
import { getRobotStagePlan, requireApprovedRobotStage } from "../../src/games/robot-tactics/stageCatalog";
import { robotCellToPosition, type RobotPosition } from "../../src/games/robot-tactics/movement";

function query(origin: RobotPosition = { x: 0, y: 0 }, target: RobotPosition = { x: 4, y: 4 }, walls: readonly RobotPosition[] = []): RobotLineOfSightQuery {
  return { board: { width: 7, height: 7, walls }, origin, target };
}

describe("adopted center-ray wall-only line of sight", () => {
  it("passes without walls in horizontal, vertical, diagonal, shallow and steep directions", () => {
    for (const target of [{ x: 6, y: 0 }, { x: 0, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 2 }, { x: 2, y: 6 }]) {
      expect(checkRobotLineOfSight(query({ x: 0, y: 0 }, target)).clear).toBe(true);
    }
  });
  it("blocks a ray crossing the interior of a wall cell", () => {
    expect(checkRobotLineOfSight(query({ x: 0, y: 0 }, { x: 4, y: 0 }, [{ x: 2, y: 0 }]))).toMatchObject({ clear: false, reason: "interior" });
    expect(checkRobotLineOfSight(query({ x: 0, y: 0 }, { x: 3, y: 1 }, [{ x: 1, y: 0 }])).clear).toBe(false);
    expect(checkRobotLineOfSight(query({ x: 0, y: 0 }, { x: 4, y: 4 }, [{ x: 2, y: 2 }])).clear).toBe(false);
  });
  it("passes an exact corner when only one flank cell is a wall", () => {
    for (const wall of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) expect(checkRobotLineOfSight(query({ x: 0, y: 0 }, { x: 2, y: 2 }, [wall])).clear).toBe(true);
  });
  it("blocks an exact corner when both flank cells are walls", () => {
    expect(checkRobotLineOfSight(query({ x: 0, y: 0 }, { x: 2, y: 2 }, [{ x: 1, y: 0 }, { x: 0, y: 1 }]))).toMatchObject({ clear: false, reason: "closed-corner" });
  });
  it("handles corners on non-45-degree rays exactly and symmetrically", () => {
    const p = query({ x: 0, y: 0 }, { x: 3, y: 1 }, [{ x: 2, y: 0 }]);
    expect(checkRobotLineOfSight(p).clear).toBe(true);
    expect(checkRobotLineOfSight({ ...p, board: { ...p.board, walls: [{ x: 2, y: 0 }, { x: 1, y: 1 }] } })).toMatchObject({ clear: false, reason: "closed-corner" });
    expect(checkRobotLineOfSight({ ...p, origin: p.target, target: p.origin }).clear).toBe(true);
  });
  it("passes through both friendly and enemy occupants", () => {
    const friendly = { x: 1, y: 0 }, enemy = { x: 2, y: 0 };
    const sight = { ...query({ x: 0, y: 0 }, { x: 4, y: 0 }), occupied: [friendly, enemy] };
    expect(checkRobotLineOfSight(sight).clear).toBe(true);
    expect(checkRobotAttackSpatial({ kind: "normal", sight, range: { status: "in-range", distance: 4 } }).canReach).toBe(true);
  });
  it("keeps facilities transparent by default, regardless of their movement blocking", () => {
    const facility = { cells: [{ x: 2, y: 0 }], blocksMovement: true };
    const q = { ...query({ x: 0, y: 0 }, { x: 4, y: 0 }), structures: [facility] };
    expect(checkRobotLineOfSight(q).clear).toBe(true);
    expect(checkRobotLineOfSight({ ...q, structures: [{ ...facility, blocksLineOfSight: false }] }).clear).toBe(true);
    expect(checkRobotLineOfSight({ ...q, structures: [{ ...facility, blocksLineOfSight: true }] })).toMatchObject({ clear: false, reason: "interior", blockers: [{ kind: "structure" }] });
  });
  it("uses the same corner rule for explicitly designated structure occluders", () => {
    const q = { ...query({ x: 0, y: 0 }, { x: 2, y: 2 }, [{ x: 1, y: 0 }]), structures: [{ cells: [{ x: 0, y: 1 }], blocksLineOfSight: true }] };
    expect(checkRobotLineOfSight(q)).toMatchObject({ clear: false, reason: "closed-corner" });
  });
  it("has identical visibility for A->B, B->A and transposed coordinates", () => {
    const points = Array.from({ length: 25 }, (_, i) => ({ x: i % 5, y: Math.floor(i / 5) }));
    const patterns = [[], [{ x: 2, y: 2 }], [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 3, y: 2 }]];
    const transpose = (p: RobotPosition) => ({ x: p.y, y: p.x });
    for (const walls of patterns) for (const origin of points) for (const target of points) {
      const q = query(origin, target, walls), clear = checkRobotLineOfSight(q).clear;
      expect(checkRobotLineOfSight({ ...q, origin: target, target: origin }).clear).toBe(clear);
      expect(checkRobotLineOfSight(query(transpose(origin), transpose(target), walls.map(transpose))).clear).toBe(clear);
    }
  });
  it("validates board bounds without mutating a query", () => {
    const q = query(), before = JSON.stringify(q);
    checkRobotLineOfSight(q);
    expect(JSON.stringify(q)).toBe(before);
    expect(checkRobotLineOfSight({ ...q, target: { x: 7, y: 0 } })).toMatchObject({ clear: false, reason: "out-of-bounds" });
    expect(() => checkRobotLineOfSight({ ...q, target: { x: 0.5, y: 0 } })).toThrow();
    expect(() => checkRobotLineOfSight({ ...q, board: { ...q.board, width: 0 } })).toThrow();
    expect(() => checkRobotLineOfSight({ ...q, board: { ...q.board, walls: [{ x: 7, y: 0 }] } })).toThrow();
  });
});

describe("separate range gate and shared attack sight", () => {
  it("keeps an unresolved formal distance metric unresolved, without importing prototype Manhattan", () => {
    const sight = query({ x: 0, y: 0 }, { x: 1, y: 1 });
    const range = checkRobotAttackRange({ ...sight, min: 1, max: 1 }, null);
    expect(range).toEqual({ status: "unresolved", distance: null });
    expect(checkRobotLineOfSight(sight).clear).toBe(true);
    expect(checkRobotAttackSpatial({ kind: "normal", range, sight })).toMatchObject({ canReach: false, reason: "range-unresolved" });
  });
  it("permits independent internal test measures without fixing a formal metric", () => {
    const input = { origin: { x: 0, y: 0 }, target: { x: 1, y: 1 }, min: 1, max: 1 };
    expect(checkRobotAttackRange(input, () => 1).status).toBe("in-range");
    expect(checkRobotAttackRange(input, () => 2).status).toBe("out-of-range");
    for (const n of [-1, 0.5, Infinity, NaN]) expect(() => checkRobotAttackRange(input, () => n)).toThrow();
    expect(() => checkRobotAttackRange({ ...input, min: 2 }, null)).toThrow();
  });
  it("uses one common sight gate for range-2 melee and overwatch", () => {
    const lance = resolveRobotBasicPart("light-lance", 5);
    expect(lance.range).toEqual({ min: 1, max: 2 });
    const sight = query({ x: 0, y: 0 }, { x: 2, y: 0 });
    // The fixed value2 is a test-provided range verdict, not a formal distance policy.
    const range = checkRobotAttackRange({ ...sight, ...lance.range! }, () => 2);
    for (const kind of ["normal", "overwatch"] as const) {
      expect(checkRobotAttackSpatial({ kind, range, sight }).canReach).toBe(true);
      expect(checkRobotAttackSpatial({ kind, range, sight: { ...sight, board: { ...sight.board, walls: [{ x: 1, y: 0 }] } } })).toMatchObject({ canReach: false, reason: "line-of-sight-blocked" });
    }
  });
  it("preserves delta's adopted range/LOS exception without making a formation fully legal", () => {
    const sight = query({ x: 0, y: 0 }, { x: 4, y: 4 }, [{ x: 2, y: 2 }]);
    expect(checkRobotLineOfSight(sight).clear).toBe(false);
    for (const range of [{ status: "unresolved", distance: null }, { status: "out-of-range", distance: 99 }] as const) {
      expect(checkRobotAttackSpatial({ kind: "delta", range, sight })).toEqual({ canReach: true, reason: "clear", sight: null });
    }
  });
  it("provides distinct shared UI reasons for range and wall obstruction", () => {
    const sight = query({ x: 0, y: 0 }, { x: 4, y: 0 }, [{ x: 2, y: 0 }]);
    const distant = checkRobotAttackSpatial({ kind: "normal", sight, range: { status: "out-of-range", distance: 4 } });
    const occluded = checkRobotAttackSpatial({ kind: "normal", sight, range: { status: "in-range", distance: 4 } });
    expect(getRobotAttackBlockReasonText(distant)).toBe("射程外です");
    expect(getRobotAttackBlockReasonText(occluded)).toBe("壁により射線が遮られています");
    expect(getRobotAttackBlockReasonText(checkRobotAttackSpatial({ kind: "normal", sight: { ...sight, board: { ...sight.board, walls: [] } }, range: { status: "in-range", distance: 4 } }))).toBeNull();
  });
});

it("smokes symmetric LOS on actual M01-M07 layouts without changing stage readiness", () => {
  let queries = 0;
  for (let missionNumber = 1; missionNumber <= 7; missionNumber++) {
    const key = { missionNumber, difficulty: "normal" as const }, plan = getRobotStagePlan(key);
    const board = { ...plan.board, walls: plan.board.walls.map(robotCellToPosition) };
    const occupied = [...plan.players, ...plan.friendlyAI.map(a => a.cell), ...plan.initialEnemies.flatMap(e => e.cells)].map(robotCellToPosition);
    const raw = plan.objective.specification.structure as { cells: string[] } | undefined;
    const structures = raw ? [{ cells: raw.cells.map(robotCellToPosition) }] : [];
    for (const origin of plan.players.map(robotCellToPosition)) for (const target of plan.initialEnemies.flatMap(e => e.cells).map(robotCellToPosition)) {
      const q = { board, occupied, structures, origin, target };
      expect(checkRobotLineOfSight(q).clear).toBe(checkRobotLineOfSight({ ...q, origin: target, target: origin }).clear);
      queries++;
    }
    expect(plan.isReadyForFormalPlay).toBe(false);
    expect(() => requireApprovedRobotStage(key)).toThrow();
  }
  expect(queries).toBeGreaterThan(100);
});
