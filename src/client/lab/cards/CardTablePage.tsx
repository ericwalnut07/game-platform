import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { navigate } from "../../lib/router";
import { CARD_SIZE, SUIT_SYMBOLS, bringToFront, cardLabel, clampPosition, createCardTable, drawCards, flipCard, moveCard, addDeck, returnCard, shufflePile, rankLabel, type Point, type TableCard } from "./model";
import { WORLD_SIZE, clampZoom, drawPositions, zoomScroll } from "./view";
import "./cards.css";

interface Pan { pointerId: number; client: Point; scroll: Point; moved: boolean }
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
  const [zoom, setZoom] = useState(1);
  const [panMode, setPanMode] = useState(false), [panning, setPanning] = useState(false);
  const [drawCount, setDrawCount] = useState("5");
  const [placement, setPlacement] = useState<"stack" | "spread">("spread");
  const pan = useRef<Pan | null>(null), pendingScroll = useRef<Point | null>(null);
  const [message, setMessage] = useState("山札から1枚引いて始めましょう。");
  const world = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null);
  const selected = table.items.find(item => item.id === selectedId);
  const busy = !!dragging || panning;
  const batchCount = Number(drawCount);
  const validCount = Number.isInteger(batchCount) && batchCount > 0 && batchCount <= table.drawPile.length;
  useLayoutEffect(() => {
    const next = pendingScroll.current;
    if (next && viewport.current) {
      viewport.current.scrollLeft = next.x; viewport.current.scrollTop = next.y;
      pendingScroll.current = null;
    }
  }, [zoom]);
  function bounds() { return WORLD_SIZE; }
  function changeZoom(nextValue: number) {
    const view = viewport.current;
    if (!view || drag.current || pan.current) return;
    const next = clampZoom(nextValue);
    if (next === zoom) return;
    pendingScroll.current = zoomScroll({ x: view.scrollLeft, y: view.scrollTop }, { x: view.clientWidth / 2, y: view.clientHeight / 2 }, zoom, next);
    setZoom(next);
  }
  function resetView() {
    if (drag.current || pan.current || !viewport.current) return;
    if (zoom === 1) { viewport.current.scrollLeft = 0; viewport.current.scrollTop = 0; }
    else { pendingScroll.current = { x: 0, y: 0 }; setZoom(1); }
    setMessage("表示位置と拡大率をリセットしました。");
  }
  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || drag.current || pan.current || !viewport.current) return;
    if (event.button !== 0 && event.button !== 1) return;
    if (event.button === 0 && !panMode && (event.target as HTMLElement).closest(".lab-card")) return;
    event.preventDefault();
    const view = viewport.current;
    view.focus({ preventScroll: true });
    pan.current = { pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY }, scroll: { x: view.scrollLeft, y: view.scrollTop }, moved: false };
    view.setPointerCapture(event.pointerId); setPanning(true);
  }
  function movePan(event: PointerEvent<HTMLDivElement>) {
    const active = pan.current, view = viewport.current;
    if (!active || active.pointerId !== event.pointerId || !view) return;
    const dx = event.clientX - active.client.x, dy = event.clientY - active.client.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) active.moved = true;
    view.scrollLeft = active.scroll.x - dx; view.scrollTop = active.scroll.y - dy;
  }
  function finishPan(cancelled: boolean) {
    const active = pan.current, view = viewport.current;
    if (!active) return;
    pan.current = null; setPanning(false);
    if (cancelled && view) { view.scrollLeft = active.scroll.x; view.scrollTop = active.scroll.y; }
    if (view?.hasPointerCapture(active.pointerId)) view.releasePointerCapture(active.pointerId);
    if (!active.moved && !cancelled && !panMode) setSelectedId(null);
  }
  function select(id: string) { setSelectedId(id); setTable(previous => bringToFront(previous, id)); }
  function draw(count = 1) {
    if (!Number.isInteger(count) || count <= 0 || count > table.drawPile.length || drag.current || pan.current) return;
    const view = viewport.current, offset = count === 1 ? table.items.length % 5 * 26 : 0;
    const start = { x: (view?.scrollLeft ?? 0) / zoom + 24 + offset, y: (view?.scrollTop ?? 0) / zoom + 28 };
    const positions = drawPositions(count, count === 1 ? "stack" : placement, start, { width: (view?.clientWidth ?? 960) / zoom, height: (view?.clientHeight ?? 640) / zoom });
    setSelectedId(table.drawPile[count - 1]!.id);
    setTable(previous => drawCards(previous, positions));
    setMessage(`${count}枚引きました。${count > 1 ? placement === "stack" ? "重ねて配置しました（束ではありません）。" : "並べて配置しました。" : "カードをドラッグして配置できます。"}`);
  }
  function add() {
    if (drag.current || pan.current) return;
    setTable(previous => addDeck(previous));
    setMessage("54枚のデッキを山札の末尾に追加しました。");
  }
  function shuffle() {
    if (drag.current || pan.current) return;
    setTable(previous => shufflePile(previous));
    setMessage("山札をシャッフルしました。配置済みのカードはそのままです。");
  }
  function putBack() {
    if (!selected || drag.current || pan.current) return;
    setTable(previous => returnCard(previous, selected.id)); setSelectedId(null);
    setMessage("選択したカードを山札の一番上へ戻しました。引き直すと表向きになります。");
  }
  function flip() {
    if (!selected || drag.current || pan.current) return;
    setTable(previous => flipCard(previous, selected.id));
    setMessage(selected.faceUp ? "選択したカードを裏向きにしました。" : "選択したカードを表向きにしました。");
  }
  function nudge(x: number, y: number) {
    if (!selected || drag.current || pan.current) return;
    const position = clampPosition({ x: selected.position.x + x, y: selected.position.y + y }, bounds());
    setTable(previous => moveCard(previous, selected.id, position));
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, card: TableCard) {
    if (event.button !== 0 || !event.isPrimary || panMode || drag.current || pan.current || !world.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true });
    const rect = world.current.getBoundingClientRect();
    drag.current = { id: card.id, pointerId: event.pointerId, grab: { x: (event.clientX - rect.left) / zoom - card.position.x, y: (event.clientY - rect.top) / zoom - card.position.y }, origin: card.position, moved: false };
    // Capture on the stable canvas: raising a card may reorder its DOM node.
    world.current.setPointerCapture(event.pointerId); select(card.id); setDragging(card.id);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || !world.current) return;
    const rect = world.current.getBoundingClientRect();
    const position = clampPosition({ x: (event.clientX - rect.left) / zoom - active.grab.x, y: (event.clientY - rect.top) / zoom - active.grab.y }, bounds());
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
    if (event.key === "Escape") { event.preventDefault(); finishDrag(true); finishPan(true); setSelectedId(null); return; }
    if (event.key.toLowerCase() === "d" && !event.repeat) { event.preventDefault(); draw(); return; }
    if (event.key.toLowerCase() === "f" && selected && !event.repeat) { event.preventDefault(); flip(); return; }
    const directions: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const direction = directions[event.key];
    if (direction && selected) { event.preventDefault(); const step = event.shiftKey ? 24 : 8; nudge(direction.x * step, direction.y * step); }
  }
  return <section className="lab-table" onKeyDown={keyDown} aria-label="トランプ自由配置ツール">
    <button className="text-button lab-back" onClick={() => navigate("/solo/lab")}>← 検討用へ</button>
    <header className="lab-heading"><div><p className="eyebrow">CARD WORKBENCH</p><h1>トランプ自由配置</h1></div><span className="lab-phase">フェーズ2</span></header>
    <p className="lab-intro">引く、動かす、裏返す。ルールのない試作テーブル。</p>
    <div className="lab-toolbar">
      <div className="lab-deck"><span className="lab-deck-icon" aria-hidden="true">◇</span><div><strong>山札 <output data-testid="deck-count">{table.drawPile.length}</output>枚</strong><small><output data-testid="deck-total">{table.deckCount}</output>デッキ · 1組54枚</small></div><button className="primary-button" onClick={() => draw()} disabled={!table.drawPile.length || busy}>1枚引く</button></div>
      <div className="lab-deck-actions"><button className="secondary-button" onClick={add} disabled={busy}>デッキ追加</button><button className="secondary-button" onClick={shuffle} disabled={table.drawPile.length < 2 || busy}>山札をシャッフル</button></div>
      <div className="lab-batch"><label>取り出す枚数<input aria-label="取り出す枚数" type="number" inputMode="numeric" min="1" max={table.drawPile.length} step="1" value={drawCount} onChange={event => setDrawCount(event.target.value)} disabled={busy} /></label><label>配置方法<select aria-label="配置方法" value={placement} onChange={event => setPlacement(event.target.value as "stack" | "spread")} disabled={busy}><option value="spread">並べて配置</option><option value="stack">重ねて配置</option></select></label><button className="secondary-button" onClick={() => draw(batchCount)} disabled={!validCount || busy}>指定枚数を引く</button></div>
      <div className="lab-selection"><span className="lab-selection-label">{selected ? `${selected.faceUp ? cardLabel(selected) : "裏向きのカード"} · ${selected.faceUp ? "表" : "裏"}` : "カード未選択"}</span>
        <div className="lab-card-actions"><button className="secondary-button" onClick={flip} disabled={!selected || busy}>裏返す</button><button className="secondary-button" onClick={putBack} disabled={!selected || busy}>山札へ戻す</button><button className="secondary-button" onClick={() => setSelectedId(null)} disabled={!selected || busy}>選択解除</button></div>
      </div>
      <div className="lab-nudge" role="group" aria-label="選択カードを少し動かす">{([["←", -8, 0, "左"], ["↑", 0, -8, "上"], ["↓", 0, 8, "下"], ["→", 8, 0, "右"]] as const).map(([symbol, x, y, name]) => <button key={name} onClick={() => nudge(x, y)} disabled={!selected || busy} aria-label={`${name}へ移動`}>{symbol}</button>)}</div>
    </div>
    <div className="lab-view-controls" role="group" aria-label="盤面の表示操作">
      <button className="secondary-button" onClick={() => changeZoom(zoom - 0.25)} disabled={zoom <= 0.25 || busy} aria-label="盤面を縮小">−</button>
      <output data-testid="zoom-level">{Math.round(zoom * 100)}%</output>
      <button className="secondary-button" onClick={() => changeZoom(zoom + 0.25)} disabled={zoom >= 2 || busy} aria-label="盤面を拡大">＋</button>
      <button className="secondary-button" onClick={resetView} disabled={busy}>表示リセット</button>
      <button className="secondary-button" onClick={() => setPanMode(previous => !previous)} aria-pressed={panMode} disabled={busy}>盤面移動モード</button>
      <small>空白ドラッグで盤面移動 · モードONでカード上からも移動</small>
    </div>
    <div className="lab-board-meta"><span>自由配置盤面</span><span>配置済み <output data-testid="table-count">{table.items.length}</output>枚</span></div>
    <div className={`lab-viewport ${panMode ? "lab-pan-mode" : ""} ${panning ? "lab-panning" : ""}`} ref={viewport} role="region" aria-label="自由配置盤面" tabIndex={0}
      onPointerDown={startPan} onPointerMove={movePan} onPointerUp={event => { if (event.pointerId === pan.current?.pointerId) finishPan(false); }}
      onPointerCancel={event => { if (event.pointerId === pan.current?.pointerId) finishPan(true); }} onLostPointerCapture={event => { if (event.pointerId === pan.current?.pointerId) finishPan(true); }}>
      <div className="lab-stage" style={{ width: WORLD_SIZE.width * zoom, height: WORLD_SIZE.height * zoom }}>
      <div ref={world} className="lab-world" data-testid="card-canvas" data-zoom={zoom} style={{ width: WORLD_SIZE.width, height: WORLD_SIZE.height, transform: `scale(${zoom})` }} onPointerMove={moveDrag} onPointerUp={event => { if (event.pointerId === drag.current?.pointerId) finishDrag(false); }} onPointerCancel={event => { if (event.pointerId === drag.current?.pointerId) finishDrag(true); }} onLostPointerCapture={() => finishDrag(true)}>
        {!table.items.length && <div className="lab-board-empty" aria-hidden="true"><span>＋</span>山札から1枚引いてみましょう<small>グリッドに関係なく、好きな位置へ動かせます</small></div>}
        {table.items.map((card, index) => <button key={card.id} type="button" className={`lab-card ${selectedId === card.id ? "lab-card-selected" : ""} ${dragging === card.id ? "lab-card-dragging" : ""}`} data-card-id={card.id} data-face-up={card.faceUp} data-x={card.position.x} data-y={card.position.y}
          style={{ width: CARD_SIZE.width, height: CARD_SIZE.height, left: card.position.x, top: card.position.y, zIndex: index + 1 }} aria-label={card.faceUp ? `${cardLabel(card)}（表向き）` : "カード（裏向き）"} aria-pressed={selectedId === card.id}
          onPointerDown={event => startDrag(event, card)} onClick={() => { if (!panMode && !pan.current) select(card.id); }} draggable={false}><CardFace card={card} /></button>)}
      </div>
      </div>
    </div>
    <p className="lab-status" role="status">{message}</p>
    <details className="lab-guide"><summary>操作ガイド・ショートカット</summary><dl>
      <div><dt>左クリック／タップ</dt><dd>カードを選択。空白で選択解除</dd></div><div><dt>左ドラッグ</dt><dd>カードを自由に移動。選択したカードは最前面へ</dd></div>
      <div><dt>D ／ F</dt><dd>1枚引く ／ 選択カードを裏返す</dd></div><div><dt>矢印キー</dt><dd>8px移動。Shift併用で24px移動</dd></div><div><dt>Esc</dt><dd>ドラッグをキャンセルし、選択解除</dd></div>
      <div><dt>盤面移動・拡大縮小</dt><dd>空白をドラッグ、または盤面移動モード。＋／−で拡大縮小、表示リセットで初期表示へ</dd></div>
    </dl><p>デッキはスート・数字順で山札に追加され、引いたカードは表向きです。シャッフルは山札だけが対象です。重ねて配置しても束にはならず、1枚ずつ動かせます。小画面でもボタンで操作できます。</p></details>
    <p className="lab-limit">この段階では保存・Undoはありません。画面を離れる、または再読み込みすると初期状態に戻ります。</p>
  </section>;
}
