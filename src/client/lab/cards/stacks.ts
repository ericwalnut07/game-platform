import { CARD_SIZE, clampPosition, type Bounds, type CardTableState, type Point, type TableCard } from "./model";

export interface TableObject { readonly id: string; readonly cards: readonly TableCard[]; readonly top: TableCard; readonly position: Point }
/** Rendering entities: loose overlap is never interpreted as bundle membership. */
export function tableObjects(state: CardTableState): TableObject[] {
  const groups = new Map<string, TableCard[]>();
  for (const card of state.items) {
    const id = card.stackId ?? card.id;
    const group = groups.get(id);
    if (group) group.push(card); else groups.set(id, [card]);
  }
  return [...groups].map(([id, cards]) => ({ id, cards, top: cards.at(-1)!, position: cards.at(-1)!.position }));
}
function cleanSingleStacks(items: readonly TableCard[]): TableCard[] {
  const counts = new Map<string, number>();
  for (const card of items) if (card.stackId) counts.set(card.stackId, (counts.get(card.stackId) ?? 0) + 1);
  return items.map(card => {
    if (!card.stackId || (counts.get(card.stackId) ?? 0) >= 2) return card;
    const { stackId: _stackId, ...loose } = card; return loose;
  });
}
function selectedCards(state: CardTableState, ids: readonly string[]): Set<string> {
  const selected = new Set(ids);
  return new Set(tableObjects(state).filter(object => selected.has(object.id)).flatMap(object => object.cards.map(card => card.id)));
}
export function raiseObjects(state: CardTableState, ids: readonly string[]): CardTableState {
  const cards = selectedCards(state, ids);
  if (!cards.size) return state;
  return { ...state, items: [...state.items.filter(card => !cards.has(card.id)), ...state.items.filter(card => cards.has(card.id))] };
}
export function moveObjects(state: CardTableState, ids: readonly string[], delta: Point, bounds: Bounds): CardTableState {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return state;
  const cards = selectedCards(state, ids), members = state.items.filter(card => cards.has(card.id));
  if (!members.length) return state;
  // Clamp one shared delta, retaining the spacing of a multiple selection.
  const dx = Math.max(-Math.min(...members.map(c => c.position.x)), Math.min(delta.x, bounds.width - CARD_SIZE.width - Math.max(...members.map(c => c.position.x))));
  const dy = Math.max(-Math.min(...members.map(c => c.position.y)), Math.min(delta.y, bounds.height - CARD_SIZE.height - Math.max(...members.map(c => c.position.y))));
  if (!dx && !dy) return state;
  return { ...state, items: state.items.map(card => cards.has(card.id) ? { ...card, position: { x: card.position.x + dx, y: card.position.y + dy } } : card) };
}
export function makeStack(state: CardTableState, ids: readonly string[]): CardTableState {
  const selected = new Set(ids), objects = tableObjects(state).filter(object => selected.has(object.id));
  if (objects.length < 2) return state;
  const cards = selectedCards(state, ids), members = state.items.filter(card => cards.has(card.id));
  const position = objects.at(-1)!.position, stackId = `stack-${state.nextStackNumber}`;
  return { ...state, nextStackNumber: state.nextStackNumber + 1, items: [
    ...state.items.filter(card => !cards.has(card.id)),
    ...members.map(card => ({ ...card, stackId, position: { ...position } }))
  ] };
}
export function dissolveStack(state: CardTableState, id: string, bounds: Bounds): CardTableState {
  const object = tableObjects(state).find(item => item.id === id);
  if (!object || object.cards.length < 2) return state;
  const offsets = new Map(object.cards.map((card, index) => [card.id, index]));
  return { ...state, items: state.items.map(card => {
    const index = offsets.get(card.id);
    if (index === undefined) return card;
    const { stackId: _stackId, ...loose } = card;
    return { ...loose, position: clampPosition({ x: object.position.x + index * 26, y: object.position.y + index * 8 }, bounds) };
  }) };
}
export function takeFromStack(state: CardTableState, id: string, cardId: string, bounds: Bounds): CardTableState {
  const object = tableObjects(state).find(item => item.id === id);
  const card = object?.cards.find(item => item.id === cardId);
  if (!object || object.cards.length < 2 || !card) return state;
  const { stackId: _stackId, ...loose } = card;
  const offset = CARD_SIZE.width + 24;
  const x = object.position.x + offset <= bounds.width - CARD_SIZE.width ? object.position.x + offset : object.position.x - offset;
  return { ...state, items: [...cleanSingleStacks(state.items.filter(item => item.id !== cardId)), {
    ...loose, position: clampPosition({ x, y: object.position.y }, bounds)
  }] };
}
export function flipObjects(state: CardTableState, ids: readonly string[]): CardTableState {
  const selected = new Set(ids);
  if (!tableObjects(state).some(object => selected.has(object.id))) return state;
  return { ...state, items: tableObjects(state).flatMap(object =>
    selected.has(object.id) ? [...object.cards].reverse().map(card => ({ ...card, faceUp: !card.faceUp })) : object.cards
  ) };
}
export function shuffleStack(state: CardTableState, id: string, random: () => number = Math.random): CardTableState {
  const object = tableObjects(state).find(item => item.id === id);
  if (!object || object.cards.length < 2) return state;
  const cards = [...object.cards];
  for (let i = cards.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) return state;
    const j = Math.floor(value * (i + 1)); [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return { ...state, items: tableObjects(state).flatMap(item => item.id === id ? cards : item.cards) };
}
export function returnObjects(state: CardTableState, ids: readonly string[]): CardTableState {
  const cards = selectedCards(state, ids);
  if (!cards.size) return state;
  const returned = state.items.filter(card => cards.has(card.id)).reverse().map(({ id, deckId, suit, rank }) => ({ id, deckId, suit, rank }));
  return { ...state, drawPile: [...returned, ...state.drawPile], items: cleanSingleStacks(state.items.filter(card => !cards.has(card.id))) };
}
