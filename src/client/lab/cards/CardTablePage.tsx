import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { navigate } from "../../lib/router";
import { CARD_SIZE, SUIT_SYMBOLS, bringToFront, cardLabel, clampPosition, createCardTable, drawCard, flipCard, moveCard, rankLabel, type Point, type TableCard } from "./model";
import "./cards.css";

interface Drag { id: string; pointerId: number; grab: Point; origin: Point; moved: boolean }
function CardFace({ card }: { card: TableCard }) {
  if (!card.faceUp) return <span className="lab-card-back" aria-hidden="true"><span>◇</span></span>;
  const symbol = SUIT_SYMBOLS[card.suit], rank = card.suit === "joker" ? "JK" : rankLabel(card.rank);
  return <span className={`lab-card-face ${card.suit === "hearts" || card.suit === "diamonds" ? "lab-card-red" : ""}`} aria-hidden="true">
    <span className="lab-card-corner">{rank}<small>{symbol}</small></span>
    <span className="lab-card-symbol">{symbol}</span>
    {card.suit === "joker" && <span className="lab-joker-label">JOKER {card.rank}</span>}
    <span className="lab-card-corner lab-card-corner-bottom">{rank}<small>{symbol}</small></span>
  </span>;
}

export default function CardTablePage() {
  const [table, setTable] = useState(createCardTable);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState("山札から1枚引いて始めましょう。");
  const world = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null);
  const selected = table.items.find(item => item.id === selectedId);
  function bounds() { return { width: world.current?.clientWidth ?? 960, height: world.current?.clientHeight ?? 640 }; }
  function select(id: string) { setSelectedId(id); setTable(previous => bringToFront(previous, id)); }
  function draw() {
    if (!table.drawPile.length || drag.current) return;
    const view = viewport.current, count = table.items.length;
    const position = clampPosition({ x: (view?.scrollLeft ?? 0) + 24 + (count % 5) * 26, y: (view?.scrollTop ?? 0) + 28 + (Math.floor(count / 5) % 3) * 30 }, bounds());
    const id = table.drawPile[0]!.id;
    setTable(previous => drawCard(previous, position)); setSelectedId(id);
    setMessage("1枚引きました。カードをドラッグして配置できます。");
  }
  function flip() {
    if (!selected || drag.current) return;
    setTable(previous => flipCard(previous, selected.id));
    setMessage(selected.faceUp ? "選択したカードを裏向きにしました。" : "選択したカードを表向きにしました。");
  }
  function nudge(x: number, y: number) {
    if (!selected || drag.current) return;
    const position = clampPosition({ x: selected.position.x + x, y: selected.position.y + y }, bounds());
    setTable(previous => moveCard(previous, selected.id, position));
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, card: TableCard) {
    if (event.button !== 0 || !event.isPrimary || drag.current || !world.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    const rect = world.current.getBoundingClientRect();
    drag.current = { id: card.id, pointerId: event.pointerId, grab: { x: event.clientX - rect.left - card.position.x, y: event.clientY - rect.top - card.position.y }, origin: card.position, moved: false };
    // Capture on the stable canvas: raising a card may reorder its DOM node.
    world.current.setPointerCapture(event.pointerId); select(card.id); setDragging(card.id);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || !world.current) return;
    const rect = world.current.getBoundingClientRect();
    const position = clampPosition({ x: event.clientX - rect.left - active.grab.x, y: event.clientY - rect.top - active.grab.y }, bounds());
    if (Math.abs(position.x - active.origin.x) + Math.abs(position.y - active.origin.y) > 2) active.moved = true;
    setTable(previous => moveCard(previous, active.id, position));
  }
  function finishDrag(cancelled: boolean) {
    const active = drag.current;
    if (!active) return;
    drag.current = null; setDragging(null);
    if (cancelled) setTable(previous => moveCard(previous, active.id, active.origin));
    if (world.current?.hasPointerCapture(active.pointerId)) world.current.releasePointerCapture(active.pointerId);
    setMessage(cancelled ? "移動をキャンセルしました。" : active.moved ? "カードを移動しました。" : "カードを選択しました。");
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (event.ctrlKey || event.metaKey || event.altKey || target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (event.key === "Escape") { event.preventDefault(); finishDrag(true); setSelectedId(null); return; }
    if (event.key.toLowerCase() === "d" && !event.repeat) { event.preventDefault(); draw(); return; }
    if (event.key.toLowerCase() === "f" && selected && !event.repeat) { event.preventDefault(); flip(); return; }
    const directions: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const direction = directions[event.key];
    if (direction && selected) { event.preventDefault(); const step = event.shiftKey ? 24 : 8; nudge(direction.x * step, direction.y * step); }
  }
  return <section className="lab-table" onKeyDown={keyDown} aria-label="トランプ自由配置ツール">
    <button className="text-button lab-back" onClick={() => navigate("/solo/lab")}>← 検討用へ</button>
    <header className="lab-heading"><div><p className="eyebrow">CARD WORKBENCH</p><h1>トランプ自由配置</h1></div><span className="lab-phase">フェーズ1</span></header>
    <p className="lab-intro">引く、動かす、裏返す。ルールのない試作テーブル。</p>
    <div className="lab-toolbar">
      <div className="lab-deck"><span className="lab-deck-icon" aria-hidden="true">◇</span><div><strong>山札 <output data-testid="deck-count">{table.drawPile.length}</output>枚</strong><small>52枚＋ジョーカー2枚</small></div><button className="primary-button" onClick={draw} disabled={!table.drawPile.length || !!dragging}>1枚引く</button></div>
      <div className="lab-selection"><span className="lab-selection-label">{selected ? `${selected.faceUp ? cardLabel(selected) : "裏向きのカード"} · ${selected.faceUp ? "表" : "裏"}` : "カード未選択"}</span>
        <div className="lab-card-actions"><button className="secondary-button" onClick={flip} disabled={!selected || !!dragging}>裏返す</button><button className="secondary-button" onClick={() => setSelectedId(null)} disabled={!selected || !!dragging}>選択解除</button></div>
      </div>
      <div className="lab-nudge" role="group" aria-label="選択カードを少し動かす">{([["←", -8, 0, "左"], ["↑", 0, -8, "上"], ["↓", 0, 8, "下"], ["→", 8, 0, "右"]] as const).map(([symbol, x, y, name]) => <button key={name} onClick={() => nudge(x, y)} disabled={!selected || !!dragging} aria-label={`${name}へ移動`}>{symbol}</button>)}</div>
    </div>
    <div className="lab-board-meta"><span>自由配置盤面</span><span>配置済み <output data-testid="table-count">{table.items.length}</output>枚</span></div>
    <div className="lab-viewport" ref={viewport} role="region" aria-label="自由配置盤面" tabIndex={0}>
      <div ref={world} className="lab-world" data-testid="card-canvas" onPointerDown={event => { if (event.target === event.currentTarget && !drag.current) setSelectedId(null); }} onPointerMove={moveDrag} onPointerUp={event => { if (event.pointerId === drag.current?.pointerId) finishDrag(false); }} onPointerCancel={event => { if (event.pointerId === drag.current?.pointerId) finishDrag(true); }} onLostPointerCapture={() => finishDrag(true)}>
        {!table.items.length && <div className="lab-board-empty" aria-hidden="true"><span>＋</span>山札から1枚引いてみましょう<small>グリッドに関係なく、好きな位置へ動かせます</small></div>}
        {table.items.map((card, index) => <button key={card.id} type="button" className={`lab-card ${selectedId === card.id ? "lab-card-selected" : ""} ${dragging === card.id ? "lab-card-dragging" : ""}`} data-card-id={card.id} data-face-up={card.faceUp} data-x={card.position.x} data-y={card.position.y}
          style={{ width: CARD_SIZE.width, height: CARD_SIZE.height, left: card.position.x, top: card.position.y, zIndex: index + 1 }} aria-label={card.faceUp ? `${cardLabel(card)}（表向き）` : "カード（裏向き）"} aria-pressed={selectedId === card.id}
          onPointerDown={event => startDrag(event, card)} onClick={() => select(card.id)} draggable={false}><CardFace card={card} /></button>)}
      </div>
    </div>
    <p className="lab-status" role="status">{message}</p>
    <details className="lab-guide"><summary>操作ガイド・ショートカット</summary><dl>
      <div><dt>左クリック／タップ</dt><dd>カードを選択。空白で選択解除</dd></div><div><dt>左ドラッグ</dt><dd>カードを自由に移動。選択したカードは最前面へ</dd></div>
      <div><dt>D ／ F</dt><dd>1枚引く ／ 選択カードを裏返す</dd></div><div><dt>矢印キー</dt><dd>8px移動。Shift併用で24px移動</dd></div><div><dt>Esc</dt><dd>ドラッグをキャンセルし、選択解除</dd></div>
      <div><dt>小さい画面</dt><dd>盤面内をスクロール。カードはタップ・ドラッグでも操作可能</dd></div>
    </dl><p>山札はスート・数字順で、引いたカードは表向きです。重ね置きはできますが、束にはなりません。</p></details>
    <p className="lab-limit">この段階では保存・Undoはありません。画面を離れる、または再読み込みすると初期状態に戻ります。</p>
  </section>;
}
