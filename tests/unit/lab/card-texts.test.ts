import { describe, expect, it } from "vitest";
import { createCardTable, drawCard } from "../../../src/client/lab/cards/model";
import { addText, editText, moveText, raiseText, removeText, clampTextPosition, TEXT_BOX_SIZE } from "../../../src/client/lab/cards/texts";
import { parseSnapshot, type TableSnapshot } from "../../../src/client/lab/cards/snapshot";
const bounds = { width: 2400, height: 1600 };
describe("board text boxes", () => {
  it("adds distinct text objects without affecting cards, with exact Unicode, whitespace and newlines", () => {
    const base = drawCard(createCardTable(), { x: 30, y: 40 });
    let state = addText(addText(base, { x: 63.5, y: 91.25 }), { x: 63.5, y: 91.25 });
    expect(state.texts.map(note => note.id)).toEqual(["text-1", "text-2"]);
    state = editText(state, "text-1", "  手札置き場\n日本語・한글・D/F\n<script>そのまま表示</script>  ");
    expect(state.texts[0]!.text).toBe("  手札置き場\n日本語・한글・D/F\n<script>そのまま表示</script>  ");
    expect(state.items).toBe(base.items); expect(state.drawPile).toBe(base.drawPile);
    expect(base.texts).toEqual([]);
  });
  it("moves/raises/removes notes independently and does not reuse removed IDs", () => {
    const original = addText(addText(createCardTable(), { x: 10, y: 20 }), { x: 100, y: 200 });
    let state = moveText(original, "text-1", { x: 125.25, y: 72.5 });
    expect(state.texts[1]).toBe(original.texts[1]); expect(original.texts[0]!.position).toEqual({ x: 10, y: 20 });
    state = raiseText(state, "text-1"); expect(state.texts.at(-1)!.id).toBe("text-1");
    state = addText(removeText(state, "text-1"), { x: 0, y: 0 });
    expect(state.texts.map(note => note.id)).toEqual(["text-2", "text-3"]);
    expect(state.nextTextNumber).toBe(4);
  });
  it("keeps the entire box in the board at every edge and rejects invalid moves", () => {
    expect(clampTextPosition({ x: 9999, y: 9999 }, bounds)).toEqual({ x: bounds.width - TEXT_BOX_SIZE.width, y: bounds.height - TEXT_BOX_SIZE.height });
    expect(clampTextPosition({ x: -9, y: -9 }, bounds)).toEqual({ x: 0, y: 0 });
    const state = addText(createCardTable(), { x: 20, y: 40 });
    for (const position of [{ x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: -1, y: 0 }]) {
      expect(addText(state, position)).toBe(state); expect(moveText(state, "text-1", position)).toBe(state);
    }
    expect(editText(state, "missing", "x")).toBe(state); expect(removeText(state, "missing")).toBe(state);
  });
  it("round trips text order/content/positions and rejects broken note IDs and counters", () => {
    let table = addText(addText(createCardTable(), { x: 20, y: 40 }), { x: 80, y: 100 });
    table = editText(table, "text-1", "保存して復元\n二行目");
    const snapshot: TableSnapshot = { schemaVersion: 2, table, view: { zoom: 1.25, scroll: { x: 100, y: 50 } } };
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    const duplicate = structuredClone(snapshot); (duplicate.table.texts as any)[1] = duplicate.table.texts[0];
    expect(parseSnapshot(duplicate)).toBeNull();
    const badCounter = { ...snapshot, table: { ...table, nextTextNumber: 2 } }; expect(parseSnapshot(badCounter)).toBeNull();
    const invalid = structuredClone(snapshot); (invalid.table.texts as any)[0].text = 123;
    expect(parseSnapshot(invalid)).toBeNull();
  });
  it("migrates legacy phase-4 snapshots with no text objects without losing card data or the camera", () => {
    const table = drawCard(createCardTable(), { x: 30, y: 40 });
    const { texts: _texts, nextTextNumber: _nextTextNumber, ...legacyTable } = table;
    const view = { zoom: 1.5, scroll: { x: 125, y: 80 } };
    const migrated = parseSnapshot({ schemaVersion: 1, table: legacyTable, view })!;
    expect(migrated).toEqual({ schemaVersion: 2, table, view });
    expect(parseSnapshot({ schemaVersion: 1, table, view })).toBeNull();
  });
});
