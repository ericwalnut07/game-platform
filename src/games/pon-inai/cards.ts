import { ALL_COLORS, CARD_NUMBERS, type Card, type Color, type PlayerCount } from "./types";
import { getActiveColors } from "./types";

export function makeCardId(color: Color, number: number, copy: 1 | 2): string {
  return `${color}-${number}-C${copy}`;
}

export function createDeck(playerCount: PlayerCount): Card[] {
  const colors = getActiveColors(playerCount);
  const cards: Card[] = [];

  for (const copy of [1, 2] as const) {
    for (const color of colors) {
      for (const number of CARD_NUMBERS) {
        cards.push({
          id: makeCardId(color, number, copy),
          color,
          number,
          copy
        });
      }
    }
  }

  return cards;
}

export function createEmptyColorCounts(): Record<Color, number> {
  return Object.fromEntries(ALL_COLORS.map((color) => [color, 0])) as Record<Color, number>;
}
