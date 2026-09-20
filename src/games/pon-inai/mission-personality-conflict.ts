import type { Mission } from "./missions";
import type { Personality } from "./personalities";
import type { Card } from "./types";

export type ConflictLevel = "NONE" | "LIGHT" | "STRONG";

export function evaluateMissionPersonalityConflict(
  mission: Mission,
  personality: Personality,
  _hand: readonly Card[]
): ConflictLevel {
  if (personality.type === "AVOID_COLOR") {
    if ((mission.type === "PUSH_COLOR" || mission.type === "COLOR_OUTPUT" || mission.type === "COLOR_COMPLETE")
      && mission.color === personality.color) return "STRONG";
    if (mission.type === "ROUTE_CODE" && mission.pairs.some((p) => p.color === personality.color)) return "LIGHT";
  }
  if (personality.type === "AVOID_NUMBER") {
    if (mission.type === "TARGET_NUMBER" && mission.number === personality.number) return "STRONG";
    if (mission.type === "NUMBER_CROSS" && mission.number === personality.number) return "STRONG";
    if (mission.type === "ROUTE_CODE" && mission.pairs.some((p) => p.number === personality.number)) return "LIGHT";
  }
  if (personality.type === "KEEP_COLOR") {
    if ((mission.type === "PUSH_COLOR" || mission.type === "COLOR_OUTPUT" || mission.type === "COLOR_COMPLETE")
      && mission.color === personality.color) return "LIGHT";
  }
  if (personality.type === "USE_COLOR_TWICE") {
    if (mission.type === "PUSH_COLOR" && mission.color === personality.color) return "LIGHT";
  }
  return "NONE";
}
