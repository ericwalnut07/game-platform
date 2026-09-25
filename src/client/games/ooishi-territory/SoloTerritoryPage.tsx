import { useState } from "react";
import {
  createTerritoryState, currentTurn, parseTerritoryConfig, reduceTerritory, TERRITORY_PRESETS,
  type StoneKind, type TerritoryConfig, type TerritoryState
} from "../../../games/ooishi-territory/engine";
import { buildTerritoryView } from "../../../games/ooishi-territory/module";
import { navigate } from "../../lib/router";
import { TerritoryGame } from "./TerritoryGame";
import { TerritorySettings } from "./TerritorySettings";
import "./ooishi.css";

const NAMES = ["青", "赤", "黄", "緑"] as const;
export function SoloTerritoryPage() {
  const [config, setConfig] = useState<TerritoryConfig>({ ...TERRITORY_PRESETS[2] });
  const [state, setState] = useState<TerritoryState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = () => {
    try {
      const parsed = parseTerritoryConfig(config);
      setState(createTerritoryState(crypto.randomUUID(),
        Array.from({ length: parsed.playerCount }, (_, seat) => ({ id: `hotseat-${seat}`, name: NAMES[seat]! })), parsed));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "設定を確認してください"); }
  };
  if (!state) return <div className="ooishi">
    <button className="text-button" onClick={() => navigate("/")}>← TOPへ</button>
    <div className="ooishi-card"><span className="eyebrow">1人で遊ぶ · 全席操作</span>
      <h1>大石のテリトリー</h1>
      <p>1台の画面で2〜4人の全手番を操作するローカル試遊モードです。対戦相手のBOTはありません。</p>
      <TerritorySettings value={config} onChange={setConfig} />
      {error && <p role="alert" className="error-box">{error}</p>}
      <button className="primary-button" onClick={start}>この設定で試遊する</button>
      <p><a href="/#/rules/ooishi-territory" target="_blank" rel="noreferrer">ルールを確認する ↗</a></p>
    </div>
  </div>;
  const active = state.phase === "PLAYING" ? currentTurn(state.config, state.moves.length).seat : 0;
  const view = buildTerritoryView(state, state.players[active]!.id);
  function place(kind: StoneKind, index: number) {
    try { setState(reduceTerritory(state!, { type: "PLACE", playerId: view.playerId, kind, index })); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "配置できませんでした"); }
  }
  function pass() {
    try { setState(reduceTerritory(state!, { type: "PASS", playerId: view.playerId })); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "パスできませんでした"); }
  }
  return <>
    <TerritoryGame view={view} onPlace={place} onPass={pass} error={error} hotSeat
      onUndo={() => setState({ ...state, moves: state.moves.slice(0, -1), revision: state.revision + 1, phase: "PLAYING" })}
      onRestart={start} onLeave={() => navigate("/")} title="大石のテリトリー · 1人用試遊" />
    <div className="ooishi ooishi-actions"><button type="button" onClick={() => {
      if (window.confirm("現在の対局を終了して設定画面へ戻りますか？")) { setState(null); setError(null); }
    }}>設定を変更する</button></div>
  </>;
}
