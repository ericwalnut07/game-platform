import type { PointerEvent, RefObject } from "react";
import type { TableText } from "./model";
import { TEXT_BOX_SIZE } from "./texts";

interface Props {
  note: TableText; selected: boolean; dragging: boolean; readOnly: boolean; blocked: boolean; layer: number; focusId: RefObject<string | null>;
  onDrag: (event: PointerEvent<HTMLButtonElement>, note: TableText) => void;
  onFocus: (id: string) => void; onBlur: () => void; onEdit: (id: string, text: string) => void; onRemove: (id: string) => void;
}
export default function TextBox({ note, selected, dragging, readOnly, blocked, layer, focusId, onDrag, onFocus, onBlur, onEdit, onRemove }: Props) {
  const number = note.id.slice(5);
  return <section className={`lab-note ${selected ? "lab-note-selected" : ""} ${dragging ? "lab-note-dragging" : ""}`} aria-label={`テキスト${number}`} data-text-id={note.id} data-x={note.position.x} data-y={note.position.y}
    style={{ left: note.position.x, top: note.position.y, width: TEXT_BOX_SIZE.width, height: TEXT_BOX_SIZE.height, zIndex: layer }}>
    <div className="lab-note-header">
      <button type="button" className="lab-note-handle" aria-label={`テキスト${number}を移動`} disabled={blocked} onPointerDown={event => onDrag(event, note)}>⠿ テキスト {number}</button>
      <button type="button" className="lab-note-delete" aria-label={`テキスト${number}を削除`} disabled={blocked || dragging} onPointerDown={event => event.stopPropagation()} onClick={() => onRemove(note.id)}>×</button>
    </div>
    <textarea aria-label={`テキスト${number}の内容`} placeholder="ここに文字を入力" value={note.text} readOnly={readOnly}
      ref={element => { if (element && focusId.current === note.id) { focusId.current = null; element.focus({ preventScroll: true }); } }}
      onPointerDown={event => { if (!readOnly) event.stopPropagation(); }} onFocus={() => onFocus(note.id)} onBlur={onBlur} onChange={event => onEdit(note.id, event.target.value)} />
  </section>;
}
