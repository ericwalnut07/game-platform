import { useEffect, useMemo, useRef, useState } from "react";
import { RULES_VERSION, STAGES } from "../../../games/two-sided-labyrinth/catalog";
import { loadStage, parseStageId } from "../../../games/two-sided-labyrinth/stage-loader";
import { createStageState, applyStageAction, type AdvancedAction, type SharedTutorialState } from "../../../games/two-sided-labyrinth/core/prototype-stage-core-v1.0";
import type { Face } from "../../../games/two-sided-labyrinth/core/layered-stage-contract-v0.6";
import { buildFaceView } from "../../../games/two-sided-labyrinth/view";
import { actionError } from "../../../games/two-sided-labyrinth/actions";
import { restoreSolo, type SoloSave } from "../../../games/two-sided-labyrinth/solo";
import { navigate } from "../../lib/router";
import { Board, BoardOverview } from "./Board";
import { Controls } from "./Controls";
import { StageSelect } from "./StageSelect";
import { formatTime } from "./LabyrinthScreen";
import "./labyrinth.css";
const SAVE_KEY = "two-sided-labyrinth:solo:v1";
interface Session { save: SoloSave; core: SharedTutorialState; paused: boolean; resumedAt: number }
export default function SoloLabyrinthPage() {
  const [selected, setSelected] = useState("tutorial-01"), [session, setSession] = useState<Session | null>(null);
  const [saved, setSaved] = useState(false), [error, setError] = useState<string | null>(null), [saveError, setSaveError] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const latest = useRef(session); latest.current = session;
  function elapsed(s: Session, now = Date.now()) { return s.save.elapsedMs + (s.paused || s.core.complete ? 0 : Math.max(0, now - s.resumedAt)); }
  function persist(s: Session) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...s.save, elapsedMs: elapsed(s) })); setSaved(true); setSaveError(null); }
    catch { setSaveError("このブラウザでは途中保存できません。空き容量や保存設定を確認してください。"); }
  }
  useEffect(() => { try { setSaved(localStorage.getItem(SAVE_KEY) !== null); } catch { setSaveError("このブラウザでは途中保存が使用できません。"); } }, []);
  useEffect(() => { if (session) persist(session); }, [session]);
  useEffect(() => {
    const timer = setInterval(() => { refresh((n) => n + 1); if (latest.current) persist(latest.current); }, 1000);
    const pause = () => { const s = latest.current; if (s && !s.paused && !s.core.complete) {
      const next = { ...s, save: { ...s.save, elapsedMs: elapsed(s) }, paused: true }; latest.current = next; persist(next); setSession(next);
    } };
    const hidden = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", pause);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", pause); if (latest.current) persist(latest.current); };
  }, []);
  const boards = useMemo(() => session ? { front: buildFaceView(session.save.stageId, session.core, "front"), back: buildFaceView(session.save.stageId, session.core, "back") } : null, [session?.core]);
  function start() {
    if (session && !session.core.complete && !window.confirm("現在の練習を終了し、この面を最初から始めますか？")) return;
    const stageId = parseStageId(selected);
    setSession({ save: { rulesVersion: RULES_VERSION, playMode: "SOLO_PRACTICE", stageId, elapsedMs: 0, activeFace: "front", steps: [] }, core: createStageState(loadStage(stageId)), paused: false, resumedAt: Date.now() }); setError(null);
  }
  function resume() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) throw new Error("保存データがありません");
      const restored = restoreSolo(raw); setSelected(restored.save.stageId); setSession({ ...restored, paused: true, resumedAt: Date.now() }); setError(null);
    } catch { setError("保存データを復元できません。対応する版で保存されたデータか確認し、新しく始める場合はステージを選んでください。"); }
  }
  function select(face: Face) { setSession((s) => s ? { ...s, save: { ...s.save, activeFace: face } } : s); }
  function send(action: AdvancedAction) {
    const s = latest.current; if (!s || s.paused || s.core.complete) return;
    try {
      const core = applyStageAction(loadStage(s.save.stageId), s.core, { playMode: "SOLO_PRACTICE", selectedFace: s.save.activeFace }, action);
      const next: Session = { ...s, core, resumedAt: Date.now(), save: { ...s.save, elapsedMs: elapsed(s), steps: [...s.save.steps, { face: s.save.activeFace, action }] } };
      latest.current = next; setSession(next); setError(null);
    } catch (cause) { setError(actionError(cause)); }
  }
  if (!session || !boards) return <section className="maze maze-card">
    <button type="button" className="text-button" onClick={() => navigate("/solo")}>← 1人用ゲームへ</button><span className="eyebrow">SOLO PRACTICE</span><h1>表裏一体迷宮</h1>
    <p>1人で表と裏を切り替えて操作します。盤面も装置も2人協力と同じです。</p><StageSelect value={selected} onChange={setSelected}/>
    {error && <p role="alert" className="maze-error">{error}</p>}{saveError && <p role="status" className="maze-notice">{saveError}</p>}
    <div className="maze-buttons"><button type="button" className="primary-button" onClick={() => { if (!saved || window.confirm("保存済みの練習を上書きして、新しく始めますか？")) start(); }}>この面で練習する</button>
      {saved && <button type="button" onClick={resume}>保存した練習を再開</button>}</div>
    <p>一時停止・自動保存に対応。タブを離れると一時停止します。練習タイムは正式記録には登録されません。</p><a href="/#/rules/two-sided-labyrinth">ルールを見る</a>
  </section>;
  const face = session.save.activeFace;
  return <div className="maze maze-solo" data-phase={session.core.complete ? "FINISHED" : session.paused ? "PAUSED" : "PLAYING"} data-actions={session.core.acceptedActions}>
    <header className="maze-heading"><div><span className="eyebrow">表裏一体迷宮 · 1人練習</span><h1>{STAGES.find((s) => s.stageId === session.save.stageId)?.title}</h1><p>左が表、右が裏。操作する面をタップして切り替えます。</p></div><div className="maze-clock"><time aria-label="練習タイム">{formatTime(elapsed(session))}</time><small>参考タイム · {session.core.acceptedActions}操作</small></div></header>
    <div className="maze-buttons"><button type="button" aria-pressed={face === "front"} onClick={() => select("front")}>表を選択</button><button type="button" aria-pressed={face === "back"} onClick={() => select("back")}>裏を選択</button>
      {!session.core.complete && <button type="button" onClick={() => { const s = latest.current!; setSession({ ...s, paused: !s.paused, resumedAt: Date.now(), save: { ...s.save, elapsedMs: elapsed(s) } }); }}>{session.paused ? "練習を続ける" : "一時停止"}</button>}
      <button type="button" onClick={() => { persist(session); latest.current = null; setSession(null); setError(null); }}>保存してステージ選択へ</button></div>
    {session.paused && !session.core.complete && <p className="maze-notice" role="status">一時停止中です。「練習を続ける」で再開します。</p>}
    {saveError && <p className="maze-notice" role="status">{saveError}</p>}{error && <p className="maze-error" role="alert">× {error}</p>}
    {session.core.complete && <section className="maze-card maze-result" aria-label="クリア結果"><h2>クリア！</h2><strong>{formatTime(elapsed(session))}</strong><p>1人練習 · {session.core.acceptedActions}操作 · 正式記録には登録されません</p><button type="button" onClick={start}>同じ面に再挑戦</button></section>}
    <div className="maze-overviews"><BoardOverview board={boards.front} active={face === "front"} select={() => select("front")}/><BoardOverview board={boards.back} active={face === "back"} select={() => select("back")}/></div>
    <div className="maze-solo-details">{(["front", "back"] as const).map((side) => <div key={side} className={face === side ? "maze-detail-active" : "maze-detail-inactive"} onClick={() => select(side)}><Board board={boards[side]} active={face === side}/></div>)}</div>
    <strong className="maze-active-label">操作中：{face === "front" ? "表 · A" : "裏 · B"}</strong>
    <Controls board={boards[face]} disabled={session.paused || session.core.complete} send={send}/>
    <a href="/#/rules/two-sided-labyrinth" target="_blank" rel="noreferrer">操作とギミックの説明 ↗</a>
  </div>;
}
