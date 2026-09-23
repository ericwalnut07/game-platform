import { useState } from "react";
import { cardId } from "../../../games/commercial-hub/cards";
import { SUIT_NAMES } from "../../../games/commercial-hub/data";
import type { HubClientAction } from "../../../games/commercial-hub/state";
import { SUITS } from "../../../games/commercial-hub/types";
import type { HubView } from "../../../games/commercial-hub/view";
import type { ClientRoomMessageInput, RoomPublicState } from "../../../shared/room-protocol";
import type { RoomConnectionState } from "../../lib/room-socket";
import { CityBoard } from "./CityBoard";
import { IncomePanel } from "./IncomePanel";
import { InvestmentPanel } from "./InvestmentPanel";
import { ABILITIES, buildingName, districtName, opportunityName, PLAYER_COLORS, RESOURCE_NAMES, resourceText, REWARDS, routeName } from "./labels";
import "./commercial-hub.css";

const PHASE_NAMES = { ROUND_START: "商機の確認", TRICK: "トリック", REWARD: "商機の獲得", TRICK_RESULT: "トリック結果", INVESTMENT: "投資", INCOME: "収入・生産", ROUND_END: "都市発展", FINISHED: "最終結果" };
interface Props {
  room: RoomPublicState; view: HubView; phaseVersion: number; send: (message: ClientRoomMessageInput) => void;
  connectionState: RoomConnectionState; pending: boolean; error: string | null;
}
export function CommercialHubScreen({ room, view, phaseVersion, send, connectionState, pending, error }: Props) {
  const [tab, setTab] = useState("turn");
  const name = (id: string) => room.players.find((p) => p.playerId === id)?.displayName ?? "商会";
  const act = (action: HubClientAction) => send({ type: "GAME_ACTION", action, phaseVersion });
  const myResources = view.companies.find((c) => c.playerId === view.playerId)!.resources;
  const currentOpportunity = view.opportunities[view.trickIndex]!;
  const turn = view.investmentTurn;
  const credits = view.credits[view.playerId]!;
  const tricksFinished = ["INVESTMENT", "INCOME", "ROUND_END", "FINISHED"].includes(view.phase);
  const disconnected = connectionState !== "CONNECTED";
  const hand = [...view.hand].sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank);
  return <div className="hub" data-game-id="commercial-hub" data-phase={view.phase}>
    <header className="hub-heading"><div><span className="eyebrow">商都開発 · v{view.rulesVersion} 試作版 · ROOM {room.roomCode}</span><h1>Round {view.round} <span>{PHASE_NAMES[view.phase]}</span></h1></div><a href="/#/rules/commercial-hub" target="_blank" rel="noreferrer">ルール ↗</a></header>
    <div className="hub-overview"><strong>City Lv{view.cityLevel} <small>発展度 {view.cityDevelopment}</small></strong><span>{view.cityCondition.name}<small>Trump：{view.trump ? SUIT_NAMES[view.trump] : "なし"}</small></span><span>{view.phase === "INVESTMENT" ? `投資 第${view.currentInvestmentPass}巡` : view.phase === "TRICK" ? `トリック ${view.trickIndex + 1}/${view.opportunities.length}` : PHASE_NAMES[view.phase]}<small>{view.currentPlayer ? `${name(view.currentPlayer)}の手番` : "全員で確認"}</small></span></div>
    {view.finalRound !== null && <div className="hub-final-round">City Lv4 到達 · {view.finalRound === view.round ? "このラウンドが最終ラウンドです" : `Round ${view.finalRound} が最終ラウンドです`}</div>}
    <div className="hub-my-resources" aria-label="自分の資源"><strong>{name(view.playerId)}</strong>{Object.entries(myResources).map(([key, value]) => <span key={key}>{RESOURCE_NAMES[key as keyof typeof myResources]} <b>{value}</b></span>)}<span>企業価値 <b>{view.companyValues[view.playerId]!.total}</b></span></div>
    {disconnected && <div className="error-box" role="status">{connectionState === "OFFLINE" ? "オフラインです。" : "再接続しています。"}接続が戻ると現在の状態を復元します。</div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    <nav className="hub-mobile-tabs" aria-label="ゲーム画面">{[["turn", "手番"], ["city", "都市・事業"], ["companies", "商会・履歴"]].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key!)}>{label}</button>)}</nav>
    {view.result && <section className="hub-card hub-result" aria-label="最終結果"><span className="eyebrow">FINAL RESULT</span><h2>{view.result.winners.map(name).join(" ＆ ")} の{view.result.winners.length > 1 ? "共同勝利" : "勝利"}</h2><p>Round {view.result.round} 終了 · {view.result.reason === "VALUE_25" ? "企業価値25点到達" : "City Lv4到達の次ラウンドが終了"}</p><p>同点の場合は資金を比較。資金も同じなら共同勝利です。</p><div className="hub-result-grid">{view.result.ranking.map((entry) => <div key={entry.playerId}><strong>{entry.rank}位 {name(entry.playerId)}</strong><b>{entry.value}点</b><small>資金 {entry.cash}</small></div>)}</div>{room.players.find((p) => p.playerId === view.playerId)?.isHost && <button className="primary-button" disabled={pending || disconnected} onClick={() => send({ type: "REMATCH" })}>同じ4人でもう一度遊ぶ</button>}<p className="hub-hint">企業価値の内訳は「商会・履歴」で確認できます。</p></section>}
    <div className="hub-layout">
      <div className={`hub-turn-column ${tab === "turn" ? "hub-visible" : ""}`}>
        <section className="hub-card hub-opportunities"><h2>このラウンドの商機</h2><ol>{view.opportunities.map((opportunity, index) => <li key={index} className={tricksFinished || index < view.trickIndex ? "past" : index === view.trickIndex ? "current" : ""}><span>{index + 1}</span>{opportunityName(opportunity)}{!tricksFinished && index === view.trickIndex && <small>現在</small>}</li>)}</ol><p>{REWARDS[currentOpportunity]}</p></section>
        {view.phase !== "FINISHED" && <section className="hub-card hub-action-panel" aria-label="現在の操作"><div className="hub-section-title"><h2>{PHASE_NAMES[view.phase]}</h2>{pending && <span role="status">送信中…</span>}</div>
          {view.phase === "INVESTMENT" && <ol className="hub-steps">{([["NEGOTIATION", "交渉"], ["MARKET", "公共市場"], ["INVESTMENT", "投資"]] as const).map(([step, label], i) => <li key={step} className={turn?.step === step ? "current" : ""}>{i + 1}. {label}</li>)}</ol>}
          <fieldset disabled={pending || disconnected} className="hub-controls" key={`${view.round}:${phaseVersion}`}>
            {view.phase === "ROUND_START" && <><p>すべての商機を見て、使うカードを考えましょう。リードは勝者と関係なく、時計回りに移ります。</p><p>このラウンドの最初のリード：<strong>{name(view.trickLeader)}</strong></p><button className="primary-button" disabled={view.roundReady.includes(view.playerId)} onClick={() => act({ type: "ROUND_READY" })}>{view.roundReady.includes(view.playerId) ? "他の商会を待っています" : "商機を確認・準備OK"}</button><small>{view.roundReady.length}/4人が確認済み</small></>}
            {view.phase === "TRICK" && <p className="hub-callout">{view.currentPlayer === view.playerId ? "あなたの手番です。下の手札から1枚選んでください。" : `${name(view.currentPlayer!)}のカードを待っています。`}<br/>Lead Suit：{view.playedCards[0] ? SUIT_NAMES[view.playedCards[0].card.suit] : "最初のカードで決定"} · Trump：{view.trump ? SUIT_NAMES[view.trump] : "なし"}</p>}
            {view.phase === "REWARD" && <><p>{name(view.rewardChoice!.playerId)}が{view.rewardChoice!.kind === "SALE" ? "販売数" : "無料で貢献する枠"}を選びます。</p>{view.rewardChoice!.playerId === view.playerId && <div className="hub-choice-grid">{view.rewardChoice!.kind === "SALE" ? Array.from({ length: view.rewardChoice!.maximum + 1 }, (_, n) => <button key={n} className="secondary-button" onClick={() => act({ type: "CLAIM_REWARD", amount: n })}>{n === 0 ? "販売しない" : `商品${n} → 資金${n * 2}`}</button>) : view.activePublicProject?.slots.map((slot, i) => <button key={i} className="secondary-button" disabled={slot.playerId !== null} onClick={() => act({ type: "CLAIM_REWARD", amount: i })}>枠{i + 1} {RESOURCE_NAMES[slot.resource]}{slot.playerId ? "（貢献済み）" : "（無料）"}</button>)}</div>}</>}
            {view.phase === "TRICK_RESULT" && <p>1位：<strong>{name(view.trickResults.at(-1)!.ranking[0]!)}</strong> · 2位：<strong>{name(view.trickResults.at(-1)!.ranking[1]!)}</strong><br/>獲得結果は履歴に残ります。自動で次へ進みます。</p>}
            {view.phase === "INVESTMENT" && <InvestmentPanel view={view} act={act} name={name}/>}
            {view.phase === "INCOME" && <IncomePanel view={view} act={act} name={name}/>}
            {view.phase === "ROUND_END" && <p>収入・生産を反映しました。City Lv{view.cityLevel}・発展度{view.cityDevelopment}。次ラウンドへ自動で進みます。</p>}
          </fieldset>
        </section>}
        {(["TRICK", "REWARD", "TRICK_RESULT"] as string[]).includes(view.phase) && <section className="hub-card"><h2>場のカード</h2><div className="hub-played">{view.players.map((id) => { const play = view.playedCards.find((p) => p.playerId === id); return <div key={id}><small>{name(id)}{view.trickLeader === id ? " · Lead" : ""}</small><strong>{play ? `${SUIT_NAMES[play.card.suit]} ${play.card.rank}` : "—"}</strong></div>; })}</div></section>}
        {view.hand.length > 0 && <section className="hub-card hub-hand" aria-label="自分の手札"><div className="hub-section-title"><h2>あなたの手札</h2><span>他の人には非公開</span></div><p className="hub-hint">Lead Suitを持っている場合は必ず従います。</p><div className="hub-hand-cards">{hand.map((card) => <button className={`hub-playing-card hub-suit-${card.suit}`} key={cardId(card)} aria-label={`${SUIT_NAMES[card.suit]} ${card.rank}`} disabled={pending || disconnected || !view.legalCards.some((legal) => cardId(legal) === cardId(card))} onClick={() => act({ type: "PLAY_CARD", card })}><span>{SUIT_NAMES[card.suit]}</span><strong>{card.rank}</strong></button>)}</div></section>}
        <div className="hub-card hub-credit-summary"><strong>保持中の権利</strong><p>敷設 {credits.route} · 輸送 {credits.transport}<br/>特別販売 {credits.businessSale}回 · 生産+1 {credits.productionBoost}回 · 建設資金-1 {credits.constructionCash}回</p><small>未使用分は繰越。建物による軽減は毎ラウンド更新。</small></div>
      </div>
      <div className={`hub-city-column ${tab === "city" ? "hub-visible" : ""}`}><CityBoard view={view} name={name}/><section className="hub-card" aria-label="公共事業"><h2>公共事業</h2>{view.activePublicProject ? <><h3>{view.activePublicProject.name}</h3><p>{view.activePublicProject.slots.filter((s) => s.playerId).length}/6枠 · 完成で都市発展+3</p><div className="hub-project-slots">{view.activePublicProject.slots.map((slot, i) => <div key={i} className={slot.playerId ? "filled" : ""}><strong>{RESOURCE_NAMES[slot.resource]}{slot.resource === "influence" ? "1" : "2"}</strong><small>{slot.playerId ? name(slot.playerId) : "未貢献"}</small></div>)}</div></> : <p>{view.completedPublicProjects.length === 3 ? "3件すべて完成しました。" : "City Lv2になった次ラウンド開始時に、最初の案件を公開します。"}</p>}<p className="hub-hint">完成案件のみ1枠1点。最多貢献は単独+2、同数なら各+1。</p>{view.completedPublicProjects.length > 0 && <details><summary>完成済み {view.completedPublicProjects.length}件</summary>{view.completedPublicProjects.map((project) => <p key={project.id}><strong>{project.name}</strong><br/>{view.players.map((id) => `${name(id)} ${project.slots.filter((s) => s.playerId === id).length}枠`).join(" · ")}</p>)}</details>}</section></div>
      <div className={`hub-company-column ${tab === "companies" ? "hub-visible" : ""}`}><section className="hub-card"><h2>各商会の公開情報</h2><div className="hub-companies">{view.companies.map((company, seat) => {
        const id = company.playerId, score = view.companyValues[id]!, owned = view.buildings.filter((b) => b.playerId === id);
        const transport = owned.filter((b) => b.suit === "logistics" && !view.discountUses.transport.includes(b.id)).length;
        const routes = owned.filter((b) => b.suit === "logistics" && b.upgraded && !view.discountUses.route.includes(b.id)).length;
        const hq = owned.filter((b) => b.suit === "civic" && b.upgraded && !view.discountUses.influence.includes(b.id)).length;
        return <article className="hub-company" key={id} style={{ borderColor: PLAYER_COLORS[seat] }}><div className="hub-section-title"><h3>{seat + 1}. {name(id)}{id === view.playerId ? "（あなた）" : ""}</h3><strong>{score.total}点</strong></div><div className="hub-resources">{Object.entries(company.resources).map(([key, amount]) => <span key={key}>{RESOURCE_NAMES[key as keyof typeof myResources]} <b>{amount}</b></span>)}</div><small>{room.players.find((p) => p.playerId === id)?.connectionStatus === "DISCONNECTED" ? "切断中 · " : ""}公共市場：{view.publicMarketUsedByPlayer.includes(id) ? "利用済み" : "未使用"} · 手札{view.handCounts.find((h) => h.playerId === id)!.count}枚</small><p>敷設クレジット{view.credits[id]!.route} / 輸送クレジット{view.credits[id]!.transport}</p><details open={view.phase === "FINISHED"}><summary>得点内訳・建物・物流路</summary><p>建物 {score.buildings} ＋ 上位化 {score.upgrades} ＋ 物流路 {score.routes} ＋ 公共事業 {score.projects} ＋ 資金 {score.cash} ＋ 在庫 {score.inventory}</p><p>建物軽減の残り：輸送料{transport} / 敷設資金{routes} / 影響力{hq}</p>{owned.map((b) => <p key={b.id}><strong>{districtName(b.district)} · {buildingName(b)}</strong><br/><small>{ABILITIES[b.suit]![b.upgraded ? 1 : 0]}</small></p>)}{Object.entries(view.routeOwnership).filter(([, owner]) => owner === id).map(([edge]) => <p key={edge}>{routeName(edge)}</p>)}</details></article>;
      })}</div></section><section className="hub-card"><h2>このラウンドのトリック履歴</h2>{view.trickResults.length === 0 && <p>まだ結果はありません。</p>}{view.trickResults.map((result) => <details key={result.index}><summary>{result.index + 1}. {opportunityName(result.opportunity)} · 1位 {name(result.ranking[0]!)}</summary><p>{result.ranking.map((id, i) => `${i + 1}位 ${name(id)}`).join(" / ")}</p><p>{result.played.map((p) => `${name(p.playerId)}：${SUIT_NAMES[p.card.suit]}${p.card.rank}`).join(" / ")}</p><p>{REWARDS[result.opportunity]}</p></details>)}</section></div>
    </div>
  </div>;
}
