import { useEffect, useState } from "react";
import { legalCaravanMoves, type CaravanAction, type CaravanMove, type CaravanSeat, type CaravanState } from "../../../games/ooishi-caravan/engine";
import { LINE_SIZE_NAMES, StoneBar } from "../ooishi-line/StoneBar";
import "../ooishi-line/line.css";
import { DiceFace } from "./DiceFace";
import "./caravan.css";

const POINTS = Array.from({ length: 10 }, (_, row) => [10 - row, 11 + row]).flat();
type Selected = { from: number; layer: number; snapshot: CaravanState };
export function CaravanRules() {
  return <details className="caravan-rules"><summary>遊び方</summary>
    <p>20ポイントの道を進み、21へぴったり到達するとゴール。自分の大2・中3・小3、全8石のゴールを目指します。</p>
    <ul><li>毎手番サイコロ2個。出目は好きな順で使え、同じ石を2回動かせます。ゾロ目も2回分です。</li>
      <li>自分の石を選ぶと、その石と上の敵味方すべての石を一緒に運びます。下の石は元の場所に残ります。</li>
      <li>運ぶ最下段が大なら空き、中なら空きか大の上、小なら空きか大・中の上へ着地できます。下側の所有者は問いません。</li>
      <li>残りの出目を使える石がなければ自動でパスします。ゴールを超える出目は使えません。</li>
      <li>混成塔でゴールした石もそれぞれの所有者に加算。同じ移動で両者8石なら引き分けです。</li></ul>
  </details>;
}

export function CaravanGame({ state, humanSeat = 0, onAction, onRestart, onExit, notice = "", error = null, disabled = false }: {
  state: CaravanState; humanSeat?: CaravanSeat; onAction: (action: CaravanAction) => void;
  onRestart: () => void; onExit: () => void; notice?: string; error?: string | null; disabled?: boolean;
}) {
  const [picked, setSelection] = useState<Selected | null>(null);
  // Props can advance before effects run. Never render or commit the old pick.
  const selection = picked?.snapshot === state ? picked : null;
  const [die, setDie] = useState<0 | 1 | null>(null);
  const [pendingPick, setPending] = useState<CaravanMove | null>(null);
  const pending = selection ? pendingPick : null;
  const myTurn = !disabled && state.phase !== "FINISHED" && state.currentSeat === humanSeat;
  const legal = myTurn ? legalCaravanMoves(state) : [];
  const selectedMove = selection && die !== null ? legal.find(move => move.from === selection.from && move.layer === selection.layer && move.die === die) : undefined;
  const destination = selectedMove ? selectedMove.from + state.dice![selectedMove.die].value : null;
  const enemy: CaravanSeat = humanSeat === 0 ? 1 : 0;
  const moving = selection ? state.board[selection.from - 1]!.slice(selection.layer) : [];

  useEffect(() => {
    setSelection(null); setPending(null);
    setDie(state.currentSeat === humanSeat && state.phase === "MOVING" ? legalCaravanMoves(state)[0]?.die ?? null : null);
  }, [state, humanSeat, disabled]);

  function chooseStone(from: number, layer: number) {
    const candidates = legal.filter(move => move.from === from && move.layer === layer);
    if (!candidates.length) return;
    setSelection({ from, layer, snapshot: state }); setPending(null);
    if (die === null || !candidates.some(move => move.die === die)) setDie(candidates[0]!.die);
  }
  function chooseDestination(point: number) {
    if (!myTurn || !selectedMove || destination !== point) return;
    setPending(selectedMove);
  }
  const finished = state.phase === "FINISHED";
  const resultTitle = state.result?.kind === "WIN" ? state.result.winner === humanSeat ? "あなたの勝利！" : "NPCの勝利" : "引き分け";
  return <section className="caravan-game" data-game-id="ooishi-caravan" data-phase={state.phase} data-moves={state.moveCount} data-turn={state.turnNumber}>
    <header className="caravan-heading"><div><span>OOISHI SERIES</span><h1>大石のキャラバン</h1></div><button type="button" className="caravan-quiet" onClick={onExit}>設定に戻る</button></header>
    {error && <p className="error-box" role="alert">{error}</p>}
    {finished && <section className="caravan-result" aria-label="対局結果"><h2>{resultTitle}</h2><p>{state.result?.kind === "DRAW" ? "両者の8石が同じ移動でゴールしました。" : "全8石がゴールしました。"}</p><button type="button" className="primary-button" onClick={onRestart}>もう一度遊ぶ</button></section>}
    <div className="caravan-layout">
      <aside className="caravan-controls" aria-label="手番と操作">
        <div className="caravan-status" role="status" aria-label="現在の手番" aria-live="polite">{finished ? "対局終了" : disabled ? "操作を待っています…" : myTurn ? "あなたの手番" : "NPCが考えています…"}</div>
        <small>第{state.turnNumber}手番</small>
        <div className="caravan-dice" aria-label="サイコロ2個">{([0, 1] as const).map(index => {
          const item = state.dice?.[index];
          const status = !item ? "未ロール" : item.status === "USED" ? "使用済み" : item.status === "PASSED" ? "パス" : "未使用";
          return <button type="button" key={index} data-die={index} aria-label={`${index + 1}個目の出目 ${item?.value ?? "未ロール"} ${status}`} aria-pressed={die === index}
            disabled={!myTurn || state.phase !== "MOVING" || !legal.some(move => move.die === index)}
            onClick={() => { setDie(index); setPending(null); }}>
            <DiceFace value={item?.value ?? null} /><span>{status}</span>
          </button>;
        })}</div>
        <button type="button" className="caravan-roll" disabled={!myTurn || state.phase !== "AWAITING_ROLL"} onClick={() => onAction({ type: "ROLL" })}>サイコロをふる</button>
        <div className="caravan-scores" aria-label="ゴール済みの石">
          <span><i className={"caravan-color line-owner--" + humanSeat} />あなた<strong>{state.goaled[humanSeat].length}/8</strong></span>
          <span><i className={"caravan-color line-owner--" + enemy} />NPC<strong>{state.goaled[enemy].length}/8</strong></span>
        </div>
        <div className="caravan-selection" aria-label="選択中の石" aria-live="polite">
          {selection ? <><strong>{selection.from}・{selection.layer + 1}段目の{LINE_SIZE_NAMES[state.board[selection.from - 1]![selection.layer]!.size]}石</strong><span>上の石も含めて{moving.length}石</span></> : <span>{myTurn && state.phase === "MOVING" ? "自分の石を選んでください" : myTurn ? "サイコロをふってください" : "盤面を見ながら次の手を考えましょう"}</span>}
        </div>
        {selection && <div className="caravan-move-info" aria-label="移動情報">{destination ? <strong>{selection.from} → {destination === 21 ? "ゴール21" : destination}</strong> : "この出目では移動できません"}</div>}
        {myTurn && selectedMove && <p className="caravan-hint">{pending ? "内容を確認して確定" : "光る移動先をタップ"}</p>}
        {myTurn && pending && <div className="caravan-confirm" aria-label="移動の確認"><button type="button" className="caravan-roll" onClick={() => onAction(pending)}>移動を確定</button><button type="button" className="caravan-quiet" onClick={() => setPending(null)}>戻る</button></div>}
        {myTurn && selection && <button type="button" className="caravan-clear" onClick={() => { setSelection(null); setPending(null); }}>選択を解除</button>}
        {notice && <p className="caravan-notice" role="status" aria-label="直前の操作">{notice}</p>}
      </aside>
      <div className="caravan-track" role="group" aria-label="20ポイントのU字盤面">
        {POINTS.map(point => {
          const stack = state.board[point - 1]!;
          return <div key={point} data-point={point} role="group" aria-label={`${point}ポイント`}
            className={"caravan-point" + (destination === point ? " caravan-point--legal" : "") + (pending && destination === point ? " caravan-point--pending" : "")}>
            <span className="caravan-point-number" aria-hidden="true">{point}</span>
            <button type="button" className="caravan-destination" disabled={destination !== point || !myTurn} aria-label={`${point}へ移動`} onClick={() => chooseDestination(point)}>{destination === point && !stack.length && <span aria-hidden="true">＋</span>}</button>
            <div className="caravan-stack">{stack.map((piece, layer) => <button type="button" key={layer} data-owner={piece.owner} data-layer={layer} data-size={piece.size}
              className={"caravan-piece-target" + (selection?.from === point && layer >= selection.layer ? " caravan-piece--carried" : "")}
              disabled={!myTurn || destination === point || !legal.some(move => move.from === point && move.layer === layer)}
              aria-label={`${point}ポイント ${layer + 1}段目 ${piece.owner === humanSeat ? "あなた" : "NPC"}の${LINE_SIZE_NAMES[piece.size]}石`}
              aria-pressed={selection?.from === point && selection.layer === layer}
              onClick={() => chooseStone(point, layer)}><StoneBar owner={piece.owner} size={piece.size} label={layer === stack.length - 1} /></button>)}</div>
          </div>;
        })}
        <button type="button" className={"caravan-goal" + (destination === 21 ? " caravan-goal--legal" : "")} aria-label="21へゴール" disabled={destination !== 21 || !myTurn} onClick={() => chooseDestination(21)}>GOAL <strong>21</strong></button>
      </div>
    </div>
    <CaravanRules />
  </section>;
}
