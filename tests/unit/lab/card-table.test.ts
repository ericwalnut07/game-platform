import { describe, expect, it } from "vitest";
import { bringToFront, cardLabel, clampPosition, createCardTable, drawCard, flipCard, moveCard, addDeck, drawCards, returnCard, shufflePile, type CardTableState } from "../../../src/client/lab/cards/model";

function ids(state: CardTableState) { return [...state.drawPile, ...state.items].map(card => card.id).sort(); }
describe("card workbench phase 1", () => {
  it("creates exactly 52 standard cards and two distinct jokers without shared state", () => {
    const state = createCardTable();
    expect(state.items).toEqual([]); expect(state.drawPile).toHaveLength(54);
    expect(new Set(ids(state)).size).toBe(54);
    for (const suit of ["spades", "hearts", "clubs", "diamonds"]) expect(state.drawPile.filter(card => card.suit === suit).map(card => card.rank)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(state.drawPile.filter(card => card.suit === "joker").map(cardLabel)).toEqual(["ジョーカー1", "ジョーカー2"]);
    expect(createCardTable().drawPile).not.toBe(state.drawPile);
  });
  it("transfers every card once, preserves identities and stops at an empty deck", () => {
    const initial = createCardTable(), expected = ids(initial); let state = initial;
    for (let count = 1; count <= 54; count++) {
      state = drawCard(state, { x: count * 1.5, y: count * 2.25 });
      expect(state.drawPile.length + state.items.length).toBe(54);
      expect(ids(state)).toEqual(expected); expect(state.items.at(-1)?.faceUp).toBe(true);
    }
    expect(state.drawPile).toHaveLength(0); expect(state.items).toHaveLength(54);
    expect(drawCard(state, { x: 10, y: 10 })).toBe(state);
    expect(initial.drawPile).toHaveLength(54); expect(initial.items).toEqual([]);
  });
  it("moves one card with fractional coordinates, permits overlap and never duplicates cards", () => {
    let state = drawCard(drawCard(createCardTable(), { x: 10, y: 20 }), { x: 50, y: 60 });
    const before = state, card = state.items[0]!, other = state.items[1]!;
    state = moveCard(state, card.id, { x: 50, y: 60 });
    expect(state.items[0]!.position).toEqual(other.position);
    state = moveCard(state, card.id, { x: 103.75, y: 89.5 });
    expect(state.items[0]!.position).toEqual({ x: 103.75, y: 89.5 });
    expect(state.items[1]).toBe(other); expect(ids(state)).toEqual(ids(before));
    expect(before.items[0]!.position).toEqual({ x: 10, y: 20 });
  });
  it("flips only the selected card and raises a card without changing its placement or face", () => {
    const before = drawCard(drawCard(createCardTable(), { x: 40, y: 30 }), { x: 40, y: 30 });
    const first = before.items[0]!, second = before.items[1]!;
    const flipped = flipCard(before, first.id);
    expect(flipped.items[0]!.faceUp).toBe(false); expect(flipped.items[1]).toBe(second);
    expect(first.faceUp).toBe(true);
    const raised = bringToFront(flipped, first.id);
    expect(raised.items.map(card => card.id)).toEqual([second.id, first.id]);
    expect(raised.items.at(-1)?.position).toEqual(first.position); expect(raised.items.at(-1)?.faceUp).toBe(false);
    expect(ids(raised)).toEqual(ids(before));
    expect(flipCard(raised, first.id).items.at(-1)?.faceUp).toBe(true);
  });
  it("rejects invalid identities/coordinates instead of losing or generating cards", () => {
    const state = drawCard(createCardTable(), { x: 4, y: 8 });
    for (const position of [{ x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: -1, y: 0 }]) {
      expect(moveCard(state, state.items[0]!.id, position)).toBe(state);
      expect(drawCard(state, position)).toBe(state);
    }
    expect(moveCard(state, "missing", { x: 10, y: 20 })).toBe(state);
    expect(flipCard(state, "missing")).toBe(state); expect(bringToFront(state, "missing")).toBe(state);
  });
  it("keeps a whole card within the visible world without snapping to grid lines", () => {
    expect(clampPosition({ x: 73.25, y: 91.75 }, { width: 960, height: 640 })).toEqual({ x: 73.25, y: 91.75 });
    expect(clampPosition({ x: -20, y: -40 }, { width: 960, height: 640 })).toEqual({ x: 0, y: 0 });
    expect(clampPosition({ x: 1000, y: 800 }, { width: 960, height: 640 })).toEqual({ x: 872, y: 516 });
    expect(clampPosition({ x: 5, y: 5 }, { width: 20, height: 20 })).toEqual({ x: 0, y: 0 });
  });
});

describe("card workbench phase 2 decks", () => {
  it("adds decks without collisions even after cards have been drawn or returned", () => {
    let state = createCardTable();
    state = drawCard(state, { x: 10, y: 20 });
    const placed = state.items[0]!;
    state = addDeck(state); state = addDeck(state);
    expect(state.deckCount).toBe(3);
    expect(state.items[0]).toBe(placed);
    expect(ids(state)).toHaveLength(162); expect(new Set(ids(state)).size).toBe(162);
    for (const deckId of ["deck-1", "deck-2", "deck-3"]) {
      expect([...state.drawPile, ...state.items].filter(card => card.deckId === deckId)).toHaveLength(54);
    }
    expect(state.drawPile[53]!.deckId).toBe("deck-2");
  });
  it("draws an ordered batch without losing identities and permits independent overlapping cards", () => {
    const initial = addDeck(createCardTable()), positions = Array.from({ length: 60 }, () => ({ x: 30, y: 45 }));
    const state = drawCards(initial, positions);
    expect(state.items.map(card => card.id)).toEqual(initial.drawPile.slice(0, 60).map(card => card.id));
    expect(ids(state)).toEqual(ids(initial)); expect(state.drawPile).toHaveLength(48);
    expect(state.items.every(card => card.faceUp)).toBe(true);
    const moved = moveCard(state, state.items[59]!.id, { x: 81.5, y: 62.5 });
    expect(moved.items[58]!.position).toEqual({ x: 30, y: 45 });
    expect(initial.items).toHaveLength(0);
  });
  it("rejects oversized, empty and invalid batches atomically", () => {
    const state = createCardTable();
    expect(drawCards(state, [])).toBe(state);
    expect(drawCards(state, Array.from({ length: 55 }, () => ({ x: 0, y: 0 })))).toBe(state);
    expect(drawCards(state, [{ x: 0, y: 0 }, { x: NaN, y: 0 }])).toBe(state);
  });
  it("returns exactly one card to the top and redraws the same identity face up", () => {
    const initial = addDeck(createCardTable());
    let state = drawCards(initial, [{ x: 12, y: 24 }, { x: 40, y: 50 }]);
    const card = state.items[0]!, other = state.items[1]!;
    state = returnCard(flipCard(state, card.id), card.id);
    expect(state.drawPile[0]!.id).toBe(card.id);
    expect(state.drawPile[0]).not.toHaveProperty("position");
    expect(state.items).toEqual([other]); expect(ids(state)).toEqual(ids(initial));
    expect(returnCard(state, card.id)).toBe(state);
    state = drawCard(state, { x: 80, y: 120 });
    expect(state.items.at(-1)).toMatchObject({ id: card.id, faceUp: true, position: { x: 80, y: 120 } });
    expect(ids(state)).toEqual(ids(initial));
  });
  it("shuffles only the remaining pile, preserves every card, and never mutates the source", () => {
    const initial = drawCards(addDeck(createCardTable()), [{ x: 0, y: 0 }, { x: 20, y: 30 }]);
    const order = initial.drawPile.map(card => card.id);
    const shuffled = shufflePile(initial, () => 0);
    expect(shuffled.drawPile.map(card => card.id)).not.toEqual(order);
    expect(shuffled.items).toBe(initial.items); expect(ids(shuffled)).toEqual(ids(initial));
    expect(initial.drawPile.map(card => card.id)).toEqual(order);
    expect(shufflePile(initial, () => 1)).toBe(initial);
    const empty = drawCards(createCardTable(), Array.from({ length: 54 }, () => ({ x: 0, y: 0 })));
    expect(shufflePile(empty)).toBe(empty);
    expect(shufflePile(returnCard(empty, empty.items[0]!.id))).toHaveProperty("drawPile.length", 1);
  });
  it("preserves all cards across repeated interleaved multi-deck operations", () => {
    let state = addDeck(createCardTable()); const expected = ids(state);
    for (let round = 0; round < 12; round++) {
      state = drawCards(state, Array.from({ length: 7 }, (_, i) => ({ x: 15.5 * i, y: round * 10 })));
      for (const card of state.items.slice(-3)) state = returnCard(state, card.id);
      state = shufflePile(state, () => 0.37);
      expect(ids(state)).toEqual(expected); expect(new Set(ids(state)).size).toBe(108);
    }
  });
});
