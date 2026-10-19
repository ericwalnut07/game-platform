import { useEffect, useRef, useState } from "react";
import { applyCaravanAction, createCaravanState, type CaravanAction, type CaravanSeat, type CaravanState } from "../../../games/ooishi-caravan/engine";
import { chooseCaravanNpcAction } from "../../../games/ooishi-caravan/npc";
import { navigate } from "../../lib/router";
import { CaravanGame, CaravanRules } from "./CaravanGame";
import { PlayerColor } from "../shared/StackedStones";

const random = { integer(min: number, max: number) {
  const value = new Uint32Array(1); crypto.getRandomValues(value);
  return min + Math.floor(value[0]! / 4294967296 * (max - min + 1));
} };

export default function SoloCaravanPage() {
  const [first, setFirst] = useState<"human" | "npc" | "random">("human");
  const [state, setState] = useState<CaravanState | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = useRef<CaravanState | null>(null);
  function begin() {
    const seat: CaravanSeat = first === "random" ? random.integer(0, 1) as CaravanSeat : first === "npc" ? 1 : 0;
    const initial = createCaravanState(seat); current.current = initial;
    setState(initial); setNotice(""); setError(null);
  }
  function commit(snapshot: CaravanState, action: CaravanAction) {
    if (current.current !== snapshot) return;
    try {
      const next = applyCaravanAction(snapshot, snapshot.currentSeat, action, random);
      current.current = next; setState(next); setError(null);
      const who = snapshot.currentSeat === 0 ? "あなた" : "NPC";
      if (action.type === "ROLL") setNotice(`${who}：${next.dice![0].value}と${next.dice![1].value}${next.currentSeat !== snapshot.currentSeat ? "。使える出目がなくパス" : ""}`);
      else {
        const to = action.from + snapshot.dice![action.die].value, count = snapshot.board[action.from - 1]!.length - action.layer;
        setNotice(`${who}：${action.from} → ${to === 21 ? "ゴール21" : to}（${count}石）${next.dice?.some(die => die.status === "PASSED") && next.phase !== "FINISHED" ? "。残りの出目はパス" : ""}`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作できませんでした"); }
  }
  useEffect(() => {
    if (!state || state.phase === "FINISHED" || state.currentSeat !== 1) return;
    const snapshot = state;
    const timer = window.setTimeout(() => {
      if (current.current !== snapshot) return;
      const action = chooseCaravanNpcAction(snapshot, 1);
      if (action) commit(snapshot, action);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [state]);
  useEffect(() => () => { current.current = null; }, []);

  if (state) return <CaravanGame state={state} notice={notice} error={error}
    onAction={action => { if (state.currentSeat === 0) commit(state, action); }} onRestart={begin}
    onExit={() => { if (state.phase !== "FINISHED" && !window.confirm("対局を終了して設定へ戻りますか？")) return; current.current = null; setState(null); setNotice(""); setError(null); }} />;
  return <section className="panel narrow caravan-setup"><button type="button" className="text-button" onClick={() => navigate("/solo")}>← 1人で遊ぶ</button>
    <span className="caravan-eyebrow">OOISHI SERIES · SOLO</span><h1>大石のキャラバン</h1>
    <p>石を重ねて運び、20ポイントの道からゴールへ。人間1人と標準NPCの2人対戦です。</p>
    <label>先手<select aria-label="先手" value={first} onChange={event => setFirst(event.target.value as typeof first)}><option value="human">あなた</option><option value="npc">NPC</option><option value="random">ランダム</option></select></label>
    <div className="caravan-setup-colors"><span><PlayerColor owner={0} />あなた</span><span><PlayerColor owner={1} />NPC</span></div>
    <button type="button" className="primary-button" onClick={begin}>この設定で始める</button><CaravanRules />
  </section>;
}
