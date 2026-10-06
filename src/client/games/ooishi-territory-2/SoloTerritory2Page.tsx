import { useState } from "react";
import {
  createTerritory2State,
  currentTerritory2Turn,
  parseTerritory2Config,
  reduceTerritory2,
  TERRITORY2_PRESETS,
  type Territory2Config,
  type Territory2State,
  type Territory2StoneKind
} from "../../../games/ooishi-territory-2/engine";
import { buildTerritory2View } from "../../../games/ooishi-territory-2/module";
import { navigate } from "../../lib/router";
import { Territory2Game } from "./Territory2Game";
import { Territory2Settings } from "./Territory2Settings";
import "../ooishi-territory/ooishi.css";
import "./ooishi2.css";

const NAMES = ["青", "赤", "黄", "緑"] as const;

export function SoloTerritory2Page() {
  const [config, setConfig] = useState<Territory2Config>({ ...TERRITORY2_PRESETS[2] });
  const [state, setState] = useState<Territory2State | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    try {
      const parsed = parseTerritory2Config(config);
      setState(createTerritory2State(
        crypto.randomUUID(),
        Array.from({ length: parsed.playerCount }, (_, seat) => ({
          id: "hotseat-" + seat,
          name: NAMES[seat]!
        })),
        parsed
      ));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "設定を確認してください");
    }
  };

  if (!state) return <div className="ooishi">
    <button className="text-button" onClick={() => navigate("/solo")}>← 1人用ゲーム一覧へ</button>
    <div className="ooishi-card">
      <span className="eyebrow">1人で遊ぶ · 全席操作</span>
      <h1>大石のテリトリー2</h1>
      <p>1台の画面で2〜4人の全手番を操作するローカル試遊モードです。対戦相手のBOTはありません。</p>
      <Territory2Settings value={config} onChange={setConfig} />
      {error && <p role="alert" className="error-box">{error}</p>}
      <button className="primary-button" onClick={start}>この設定で試遊する</button>
      <p><a href="/#/rules/ooishi-territory-2" target="_blank" rel="noreferrer">ルールを確認する ↗</a></p>
    </div>
  </div>;

  const active = state.phase === "PLAYING"
    ? currentTerritory2Turn(state.config, state.moves.length).seat
    : 0;
  const view = buildTerritory2View(state, state.players[active]!.id);

  function place(kind: Territory2StoneKind, index: number) {
    try {
      setState(reduceTerritory2(state!, {
        type: "PLACE",
        playerId: view.playerId,
        kind,
        index
      }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "配置できませんでした");
    }
  }

  function pass() {
    try {
      setState(reduceTerritory2(state!, { type: "PASS", playerId: view.playerId }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "パスできませんでした");
    }
  }

  return <>
    <Territory2Game
      view={view}
      onPlace={place}
      onPass={pass}
      error={error}
      hotSeat
      onUndo={() => setState({
        ...state,
        moves: state.moves.slice(0, -1),
        revision: state.revision + 1,
        phase: "PLAYING"
      })}
      onRestart={start}
      onLeave={() => navigate("/")}
      title="大石のテリトリー2 · 1人用試遊"
    />
    <div className="ooishi ooishi-actions">
      <button type="button" onClick={() => {
        if (window.confirm("現在の対局を終了して設定画面へ戻りますか？")) {
          setState(null);
          setError(null);
        }
      }}>設定を変更する</button>
    </div>
  </>;
}
