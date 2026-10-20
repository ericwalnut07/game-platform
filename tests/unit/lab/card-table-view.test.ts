import { describe, expect, it } from "vitest";
import { clampZoom, drawPositions, WORLD_SIZE, zoomScroll } from "../../../src/client/lab/cards/view";
import { CARD_SIZE } from "../../../src/client/lab/cards/model";

describe("card table view", () => {
  it("preserves the world point at the zoom anchor after panning", () => {
    const scroll = { x: 420, y: 260 }, anchor = { x: 320, y: 210 };
    for (const [from, to] of [[1, 1.75], [1.75, 0.5], [0.5, 2]]) {
      const next = zoomScroll(scroll, anchor, from!, to!);
      expect((next.x + anchor.x) / to!).toBeCloseTo((scroll.x + anchor.x) / from!);
      expect((next.y + anchor.y) / to!).toBeCloseTo((scroll.y + anchor.y) / from!);
    }
    expect(clampZoom(-1)).toBe(.25); expect(clampZoom(9)).toBe(2); expect(clampZoom(NaN)).toBe(1);
  });
  it("lays out separate rows for small screens and independent overlapping cards for stack", () => {
    const start = { x: 100, y: 150 };
    const spread = drawPositions(6, "spread", start, { width: 280, height: 420 });
    expect(spread[0]).toEqual(start); expect(spread[1]!.x).toBeGreaterThan(start.x);
    expect(spread[2]!.y).toBeGreaterThan(start.y);
    expect(new Set(spread.map(p => `${p.x},${p.y}`)).size).toBe(6);
    expect(drawPositions(6, "stack", start, { width: 280, height: 420 })).toEqual(Array.from({ length: 6 }, () => start));
  });
  it("keeps drawn cards in the world at extreme pan positions", () => {
    for (const position of drawPositions(54, "spread", { x: 2300, y: 1580 }, { width: 150, height: 200 })) {
      expect(position.x).toBeGreaterThanOrEqual(0); expect(position.x + CARD_SIZE.width).toBeLessThanOrEqual(WORLD_SIZE.width);
      expect(position.y).toBeGreaterThanOrEqual(0); expect(position.y + CARD_SIZE.height).toBeLessThanOrEqual(WORLD_SIZE.height);
    }
  });
});
