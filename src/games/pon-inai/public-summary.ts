import { createEmptyColorCounts } from "./cards";
import { ALL_COLORS, CARD_NUMBERS, type CardNumber, type Color, type PublicSummary, type RoundResult } from "./types";

export function buildPublicSummary(rounds: readonly RoundResult[]): PublicSummary {
  const colorCounts = createEmptyColorCounts();
  const colorNumberSums = createEmptyColorCounts();
  const numberCounts = Object.fromEntries(CARD_NUMBERS.map((n) => [n, 0])) as Record<CardNumber, number>;

  let totalPlayedCards = 0;
  let totalNumberSum = 0;

  for (const round of rounds) {
    for (const result of round.players) {
      totalPlayedCards += 1;
      totalNumberSum += result.card.number;
      numberCounts[result.card.number] += 1;
      colorCounts[result.card.color] += 1;
      colorNumberSums[result.card.color] += result.card.number;
    }
  }

  // Keep all four color keys in the fixed public UI, even in 3-player games.
  for (const color of ALL_COLORS) {
    colorCounts[color] ??= 0;
    colorNumberSums[color] ??= 0;
  }

  return {
    completedRounds: [...rounds],
    totalPlayedCards,
    totalNumberSum,
    totalNumberAverage: totalPlayedCards === 0 ? 0 : totalNumberSum / totalPlayedCards,
    numberCounts,
    colorCounts,
    colorNumberSums,
    roundNumberSums: rounds.map((round) => round.numberSum),
    roundNumberAverages: rounds.map((round) => round.numberAverage),
    uniqueTopColorHistory: rounds.map((round) => round.uniqueTopColor)
  };
}

export function deriveUniqueTopColor(colorCounts: Readonly<Record<Color, number>>): Color | null {
  let bestColor: Color | null = null;
  let bestCount = -1;
  let tied = false;

  for (const [rawColor, count] of Object.entries(colorCounts)) {
    const color = rawColor as Color;
    if (count > bestCount) {
      bestColor = color;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }

  return tied ? null : bestColor;
}
