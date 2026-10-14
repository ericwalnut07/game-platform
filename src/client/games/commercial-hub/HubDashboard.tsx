import type { HubView } from "../../../games/commercial-hub/view";
import { SUIT_NAMES } from "../../../games/commercial-hub/data";
import { MAJOR_LABELS } from "../../../games/commercial-hub/next-rules";
import { HUB_NPC_LABELS } from "../../../shared/commercial-hub-npc";
import { PLAYER_COLORS } from "./labels";
import { phaseLabel, operationStatus } from "./NextOverview";

export function progressStatus(view: HubView, name: (id: string) => string): string {
  if (view.phase === "FINISHED") return "対局終了";
  const done = view.phase === "PROCUREMENT" ? view.procurementDone
    : view.phase === "PRODUCTION" ? view.productionDone
    : ["ROUND_START", "ROUND_END"].includes(view.phase) ? view.roundReady
    : view.phase === "BID" ? view.bidSubmitted : null;
  if (done) return (done.includes(view.playerId) ? "他商会を待機中" : "あなたの操作・確認") + " · 完了 " + done.length + "/" + view.players.length + "人";
  if (view.currentPlayer) return view.currentPlayer === view.playerId ? "あなたの手番" : name(view.currentPlayer) + "を待機中";
  return "結果を確認中 · 自動で次へ";
}

export function HubDashboard({ view, name }: { view: HubView; name: (id: string) => string }) {
  const resources = view.companies.find(c => c.playerId === view.playerId)!.resources;
  return <div className="hub-dashboard-bar" aria-label="自社の状況">
    <div className="hub-dashboard-phase"><strong>R{view.round} · 都市Lv{view.cityLevel} · {phaseLabel(view)}{view.phase === "INVESTMENT" && ` 第${view.currentInvestmentPass}巡`}</strong><span aria-label="自分の進行状況">{progressStatus(view, name)}</span></div>
    <dl className="hub-resource-strip">
      <div><dt>資金</dt><dd className={resources.cash < 0 ? "hub-deficit" : ""}>{resources.cash}</dd></div>
      <div><dt>資材</dt><dd>{resources.materials}</dd></div>
      <div><dt>商品</dt><dd>{resources.goods}</dd></div>
      <div><dt>暫定企業価値<small>自分のみ</small></dt><dd>{view.ownValue.total}<small>点</small></dd></div>
    </dl>
    <p className="hub-end-plan" aria-label="最終予定ラウンド">現在R{view.round} / {view.finalRoundDecision ? `最終予定R${view.finalRound}（確定）` : `最終予定は未確定・最長R${view.finalRound}`}{view.round === view.finalRound && <b> · 最終ラウンド</b>}</p>
  </div>;
}

export function FinanceSummary({ view }: { view: HubView }) {
  return <details className="hub-finance-details" aria-label="自分の精算見込み">
    <summary>R末資金見込 <b>{view.ownBalance.projectedCash}</b> · 輸送費 −{view.ownBalance.expense} / 通行料 ＋{view.ownBalance.income}{view.ownBalance.projectedCash < 0 && <strong className="hub-deficit">赤字見込</strong>}</summary>
    <div className="hub-my-finances"><span>未精算輸送費 <b>−{view.ownBalance.expense}</b></span><span>未精算通行料 <b>＋{view.ownBalance.income}</b></span><span>精算後見込 <b>{view.ownBalance.projectedCash}</b></span><span>公共事業 <b>{view.ownValue.projects}点</b></span><small>未精算の通行料はまだ使えません。残高は今後の操作で変わります。</small></div>
    <dl className="hub-value-breakdown" aria-label="自社の企業価値内訳">{([["建物", view.ownValue.buildings], ["輸送路", view.ownValue.routes], ["公共事業", view.ownValue.projects], ["資金", view.ownValue.cash], ["資材・商品", view.ownValue.inventory], ...(view.config.trickRule === "BID" ? [["予測成功", view.ownValue.prediction ?? 0]] : [])] as [string, number][]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}点</dd></div>)}</dl>
  </details>;
}

export function CompanyOverview({ view, name }: { view: HubView; name: (id: string) => string }) {
  return <section className="hub-companies" aria-label="4商会の公開資源"><h2>商会の公開情報</h2><div className="hub-company-strip">{view.companies.map((c, i) => <article key={c.playerId} style={{ borderColor: PLAYER_COLORS[i] }}>
    <strong>{name(c.playerId)}{c.playerId === view.playerId && "（自分）"}</strong>
    <dl><div><dt>資金</dt><dd>{c.resources.cash}</dd></div><div><dt>資材</dt><dd>{c.resources.materials}</dd></div><div><dt>商品</dt><dd>{c.resources.goods}</dd></div></dl>
    <small>手札{view.handCounts.find(h => h.playerId === c.playerId)?.count ?? 0}枚 · {view.npcPlayers[c.playerId] ? `NPC · ${HUB_NPC_LABELS[view.npcPlayers[c.playerId]!]}` : view.connections[c.playerId]?.bot ? "BOT代行中" : view.connections[c.playerId]?.connected ? "接続中" : "切断中・60秒でBOT"}</small>
    <details className="hub-company-assets"><summary>建物{view.buildings.filter(b => b.playerId === c.playerId).length} · 輸送路{view.routes.filter(r => r.playerId === c.playerId).length} · {operationStatus(view, c.playerId)}</summary><p>上位建物{view.buildings.filter(b => b.playerId === c.playerId && b.upgraded).length}棟</p><p>大型投資：{view.next?.cards.filter(x => x.owner === c.playerId).map(x => MAJOR_LABELS[x.id]?.[0]).join(" / ") || "なし"}</p></details>
  </article>)}</div></section>;
}

export function RoundSummary({ view }: { view: HubView }) {
  return <div className="hub-round-summary"><strong>{view.cityCondition.name}</strong><span>{view.trump ? SUIT_NAMES[view.trump] + "切札" : "ノートランプ"}</span><span>都市発展 {view.cityDevelopment}{view.cityLevel < 4 ? ` / ${[0, 16, 32, 64][view.cityLevel]}` : " · Lv4"}</span><progress aria-label="都市発展" value={Math.min(64, view.cityDevelopment)} max={64}/></div>;
}
