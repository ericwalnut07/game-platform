import type { RobotPosition } from "./movement";

export type RobotRangeCheck =
  | { readonly status: "unresolved"; readonly distance: null }
  | { readonly status: "in-range" | "out-of-range"; readonly distance: number };

/** Trusted rule-layer dependency, never a function supplied by a launch/action request. */
export type RobotRangeDistance = (origin: RobotPosition, target: RobotPosition) => number;

/** Adopted 2026-10-31. Weapon distance only; LOS and special geometry stay separate. */
export const robotChebyshevDistance: RobotRangeDistance = (origin, target) => {
  for (const n of [origin.x, origin.y, target.x, target.y]) if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid range cell");
  return Math.max(Math.abs(origin.x - target.x), Math.abs(origin.y - target.y));
};

/**
 * Defaults to the adopted weapon metric. Explicit null remains a fail-closed
 * dependency error, never a fallback to the prototype's Manhattan distance.
 */
export function checkRobotAttackRange(input: {
  readonly origin: RobotPosition; readonly target: RobotPosition;
  readonly min: number; readonly max: number;
}, measure: RobotRangeDistance | null = robotChebyshevDistance): RobotRangeCheck {
  for (const n of [input.origin.x, input.origin.y, input.target.x, input.target.y, input.min, input.max]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid attack range input");
  }
  if (input.min > input.max) throw new Error("Attack range minimum exceeds maximum");
  if (measure === null) return { status: "unresolved", distance: null };
  const distance = measure(input.origin, input.target);
  if (!Number.isSafeInteger(distance) || distance < 0) throw new Error("Invalid measured attack distance");
  return { status: distance >= input.min && distance <= input.max ? "in-range" : "out-of-range", distance };
}
