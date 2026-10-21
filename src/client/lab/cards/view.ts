import { CARD_SIZE, clampPosition, type Bounds, type Point } from "./model";

export const WORLD_SIZE: Bounds = { width: 2400, height: 1600 };
export const MIN_ZOOM = 0.25, MAX_ZOOM = 2;
export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) : 1;
}
/** Keep the world point beneath the chosen viewport anchor stationary. */
export function zoomScroll(scroll: Point, anchor: Point, from: number, to: number): Point {
  return { x: (scroll.x + anchor.x) / from * to - anchor.x, y: (scroll.y + anchor.y) / from * to - anchor.y };
}
export function drawPositions(count: number, mode: "stack" | "spread", start: Point, visible: Bounds): Point[] {
  const columns = Math.max(1, Math.floor((visible.width - 48) / (CARD_SIZE.width + 16)));
  return Array.from({ length: count }, (_, index) => clampPosition({
    x: start.x + (mode === "spread" ? index % columns * (CARD_SIZE.width + 16) : 0),
    y: start.y + (mode === "spread" ? Math.floor(index / columns) * (CARD_SIZE.height + 16) : 0)
  }, WORLD_SIZE));
}
