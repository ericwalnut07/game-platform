export interface Point { readonly x: number; readonly y: number }
export interface Bounds { readonly width: number; readonly height: number }
export type Suit = "spades" | "hearts" | "clubs" | "diamonds" | "joker";
export interface PlayingCard {
  readonly id: string;
  readonly deckId: string;
  readonly suit: Suit;
  /** A=1, J=11, Q=12, K=13; jokers are numbered 1 and 2. */
  readonly rank: number;
}
export interface TableCard extends PlayingCard {
  readonly kind: "playing-card";
  readonly position: Point;
  readonly faceUp: boolean;
  /** Explicit bundle membership; array order remains bottom to top. */
  readonly stackId?: string;
}
export interface CardTableState {
  readonly version: 1;
  readonly deckCount: number;
  readonly nextStackNumber: number;
  readonly drawPile: readonly PlayingCard[];
  /** Bottom to top. Selection is transient UI state, not part of this order. */
  readonly items: readonly TableCard[];
}
export const CARD_SIZE: Bounds = { width: 88, height: 124 };
export const SUIT_SYMBOLS: Record<Suit, string> = { spades: "♠", hearts: "♥", clubs: "♣", diamonds: "♦", joker: "☆" };
const SUIT_NAMES: Record<Suit, string> = { spades: "スペード", hearts: "ハート", clubs: "クラブ", diamonds: "ダイヤ", joker: "ジョーカー" };
export function rankLabel(rank: number): string { return ({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[rank] ?? String(rank); }
export function cardLabel(card: PlayingCard): string { return card.suit === "joker" ? `ジョーカー${card.rank}` : `${SUIT_NAMES[card.suit]}の${rankLabel(card.rank)}`; }
function createDeck(deckNumber: number): PlayingCard[] {
  const deckId = `deck-${deckNumber}`;
  const drawPile: PlayingCard[] = [];
  for (const suit of ["spades", "hearts", "clubs", "diamonds"] as const) {
    for (let rank = 1; rank <= 13; rank++) drawPile.push({ id: `${deckId}:${suit}:${rank}`, deckId, suit, rank });
  }
  for (const rank of [1, 2]) drawPile.push({ id: `${deckId}:joker:${rank}`, deckId, suit: "joker", rank });
  return drawPile;
}
export function createCardTable(): CardTableState {
  return { version: 1, deckCount: 1, nextStackNumber: 1, drawPile: createDeck(1), items: [] };
}
function validPoint(point: Point): boolean { return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0; }
export function clampPosition(point: Point, bounds: Bounds): Point {
  return {
    x: Math.max(0, Math.min(point.x, Math.max(0, bounds.width - CARD_SIZE.width))),
    y: Math.max(0, Math.min(point.y, Math.max(0, bounds.height - CARD_SIZE.height)))
  };
}
export function drawCard(state: CardTableState, position: Point): CardTableState {
  const card = state.drawPile[0];
  if (!card || !validPoint(position)) return state;
  return { ...state, drawPile: state.drawPile.slice(1), items: [...state.items, { ...card, kind: "playing-card", position: { ...position }, faceUp: true }] };
}
export function moveCard(state: CardTableState, id: string, position: Point): CardTableState {
  const card = state.items.find(item => item.id === id);
  if (!card || !validPoint(position) || (card.position.x === position.x && card.position.y === position.y)) return state;
  return { ...state, items: state.items.map(item => (item.id === id || (card.stackId && item.stackId === card.stackId)) ? { ...item, position: { ...position } } : item) };
}
export function flipCard(state: CardTableState, id: string): CardTableState {
  if (!state.items.some(item => item.id === id)) return state;
  return { ...state, items: state.items.map(item => item.id === id ? { ...item, faceUp: !item.faceUp } : item) };
}
export function bringToFront(state: CardTableState, id: string): CardTableState {
  const card = state.items.find(item => item.id === id);
  if (!card || state.items.at(-1)?.id === id) return state;
  const members = state.items.filter(item => item.id === id || (card.stackId && item.stackId === card.stackId));
  const ids = new Set(members.map(item => item.id));
  return { ...state, items: [...state.items.filter(item => !ids.has(item.id)), ...members] };
}

/** All decks share a draw pile. Added decks retain distinct identities. */
export function addDeck(state: CardTableState): CardTableState {
  const deckCount = state.deckCount + 1;
  return { ...state, deckCount, drawPile: [...state.drawPile, ...createDeck(deckCount)] };
}
/** Draw in order, bottom to top, without creating a logical bundle. */
export function drawCards(state: CardTableState, positions: readonly Point[]): CardTableState {
  if (!positions.length || positions.length > state.drawPile.length || !positions.every(validPoint)) return state;
  const cards = state.drawPile.slice(0, positions.length).map((card, index): TableCard => ({
    ...card, kind: "playing-card", position: { ...positions[index]! }, faceUp: true
  }));
  return { ...state, drawPile: state.drawPile.slice(positions.length), items: [...state.items, ...cards] };
}
export function returnCard(state: CardTableState, id: string): CardTableState {
  const card = state.items.find(item => item.id === id);
  if (!card || card.stackId) return state;
  const { id: cardId, deckId, suit, rank } = card;
  return { ...state, drawPile: [{ id: cardId, deckId, suit, rank }, ...state.drawPile], items: state.items.filter(item => item.id !== id) };
}
/** Fisher–Yates; injectable randomness allows deterministic conservation tests. */
export function shufflePile(state: CardTableState, random: () => number = Math.random): CardTableState {
  if (state.drawPile.length < 2) return state;
  const drawPile = [...state.drawPile];
  for (let i = drawPile.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) return state;
    const j = Math.floor(value * (i + 1));
    [drawPile[i], drawPile[j]] = [drawPile[j]!, drawPile[i]!];
  }
  return { ...state, drawPile };
}
