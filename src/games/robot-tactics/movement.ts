import type { RobotCell } from "./types";

export type RobotMovementType = "straight" | "diagonal" | "omni" | "forward";
export type RobotFacing = "north" | "east" | "south" | "west";
export interface RobotPosition { readonly x: number; readonly y: number }
export interface RobotMovementShape {
  readonly types: readonly RobotMovementType[];
  readonly mov: number;
  /** Toward the opposing deployment edge; never inferred from an actor ID. */
  readonly facing: RobotFacing;
}

/**
 * Mandatory caller-supplied policy: path length and corner rules are NOT adopted
 * yet. There is deliberately no production default or fallback to prototype BFS.
 */
export interface RobotTraversalPolicy {
  readonly adjacency: "orthogonal" | "eight-way";
  readonly diagonalCorners: "allow" | "block-if-both-sides-blocked" | "block-if-either-side-blocked";
  readonly maxSteps: number;
}
export interface RobotMovementQuery extends RobotMovementShape {
  readonly board: { readonly width: number; readonly height: number; readonly walls: readonly RobotPosition[] };
  readonly origin: RobotPosition;
  /** Living units on either team, excluding the moving unit itself. */
  readonly occupied: readonly RobotPosition[];
  /** Every cell of blocking facilities/depots/other large structures. */
  readonly structures: readonly RobotPosition[];
  readonly traversal: RobotTraversalPolicy;
}
export interface RobotLegalMove {
  readonly destination: RobotPosition;
  /** Shortest adjacent-cell route, excluding origin and including destination. */
  readonly path: readonly RobotPosition[];
}
export type RobotMoveCheck =
  | { readonly legal: true; readonly move: RobotLegalMove }
  | { readonly legal: false; readonly reason: "out-of-bounds" | "blocked" | "outside-footprint" | "no-path" };

const TYPES: readonly string[] = ["straight", "diagonal", "omni", "forward"];
const FACINGS: readonly string[] = ["north", "east", "south", "west"];
const DIRECTIONS: readonly RobotPosition[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
];
// Full forward footprints at MOV6/7, NOT additions to the previous footprint.
const FORWARD_ROWS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  6: [[-7, 0], [-6, 1], [-5, 2], [-4, 3], [-3, 4], [-2, 5], [-1, 4], [0, 3], [1, 2], [2, 1], [3, 0]],
  7: [[-8, 0], [-7, 1], [-6, 2], [-5, 3], [-4, 4], [-3, 5], [-2, 5], [-1, 4], [0, 4], [1, 3], [2, 2], [3, 1], [4, 0]]
};

function key(p: RobotPosition): string { return p.x + "," + p.y; }
function integer(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new Error("Invalid integer: " + name);
}
function position(p: RobotPosition, name: string): void {
  if (!p || typeof p !== "object") throw new Error("Invalid position: " + name);
  integer(p.x, name + ".x");
  integer(p.y, name + ".y");
}
function validateShape(shape: RobotMovementShape): void {
  integer(shape.mov, "MOV");
  if (shape.mov < 1 || shape.mov > 7) throw new Error("Only adopted MOV1..7 geometry is available; MOV is not clamped");
  if (!Array.isArray(shape.types) || shape.types.length === 0 || shape.types.some(t => !TYPES.includes(t))) throw new Error("Unknown or empty movement types");
  if (!FACINGS.includes(shape.facing)) throw new Error("Unknown movement facing");
}

/** Exact adopted comparison diagram (2026-10-24), excluding the origin. */
function originalFootprint(type: RobotMovementType, mov: number, x: number, y: number): boolean {
  const a = Math.abs(x), b = Math.abs(y), r = Math.max(a, b);
  if (r === 0) return false;
  if (r === 1) return true;
  if (type === "omni") {
    return (mov >= 2 && ((a === 2 && b === 0) || (b === 2 && a === 0)))
      || (mov >= 3 && r === 2)
      || (mov >= 4 && ((a === 3 && b <= 1) || (b === 3 && a <= 1)))
      || (mov >= 5 && r === 3);
  }
  if (type === "straight") {
    return (mov >= 2 && ((a === 2 && b === 0) || (b === 2 && a === 0)))
      || (mov >= 3 && ((a === 3 && b === 0) || (b === 3 && a === 0) || (a === 2 && b === 1) || (a === 1 && b === 2)))
      || (mov >= 4 && ((a === 4 && b === 0) || (b === 4 && a === 0) || (a === 3 && b === 1) || (a === 1 && b === 3)))
      || (mov >= 5 && ((a === 5 && b === 0) || (b === 5 && a === 0) || (a === 4 && b === 1) || (a === 1 && b === 4)));
  }
  if (type === "diagonal") {
    return (mov >= 2 && a === 2 && b === 2)
      || (mov >= 3 && ((a === 3 && b === 3) || (a === 1 && b === 2) || (a === 2 && b === 1)))
      || (mov >= 4 && ((a === 4 && b === 4) || (a === 2 && b === 3) || (a === 3 && b === 2)))
      || (mov >= 5 && ((a === 5 && b === 5) || (a === 3 && b === 4) || (a === 4 && b === 3)));
  }
  return (mov >= 2 && ((y === -2 && a <= 1) || (y === -3 && x === 0)))
    || (mov >= 3 && ((y === -3 && a === 1) || (y === -4 && a <= 1) || (y === -2 && a === 2) || ((y === -1 || y === 0) && a === 2) || (y === 2 && x === 0)))
    || (mov >= 4 && ((y === -5 && a <= 1) || ((y === -4 || y === -3) && a === 2) || (y === -2 && a === 3) || (y === 0 && a === 3)))
    || (mov >= 5 && ((y === -6 && a <= 1) || (y === -5 && a === 2) || ((y === -4 || y === -3 || y === -1) && a === 3) || (y === 2 && a === 1)));
}

function insideFootprint(type: RobotMovementType, mov: number, x: number, y: number): boolean {
  if (x === 0 && y === 0) return false;
  if (mov <= 5) return originalFootprint(type, mov, x, y);
  if (type === "forward") return FORWARD_ROWS[mov]?.some(([row, halfWidth]) => y === row && Math.abs(x) <= halfWidth) ?? false;
  if (originalFootprint(type, 5, x, y)) return true;
  const a = Math.abs(x), b = Math.abs(y), hi = Math.max(a, b), lo = Math.min(a, b);
  if (type === "omni") return hi === 4 && (mov === 7 || lo <= 1);
  if (type === "straight") return (hi === 6 && lo === 0) || (hi === 5 && lo === 1)
    || (mov === 7 && ((hi === 7 && lo === 0) || (hi === 6 && lo === 1) || (hi === 5 && lo === 2)));
  return (hi === 6 && (lo === 6 || lo === 4)) || (mov === 7 && hi === 7 && (lo === 7 || lo === 5 || lo === 3));
}

function orient(p: RobotPosition, facing: RobotFacing): RobotPosition {
  switch (facing) {
    case "north": return { ...p };
    case "east": return { x: -p.y, y: p.x };
    case "south": return { x: -p.x, y: -p.y };
    case "west": return { x: p.y, y: -p.x };
  }
}

/** Destination geometry only. Combined movement parts form a deduplicated union. */
export function getRobotMovementOffsets(shape: RobotMovementShape): readonly RobotPosition[] {
  validateShape(shape);
  const result = new Map<string, RobotPosition>();
  for (const type of shape.types) {
    for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
      if (!insideFootprint(type, shape.mov, x, y)) continue;
      const p = type === "forward" ? orient({ x, y }, shape.facing) : { x, y };
      result.set(key(p), p);
    }
  }
  return [...result.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

function prepare(query: RobotMovementQuery): { readonly blocked: ReadonlySet<string>; readonly offsets: ReadonlySet<string> } {
  const offsets = new Set(getRobotMovementOffsets(query).map(key));
  integer(query.board.width, "board.width");
  integer(query.board.height, "board.height");
  if (query.board.width < 1 || query.board.height < 1) throw new Error("Board dimensions must be positive");
  const blocked = new Set<string>();
  for (const p of [...query.board.walls, ...query.occupied, ...query.structures]) {
    position(p, "blocker");
    if (!inBounds(query, p)) throw new Error("Blocker outside board");
    blocked.add(key(p));
  }
  position(query.origin, "origin");
  if (!inBounds(query, query.origin) || blocked.has(key(query.origin))) throw new Error("Invalid or blocked movement origin; exclude moving actor from occupied");
  const policy = query.traversal;
  if (!policy || !["orthogonal", "eight-way"].includes(policy.adjacency)
    || !["allow", "block-if-both-sides-blocked", "block-if-either-side-blocked"].includes(policy.diagonalCorners)) {
    throw new Error("An explicit traversal policy is required; formal path rules are unresolved");
  }
  integer(policy.maxSteps, "traversal.maxSteps");
  if (policy.maxSteps < 0) throw new Error("Traversal maxSteps must be nonnegative");
  return { blocked, offsets };
}
function inBounds(query: RobotMovementQuery, p: RobotPosition): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < query.board.width && p.y < query.board.height;
}

function routes(query: RobotMovementQuery, blocked: ReadonlySet<string>): ReadonlyMap<string, RobotLegalMove> {
  const originKey = key(query.origin);
  const found = new Map<string, RobotLegalMove>([[originKey, { destination: { ...query.origin }, path: [] }]]);
  const queue = [found.get(originKey)!];
  const available = (p: RobotPosition): boolean => inBounds(query, p) && !blocked.has(key(p));
  const directions = query.traversal.adjacency === "orthogonal" ? DIRECTIONS.slice(0, 4) : DIRECTIONS;
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i]!;
    if (here.path.length >= query.traversal.maxSteps) continue;
    for (const delta of directions) {
      const p = { x: here.destination.x + delta.x, y: here.destination.y + delta.y };
      if (found.has(key(p)) || !available(p)) continue;
      if (delta.x !== 0 && delta.y !== 0) {
        const sideA = !available({ x: here.destination.x + delta.x, y: here.destination.y });
        const sideB = !available({ x: here.destination.x, y: here.destination.y + delta.y });
        const corner = query.traversal.diagonalCorners;
        if ((corner === "block-if-both-sides-blocked" && sideA && sideB)
          || (corner === "block-if-either-side-blocked" && (sideA || sideB))) continue;
      }
      const move: RobotLegalMove = { destination: p, path: [...here.path, p] };
      found.set(key(p), move);
      queue.push(move);
    }
  }
  return found;
}

/**
 * Path evaluator under the explicitly supplied policy. A route may traverse a
 * cell outside the destination footprint; the footprint restricts landing only.
 * This helper does not approve that policy or launch a formal battle.
 */
export function getRobotLegalMoves(query: RobotMovementQuery): readonly RobotLegalMove[] {
  const { blocked, offsets } = prepare(query);
  const found = routes(query, blocked);
  return [...found.values()].filter(move => offsets.has(key({ x: move.destination.x - query.origin.x, y: move.destination.y - query.origin.y })))
    .sort((a, b) => a.destination.y - b.destination.y || a.destination.x - b.destination.x);
}

export function checkRobotMove(query: RobotMovementQuery, destination: RobotPosition): RobotMoveCheck {
  const { blocked, offsets } = prepare(query);
  position(destination, "destination");
  if (!inBounds(query, destination)) return { legal: false, reason: "out-of-bounds" };
  if (blocked.has(key(destination))) return { legal: false, reason: "blocked" };
  if (!offsets.has(key({ x: destination.x - query.origin.x, y: destination.y - query.origin.y }))) return { legal: false, reason: "outside-footprint" };
  const move = routes(query, blocked).get(key(destination));
  return move ? { legal: true, move } : { legal: false, reason: "no-path" };
}

/** Stage catalog A1 cells <-> zero-based grid coordinates. */
export function robotCellToPosition(cell: RobotCell): RobotPosition {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(cell);
  if (!match) throw new Error("Invalid robot cell: " + cell);
  let column = 0;
  for (const letter of match[1]!) column = column * 26 + letter.charCodeAt(0) - 64;
  const row = Number(match[2]);
  integer(column, "cell column");
  integer(row, "cell row");
  return { x: column - 1, y: row - 1 };
}
export function robotPositionToCell(p: RobotPosition): RobotCell {
  position(p, "cell");
  if (p.x < 0 || p.y < 0 || p.x >= Number.MAX_SAFE_INTEGER || p.y >= Number.MAX_SAFE_INTEGER) throw new Error("Invalid robot cell position");
  let column = p.x + 1, letters = "";
  while (column > 0) {
    letters = String.fromCharCode(65 + (column - 1) % 26) + letters;
    column = Math.floor((column - 1) / 26);
  }
  return letters + (p.y + 1);
}
