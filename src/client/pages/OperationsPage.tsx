import { useState } from "react";
import type { MaintenanceResult, OperationsOverview } from "../../shared/operations";
import { api } from "../lib/api";

function time(value: number | null): string {
  return value === null ? "—" : new Date(value).toLocaleString();
}

export function OperationsPage() {
  const [matchId, setMatchId] = useState("");
  const [learning, setLearning] = useState<Record<string, unknown>[]>([]);
  const [token, setToken] = useState("");
  const [data, setData] = useState<OperationsOverview | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true); setError(null);
    try { setData(await api.operations(token)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "読み込みに失敗しました"); }
    finally { setLoading(false); }
  }

  async function run(dryRun: boolean) {
    if (!dryRun && !window.confirm("期限切れデータを削除します。実行しますか？")) return;
    setLoading(true); setError(null);
    try {
      const result = await api.maintenance(token, dryRun);
      setMaintenance(result);
      setData(await api.operations(token));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "メンテナンスに失敗しました"); }
    finally { setLoading(false); }
  }

  async function learningRequest(action: "search" | "export" | "delete") {
    if (action === "delete" && !window.confirm("この試合のNPC改善用データを削除しますか？通常の対戦履歴は残ります。")) return;
    setLoading(true); setError(null);
    try {
      const id = matchId.trim();
      const path = action === "search" ? `/api/admin/hub-learning${id ? `?matchId=${encodeURIComponent(id)}` : ""}` : `/api/admin/hub-learning/${encodeURIComponent(id)}`;
      const response = await fetch(path, { method: action === "delete" ? "DELETE" : "GET", headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error(`学習用データの処理に失敗しました (${response.status})`);
      if (action === "export") {
        const url = URL.createObjectURL(await response.blob()), a = document.createElement("a");
        a.href = url; a.download = `hub-learning-${id}.json`; a.click(); URL.revokeObjectURL(url);
      } else if (action === "search") setLearning(await response.json() as Record<string, unknown>[]);
      else setLearning([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "取得に失敗しました"); }
    finally { setLoading(false); }
  }

  return <section className="panel wide analytics-page">
    <div className="eyebrow">OPERATIONS</div><h1>運用状態</h1>
    <p>管理者専用です。部屋ディレクトリ、ログ保持、エラー件数、自動メンテナンスの状態を確認します。</p>
    <div className="analytics-login">
      <label>管理用トークン<input type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" /></label>
      <button className="primary-button" disabled={!token || loading} onClick={reload}>{loading ? "処理中…" : "状態を表示"}</button>
    </div>
    {error && <div className="error-box" role="alert">{error}</div>}
    <section className="analytics-section"><h2>商都開発・NPC改善用データ</h2><p>任意同意に基づく詳細記録です。保存期間は試合開始から30日。完備表示は試合終了・必要件数と保存件数の一致・欠落なしを確認した結果です。</p>
      <label>試合ID（空欄で最近100件）<input value={matchId} onChange={(e) => setMatchId(e.target.value)} maxLength={100}/></label>
      <div className="lobby-actions"><button className="secondary-button" disabled={!token || loading} onClick={() => learningRequest("search")}>記録状況を検索</button><button className="secondary-button" disabled={!token || !matchId.trim() || loading} onClick={() => learningRequest("export")}>JSONを取得</button><button className="secondary-button" disabled={!token || !matchId.trim() || loading} onClick={() => learningRequest("delete")}>詳細記録を削除</button></div>
      <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>試合ID</th><th>状態</th><th>保存／必要件数</th><th>保存失敗／欠落</th><th>削除予定</th></tr></thead><tbody>{learning.map((r) => <tr key={String(r.match_id)}><td><button className="secondary-button" onClick={() => setMatchId(String(r.match_id))}>{String(r.match_id)}</button></td><td>{r.deleted ? "削除済み" : r.complete ? "完備" : r.finished ? "不足あり" : "進行中"}</td><td>{String(r.recorded_records)} / {String(r.expected_records)}</td><td>{String(r.failures)} / {String(r.dropped_records)}</td><td>{time(Number(r.expires_at))}</td></tr>)}</tbody></table></div>
    </section>
    {data && <>
      <div className="analytics-metrics">
        <div><span>部屋一覧</span><strong>{data.roomDirectory.listedRooms}</strong></div>
        <div><span>期限超過候補</span><strong>{data.roomDirectory.staleRooms}</strong></div>
        <div><span>イベントログ</span><strong>{data.playtestEvents.count}</strong></div>
        <div><span>エラー 24h</span><strong>{data.errors.last24Hours}</strong></div>
        <div><span>エラー 7日</span><strong>{data.errors.last7Days}</strong></div>
        <div><span>期限切れ中断 7日</span><strong>{data.matches.abandonedLast7Days}</strong></div>
        <div><span>部屋保持</span><strong>{data.retention.staleRoomHours}h</strong></div>
        <div><span>イベント保持</span><strong>{data.retention.playtestEventDays}日</strong></div>
        <div><span>エラー保持</span><strong>{data.retention.errorDays}日</strong></div>
      </div>
      <section className="analytics-section ops-grid">
        <div className="ops-card"><h2>最古データ</h2><p>部屋一覧: <strong>{time(data.roomDirectory.oldestUpdatedAt)}</strong></p><p>イベント: <strong>{time(data.playtestEvents.oldestCreatedAt)}</strong></p><p>最新エラー: <strong>{time(data.errors.latestAt)}</strong></p></div>
        <div className="ops-card"><h2>前回メンテナンス</h2>{data.lastMaintenance ? <><p>{time(data.lastMaintenance.ranAt)}</p><p>部屋 {data.lastMaintenance.deletedRooms} / イベント {data.lastMaintenance.deletedEvents} / エラー {data.lastMaintenance.deletedErrors}</p></> : <p>まだ実行記録がありません。</p>}</div>
      </section>
      <section className="analytics-section"><h2>手動メンテナンス</h2><p>毎日Cronで自動実行されます。実削除の前にドライランで対象件数を確認できます。</p><div className="lobby-actions"><button className="secondary-button" disabled={loading} onClick={() => run(true)}>ドライラン</button><button className="primary-button" disabled={loading} onClick={() => run(false)}>今すぐ実行</button></div>{maintenance && <div className="ops-result" role="status"><strong>{maintenance.dryRun ? "削除予定" : "削除完了"}</strong><span>部屋 {maintenance.deletedRooms} / イベント {maintenance.deletedEvents} / エラー {maintenance.deletedErrors}</span></div>}</section>
      <section className="analytics-section"><h2>最近のサーバーエラー</h2>{data.errors.recent.length === 0 ? <p className="muted-copy">記録されたエラーはありません。</p> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>時刻</th><th>発生元</th><th>内容</th><th>ルート / 部屋</th></tr></thead><tbody>{data.errors.recent.map((row, index) => <tr key={`${row.createdAt}-${index}`}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.source}</td><td className="ops-error-message">{row.message}</td><td>{row.route ?? row.roomCode ?? "—"}</td></tr>)}</tbody></table></div>}</section>
      <p className="muted-copy">集計生成: {new Date(data.generatedAt).toLocaleString()}</p>
    </>}
  </section>;
}
