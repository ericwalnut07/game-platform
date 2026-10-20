import { useEffect, useState } from "react";
import { applyLineAction, createLineState, type LineAction, type LineState } from "../../../games/ooishi-line/engine";
import { chooseLineNpcAction } from "../../../games/ooishi-line/npc";
import { navigate } from "../../lib/router";
import { LineGame, LineRules } from "./LineGame";
import { StoneBar } from "../shared/StackedStones";
import "./line.css";

const soloRandom = { integer(min: number, max: number) {
  const value = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return min + Math.floor(value / 4_294_967_296 * (max - min + 1));
} };

export default function SoloLinePage() {
  const [first, setFirst] = useState<"human" | "npc" | "random">("human");
  const [state, setState] = useState<LineState | null>(null);
  const [error, setError] = useState<string | null>(null);
  function start() {
    const seat = first === "random" ? soloRandom.integer(0, 1) as 0 | 1 : first === "npc" ? 1 : 0;
    setState(createLineState(seat)); setError(null);
  }
  useEffect(() => {
    if (!state || state.phase !== "PLAYING" || state.position.nextSeat !== 1) return;
    const timer = window.setTimeout(() => {
      try {
        const action = chooseLineNpcAction(state, soloRandom);
        if (!action) throw new Error("NPCの合法手を取得できませんでした");
        const next = applyLineAction(state, 1, action);
        setState(current => current === state ? next : current);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "NPCの操作に失敗しました"); }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!state) return <section className="line-game line-setup">
    <button type="button" className="line-quiet-button" onClick={() => navigate("/solo")}>← 1人用ゲーム一覧へ</button>
    <div className="line-setup-card"><span className="line-eyebrow">OOISHI SERIES · SOLO</span><h1>大石のライン</h1>
      <p>重ねて、運んで。<br />大・中・小の3つを、ひとつのラインに。</p>
      <div className="line-setup-tower" aria-hidden="true"><StoneBar size="small" owner={0} label={false} /><StoneBar size="medium" owner={1} label={false} /><StoneBar size="large" owner={0} label={false} /></div>
      <div className="line-facts"><span>4×4盤面</span><span>2人用</span><span>人間 vs NPC</span></div>
      <label className="line-start-setting">先手<select aria-label="先手" value={first} onChange={event => setFirst(event.target.value as typeof first)}>
        <option value="human">自分から始める</option><option value="npc">NPCから始める</option><option value="random">ランダムに決める</option>
      </select></label>
      <button type="button" className="primary-button" onClick={start}>この設定で始める</button>
    </div><LineRules />
  </section>;

  function act(action: LineAction) {
    try { setState(applyLineAction(state!, 0, action)); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作できませんでした"); }
  }
  return <LineGame state={state} onAction={act} onRestart={start} error={error} onExit={() => {
    if (state.phase === "FINISHED" || window.confirm("現在の対局を終了して設定に戻りますか？")) { setState(null); setError(null); }
  }} />;
}
