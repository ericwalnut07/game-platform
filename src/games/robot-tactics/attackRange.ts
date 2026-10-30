import type { RobotPosition } from "./movement";

export type RobotRangeCheck =
  | { readonly status: "unresolved"; readonly distance: null }
  | { readonly status: "in-range" | "out-of-range"; readonly distance: number };

/** Trusted rule-layer dependency, never a function supplied by a launch/action request. */
export type RobotRangeDistance = (origin: RobotPosition, target: RobotPosition) => number;

/**
 * No distance metric is adopted. Formal callers pass null until a metric is
 * adopted; tests may inject a measure to exercise this independent range gate.
 */
export function checkRobotAttackRange(input: {
  readonly origin: RobotPosition; readonly target: RobotPosition;
  readonly min: number; readonly max: number;
}, measure: RobotRangeDistance | null): RobotRangeCheck {
  for (const n of [input.origin.x, input.origin.y, input.target.x, input.target.y, input.min, input.max]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid attack range input");
  }
  if (input.min > input.max) throw new Error("Attack range minimum exceeds maximum");
  if (measure === null) return { status: "unresolved", distance: null };
  const distance = measure(input.origin, input.target);
  if (!Number.isSafeInteger(distance) || distance < 0) throw new Error("Invalid measured attack distance");
  return { status: distance >= input.min && distance <= input.max ? "in-range" : "out-of-range", distance };
}
