import type { Mission } from "./missions";
import type { Personality } from "./personalities";

export type HelpfulAlignment = "NORMAL" | "TOO_HELPFUL";

export function evaluateHelpfulAlignment(mission: Mission, personality: Personality): HelpfulAlignment {
  if (personality.type === "USE_COLOR_TWICE") {
    if ((mission.type === "PUSH_COLOR" || mission.type === "COLOR_OUTPUT" || mission.type === "COLOR_COMPLETE")
      && mission.color === personality.color) return "TOO_HELPFUL";
  }
  if (personality.type === "USE_ALL_COLORS") {
    if (mission.type === "RAINBOW") return "TOO_HELPFUL";
  }
  return "NORMAL";
}
