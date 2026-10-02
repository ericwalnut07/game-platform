import type { Suit } from "../../../games/commercial-hub/types";
import { SUIT_COLORS } from "./labels";
/** Stable shared SVG geometry, independent of installed symbol fonts. */
export function SuitMark({ suit, filled = false, size = 24 }: { suit: Suit | "common"; filled?: boolean; size?: number }) {
  const color = SUIT_COLORS[suit], props = { stroke: color, strokeWidth: 2.5, fill: filled && suit !== "common" ? color : "none", strokeLinejoin: "round" as const };
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="hub-mark">
    {suit === "commerce" ? <path d="M12 3 L22 21 H2 Z" {...props}/> : suit === "industry" ? <rect x="3" y="3" width="18" height="18" rx="1" {...props}/> : suit === "procurement" ? <path d="M12 2 L22 12 L12 22 L2 12 Z" {...props}/> : suit === "administration" ? <path d="M12 2 L15 9 L22 12 L15 15 L12 22 L9 15 L2 12 L9 9 Z" {...props} fill={color}/> : <circle cx="12" cy="12" r="9" {...props}/>}
  </svg>;
}
