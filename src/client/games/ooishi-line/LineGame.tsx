import { useEffect, useRef, useState } from "react";
import { legalLineActions, type LineAction, type LineDisplayState } from "../../../games/ooishi-line/engine";
import type { LineSeat, LineStoneSize } from "../../../games/ooishi-line/position";
import { STONE_SIZE_NAMES, StoneBar, StackView, PlayerColor } from "../shared/StackedStones";
import "./line.css";

type Selection = { type: "PLACE"; size: LineStoneSize } | { type: "MOVE"; from: number; layer: number };
const coordinate = (index: number) => String.fromCharCode(65 + index % 4) + (Math.floor(index / 4) + 1);
const SIZES = ["large", "medium", "small"] as const;

export function LineRules() {
  return <details className="line-rules"><summary>遊び方と石の動かし方</summary>
    <p>自分の手番では、手持ちから1石を置くか、盤上の自分の石を移動します。</p>
    <ul><li>大石は空きマス、中石は大石の上、小石は中石の上。相手の石の上にも重ねられます。</li>
      <li>盤上の自分の石を選ぶと、その石と上のすべての石を一緒に運びます。下の石は元のマスに残ります。</li>
      <li>移動先は盤面内の任意の合法マス。運ぶ石の最下段で、配置と同じサイズ条件を判定します。</li>
      <li>一番上が自分の大・中・小になる縦か横の連続3マスを作れば勝利。順番は自由、斜めは無効です。</li>
      <li>両者同時にラインができた場合と、同一局面が3回現れた場合は引き分けです。</li></ul>
  </details>;
}

export function LineGame({ state, humanSeat = 0, onAction, onRestart, onExit, error = null, opponentName = "NPC", opponentIsNpc = true, disabled = false, connectionMessage = null, canRestart = true, exitLabel = "設定に戻る" }: {
  state: LineDisplayState; humanSeat?: LineSeat; onAction: (action: LineAction) => void;
  onRestart: () => void; onExit: () => void; error?: string | null; opponentName?: string; opponentIsNpc?: boolean; disabled?: boolean; connectionMessage?: string | null; canRestart?: boolean; exitLabel?: string;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [destination, setDestination] = useState<number | null>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const myTurn = !disabled && state.phase === "PLAYING" && state.position.nextSeat === humanSeat;
  const legal = myTurn ? legalLineActions(state) : [];
  const selectedActions = legal.filter(action => selection && action.type === selection.type &&
    (action.type === "PLACE" ? selection.type === "PLACE" && action.size === selection.size :
      selection.type === "MOVE" && action.from === selection.from && action.layer === selection.layer));
  const destinations = new Set(selectedActions.map(action => action.to));
  const moving = selection?.type === "MOVE" ? state.position.board[selection.from]!.slice(selection.layer) : [];
  const enemy: LineSeat = humanSeat === 0 ? 1 : 0;

  useEffect(() => { setSelection(null); setDestination(null); }, [state, disabled]);
  useEffect(() => { if (destination !== null) confirm.current?.focus({ preventScroll: true }); }, [destination]);

  function chooseDestination(cell: number) {
    if (!myTurn) return;
    const action = selectedActions.find(candidate => candidate.to === cell);
    if (!action) return;
    if (action.type === "PLACE") onAction(action);
    else setDestination(cell);
  }
  function chooseStone(cell: number, layer: number) {
    if (!myTurn) return;
    if (destinations.has(cell)) { chooseDestination(cell); return; }
    if (state.position.board[cell]![layer]?.owner !== humanSeat) return;
    setSelection({ type: "MOVE", from: cell, layer }); setDestination(null);
  }

  const resultTitle = state.result?.kind === "WIN" ? state.result.winner === humanSeat ? "あなたの勝利！" : opponentName + "の勝利" : "引き分け";
  return <section className="line-game" data-game-id="ooishi-line" data-phase={state.phase} data-ply={state.ply}>
    <header className="line-heading"><div><span className="line-eyebrow">OOISHI SERIES</span><h1>大石のライン</h1></div>
      <button type="button" className="line-quiet-button" onClick={onExit}>{exitLabel}</button></header>
    <div className="line-players"><span><PlayerColor owner={humanSeat} />あなた</span>
      <span className="line-versus">VS</span><span><PlayerColor owner={enemy} />{opponentName}</span>
      <small>{state.ply}手目まで進行</small></div>
    <div className={"line-status" + (myTurn ? " line-status--yours" : "")} role="status" aria-live="polite" aria-label="現在の手番">
      {state.phase === "FINISHED" ? "対局終了" : connectionMessage ?? (disabled ? "送信中…" : myTurn ? "あなたの手番" : opponentIsNpc ? "NPCが考えています…" : opponentName + "の手番")}
    </div>
    {error && <p className="error-box" role="alert">{error}</p>}

    {state.result && <section className="line-result" aria-label="対局結果"><h2>{resultTitle}</h2>
      <p>{state.result.kind === "WIN" ? "表面に大・中・小のラインが完成しました。" :
        state.result.reason === "SIMULTANEOUS_LINES" ? "両者のラインが同時に完成しました。" : "同じ局面が3回現れました。"}</p>
      {canRestart ? <button type="button" className="primary-button" disabled={disabled} onClick={onRestart}>もう一度遊ぶ</button> : <p>ホストが再戦を開始できます。</p>}</section>}

    <div className="line-reserves" aria-label="あなたの手持ち">
      {SIZES.map(size => <button type="button" key={size} aria-label={STONE_SIZE_NAMES[size] + "石を選択 残り" + state.position.hands[humanSeat][size]}
        aria-pressed={selection?.type === "PLACE" && selection.size === size}
        disabled={!myTurn || !legal.some(action => action.type === "PLACE" && action.size === size)}
        onClick={() => { setSelection({ type: "PLACE", size }); setDestination(null); }}>
        <StoneBar size={size} owner={humanSeat} /><span>{STONE_SIZE_NAMES[size]}石 <b>×{state.position.hands[humanSeat][size]}</b></span>
      </button>)}
    </div>
    <p className="line-instruction" aria-live="polite">{state.phase === "FINISHED" ? "盤面を見ながら、対局を振り返ってみましょう。" : !myTurn ? "盤面の変化を見ながら、次の手を考えましょう。" :
      selection?.type === "PLACE" ? STONE_SIZE_NAMES[selection.size] + "石の配置先をタップしてください。" :
      selection?.type === "MOVE" ? "選んだ石から上の" + moving.length + "石を運びます。移動先を選んでください。" : "手持ちの石か、盤上の自分の石を選んでください。"}</p>

    <div className="line-board" role="group" aria-label="4×4の盤面">
      {state.position.board.map((stack, cell) => <div key={cell} data-cell={cell}
        className={"line-cell" + (destinations.has(cell) ? " line-cell--legal" : "") + (destination === cell ? " line-cell--destination" : "")}
        role="group" aria-label={coordinate(cell)}>
        <span className="line-coordinate" aria-hidden="true">{coordinate(cell)}</span>
        <button type="button" className="line-destination" disabled={!destinations.has(cell)}
          aria-label={coordinate(cell) + (selection?.type === "MOVE" ? "へ移動" : selection?.type === "PLACE" ? "に" + STONE_SIZE_NAMES[selection.size] + "石を配置" : " 空きマス")}
          onClick={() => chooseDestination(cell)}>{destinations.has(cell) && !stack.length && <span aria-hidden="true">＋</span>}</button>
        <StackView stones={stack} selectedLayer={selection?.type === "MOVE" && selection.from === cell ? selection.layer : null}
          destinationActive={destinations.has(cell)} canSelect={piece => myTurn && piece.owner === humanSeat}
          describeStone={(piece, layer) => coordinate(cell) + " " + (layer + 1) + "段目 " + (piece.owner === humanSeat ? "あなた" : opponentName) + "の" + STONE_SIZE_NAMES[piece.size] + "石"}
          onSelect={layer => chooseStone(cell, layer)} />
      </div>)}
    </div>

    {myTurn && selection?.type === "MOVE" && destination !== null && <div className="line-confirm" aria-label="移動の確認">
      <div><strong>{coordinate(selection.from)} → {coordinate(destination)}</strong><span>上の石も含めて{moving.length}石を移動</span></div>
      <button type="button" className="line-quiet-button" onClick={() => setDestination(null)}>戻る</button>
      <button type="button" className="primary-button" ref={confirm} onClick={() => {
        const action = selectedActions.find(candidate => candidate.to === destination);
        if (action) onAction(action);
      }}>移動を確定</button>
    </div>}
    {myTurn && selection && <button type="button" className="line-quiet-button line-clear" onClick={() => { setSelection(null); setDestination(null); }}>選択を解除</button>}
    <p className="line-enemy-hand">{opponentName}の手持ち：大{state.position.hands[enemy].large}・中{state.position.hands[enemy].medium}・小{state.position.hands[enemy].small}</p>
    <LineRules />
  </section>;
}
