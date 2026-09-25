import { useEffect, useMemo, useState } from "react";
import {
  calculateBoard, currentTurn, PLAYER_COLORS, territoryReport, type StoneKind,
  type TerritoryState
} from "../../../games/ooishi-territory/engine";
import type { TerritoryView } from "../../../games/ooishi-territory/module";
import { TerritoryBoard } from "./TerritoryBoard";
import "./ooishi.css";

const KINDS: { key: StoneKind; label: string }[] = [
  { key: "big", label: "大石" }, { key: "medium", label: "中石" },
  { key: "small", label: "小石" }, { key: "exp", label: "ムーンボレー" }
];
const EMPTY: Record<StoneKind, number[]> = { big: [], medium: [], small: [], exp: [] };

export function TerritoryGame({ view, onPlace, onPass, onUndo, onRestart, onLeave,
  onRematch, canRematch = false, disabled = false, error = null, title = "大石のテリトリー" }: {
  view: TerritoryView;
  onPlace: (kind: StoneKind, index: number) => void;
  onPass: () => void;
  onUndo?: () => void;
  onRestart?: () => void;
  onLeave?: () => void;
  onRematch?: () => void;
  canRematch?: boolean;
  disabled?: boolean;
  error?: string | null;
  title?: string;
}) {
  const [kind, setKind] = useState<StoneKind | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => { setKind(null); setSelected(null); setInspect(null); }, [view.matchId, view.revision, view.playerId]);
  const turn = view.turn ?? currentTurn(view.config, view.moves.length);
  const isMyTurn = view.phase === "PLAYING" && turn.seat === view.mySeat;
  const legal = isMyTurn ? view.legal : EMPTY;
  const chosenKind = kind && legal[kind].length ? kind : KINDS.find((item) => legal[item.key].length)?.key ?? null;
  const valid = selected !== null && chosenKind !== null && legal[chosenKind].includes(selected);
  const preview = useMemo(() => {
    if (!valid || selected === null || !chosenKind) return null;
    return calculateBoard(view.config, [...view.moves, { seat: view.mySeat, kind: chosenKind, index: selected }]);
  }, [view.config, view.moves, view.mySeat, chosenKind, selected, valid]);
  const fullState: TerritoryState = { gameId: "ooishi-territory", rulesVersion: "1.0", matchId: view.matchId,
    phase: view.phase, revision: view.revision, config: view.config, players: view.players,
    moves: view.moves, startedAt: 0 };
  const report = territoryReport(fullState);
  const roundCount = view.config.big + view.config.medium + view.config.small;
  const position = inspect === null ? null : String.fromCharCode(65 + inspect % view.config.size) + (Math.floor(inspect / view.config.size) + 1);
  const hasMoves = Object.values(legal).some((cells) => cells.length > 0);
  async function copyReport() {
    try { await navigator.clipboard.writeText(report); setCopyStatus("コピーしました"); } catch {
      const node = document.getElementById("ooishi-report");
      if (node instanceof HTMLTextAreaElement) { node.hidden = false; node.focus(); node.select(); setCopyStatus("テキストを選択してください"); }
    }
  }
  function confirm() {
    if (disabled || !valid || selected === null || !chosenKind) return;
    onPlace(chosenKind, selected); setSelected(null);
  }
  return <div className="ooishi" data-game-id="ooishi-territory" data-phase={view.phase}>
    <header className="ooishi-heading"><div><span className="eyebrow">{title} · ルール v{view.rulesVersion}</span>
      <h1>{view.phase === "FINISHED" ? "最終結果" : `第${turn.round + 1}ラウンド／${roundCount}`}</h1>
      <p>{view.phase === "FINISHED" ? "すべての手番が終了しました" : `${PLAYER_COLORS[turn.seat]}：${view.players[turn.seat]?.name} の手番`}</p>
    </div><div className="ooishi-actions">{onUndo && <button type="button" onClick={onUndo} disabled={!view.moves.length}>1手戻す</button>}
      {onRestart && view.phase === "PLAYING" && <button type="button" onClick={() => {
        if (window.confirm("同じ設定で最初からやり直しますか？")) onRestart();
      }}>同じ設定で最初から</button>}
      {onLeave && <button type="button" onClick={onLeave}>TOPへ</button>}
      <a href="/#/rules/ooishi-territory" target="_blank" rel="noreferrer">ルール ↗</a></div>
    </header>
    {error && <div role="alert" className="error-box">{error}</div>}
    {disabled && view.phase === "PLAYING" && <div role="status" className="ooishi-alert">接続が戻るまで配置できません。盤面は保持しています。</div>}
    <div className="ooishi-scores" aria-label="現在の支配マス">
      {view.players.map((player, seat) => <div className="ooishi-score" key={player.id} style={{ borderColor: ["#487dd6","#df776d","#d3a542","#51a985"][seat] }}>
        <strong>{PLAYER_COLORS[seat]}：{player.name}</strong><b>{view.scores[seat]}マス</b>
        <small>残り 大{view.stocks[seat]!.big}・中{view.stocks[seat]!.medium}・小{view.stocks[seat]!.small} ／ ムーンボレー{view.stocks[seat]!.exp}</small>
      </div>)}
      <div className="ooishi-score"><strong>中立地</strong><b>{view.neutral}マス</b></div>
    </div>
    <div className="ooishi-layout">
      <section className="ooishi-card">
        <div className="ooishi-toolbar"><label>盤面の拡大　{Math.round(zoom * 100)}%
          <input aria-label="盤面の拡大" type="range" min="1" max="1.8" step=".2" value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <span>四隅の数値：左上＝青、右上＝赤、左下＝黄、右下＝緑</span></div>
        <TerritoryBoard view={view} selectedKind={chosenKind} selectedIndex={selected}
          inspectIndex={inspect} zoom={zoom} onCellClick={(index) => {
            setInspect(index); setSelected(!disabled && legal[chosenKind ?? "big"].includes(index) ? index : null);
          }} />
        {inspect !== null && <p aria-live="polite" className="ooishi-cell-detail">{position}：{view.owners[inspect] === -1 ? "中立地" : `${PLAYER_COLORS[view.owners[inspect]!]}の陣地`} ／
          {view.influences.map((row, seat) => `${PLAYER_COLORS[seat]} ${row[inspect]}`).join(" ・ ")}
          {view.occupants[inspect] && ` ／ ${PLAYER_COLORS[view.occupants[inspect]!.seat]}の石`}</p>}
      </section>
      <div>
        {view.result && <section className="ooishi-card ooishi-result" aria-label="最終結果">
          <h2>{view.result.winners.map((id) => view.players.find((player) => player.id === id)?.name).join("・")} の{view.result.winners.length > 1 ? "同率勝利" : "勝利"}！</h2>
          <p>中立地：{view.neutral}マス。得点は各プレイヤーの支配マス数です。</p>
          {canRematch && onRematch && <button className="primary-button" disabled={disabled} onClick={onRematch}>同じ設定・メンバーでもう一度</button>}
          {onRestart && <button className="secondary-button" onClick={onRestart}>同じ設定で最初から</button>}
          <button className="secondary-button" onClick={copyReport}>結果・手番履歴をコピー</button>
          <small role="status">{copyStatus}</small>
          <textarea id="ooishi-report" className="ooishi-report" hidden readOnly value={report} aria-label="コピー用の対局記録" />
        </section>}
        {view.phase === "PLAYING" && <section className="ooishi-card ooishi-control">
          <h2>この手番の行動</h2>
          {!isMyTurn ? <p>{PLAYER_COLORS[turn.seat]}のプレイヤーが配置するのを待っています。</p> :
            <><div className="ooishi-kind-grid">{KINDS.map((item) =>
              <button type="button" key={item.key} disabled={disabled || !legal[item.key].length}
                aria-pressed={chosenKind === item.key} onClick={() => { setKind(item.key); setSelected(null); }}>
                <strong>{item.label} ×{view.stocks[view.mySeat]![item.key]}</strong>
                <small>配置可能：{legal[item.key].length}マス</small>
              </button>)}</div>
              {turn.round === 0 && <p>初手は必ず大石を置きます。</p>}
              {view.config.bigBan === 1 && turn.round === roundCount - 2 && view.stocks[view.mySeat]!.big > 0 &&
                <p>大石が残っているため、この手番では大石を必ず配置します。</p>}
              {view.config.bigBan === 1 && view.config.expRule === 1 && turn.round === roundCount - 1 &&
                <p>最終手番では大石とムーンボレーを使用できません。</p>}
              {valid && selected !== null && preview && <p aria-live="polite">
                {String.fromCharCode(65 + selected % view.config.size)}{Math.floor(selected / view.config.size) + 1}に配置：
                {view.players.map((player, seat) => `${PLAYER_COLORS[seat]}${preview.scores[seat]! - view.scores[seat]! >= 0 ? "＋" : ""}${preview.scores[seat]! - view.scores[seat]!}`).join(" ／ ")}
              </p>}
              <button className="ooishi-primary" disabled={disabled || !valid} onClick={confirm}>この場所に配置を確定</button>
              {!hasMoves && <button disabled={disabled} onClick={onPass}>配置可能な場所がないためパス</button>}
            </>}
        </section>}
        <section className="ooishi-card"><h2>手番履歴</h2><ol className="ooishi-history">
          {view.moves.map((move, i) => <li key={i}>{Math.floor(i / view.config.playerCount) + 1}R　
            {PLAYER_COLORS[move.seat]}　{move.kind === "big" ? "大石" : move.kind === "medium" ? "中石" : move.kind === "small" ? "小石" : move.kind === "exp" ? "ムーンボレー" : "パス"}　
            {move.index < 0 ? "配置なし" : String.fromCharCode(65 + move.index % view.config.size) + (Math.floor(move.index / view.config.size) + 1)}
          </li>)}
        </ol></section>
      </div>
    </div>
  </div>;
}
