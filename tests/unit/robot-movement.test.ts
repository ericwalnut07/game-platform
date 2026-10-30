import { describe, expect, it } from "vitest";
import golden from "../fixtures/robot-movement-adopted-v01.json";
import {
  checkRobotMove, getRobotLegalMoves, getRobotMovementOffsets, robotCellToPosition, robotPositionToCell,
  type RobotFacing, type RobotMovementQuery, type RobotMovementType, type RobotPosition, type RobotTraversalPolicy
} from "../../src/games/robot-tactics/movement";

const types: readonly RobotMovementType[] = ["straight", "diagonal", "omni", "forward"];
const pointKey = (p: RobotPosition): string => p.x + "," + p.y;
const offsets = (type: RobotMovementType, mov: number, facing: RobotFacing = "north") => getRobotMovementOffsets({ types: [type], mov, facing });
const keys = (points: readonly RobotPosition[]) => new Set(points.map(pointKey));
// Explicit TEST policy only. Neither this budget nor its corner rule is adopted.
const testPolicy: RobotTraversalPolicy = { adjacency: "eight-way", diagonalCorners: "block-if-both-sides-blocked", maxSteps: 3 };
const query = (overrides: Partial<RobotMovementQuery> = {}): RobotMovementQuery => ({
  types: ["straight"], mov: 3, facing: "north", origin: { x: 3, y: 3 },
  board: { width: 9, height: 9, walls: [] }, occupied: [], structures: [], traversal: testPolicy, ...overrides
});

describe("robot tactics adopted movement footprints", () => {
  for (const type of types) for (let mov = 1; mov <= 7; mov++) {
    it(type + " MOV" + mov + " preserves the adopted count and legacy coordinates", () => {
      const result = offsets(type, mov);
      expect(result).toHaveLength(type === "forward" && mov === 4 ? 35 : [8, 12, 24, 36, 48, 60, 80][mov - 1]!);
      expect(keys(result).size).toBe(result.length);
      expect(keys(result).has("0,0")).toBe(false);
      if (mov <= 5) {
        const fixture = golden.footprints[type] as Record<string, readonly string[]>;
        expect([...result.map(pointKey)]).toEqual(fixture[mov]);
      }
    });
  }
  it("adds exactly the adopted MOV6/7 symmetric points", () => {
    const orbit = (a: number, b: number): Set<string> => {
      const result = new Set<string>();
      for (const [x, y] of [[a, b], [b, a]]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) result.add(sx * x! + "," + sy * y!);
      return result;
    };
    const added = (type: RobotMovementType, mov: number) => {
      const previous = keys(offsets(type, mov - 1));
      return new Set([...keys(offsets(type, mov))].filter(p => !previous.has(p)));
    };
    expect(added("straight", 6)).toEqual(new Set([...orbit(6, 0), ...orbit(5, 1)]));
    expect(added("straight", 7)).toEqual(new Set([...orbit(7, 0), ...orbit(6, 1), ...orbit(5, 2)]));
    expect(added("diagonal", 6)).toEqual(new Set([...orbit(6, 6), ...orbit(6, 4)]));
    expect(added("diagonal", 7)).toEqual(new Set([...orbit(7, 7), ...orbit(7, 5), ...orbit(7, 3)]));
    expect(added("omni", 6)).toEqual(new Set([...orbit(4, 0), ...orbit(4, 1)]));
    expect(keys(offsets("omni", 7))).toEqual(new Set(Array.from({ length: 81 }, (_, i) => (i % 9 - 4) + "," + (Math.floor(i / 9) - 4)).filter(k => k !== "0,0")));
  });
  it("retains every previous-MOV destination through MOV7", () => {
    for (const type of types) for (let mov = 2; mov <= 7; mov++) {
      const current = keys(offsets(type, mov));
      for (const p of offsets(type, mov - 1)) expect(current.has(pointKey(p))).toBe(true);
    }
  });
  it("rotates forward toward the explicitly supplied opposing edge", () => {
    for (let mov = 1; mov <= 7; mov++) {
      const north = offsets("forward", mov);
      expect(keys(offsets("forward", mov, "south"))).toEqual(keys(north.map(p => ({ x: -p.x, y: -p.y }))));
      expect(keys(offsets("forward", mov, "east"))).toEqual(keys(north.map(p => ({ x: -p.y, y: p.x }))));
      expect(keys(offsets("forward", mov, "west"))).toEqual(keys(north.map(p => ({ x: p.y, y: -p.x }))));
    }
    expect(Math.min(...offsets("forward", 6).map(p => p.y))).toBe(-7);
    expect(Math.max(...offsets("forward", 6).map(p => p.y))).toBe(3);
    expect(Math.min(...offsets("forward", 7).map(p => p.y))).toBe(-8);
    expect(Math.max(...offsets("forward", 7).map(p => p.y))).toBe(4);
  });
  it("combines movement parts by union without duplicating shared cells", () => {
    const combined = getRobotMovementOffsets({ types: ["straight", "diagonal", "straight"], mov: 5, facing: "north" });
    expect(keys(combined)).toEqual(new Set([...keys(offsets("straight", 5)), ...keys(offsets("diagonal", 5))]));
    expect(combined.length).toBe(keys(combined).size);
  });
  it("rejects unsupported MOV instead of introducing a system cap or extrapolation", () => {
    for (const mov of [0, -1, 1.5, 8, 99, NaN, Infinity]) expect(() => offsets("omni", mov)).toThrow();
    expect(() => offsets("jump" as RobotMovementType, 3)).toThrow();
    expect(() => offsets("forward", 3, "auto" as RobotFacing)).toThrow();
    expect(() => getRobotMovementOffsets({ types: [], mov: 3, facing: "north" })).toThrow();
  });
});

describe("robot movement routes under an explicit caller-supplied policy", () => {
  it("does not silently supply missing formal path rules", () => {
    const q = query();
    expect(() => getRobotLegalMoves({ ...q, traversal: undefined as unknown as RobotTraversalPolicy })).toThrow(/explicit traversal policy/);
    expect(() => getRobotLegalMoves(query({ traversal: { ...testPolicy, maxSteps: -1 } }))).toThrow();
    expect(() => getRobotLegalMoves(query({ traversal: { ...testPolicy, maxSteps: 1.5 } }))).toThrow();
  });
  it("distinguishes occupied destinations, outside footprint, board bounds and stay", () => {
    const q = query({ occupied: [{ x: 4, y: 3 }] });
    expect(checkRobotMove(q, { x: 4, y: 3 })).toEqual({ legal: false, reason: "blocked" });
    expect(checkRobotMove(q, { x: 8, y: 8 })).toEqual({ legal: false, reason: "outside-footprint" });
    expect(checkRobotMove(q, { x: -1, y: 3 })).toEqual({ legal: false, reason: "out-of-bounds" });
    expect(checkRobotMove(q, q.origin)).toEqual({ legal: false, reason: "outside-footprint" });
  });
  it("cannot teleport across a sealed wall, living units, or a multi-cell facility", () => {
    const barrier = Array.from({ length: 5 }, (_, y) => ({ x: 2, y }));
    for (const kind of ["walls", "occupied", "structures"] as const) {
      const q = query({ origin: { x: 1, y: 2 }, board: { width: 5, height: 5, walls: kind === "walls" ? barrier : [] },
        occupied: kind === "occupied" ? barrier : [], structures: kind === "structures" ? barrier : [], traversal: { ...testPolicy, maxSteps: 7 } });
      expect(checkRobotMove(q, { x: 3, y: 2 })).toEqual({ legal: false, reason: "no-path" });
    }
  });
  it("finds a shortest detour and respects the explicit path budget", () => {
    const q = query({ origin: { x: 1, y: 1 }, mov: 2, board: { width: 5, height: 5, walls: [{ x: 2, y: 1 }] }, traversal: { ...testPolicy, maxSteps: 2 } });
    const check = checkRobotMove(q, { x: 3, y: 1 });
    expect(check.legal).toBe(true);
    if (check.legal) expect(check.move.path).toEqual([{ x: 2, y: 0 }, { x: 3, y: 1 }]);
    expect(checkRobotMove({ ...q, traversal: { ...testPolicy, maxSteps: 1 } }, { x: 3, y: 1 })).toEqual({ legal: false, reason: "no-path" });
  });
  it("keeps corner alternatives explicit without selecting a formal rule", () => {
    const origin = { x: 1, y: 1 }, destination = { x: 2, y: 2 };
    const q = query({ origin, mov: 1, board: { width: 4, height: 4, walls: [{ x: 2, y: 1 }] }, traversal: { ...testPolicy, maxSteps: 1 } });
    expect(checkRobotMove(q, destination).legal).toBe(true);
    expect(checkRobotMove({ ...q, traversal: { ...q.traversal, diagonalCorners: "block-if-either-side-blocked" } }, destination).legal).toBe(false);
    const twoWalls = { ...q, occupied: [{ x: 1, y: 2 }] };
    expect(checkRobotMove(twoWalls, destination).legal).toBe(false);
    expect(checkRobotMove({ ...twoWalls, traversal: { ...q.traversal, diagonalCorners: "allow" } }, destination).legal).toBe(true);
    expect(checkRobotMove({ ...q, traversal: { ...q.traversal, adjacency: "orthogonal" } }, destination).legal).toBe(false);
  });
  it("uses the footprint for landing rather than every intermediate cell", () => {
    const q = query({ types: ["diagonal"], mov: 2, board: { width: 9, height: 9, walls: [{ x: 4, y: 4 }] } });
    const check = checkRobotMove(q, { x: 5, y: 5 });
    expect(check.legal).toBe(true);
    if (check.legal) {
      expect(check.move.path).toHaveLength(3);
      expect(check.move.path.some(p => !keys(offsets("diagonal", 2)).has(pointKey({ x: p.x - 3, y: p.y - 3 })))).toBe(true);
    }
  });
  it("clips to board edges, returns deterministic routes, and leaves inputs untouched", () => {
    const q = query({ origin: { x: 0, y: 0 }, types: ["omni"], mov: 1 });
    const before = JSON.stringify(q);
    expect(getRobotLegalMoves(q).map(m => pointKey(m.destination))).toEqual(["1,0", "0,1", "1,1"]);
    expect(getRobotLegalMoves(q)).toEqual(getRobotLegalMoves(q));
    expect(JSON.stringify(q)).toBe(before);
    expect(getRobotLegalMoves({ ...q, traversal: { ...q.traversal, maxSteps: 0 } })).toEqual([]);
  });
  it("rejects malformed board coordinates and an occupied origin", () => {
    expect(() => getRobotLegalMoves(query({ occupied: [{ x: 3, y: 3 }] }))).toThrow(/origin/);
    expect(() => getRobotLegalMoves(query({ origin: { x: 0.5, y: 0 } }))).toThrow();
    expect(() => getRobotLegalMoves(query({ structures: [{ x: 99, y: 0 }] }))).toThrow();
    expect(() => getRobotLegalMoves(query({ board: { width: 0, height: 9, walls: [] } }))).toThrow();
  });
});

describe("robot stage coordinate adapters", () => {
  it("round-trips catalog cells and multi-letter columns", () => {
    for (const [cell, p] of [["A1", { x: 0, y: 0 }], ["F10", { x: 5, y: 9 }], ["AA12", { x: 26, y: 11 }]] as const) {
      expect(robotCellToPosition(cell)).toEqual(p);
      expect(robotPositionToCell(p)).toBe(cell);
    }
    for (const cell of ["a1", "A0", "A01", "1A", "A1x", "A9007199254740992"]) expect(() => robotCellToPosition(cell)).toThrow();
    expect(() => robotPositionToCell({ x: -1, y: 0 })).toThrow();
  });
});
