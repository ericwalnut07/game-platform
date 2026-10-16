import { OpportunityHand } from "./OpportunityHand";
import { HubDashboard, FinanceSummary, CompanyOverview, RoundSummary } from "./HubDashboard";
import { projectScoringLabel, projectCompletionLabel } from "../../../games/commercial-hub/projects";
import { v1Opportunities } from "../../../games/commercial-hub/trial-features";
import { NextOpportunityRules } from "./NextOpportunityRules";
import { RecentEvents, PhaseResults, phaseLabel } from "./NextOverview";
import { NextInvestmentRules } from "./NextInvestmentRules";
import { TrialFeedback } from "./TrialFeedback";
import { MajorPanel } from "./MajorPanel";
import { useState } from "react";
import { CITY_CONDITIONS, SUIT_NAMES } from "../../../games/commercial-hub/data";
import type { HubClientAction } from "../../../games/commercial-hub/state";
import type { HubView } from "../../../games/commercial-hub/view";
import type { ClientRoomMessageInput, RoomPublicState } from "../../../shared/room-protocol";
import type { RoomConnectionState } from "../../lib/room-socket";
import { CityBoard, type MapHighlight } from "./CityBoard";
import { IncomePanel } from "./IncomePanel";
import { InvestmentPanel } from "./InvestmentPanel";
import { PublicProjects } from "./PublicProjects";
import { ProcurementPanel } from "./ProcurementPanel";
import { eventText, TIE_NAMES } from "./labels";
import { SuitMark } from "./SuitMark";
import { BidPanel, BidStatus } from "./BidPanel";
import { AuditorPanel, AuditorStatus } from "./AuditorPanel";
import "./commercial-hub.css";
interface Props { room: RoomPublicState; view: HubView; phaseVersion: number; send: (message: ClientRoomMessageInput) => void; connectionState: RoomConnectionState; pending: boolean; error: string | null; learningConsent?: boolean }
export function CommercialHubScreen({ room, view, phaseVersion, send, connectionState, pending, error, learningConsent = false }: Props) {
  const [tab, setTab] = useState("turn"), [highlight, setHighlight] = useState<MapHighlight>({ district: null, suit: null });
  const [expandedProject, expandProject] = useState<string | null>(null);
  const [mapTarget,setMapTarget]=useState<{district:import("../../../games/commercial-hub/types").DistrictId;buildingId?:string;seq:number}|null>(null);
  const selectTarget=(district:import("../../../games/commercial-hub/types").DistrictId,buildingId?:string)=>{setMapTarget({district,...(buildingId?{buildingId}:{}),seq:Date.now()});setTab("turn");setTimeout(()=>{document.querySelector(buildingId&&view.phase==="PRODUCTION"?`[data-building="${buildingId}"]`:"#hub-current-action")?.scrollIntoView({behavior:"smooth",block:"start"});},0);};
  const projectExpansion = { expandedProject, expandProject };
  const name = (id: string) => `${view.players.indexOf(id) + 1}. ${room.players.find((p) => p.playerId === id)?.displayName ?? "商会"}`;
  const act = (action: HubClientAction) => send({ type: "GAME_ACTION", action, phaseVersion });
  const disconnected = connectionState !== "CONNECTED";
  const actionProps = { view, act, name };

  const isHost = room.players.find((p) => p.playerId === view.playerId)?.isHost;
  const settlement = view.settlement;
  const consentNotice = learningConsent && <p className="hub-learning-status">NPC改善用データの提供に同意済み <button className="secondary-button" disabled={pending || disconnected} onClick={() => send({ type: "SET_LEARNING_CONSENT", consent: false })}>収集停止・この試合の提供データを削除</button></p>;
  const compactTrick = ["TRICK", "REWARD", "TRICK_RESULT"].includes(view.phase);
  return <div className={`hub hub-workspace ${compactTrick ? "hub-opportunity-mode" : ""}`} data-game-id="commercial-hub" data-phase={view.phase}>
    <header className="hub-heading"><div><span className="eyebrow">商都開発 · v{view.rulesVersion} · ROOM {room.roomCode}</span><h1>商都開発</h1></div><a href="/#/rules/commercial-hub" target="_blank" rel="noreferrer">{view.rulesVersion === "1.0" ? "正式版1.0ルール ↗" : view.next ? "NEXT試遊版ルール ↗" : "旧v0.5ルール ↗"}</a></header>
    <HubDashboard view={view} name={name} compact={compactTrick}/>{!compactTrick && <FinanceSummary view={view}/>}
    {!compactTrick && consentNotice}
    
    {disconnected && <div className="error-box" role="status">{connectionState === "OFFLINE" ? "オフラインです。" : "再接続しています。"}接続が戻ると現在の状態を復元します。60秒後はBOTが代行します。</div>}{error && <div className="error-box" role="alert">{error}</div>}
    <nav className="hub-mobile-tabs" aria-label="ゲーム画面">{[["turn", "手番"], ["city", "都市"], ["log", "履歴"]].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => { setTab(key!); window.scrollTo({ top: 0, behavior: "instant" }); }}>{label}</button>)}</nav>
    {view.result && <section className="hub-card hub-result" aria-label="最終結果"><span className="eyebrow">FINAL RESULT</span><h2>{view.result.winners.map(name).join(" ＆ ")} の勝利</h2><p>{view.result.reason === "TRIAL_HORIZON" ? `${view.round}ラウンド終了（${view.rulesVersion === "1.0" ? `終了方式${view.config.horizon === "12-14" ? "B" : "A"}` : "試験終了方式"}）` : view.result.reason === "ROUND_12" ? "12ラウンド終了" : "Lv4到達による最終ラウンド終了"} · 最終輸送費を精算済み</p><p>非赤字を優先 → 企業価値 → 事業資産 → 建物 → 公共事業。すべて同じなら同順位。</p><p aria-label="公共事業の得点ルール">{projectScoringLabel(view)}{projectCompletionLabel(view)}</p><div className="hub-result-grid">{view.result.ranking.map((e) => <article key={e.playerId}><h3>{e.rank}位 {name(e.playerId)}</h3><strong>{e.value.total}点</strong>{e.deficit && <b className="hub-deficit">最終精算後：赤字（資金{e.cash}）</b>}<dl>{([["建物", e.value.buildings], ["輸送路", e.value.routes], ["公共事業", e.value.projects], ["資金", e.value.cash], ["資材・商品", e.value.inventory]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{view.config.trickRule === "BID" && <p>予測成功点：{e.value.prediction ?? 0}点</p>}<small>隣接順位との比較：{TIE_NAMES[e.tieBreak]}</small></article>)}</div>{isHost ? <button className="primary-button" disabled={pending || disconnected || room.players.some((p) => p.connectionStatus !== "CONNECTED")} onClick={() => send({ type: "REMATCH" })}>再戦</button> : <p>ホストの再戦操作を待っています。</p>}<small>席を維持し、開始プレイヤーを再抽選します。全員の再接続後に再戦できます。</small></section>}
    {view.next && view.rulesVersion !== "1.0" && view.result && <TrialFeedback view={view}/>}
    <div className="hub-layout"><main className={`hub-turn-column ${tab === "turn" ? "hub-visible" : ""}`}>
      <BidStatus view={view} name={name} compact={compactTrick}/>
      {["ROUND_START", "BID", "TRICK", "REWARD", "TRICK_RESULT"].includes(view.phase) && <OpportunityHand key={view.round} view={view} act={act} name={name} disabled={pending || disconnected}/>}
      {view.next && view.phase === "MAJOR_SELECTION" && <fieldset className="hub-controls" disabled={pending || disconnected}><MajorPanel {...actionProps} mode="selection"/></fieldset>}
      {view.phase !== "FINISHED" && !compactTrick && <section id="hub-current-action" className="hub-card hub-action-panel" aria-label="現在の操作"><div className="hub-section-title"><h2>{phaseLabel(view)}</h2>{pending && <small role="status">送信中…</small>}</div>{view.phase === "INVESTMENT" && <p className="hub-order">第{view.currentInvestmentPass}周 / {view.investmentOrder.map(name).join(" → ")}</p>}
        <fieldset className="hub-controls" disabled={pending || disconnected} key={`${view.round}:${view.phase}`}>
          {view.phase === "MAJOR_SELECTION" && <p>大型投資の対象を上の専用パネルで選んでください。</p>}
          {view.phase === "ROUND_START" && <><p>{view.round === 1 ? "開始プレイヤーを抽選しました。6商機のうち1回だけノートランプです。" : "商機の順番を見て、使うカードを考えましょう。"}</p><p>リード：{name(view.trickLeader)}。勝者に関係なく席順で交代します。</p><button className="primary-button" disabled={view.roundReady.includes(view.playerId)} onClick={() => act({ type: "ROUND_READY" })}>{view.roundReady.includes(view.playerId) ? "他の商会を待っています" : "商機を確認・準備OK"}</button><small>{view.roundReady.length}/4人確認</small></>}
          {view.phase === "BID" && <BidPanel {...actionProps}/>}
          {view.phase === "BID_RESULT" && <><p>ビッド結果と予測成功点を上の一覧へ反映しました。結果はこのラウンド中も確認できます。</p><small>自動で{view.config.auditor && view.round >= 2 ? "監査官の配置" : "仕入"}へ進みます。</small></>}
          {view.phase === "AUDITOR_PLACEMENT" && <AuditorPanel {...actionProps}/>}
          {view.phase === "PROCUREMENT" && <ProcurementPanel {...actionProps}/>}{view.phase === "PRODUCTION" && <IncomePanel {...actionProps} mapTarget={mapTarget}/>}{view.phase === "INVESTMENT" && <InvestmentPanel {...actionProps} {...projectExpansion} highlight={setHighlight} mapTarget={mapTarget}/>}
          {view.phase === "ROUND_END" && <><p>下の精算結果を確認してください。</p><button className="primary-button" disabled={view.roundReady.includes(view.playerId)} onClick={() => act({ type: "ROUND_END_READY" })}>{view.roundReady.includes(view.playerId) ? "他の商会を待っています" : "精算を確認・次ラウンドへ"}</button><small>{view.roundReady.length}/4人確認</small></>}
        </fieldset>
      </section>}
      {compactTrick && <>{consentNotice}<FinanceSummary view={view}/></>}

      {!["ROUND_START", "BID", "TRICK", "REWARD", "TRICK_RESULT", "FINISHED"].includes(view.phase) && <details><summary>このRの商機・手札を確認</summary><OpportunityHand key={view.round} view={view} act={act} disabled={true}/></details>}
      {view.next && <details className="hub-major-collapsed"><summary>所有済み大型投資を確認</summary><fieldset className="hub-controls" disabled={pending || disconnected}><MajorPanel {...actionProps} mode="owned"/></fieldset></details>}
      {settlement && (view.phase === "ROUND_END" || view.phase === "FINISHED") && <section className="hub-card hub-settlement" aria-label="ラウンド精算"><h2>Round {settlement.round} 精算</h2><h3>自分の輸送費</h3><p>公共輸送 −{settlement.charges.filter((c) => c.payer === view.playerId && c.payee === null).reduce((n, c) => n + c.amount, 0)}</p>{view.players.filter((p) => p !== view.playerId).map((p) => <p key={p}>{name(p)}へ −{settlement.charges.filter((c) => c.payer === view.playerId && c.payee === p).reduce((n, c) => n + c.amount, 0)} / 受取 ＋{settlement.charges.filter((c) => c.payer === p && c.payee === view.playerId).reduce((n, c) => n + c.amount, 0)}</p>)}<strong>精算前 資金{settlement.cashBefore[view.playerId]} → 精算後 資金{settlement.cashAfter[view.playerId]}</strong><h3>都市発展</h3><p>建物 ＋{settlement.development.buildings} / 上位化 ＋{settlement.development.upgrades} / 輸送路 ＋{settlement.development.routes} / 公共事業 ＋{settlement.development.projects}</p><strong>{settlement.developmentBefore} → {settlement.developmentAfter}（＋{settlement.developmentAfter - settlement.developmentBefore}） / Lv{settlement.levelBefore} → Lv{settlement.levelAfter}</strong>{settlement.levelAfter > settlement.levelBefore && <p className="hub-announcement">{settlement.levelAfter === 2 ? "次Rから外周地区解放" : settlement.levelAfter === 3 ? "次Rは特別消費ブーム" : `Round ${view.finalRound}が最終ラウンド`}</p>}</section>}
    </main>
    <aside className={`hub-city-column ${tab === "city" ? "hub-visible" : ""}`}><CompanyOverview view={view} name={name}/><RoundSummary view={view}/><AuditorStatus view={view}/><CityBoard view={view} name={name} highlight={highlight} selectTarget={selectTarget}/><section className="hub-card" aria-label="公共事業"><h2>公共事業</h2><p>完成時に都市発展＋5。{projectCompletionLabel(view)}</p><PublicProjects view={view} name={name} {...projectExpansion}/><small aria-label="公共事業の得点ルール">{projectScoringLabel(view)}最多拠出ボーナスなし。</small></section><details className="hub-reference-help"><summary>対局設定・ルール補足</summary><details><summary>通常相場の袋</summary><p>使用済み：{view.marketUsed.map(id => CITY_CONDITIONS.find(c => c.id === id)!.name).join(" / ") || "なし"}</p><p>残候補：{view.marketRemaining.map(id => CITY_CONDITIONS.find(c => c.id === id)!.name).join(" / ") || "次の通常Rで補充"}</p></details>    {view.next && <p className="hub-callout">商都開発 {view.rulesVersion === "1.0" ? "正式版1.0" : "NEXT試遊版"} · {view.config.horizon}R · 大型投資{view.config.majorInvestments ? "あり" : "なし"}</p>}
    {v1Opportunities(view) && <details><summary>特別消費ブーム・公共事業商機のルール</summary><NextOpportunityRules/></details>}
    {["next-trial-3", "next-trial-4", "1.0"].includes(view.rulesVersion) && <details><summary>{view.rulesVersion === "1.0" ? "正式版1.0の建設・上位化ルール" : "NEXTの建設・上位化ルール"}</summary><NextInvestmentRules trial4={["next-trial-4", "1.0"].includes(view.rulesVersion)} formal={view.rulesVersion === "1.0"}/></details>}</details></aside>
    <section className={`hub-log-column ${tab === "log" ? "hub-visible" : ""}`}><RecentEvents view={view} name={name}/><PhaseResults view={view} name={name}/><div className="hub-card"><h2>確定行動ログ</h2><small>新しい順。再接続後もサーバーの履歴を復元します。</small><ol className="hub-event-log">{[...view.events].reverse().map((e) => <li key={e.seq}><small>R{e.round} · #{e.seq}</small><span>{eventText(e, name, !!view.next)}</span></li>)}</ol></div></section></div>
  </div>;
}





