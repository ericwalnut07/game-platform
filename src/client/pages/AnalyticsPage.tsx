import { useState } from "react";
import type { PlaytestAnalytics, PlaytestBreakdownRow } from "../../shared/playtest-analytics";
import { api } from "../lib/api";

function pct(value: number) { return `${value.toFixed(1)}%`; }
function metric(value: number | null, suffix = "") { return value === null ? "—" : `${value.toFixed(1)}${suffix}`; }

function BreakdownTable({ title, rows }: { title: string; rows: readonly PlaytestBreakdownRow[] }) {
  return <section className="analytics-section"><h2>{title}</h2><div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>項目</th><th>件数</th><th>ミッション成功</th><th>裁判正解</th><th>判決不能</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.key}</td><td>{row.games}</td><td>{pct(row.missionSuccessRate)}</td><td>{pct(row.verdictCorrectRate)}</td><td>{pct(row.undecidedRate)}</td></tr>)}</tbody></table></div></section>;
}

export function AnalyticsPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<PlaytestAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setData(await api.playtestAnalytics(token)); }
    catch (e) { setError(e instanceof Error ? e.message : "読み込みに失敗しました"); }
    finally { setLoading(false); }
  }

  return <section className="panel wide analytics-page">
    <div className="eyebrow">PLAYTEST ANALYTICS</div><h1>プレイテスト分析</h1>
    <p>管理用トークンを入力した端末でのみ表示します。トークンはこの画面の状態にだけ保持し、保存しません。</p>
    <div className="analytics-login"><label>管理用トークン<input type="password" value={token} onChange={e=>setToken(e.target.value)} autoComplete="off" /></label><button className="primary-button" disabled={!token || loading} onClick={load}>{loading?"集計中…":"集計を表示"}</button></div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {data && <>
      <div className="analytics-metrics">
        <div><span>ゲーム数</span><strong>{data.overview.gameCount}</strong></div>
        <div><span>完了マッチ</span><strong>{data.overview.matchCount}</strong></div>
        <div><span>ミッション成功率</span><strong>{pct(data.overview.missionSuccessRate)}</strong></div>
        <div><span>裁判正解率</span><strong>{pct(data.overview.verdictCorrectRate)}</strong></div>
        <div><span>判決不能率</span><strong>{pct(data.overview.undecidedRate)}</strong></div>
        <div><span>ポン存在率</span><strong>{pct(data.overview.ponPresenceRate)}</strong></div>
        <div><span>平均ゲーム時間</span><strong>{metric(data.overview.averageGameDurationSeconds,"秒")}</strong></div>
        <div><span>アンケート数</span><strong>{data.overview.feedbackCount}</strong></div>
        <div><span>サマリー有用度</span><strong>{metric(data.overview.averageSummaryUsefulness," / 5")}</strong></div>
        <div><span>盛り上がり</span><strong>{metric(data.overview.averageFunRating," / 5")}</strong></div>
        <div><span>自己疑念率</span><strong>{data.overview.selfSuspicionRate===null?"—":pct(data.overview.selfSuspicionRate)}</strong></div>
        <div><span>1人だけ明白率</span><strong>{data.overview.singleObviousSuspectRate===null?"—":pct(data.overview.singleObviousSuspectRate)}</strong></div>
      </div>
      <BreakdownTable title="人数別" rows={data.byPlayerCount}/>
      <BreakdownTable title="偽条件タイプ別" rows={data.byFalseRelation}/>
      <BreakdownTable title="真ミッション別" rows={data.byMission}/>
      <section className="analytics-section"><h2>秘密の性格</h2><div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>性格</th><th>件数</th><th>達成率</th><th>平均得点</th></tr></thead><tbody>{data.personalities.map(row=><tr key={row.personalityType}><td>{row.personalityType}</td><td>{row.samples}</td><td>{pct(row.successRate)}</td><td>{row.averageScore.toFixed(2)}</td></tr>)}</tbody></table></div></section>
      <section className="analytics-section"><h2>自分をポンだと疑い始めたラウンド</h2><div className="suspicion-rounds">{[1,2,3,4].map(round=>{const count=data.selfSuspicionRounds.find(r=>r.round===round)?.count??0; return <div key={round}><span>R{round}</span><strong>{count}</strong></div>})}</div></section>
      <p className="muted-copy">集計生成: {new Date(data.generatedAt).toLocaleString()}</p>
    </>}
  </section>;
}
