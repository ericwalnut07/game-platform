import type { Bounds, CardTableState, Point } from "./model";

export const TEXT_BOX_SIZE: Bounds = { width: 240, height: 132 };
export function clampTextPosition(position: Point, bounds: Bounds): Point {
  return { x: Math.max(0, Math.min(position.x, Math.max(0, bounds.width - TEXT_BOX_SIZE.width))), y: Math.max(0, Math.min(position.y, Math.max(0, bounds.height - TEXT_BOX_SIZE.height))) };
}
function valid(position: Point): boolean { return Number.isFinite(position.x) && Number.isFinite(position.y) && position.x >= 0 && position.y >= 0; }
export function addText(state: CardTableState, position: Point): CardTableState {
  if (!valid(position)) return state;
  return { ...state, nextTextNumber: state.nextTextNumber + 1, texts: [...state.texts, { kind: "text-box", id: `text-${state.nextTextNumber}`, text: "", position: { ...position } }] };
}
export function editText(state: CardTableState, id: string, text: string): CardTableState {
  const note = state.texts.find(item => item.id === id);
  if (!note || note.text === text) return state;
  return { ...state, texts: state.texts.map(item => item.id === id ? { ...item, text } : item) };
}
export function moveText(state: CardTableState, id: string, position: Point): CardTableState {
  const note = state.texts.find(item => item.id === id);
  if (!note || !valid(position) || (note.position.x === position.x && note.position.y === position.y)) return state;
  return { ...state, texts: state.texts.map(item => item.id === id ? { ...item, position: { ...position } } : item) };
}
export function raiseText(state: CardTableState, id: string): CardTableState {
  const note = state.texts.find(item => item.id === id);
  if (!note || state.texts.at(-1)?.id === id) return state;
  return { ...state, texts: [...state.texts.filter(item => item.id !== id), note] };
}
export function removeText(state: CardTableState, id: string): CardTableState {
  if (!state.texts.some(item => item.id === id)) return state;
  return { ...state, texts: state.texts.filter(item => item.id !== id) };
}
