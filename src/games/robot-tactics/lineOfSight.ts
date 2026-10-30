import type { RobotPosition } from "./movement";

export interface RobotSightStructure {
  readonly cells: readonly RobotPosition[];
  /** Omitted/false is transparent. Never infer this from movement blocking. */
  readonly blocksLineOfSight?: boolean;
}
export interface RobotLineOfSightQuery {
  readonly board: { readonly width: number; readonly height: number; readonly walls: readonly RobotPosition[] };
  readonly origin: RobotPosition;
  readonly target: RobotPosition;
  readonly structures?: readonly RobotSightStructure[];
  /** Both teams' units are transparent; this list is deliberately never an occluder. */
  readonly occupied?: readonly RobotPosition[];
}
export interface RobotSightBlocker { readonly cell: RobotPosition; readonly kind: "wall" | "structure" }
export type RobotLineOfSightCheck =
  | { readonly clear: true }
  | { readonly clear: false; readonly reason: "out-of-bounds" | "interior" | "closed-corner"; readonly blockers: readonly RobotSightBlocker[] };

function key(p: RobotPosition): string { return p.x + "," + p.y; }
function integer(n: number, min: number): void {
  if (!Number.isSafeInteger(n) || n < min) throw new Error("Invalid line-of-sight coordinate or board size");
}
function position(p: RobotPosition): void {
  if (!p) throw new Error("Missing line-of-sight cell");
  integer(p.x, 0); integer(p.y, 0);
}

/** Symmetric center-to-center ray; exact boundary comparisons, no floating epsilon. */
export function checkRobotLineOfSight(query: RobotLineOfSightQuery): RobotLineOfSightCheck {
  const { board, origin, target } = query;
  integer(board.width, 1); integer(board.height, 1);
  position(origin); position(target);
  const inside = (p: RobotPosition) => p.x < board.width && p.y < board.height;
  if (!inside(origin) || !inside(target)) return { clear: false, reason: "out-of-bounds", blockers: [] };
  const blockers = new Map<string, RobotSightBlocker>();
  const add = (cell: RobotPosition, kind: RobotSightBlocker["kind"]) => {
    position(cell);
    if (!inside(cell)) throw new Error("Line-of-sight blocker outside board");
    blockers.set(key(cell), { cell: { ...cell }, kind });
  };
  for (const structure of query.structures ?? []) if (structure.blocksLineOfSight === true) {
    for (const cell of structure.cells) add(cell, "structure");
  }
  for (const cell of board.walls) add(cell, "wall");
  let x = origin.x, y = origin.y;
  const sx = Math.sign(target.x - x), sy = Math.sign(target.y - y);
  const dx = BigInt(Math.abs(target.x - x)), dy = BigInt(Math.abs(target.y - y));
  // Next vertical/horizontal boundary times are odd/(2*delta).
  let nextX = 1n, nextY = 1n;
  const initial = blockers.get(key(origin));
  if (initial) return { clear: false, reason: "interior", blockers: [initial] };
  while (x !== target.x || y !== target.y) {
    const compare = dx === 0n ? 1n : dy === 0n ? -1n : nextX * dy - nextY * dx;
    if (compare < 0n) { x += sx; nextX += 2n; }
    else if (compare > 0n) { y += sy; nextY += 2n; }
    else {
      const a = blockers.get(key({ x: x + sx, y })), b = blockers.get(key({ x, y: y + sy }));
      if (a && b) return { clear: false, reason: "closed-corner", blockers: [a, b] };
      x += sx; y += sy; nextX += 2n; nextY += 2n;
    }
    const hit = blockers.get(key({ x, y }));
    if (hit) return { clear: false, reason: "interior", blockers: [hit] };
  }
  return { clear: true };
}
