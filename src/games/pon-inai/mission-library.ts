import { permutations } from "./combinatorics";
import type { Mission } from "./missions";
import type { CardNumber, Color, PlayerCount } from "./types";
import { CARD_NUMBERS, getActiveColors } from "./types";

function routeCodes(playerCount: PlayerCount): Mission[] {
  const colors = getActiveColors(playerCount);
  const out: Mission[] = [];
  const seen = new Set<string>();

  if (playerCount === 4) {
    for (const colorOrder of permutations(colors)) {
      const pairs = CARD_NUMBERS.map((number, i) => ({ color: colorOrder[i]!, number })) as [
        { color: Color; number: CardNumber },
        { color: Color; number: CardNumber },
        { color: Color; number: CardNumber },
        { color: Color; number: CardNumber }
      ];
      out.push({ type: "ROUTE_CODE", pairs });
    }
    return out;
  }

  for (const a of colors) for (const b of colors) for (const c of colors) for (const d of colors) {
    const seq = [a, b, c, d] as const;
    if (!colors.every((color) => seq.includes(color))) continue;
    const key = seq.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const pairs = CARD_NUMBERS.map((number, i) => ({ color: seq[i]!, number })) as [
      { color: Color; number: CardNumber },
      { color: Color; number: CardNumber },
      { color: Color; number: CardNumber },
      { color: Color; number: CardNumber }
    ];
    out.push({ type: "ROUTE_CODE", pairs });
  }
  return out;
}

export function createConcreteMissionLibrary(playerCount: PlayerCount): readonly Mission[] {
  const colors = getActiveColors(playerCount);
  const out: Mission[] = [
    { type: "AVERAGE_OUTPUT", min: 2.4, max: 2.6 },
    { type: "HIGH_LOW_BALANCE" },
    ...CARD_NUMBERS.map((number) => ({ type: "TARGET_NUMBER", number, minimumCount: playerCount === 3 ? 4 : 5 } as const)),
    { type: "ALL_NUMBERS", minimumEach: playerCount === 3 ? 2 : 3 },
    ...colors.map((color) => ({ type: "PUSH_COLOR", color, minimumCount: 5 } as const)),
    { type: "RAINBOW", minimumEach: 3 },
    { type: "COLOR_BALANCE", maxDifference: 2 },
    { type: "COLOR_SYNC", minimumSynchronizedRounds: 1 },
    ...colors.map((color) => ({ type: "COLOR_OUTPUT", color, minSum: 9, maxSum: 11 } as const)),
    ...colors.map((color) => ({ type: "COLOR_COMPLETE", color } as const)),
    ...CARD_NUMBERS.map((number) => ({ type: "NUMBER_CROSS", number } as const)),
    ...routeCodes(playerCount),
    { type: "OUTPUT_RISE", minimumIncreasingTransitions: 2 },
    { type: "STABLE_NAVIGATION", maxRange: playerCount },
    { type: "COLOR_ROTATION", minimumChanges: 2 }
  ];
  return out;
}

export function missionKey(mission: Mission): string {
  switch (mission.type) {
    case "TARGET_NUMBER": return `${mission.type}:${mission.number}`;
    case "PUSH_COLOR":
    case "COLOR_OUTPUT":
    case "COLOR_COMPLETE": return `${mission.type}:${mission.color}`;
    case "NUMBER_CROSS": return `${mission.type}:${mission.number}`;
    case "ROUTE_CODE": return `${mission.type}:${mission.pairs.map((p) => `${p.color}${p.number}`).join("|")}`;
    default: return mission.type;
  }
}
