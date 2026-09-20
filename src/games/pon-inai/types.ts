export type PlayerCount = 3 | 4;
export type GameCount = 1 | 2 | 3 | 4 | 5;
export type RoundNumber = 1 | 2 | 3 | 4;

export type Color = "RED" | "BLUE" | "GREEN" | "YELLOW";
export type CardNumber = 1 | 2 | 3 | 4;
export type Confidence = "CONFIDENT" | "NORMAL" | "ANXIOUS";
export type PlayerId = string;

export interface PlayerRef {
  id: PlayerId;
  displayName: string;
}

export interface Card {
  id: string;
  color: Color;
  number: CardNumber;
  copy: 1 | 2;
}

export interface PlayedCard {
  round: RoundNumber;
  card: Card;
}

export interface RoundPlayerResult {
  playerId: PlayerId;
  card: Card;
  confidence: Confidence;
}

export interface RoundResult {
  round: RoundNumber;
  players: readonly RoundPlayerResult[];
  numberSum: number;
  numberAverage: number;
  colorCounts: Readonly<Record<Color, number>>;
  uniqueTopColor: Color | null;
}

export interface PublicSummary {
  completedRounds: readonly RoundResult[];
  totalPlayedCards: number;
  totalNumberSum: number;
  totalNumberAverage: number;
  numberCounts: Readonly<Record<CardNumber, number>>;
  colorCounts: Readonly<Record<Color, number>>;
  colorNumberSums: Readonly<Record<Color, number>>;
  roundNumberSums: readonly number[];
  roundNumberAverages: readonly number[];
  uniqueTopColorHistory: readonly (Color | null)[];
}

export function getActiveColors(playerCount: PlayerCount): readonly Color[] {
  return playerCount === 3
    ? (["RED", "BLUE", "GREEN"] as const)
    : (["RED", "BLUE", "GREEN", "YELLOW"] as const);
}

export const CARD_NUMBERS = [1, 2, 3, 4] as const satisfies readonly CardNumber[];
export const ALL_COLORS = ["RED", "BLUE", "GREEN", "YELLOW"] as const satisfies readonly Color[];
