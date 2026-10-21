import { CARD_SIZE, createCardTable, type CardTableState, type PlayingCard, type Point, type Suit, type TableCard, type TableText } from "./model";
import { TEXT_BOX_SIZE } from "./texts";
import { MAX_ZOOM, MIN_ZOOM, WORLD_SIZE } from "./view";

export interface SavedView { readonly zoom: number; readonly scroll: Point }
export interface TableSnapshot { readonly schemaVersion: 2; readonly table: CardTableState; readonly view: SavedView }
export const UNDO_LIMIT = 50;
export function initialSnapshot(): TableSnapshot { return { schemaVersion: 2, table: createCardTable(), view: { zoom: 1, scroll: { x: 0, y: 0 } } }; }
export function sameTable(a: CardTableState, b: CardTableState): boolean { return a === b || JSON.stringify(a) === JSON.stringify(b); }
export function pushUndo(history: readonly TableSnapshot[], before: TableSnapshot): TableSnapshot[] { return [...history.slice(-(UNDO_LIMIT - 1)), before]; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function point(value: unknown, maxX: number, maxY: number): Point | null {
  if (!record(value) || typeof value.x !== "number" || typeof value.y !== "number" || !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < 0 || value.y < 0 || value.x > maxX || value.y > maxY) return null;
  return { x: value.x, y: value.y };
}
/** Rebuild canonical objects; never apply unchecked database contents to the board. */
export function parseSnapshot(value: unknown): TableSnapshot | null {
  if (!record(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2) || !record(value.table) || !record(value.view)) return null;
  const source = value.table, camera = value.view;
  if (source.version !== 1 || !integer(source.deckCount) || !integer(source.nextStackNumber) || !Array.isArray(source.drawPile) || !Array.isArray(source.items)) return null;
  if (source.drawPile.length + source.items.length !== source.deckCount * 54) return null;
  const seen = new Set<string>();
  function playingCard(raw: unknown): PlayingCard | null {
    if (!record(raw) || typeof raw.id !== "string" || typeof raw.deckId !== "string" || !integer(raw.rank)) return null;
    const deck = /^deck-([1-9]\d*)$/.exec(raw.deckId);
    const deckNumber = deck ? Number(deck[1]) : 0;
    if (!Number.isSafeInteger(deckNumber) || deckNumber < 1 || deckNumber > (source.deckCount as number)) return null;
    if (typeof raw.suit !== "string" || !["spades", "hearts", "clubs", "diamonds", "joker"].includes(raw.suit)) return null;
    if (raw.rank > (raw.suit === "joker" ? 2 : 13) || raw.id !== `${raw.deckId}:${raw.suit}:${raw.rank}` || seen.has(raw.id)) return null;
    seen.add(raw.id);
    return { id: raw.id, deckId: raw.deckId, suit: raw.suit as Suit, rank: raw.rank };
  }
  const texts: TableText[] = [];
  let nextTextNumber = 1;
  if (value.schemaVersion === 2) {
    if (!integer(source.nextTextNumber) || !Array.isArray(source.texts)) return null;
    nextTextNumber = source.nextTextNumber;
    const textIds = new Set<string>();
    for (const raw of source.texts) {
      if (!record(raw) || raw.kind !== "text-box" || typeof raw.id !== "string" || !/^text-[1-9]\d*$/.test(raw.id) || typeof raw.text !== "string" || textIds.has(raw.id)) return null;
      const number = Number(raw.id.slice(5));
      if (!Number.isSafeInteger(number) || number >= nextTextNumber) return null;
      const position = point(raw.position, WORLD_SIZE.width - TEXT_BOX_SIZE.width, WORLD_SIZE.height - TEXT_BOX_SIZE.height);
      if (!position) return null;
      textIds.add(raw.id); texts.push({ kind: "text-box", id: raw.id, text: raw.text, position });
    }
  } else if (source.texts !== undefined || source.nextTextNumber !== undefined) {
    // Unknown extended v1 data must not silently drop newer objects.
    return null;
  }
  const drawPile: PlayingCard[] = [], items: TableCard[] = [];
  for (const raw of source.drawPile) { const card = playingCard(raw); if (!card) return null; drawPile.push(card); }
  const groups = new Map<string, { count: number; position: Point }>();
  let previousStack: string | undefined;
  for (const raw of source.items) {
    const card = playingCard(raw);
    if (!card || !record(raw) || raw.kind !== "playing-card" || typeof raw.faceUp !== "boolean") return null;
    const position = point(raw.position, WORLD_SIZE.width - CARD_SIZE.width, WORLD_SIZE.height - CARD_SIZE.height);
    if (!position) return null;
    const stackId = raw.stackId;
    if (stackId !== undefined) {
      if (typeof stackId !== "string" || !/^stack-[1-9]\d*$/.test(stackId)) return null;
      const number = Number(stackId.slice(6));
      if (!Number.isSafeInteger(number) || number >= source.nextStackNumber) return null;
      const group = groups.get(stackId);
      if (group) {
        if (previousStack !== stackId || group.position.x !== position.x || group.position.y !== position.y) return null;
        group.count++;
      } else groups.set(stackId, { count: 1, position });
    }
    previousStack = typeof stackId === "string" ? stackId : undefined;
    items.push({ ...card, kind: "playing-card", position, faceUp: raw.faceUp, ...(typeof stackId === "string" ? { stackId } : {}) });
  }
  if ([...groups.values()].some(group => group.count < 2)) return null;
  if (typeof camera.zoom !== "number" || !Number.isFinite(camera.zoom) || camera.zoom < MIN_ZOOM || camera.zoom > MAX_ZOOM) return null;
  const scroll = point(camera.scroll, WORLD_SIZE.width * camera.zoom, WORLD_SIZE.height * camera.zoom);
  if (!scroll) return null;
  return { schemaVersion: 2, table: { version: 1, deckCount: source.deckCount, nextStackNumber: source.nextStackNumber, nextTextNumber, texts, drawPile, items }, view: { zoom: camera.zoom, scroll } };
}
