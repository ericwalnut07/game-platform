import { describe, expect, it } from "vitest";
import { addDeck, createCardTable, drawCards, flipCard, moveCard, bringToFront, returnCard, type CardTableState } from "../../../src/client/lab/cards/model";
import { tableObjects, makeStack, dissolveStack, takeFromStack, flipObjects, moveObjects, raiseObjects, returnObjects, shuffleStack } from "../../../src/client/lab/cards/stacks";
const bounds = { width: 2400, height: 1600 };
function setup(count = 5) { return drawCards(addDeck(createCardTable()), Array.from({ length: count }, (_, i) => ({ x: 24 + i * 104, y: 28 + i * 8 }))); }
function ids(state: CardTableState) { return [...state.drawPile, ...state.items].map(card => card.id).sort(); }
function assertSound(state: CardTableState) {
  expect(new Set(ids(state)).size).toBe(state.deckCount * 54);
  expect(ids(state)).toHaveLength(state.deckCount * 54);
  for (const object of tableObjects(state)) {
    if (object.cards.length > 1) {
      expect(object.cards.every(card => card.stackId === object.id)).toBe(true);
      expect(object.cards.every(card => card.position.x === object.position.x && card.position.y === object.position.y)).toBe(true);
      const indices = object.cards.map(card => state.items.findIndex(item => item.id === card.id));
      expect(indices).toEqual(Array.from({ length: indices.length }, (_, index) => indices[0]! + index));
    } else expect(object.top.stackId).toBeUndefined();
  }
}
describe("explicit card bundles", () => {
  it("distinguishes coincident loose cards from a bundle and preserves bottom-to-top order", () => {
    let state = setup(4);
    for (const card of state.items) state = moveCard(state, card.id, { x: 100, y: 100 });
    expect(tableObjects(state)).toHaveLength(4);
    const before = state, order = state.items.map(card => card.id);
    state = makeStack(state, [order[3]!, order[0]!, order[2]!, order[1]!, order[0]!]);
    expect(tableObjects(state)).toHaveLength(1);
    expect(state.items.map(card => card.id)).toEqual(order);
    expect(ids(state)).toEqual(ids(before)); expect(before.items.every(card => !card.stackId)).toBe(true);
    assertSound(state);
  });
  it("moves multiple loose cards and bundles with one clamped delta without merging or changing order", () => {
    const before = setup(4), names = before.items.map(card => card.id);
    let state = makeStack(before, names.slice(0, 2));
    const stack = tableObjects(state).find(object => object.cards.length === 2)!;
    const targets = [stack.id, names[2]!], other = state.items.find(card => card.id === names[3])!;
    const order = state.items.map(card => card.id);
    state = moveObjects(state, targets, { x: -1000, y: -1000 }, bounds);
    expect(state.items.find(card => card.id === names[0])!.position.x).toBe(0);
    expect(state.items.find(card => card.id === names[2])!.position.x).toBe(104);
    expect(state.items.find(card => card.id === names[3])).toBe(other);
    expect(state.items.map(card => card.id)).toEqual(order); assertSound(state);
    const moved = moveCard(state, names[0]!, { x: 175.25, y: 240.75 });
    expect(moved.items.filter(card => card.stackId === stack.id).every(card => card.position.x === 175.25)).toBe(true);
    assertSound(bringToFront(moved, names[0]!));
  });
  it("raises an entire bundle as one contiguous object and merges existing bundles explicitly", () => {
    let state = setup(6); const original = ids(state), names = state.items.map(card => card.id);
    state = makeStack(state, names.slice(0, 2)); const first = state.items.at(-1)!.stackId!;
    state = makeStack(state, names.slice(2, 4)); const second = state.items.at(-1)!.stackId!;
    state = raiseObjects(state, [first]);
    expect(state.items.slice(-2).map(card => card.id)).toEqual(names.slice(0, 2));
    const order = state.items.filter(card => card.stackId).map(card => card.id);
    state = makeStack(state, [first, second]);
    expect(state.items.slice(-4).map(card => card.id)).toEqual(order);
    expect(ids(state)).toEqual(original); assertSound(state);
  });
  it("extracts any requested card, preserves faces/order, and dissolves the final singleton", () => {
    const initial = setup(3), names = initial.items.map(card => card.id);
    let state = makeStack(flipCard(initial, names[1]!), names);
    const stackId = state.items[0]!.stackId!;
    state = takeFromStack(state, stackId, names[1]!, bounds);
    expect(state.items.at(-1)).toMatchObject({ id: names[1], faceUp: false });
    expect(state.items.at(-1)!.stackId).toBeUndefined();
    expect(state.items.slice(0, 2).map(card => card.id)).toEqual([names[0], names[2]]);
    state = takeFromStack(state, stackId, names[2]!, bounds);
    expect(tableObjects(state).every(object => object.cards.length === 1)).toBe(true);
    expect(ids(state)).toEqual(ids(initial)); assertSound(state);
  });
  it("flips a whole bundle physically and a member individually, without exposing or changing other cards", () => {
    const initial = setup(4), names = initial.items.map(card => card.id);
    let state = makeStack(initial, names.slice(0, 3)), stackId = state.items.at(-1)!.stackId!;
    const other = state.items[0]!;
    state = flipObjects(state, [stackId]);
    const stack = tableObjects(state).find(object => object.id === stackId)!;
    expect(stack.cards.map(card => card.id)).toEqual(names.slice(0, 3).reverse());
    expect(stack.cards.every(card => !card.faceUp)).toBe(true); expect(state.items[0]).toBe(other);
    state = flipCard(state, names[1]!);
    expect(state.items.find(card => card.id === names[1])!.faceUp).toBe(true);
    expect(tableObjects(state).find(object => object.id === stackId)!.cards.map(card => card.id)).toEqual(stack.cards.map(card => card.id));
    state = flipObjects(flipObjects(state, [stackId]), [stackId]);
    expect(ids(state)).toEqual(ids(initial)); assertSound(state);
  });
  it("shuffles only the specified bundle with faces and identities attached to cards", () => {
    let state = setup(5), names = state.items.map(card => card.id);
    state = makeStack(flipCard(state, names[2]!), names.slice(0, 4));
    const stackId = state.items.at(-1)!.stackId!, before = state;
    state = shuffleStack(state, stackId, () => 0);
    expect(state.items.filter(card => card.stackId).map(card => card.id)).not.toEqual(before.items.filter(card => card.stackId).map(card => card.id));
    expect(state.items.find(card => card.id === names[2])!.faceUp).toBe(false);
    expect(state.drawPile).toBe(before.drawPile); expect(state.items[0]).toBe(before.items[0]);
    expect(ids(state)).toEqual(ids(before)); expect(shuffleStack(state, stackId, () => NaN)).toBe(state); assertSound(state);
  });
  it("dissolves, re-bundles and returns every member exactly once without reusing stack IDs", () => {
    const initial = setup(6), names = initial.items.map(card => card.id);
    let state = makeStack(initial, names), first = state.items[0]!.stackId!;
    state = dissolveStack(state, first, bounds);
    expect(state.items.every(card => !card.stackId)).toBe(true);
    expect(new Set(state.items.map(card => card.position.x)).size).toBe(6);
    state = makeStack(state, names); const second = state.items[0]!.stackId!;
    expect(second).not.toBe(first);
    expect(returnCard(state, names[0]!)).toBe(state);
    const top = state.items.at(-1)!.id;
    state = returnObjects(state, [second, second]);
    expect(state.items).toEqual([]); expect(state.drawPile[0]!.id).toBe(top);
    expect(ids(state)).toEqual(ids(initial)); expect(state.drawPile[0]).not.toHaveProperty("stackId"); assertSound(state);
  });
  it("ignores stale selections and invalid moves without losing cards", () => {
    const state = setup(3), name = state.items[0]!.id;
    expect(makeStack(state, [name, name, "missing"])).toBe(state);
    expect(dissolveStack(state, name, bounds)).toBe(state);
    expect(takeFromStack(state, name, name, bounds)).toBe(state);
    expect(moveObjects(state, [name], { x: Infinity, y: 0 }, bounds)).toBe(state);
    expect(returnObjects(state, ["missing"])).toBe(state);
    expect(shuffleStack(state, "missing")).toBe(state);
  });
  it("maintains all invariants across repeated creation, extraction, flip, shuffle and return", () => {
    let state = addDeck(createCardTable()); const expected = ids(state);
    for (let round = 0; round < 10; round++) {
      state = drawCards(state, Array.from({ length: 8 }, () => ({ x: 2350 - 100, y: 1450 })));
      const names = state.items.slice(-8).map(card => card.id);
      state = makeStack(state, names); const stackId = state.items.at(-1)!.stackId!;
      state = moveObjects(state, [stackId], { x: 1000, y: 1000 }, bounds);
      state = shuffleStack(flipObjects(state, [stackId]), stackId, () => 0.25);
      state = takeFromStack(state, stackId, names[4]!, bounds);
      state = returnObjects(state, tableObjects(state).map(object => object.id));
      expect(ids(state)).toEqual(expected); assertSound(state);
    }
  });
});
