import type { GameRandomSource } from "../core/GameModule";
import { SUITS, type Card, type PlayerId, type PlayedCard, type Suit } from "./types";

export function cardId(card: Card): string { return `${card.suit}:${card.rank}`; }
export function assertCard(card: Card): void {
  if (!card || !SUITS.includes(card.suit) || !Number.isInteger(card.rank) || card.rank < 1 || card.rank > 8) {
    throw new Error("カードが不正です");
  }
}
export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => Array.from({ length: 8 }, (_, index) => ({ suit, rank: index + 1 })));
}
export function assertFourPlayers(players: readonly PlayerId[]): void {
  if (players.length !== 4 || new Set(players).size !== 4 || players.some((id) => typeof id !== "string" || !id)) {
    throw new Error("異なる4人のプレイヤーが必要です");
  }
}
export function dealHands(players: readonly PlayerId[], tricks: number, rng: GameRandomSource): Record<PlayerId, Card[]> {
  assertFourPlayers(players);
  if (![4, 5, 6].includes(tricks)) throw new Error("トリック数は4〜6です");
  const deck = rng.shuffle(createDeck());
  return Object.fromEntries(players.map((id, seat) => [id, deck.slice(seat * tricks, (seat + 1) * tricks)]));
}
export function legalCards(hand: readonly Card[], lead: Suit | null): readonly Card[] {
  const followers = lead === null ? [] : hand.filter((card) => card.suit === lead);
  return followers.length > 0 ? followers : hand;
}
export function playCard(hand: readonly Card[], card: Card, lead: Suit | null): Card[] {
  assertCard(card);
  if (!legalCards(hand, lead).some((candidate) => cardId(candidate) === cardId(card))) {
    throw new Error("手札にあるカードでリードスートに従ってください（Must Follow）");
  }
  const index = hand.findIndex((candidate) => cardId(candidate) === cardId(card));
  return hand.filter((_, i) => i !== index);
}
function strength(card: Card, lead: Suit, trump: Suit | null): number {
  return (card.suit === trump ? 200 : card.suit === lead ? 100 : 0) + card.rank;
}
/** Compare card strength; trickRanking applies the confirmed earlier-play tie-break. */
export function compareCards(a: Card, b: Card, lead: Suit, trump: Suit | null): number {
  assertCard(a); assertCard(b);
  return strength(a, lead, trump) - strength(b, lead, trump);
}
export function trickWinner(played: readonly PlayedCard[], trump: Suit | null): PlayerId {
  assertFourPlayers(played.map((play) => play.playerId));
  played.forEach((play) => assertCard(play.card));
  if (new Set(played.map((play) => cardId(play.card))).size !== 4) throw new Error("同じカードは2枚ありません");
  const lead = played[0]!.card.suit;
  return played.reduce((best, play) => compareCards(play.card, best.card, lead, trump) > 0 ? play : best).playerId;
}
export function trickRanking(played: readonly PlayedCard[], trump: Suit | null): PlayerId[] {
  trickWinner(played, trump); // Validate players/cards before ranking all places.
  const lead = played[0]!.card.suit;
  return played.map((play, index) => ({ ...play, index }))
    .sort((a, b) => compareCards(b.card, a.card, lead, trump) || a.index - b.index)
    .map((play) => play.playerId);
}
export function clockwisePlayer(players: readonly PlayerId[], current: PlayerId, steps = 1): PlayerId {
  assertFourPlayers(players);
  const index = players.indexOf(current);
  if (index < 0 || !Number.isSafeInteger(steps) || steps < 0) throw new Error("手番が不正です");
  return players[(index + steps % 4) % 4]!;
}
export function investmentOrder(players: readonly PlayerId[], starter: PlayerId, pass: 1 | 2): PlayerId[] {
  if (pass !== 1 && pass !== 2) throw new Error("投資は2巡です");
  return Array.from({ length: 4 }, (_, offset) => clockwisePlayer(players, starter, offset + pass - 1));
}

/** Whitelist the outgoing fields. Never spread server hands into a player view. */
export function buildHandView(players: readonly PlayerId[], hands: Readonly<Record<PlayerId, readonly Card[]>>, viewer: PlayerId) {
  assertFourPlayers(players);
  if (!players.includes(viewer)) throw new Error("Unknown player");
  if (players.some((id) => !Object.hasOwn(hands, id))) throw new Error("手札がありません");
  return {
    playerId: viewer,
    hand: hands[viewer]!.map((card) => ({ suit: card.suit, rank: card.rank })),
    handCounts: players.map((playerId) => ({ playerId, count: hands[playerId]!.length }))
  };
}
