import { useEffect, useRef, useState } from "react";
import {
  currentTerritory2Turn, reduceTerritory2, TERRITORY2_PLAYER_COLORS, TERRITORY2_PRESETS,
  type Territory2Config, type Territory2State, type Territory2StoneKind
} from "../../../games/ooishi-territory-2/engine";
import { buildTerritory2View, ooishiTerritory2GameModule } from "../../../games/ooishi-territory-2/module";
import { createTerritory2SoloState, TERRITORY2_SOLO_HUMAN_ID, type Territory2SoloMode } from "../../../games/ooishi-territory-2/solo";
import { cryptoRandom } from "../../../shared/random";
import { TERRITORY2_DIFFICULTIES, TERRITORY2_NPC_LABELS, type Territory2Difficulty } from "../../../shared/territory2-npc";
import { navigate } from "../../lib/router";
import { Territory2Game } from "./Territory2Game";
import { Territory2Settings } from "./Territory2Settings";
import "../ooishi-territory/ooishi.css";
import "./ooishi2.css";

export function SoloTerritory2Page() {
  const [config, setConfig] = useState<Territory2Config>({ ...TERRITORY2_PRESETS[2] });
  const [mode, setMode] = useState<Territory2SoloMode>("hotseat");
  const [difficulties, setDifficulties] = useState<Territory2Difficulty[]>(["medium", "medium", "medium", "medium"]);
  const [state, setState] = useState<Territory2State | null>(null);
  const current = useRef<Territory2State | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedStart = config.startingPlayerId && Number(config.startingPlayerId.split("-")[1]) < config.playerCount ? config.startingPlayerId : TERRITORY2_SOLO_HUMAN_ID;
  const start = () => {
    try {
      const next = createTerritory2SoloState(crypto.randomUUID(), { config, mode, difficulties }, cryptoRandom);
      current.current = next; setState(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "設定を確認してください");
    }
  };

  useEffect(() => {
    if (!state || state.phase !== "PLAYING") return;
    const turn = currentTerritory2Turn(state.config, state.moves.length);
    if (!state.players[turn.seat]?.controller) return;
    // Each NPC gets its own visible pause, including consecutive turns.
    const timer = window.setTimeout(() => {
      if (current.current !== state) return;
      try {
        const progress = ooishiTerritory2GameModule.getAutomaticProgress!(state, { rng: cryptoRandom });
        if (progress) {
          const next = reduceTerritory2(state, progress.action);
          if (current.current === state) { current.current = next; setState(next); }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "NPCの操作に失敗しました");
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => () => { current.current = null; }, []);

  function commit(next: Territory2State) { current.current = next; setState(next); setError(null); }

  if (!state) return <div className="ooishi">
    <button className="text-button" onClick={() => navigate("/solo")}>← 1人用ゲーム一覧へ</button>
    <div className="ooishi-card">
      <span className="eyebrow">1人で遊ぶ · {mode === "hotseat" ? "全席操作" : "NPC対戦"}</span>
      <h1>大石のテリトリー2</h1>
      <fieldset className="ooishi2-solo-modes">
        <legend>操作方法</legend>
        <label><input type="radio" name="solo-mode" checked={mode === "hotseat"} onChange={() => setMode("hotseat")} />自分で操作する</label>
        <label><input type="radio" name="solo-mode" checked={mode === "npc"} onChange={() => setMode("npc")} />NPCに任せる</label>
      </fieldset>
      <p>{mode === "hotseat" ? "1台の画面で2〜4人の全手番を操作します。1手戻す操作も利用できます。" : "自分の席だけ操作し、残りの席はNPCに任せます。"}</p>
      <Territory2Settings value={config} onChange={setConfig} />
      <div className="ooishi-settings">
        <label>手番の決め方<select aria-label="手番の決め方" value={config.turnOrderMode ?? "host-select"} onChange={event => {
          const next = { ...config, turnOrderMode: event.target.value as "host-select" | "random" };
          if (next.turnOrderMode === "random") delete next.startingPlayerId;
          setConfig(next);
        }}><option value="host-select">開始プレイヤーを指定</option><option value="random">ランダムに割り振る</option></select></label>
        {config.turnOrderMode !== "random" && <label>開始プレイヤー<select aria-label="開始プレイヤー" value={selectedStart} onChange={event => setConfig({ ...config, startingPlayerId: event.target.value })}>
          {TERRITORY2_PLAYER_COLORS.slice(0, config.playerCount).map((name, seat) => <option key={seat} value={"solo-" + seat}>{mode === "npc" ? seat === 0 ? "あなた" : "NPC" + seat : "プレイヤー" + (seat + 1)}</option>)}
        </select></label>}
        {mode === "npc" && TERRITORY2_PLAYER_COLORS.slice(1, config.playerCount).map((name, offset) => {
          const seat = offset + 1;
          return <label key={seat}>NPC{seat}の難易度<select aria-label={"NPC" + seat + "の難易度"} value={difficulties[seat]} onChange={event => setDifficulties(previous => previous.map((value, index) => index === seat ? event.target.value as Territory2Difficulty : value))}>
            {TERRITORY2_DIFFICULTIES.map(difficulty => <option key={difficulty} value={difficulty}>{TERRITORY2_NPC_LABELS[difficulty]}</option>)}
          </select></label>;
        })}
      </div>
      <p>最初の配置は自由。2手目以降は、自分の石と縦・横・斜め一直線上のマスへ配置します。</p>
      {error && <p role="alert" className="error-box">{error}</p>}
      <button className="primary-button" onClick={start}>{mode === "hotseat" ? "この設定で試遊する" : "この設定でNPCと対戦する"}</button>
      <p><a href="/#/rules/ooishi-territory-2" target="_blank" rel="noreferrer">ルールを確認する ↗</a></p>
    </div>
  </div>;

  const active = state.phase === "PLAYING" ? currentTerritory2Turn(state.config, state.moves.length).seat : 0;
  const view = buildTerritory2View(state, mode === "npc" ? TERRITORY2_SOLO_HUMAN_ID : state.players[active]!.id);

  function place(kind: Territory2StoneKind, index: number) {
    try { if (current.current === state) commit(reduceTerritory2(state!, { type: "PLACE", playerId: view.playerId, kind, index })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "配置できませんでした"); }
  }
  function pass() {
    try { if (current.current === state) commit(reduceTerritory2(state!, { type: "PASS", playerId: view.playerId })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "パスできませんでした"); }
  }

  return <>
    <Territory2Game view={view} onPlace={place} onPass={pass} error={error}
      hotSeat={mode === "hotseat"}
      {...(mode === "hotseat" ? { onUndo: () => commit({ ...state, moves: state.moves.slice(0, -1), revision: state.revision + 1, phase: "PLAYING" }) } : {})}
      onRestart={start} onLeave={() => navigate("/")}
      title={"大石のテリトリー2 · " + (mode === "hotseat" ? "1人用試遊" : "NPC対戦")} />
    <div className="ooishi ooishi-actions"><button type="button" onClick={() => {
      if (window.confirm("現在の対局を終了して設定画面へ戻りますか？")) { current.current = null; setState(null); setError(null); }
    }}>設定を変更する</button></div>
  </>;
}
