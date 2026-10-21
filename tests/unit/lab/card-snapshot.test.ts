import { describe, expect, it } from "vitest";
import { addDeck, createCardTable, drawCards, flipCard } from "../../../src/client/lab/cards/model";
import { makeStack, flipObjects, takeFromStack } from "../../../src/client/lab/cards/stacks";
import { initialSnapshot, parseSnapshot, pushUndo, sameTable, UNDO_LIMIT, type TableSnapshot } from "../../../src/client/lab/cards/snapshot";
const bounds = { width: 2400, height: 1600 };
function complex(): TableSnapshot {
  let table = drawCards(addDeck(createCardTable()), Array.from({ length: 8 }, (_, i) => ({ x: 24 + i * 100, y: 28 })));
  table = makeStack(table, table.items.slice(0, 5).map(card => card.id));
  const stackId = table.items.at(-1)!.stackId!;
  table = flipObjects(table, [stackId]);
  table = flipCard(table, table.items.at(-2)!.id);
  table = takeFromStack(table, stackId, table.items.at(-3)!.id, bounds);
  return { schemaVersion: 2, table, view: { zoom: 1.5, scroll: { x: 300.5, y: 200.25 } } };
}
function copy(): any { return JSON.parse(JSON.stringify(complex())); }
describe("saved card snapshots", () => {
  it("round trips mixed faces, bundles, pile order, deck identities, positions and camera without shared references", () => {
    const snapshot = complex(), parsed = parseSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(parsed).toEqual(snapshot); expect(parsed!.table.items).not.toBe(snapshot.table.items);
    expect(parsed!.view.scroll).not.toBe(snapshot.view.scroll);
    expect(parseSnapshot(initialSnapshot())).toEqual(initialSnapshot());
  });
  it("rejects missing and duplicate cards, invalid identities and incompatible versions", () => {
    const missing = copy(); missing.table.drawPile.pop(); expect(parseSnapshot(missing)).toBeNull();
    const duplicate = copy(); duplicate.table.drawPile[0] = duplicate.table.items[0]; expect(parseSnapshot(duplicate)).toBeNull();
    const identity = copy(); identity.table.items[0].id = "unknown"; expect(parseSnapshot(identity)).toBeNull();
    const deck = copy(); deck.table.items[0].deckId = "deck-3"; expect(parseSnapshot(deck)).toBeNull();
    const rank = copy(); rank.table.items[0].rank = 14; expect(parseSnapshot(rank)).toBeNull();
    const version = copy(); version.schemaVersion = 99; expect(parseSnapshot(version)).toBeNull();
    expect(parseSnapshot(null)).toBeNull(); expect(parseSnapshot({})).toBeNull();
  });
  it("rejects broken bundle order, positions, singleton bundles and reused bundle counters", () => {
    const order = copy(), member = order.table.items.find((card: any) => card.stackId);
    const loose = order.table.items.find((card: any) => !card.stackId);
    order.table.items.splice(order.table.items.indexOf(member) + 1, 0, order.table.items.splice(order.table.items.indexOf(loose), 1)[0]);
    expect(parseSnapshot(order)).toBeNull();
    const positions = copy(); positions.table.items.find((card: any) => card.stackId).position.x++;
    expect(parseSnapshot(positions)).toBeNull();
    const singleton = copy(); singleton.table.items.filter((card: any) => card.stackId).slice(1).forEach((card: any) => delete card.stackId);
    expect(parseSnapshot(singleton)).toBeNull();
    const counter = copy(); counter.table.nextStackNumber = 1; expect(parseSnapshot(counter)).toBeNull();
  });
  it("rejects invalid coordinates, face values and cameras and strips extra fields", () => {
    for (const value of [-1, Infinity, NaN, 2400]) {
      const snapshot = copy(); snapshot.table.items[0].position.x = value;
      expect(parseSnapshot(snapshot)).toBeNull();
    }
    const boxed = copy(); boxed.table.items[0].suit = new String(boxed.table.items[0].suit); expect(parseSnapshot(boxed)).toBeNull();
    const face = copy(); face.table.items[0].faceUp = "false"; expect(parseSnapshot(face)).toBeNull();
    for (const zoom of [0, .24, 2.1, NaN]) { const snapshot = copy(); snapshot.view.zoom = zoom; expect(parseSnapshot(snapshot)).toBeNull(); }
    const scroll = copy(); scroll.view.scroll.x = 1e8; expect(parseSnapshot(scroll)).toBeNull();
    const extras = copy(); extras.table.items[0].extra = "unused"; extras.extra = "unused";
    expect(parseSnapshot(extras)).not.toHaveProperty("extra");
    expect(parseSnapshot(extras)!.table.items[0]).not.toHaveProperty("extra");
  });
});
describe("undo snapshot history", () => {
  it("retains the latest 50 actions and exact shuffled order/camera snapshots", () => {
    let history: TableSnapshot[] = [];
    const base = initialSnapshot();
    for (let i = 0; i < 70; i++) history = pushUndo(history, { ...base, view: { zoom: 1, scroll: { x: i, y: 0 } } });
    expect(history).toHaveLength(UNDO_LIMIT); expect(history[0]!.view.scroll.x).toBe(20); expect(history.at(-1)!.view.scroll.x).toBe(69);
    const snapshot = complex(), before = JSON.stringify(snapshot);
    history = pushUndo(history, snapshot);
    expect(history.at(-1)).toBe(snapshot); expect(JSON.stringify(snapshot)).toBe(before);
    expect(sameTable(snapshot.table, parseSnapshot(copy())!.table)).toBe(true);
    expect(sameTable(snapshot.table, createCardTable())).toBe(false);
  });
});
