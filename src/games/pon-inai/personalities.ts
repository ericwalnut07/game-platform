import { combinations } from "./combinatorics";
import type { Card, CardNumber, Color, Confidence } from "./types";

export type Personality =
  | { type: "AVOID_COLOR"; color: Color; displayName: string }
  | { type: "USE_COLOR_TWICE"; color: Color; minimumUses: 2; displayName: string }
  | { type: "USE_ALL_COLORS"; displayName: string }
  | { type: "AVOID_NUMBER"; number: CardNumber; displayName: string }
  | { type: "USE_TWO_NUMBERS"; numbers: readonly [CardNumber, CardNumber]; minimumUses: 3; displayName: string }
  | { type: "KEEP_COLOR"; color: Color; minimumRemaining: 1; displayName: string }
  | { type: "PLANNER"; displayName: "計画魔" }
  | { type: "CONFIDENT"; displayName: "自信家"; minimumConfident: 3 }
  | { type: "WORRIER"; displayName: "心配性"; minimumAnxious: 3 }
  | { type: "BRAVE"; displayName: "強がり"; maximumAnxious: 0 }
  | { type: "MOODY"; displayName: "気分屋"; minimumNormal: 2 };

export interface PersonalityResultContext {
  initialHand: readonly Card[];
  playedCards: readonly Card[];
  remainingCards: readonly Card[];
  confidenceHistory: readonly Confidence[];
  activeColors: readonly Color[];
}

const avoidColorNames: Record<Color, string> = {
  RED: "トマト嫌い",
  BLUE: "ブルーハワイ嫌い",
  GREEN: "ピーマン嫌い",
  YELLOW: "レモン嫌い"
};
const useColorNames: Record<Color, string> = {
  RED: "いちご好き",
  BLUE: "青空好き",
  GREEN: "クローバー好き",
  YELLOW: "ひまわり好き"
};
const keepColorNames: Record<Color, string> = {
  RED: "いちごは最後に食べる派",
  BLUE: "青いものは保存派",
  GREEN: "四つ葉のクローバーを信じる派",
  YELLOW: "冷蔵庫にはいつでもバナナ派"
};
const avoidNumberNames: Record<CardNumber, string> = {
  1: "1番のプレッシャーが苦手",
  2: "二択が苦手",
  3: "三角関係が苦手",
  4: "4が怖い"
};

export function createAvoidColorPersonality(color: Color): Personality {
  return { type: "AVOID_COLOR", color, displayName: avoidColorNames[color] };
}
export function createUseColorPersonality(color: Color): Personality {
  return { type: "USE_COLOR_TWICE", color, minimumUses: 2, displayName: useColorNames[color] };
}
export function createKeepColorPersonality(color: Color): Personality {
  return { type: "KEEP_COLOR", color, minimumRemaining: 1, displayName: keepColorNames[color] };
}
export function createAvoidNumberPersonality(number: CardNumber): Personality {
  return { type: "AVOID_NUMBER", number, displayName: avoidNumberNames[number] };
}

function pairName(a: CardNumber, b: CardNumber): string {
  const key = `${a}${b}`;
  return ({
    "12": "小さい数字が好き",
    "13": "奇数派",
    "14": "両極端が好き",
    "23": "真ん中が落ち着く",
    "24": "偶数派",
    "34": "大きい数字が好き"
  } as Record<string, string>)[key] ?? `${a}と${b}が好き`;
}

export function listPersonalityCandidates(activeColors: readonly Color[]): Personality[] {
  const out: Personality[] = [];
  for (const color of activeColors) {
    out.push(createAvoidColorPersonality(color));
    out.push(createUseColorPersonality(color));
    out.push(createKeepColorPersonality(color));
  }
  out.push({ type: "USE_ALL_COLORS", displayName: "カラフル好き" });
  for (const number of [1, 2, 3, 4] as const) out.push(createAvoidNumberPersonality(number));
  for (const [a, b] of combinations([1, 2, 3, 4] as const, 2) as [CardNumber, CardNumber][]) {
    out.push({ type: "USE_TWO_NUMBERS", numbers: [a, b], minimumUses: 3, displayName: pairName(a, b) });
  }
  out.push({ type: "PLANNER", displayName: "計画魔" });
  out.push({ type: "CONFIDENT", displayName: "自信家", minimumConfident: 3 });
  out.push({ type: "WORRIER", displayName: "心配性", minimumAnxious: 3 });
  out.push({ type: "BRAVE", displayName: "強がり", maximumAnxious: 0 });
  out.push({ type: "MOODY", displayName: "気分屋", minimumNormal: 2 });
  return out;
}

export function evaluatePersonality(personality: Personality, context: PersonalityResultContext): boolean {
  const { playedCards, remainingCards, confidenceHistory, activeColors } = context;
  switch (personality.type) {
    case "AVOID_COLOR": return playedCards.every((c) => c.color !== personality.color);
    case "USE_COLOR_TWICE": return playedCards.filter((c) => c.color === personality.color).length >= personality.minimumUses;
    case "USE_ALL_COLORS": return activeColors.every((color) => playedCards.some((c) => c.color === color));
    case "AVOID_NUMBER": return playedCards.every((c) => c.number !== personality.number);
    case "USE_TWO_NUMBERS": return playedCards.filter((c) => personality.numbers.includes(c.number)).length >= personality.minimumUses;
    case "KEEP_COLOR": return remainingCards.filter((c) => c.color === personality.color).length >= personality.minimumRemaining;
    case "PLANNER": {
      if (remainingCards.length !== 2) return false;
      const [a, b] = remainingCards;
      return a!.color !== b!.color && a!.number !== b!.number && a!.number + b!.number === 5;
    }
    case "CONFIDENT": return confidenceHistory.filter((c) => c === "CONFIDENT").length >= personality.minimumConfident;
    case "WORRIER": return confidenceHistory.filter((c) => c === "ANXIOUS").length >= personality.minimumAnxious;
    case "BRAVE": return confidenceHistory.filter((c) => c === "ANXIOUS").length <= personality.maximumAnxious;
    case "MOODY": {
      const seen = new Set(confidenceHistory);
      return seen.has("CONFIDENT") && seen.has("NORMAL") && seen.has("ANXIOUS")
        && confidenceHistory.filter((c) => c === "NORMAL").length >= personality.minimumNormal;
    }
  }
}

export function isCardBasedPersonality(personality: Personality): boolean {
  return !["CONFIDENT", "WORRIER", "BRAVE", "MOODY"].includes(personality.type);
}

export function selectionSatisfiesPersonality(
  personality: Personality,
  hand: readonly Card[],
  playedCards: readonly Card[],
  activeColors: readonly Color[]
): boolean {
  const playedIds = new Set(playedCards.map((c) => c.id));
  const remaining = hand.filter((c) => !playedIds.has(c.id));
  return evaluatePersonality(personality, {
    initialHand: hand,
    playedCards,
    remainingCards: remaining,
    confidenceHistory: ["CONFIDENT", "NORMAL", "ANXIOUS", "NORMAL"],
    activeColors
  });
}

export function canAchievePersonality(personality: Personality, hand: readonly Card[], activeColors: readonly Color[]): boolean {
  if (!isCardBasedPersonality(personality)) return true;
  return combinations(hand, 4).some((played) => selectionSatisfiesPersonality(personality, hand, played, activeColors));
}
