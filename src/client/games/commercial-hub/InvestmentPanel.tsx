import { useState } from "react";
import { remainingBuildingCapacity } from "../../../games/commercial-hub/buildings";
import { BUILDING_NAMES, DISTRICTS, SUIT_NAMES } from "../../../games/commercial-hub/data";
import { exchangeResources } from "../../../games/commercial-hub/resources";
import type { HubClientAction, InvestmentAction } from "../../../games/commercial-hub/state";
import { SUITS, type TradeBundle } from "../../../games/commercial-hub/types";
import type { HubView } from "../../../games/commercial-hub/view";
import { ABILITIES, buildingName, districtName, resourceText, RESOURCE_NAMES, routeName } from "./labels";

export interface ActionProps { view: HubView; act: (action: HubClientAction) => void; name: (id: string) => string }
const emptyBundle = (): TradeBundle => ({ materials: 0, goods: 0, cash: 0 });
export function NegotiationPanel({ view, act, name }: ActionProps) {
  const turn = view.investmentTurn!, trade = turn.negotiation;
  const [counterpart, setCounterpart] = useState(view.players.find((id) => id !== turn.playerId)!);
  const [give, setGive] = useState<TradeBundle>(trade?.give ?? emptyBundle);
  const [receive, setReceive] = useState<TradeBundle>(trade?.receive ?? emptyBundle);
  const [countering, setCountering] = useState(false);
  const actor = turn.playerId, other = trade?.counterpart ?? counterpart;
  const canOffer = view.playerId === actor && !trade;
  const responder = trade?.status === "OFFERED" ? trade.counterpart : trade?.status === "COUNTERED" ? actor : null;
  const canAnswer = responder === view.playerId;
  let issue: string | null = null;
  try { exchangeResources(view.companies.find((c) => c.playerId === actor)!.resources, view.companies.find((c) => c.playerId === other)!.resources, give, receive); }
  catch (e) { issue = e instanceof Error ? e.message : "交換内容を確認してください"; }
  return <div className="hub-negotiation">
    <p>1手番につき相手1人・対案1回まで。交換は双方が資源を渡します。</p>
    {trade && <div className="hub-callout"><strong>{trade.status === "COUNTERED" ? "対案" : "提示中の条件"}</strong><p>{name(actor)} → {name(other)}：{resourceText(trade.give)}<br/>{name(other)} → {name(actor)}：{resourceText(trade.receive)}</p></div>}
    {(canOffer || countering) && <form onSubmit={(e) => { e.preventDefault(); if (!issue) act(countering ? { type: "COUNTER_TRADE", terms: { give, receive } } : { type: "OFFER_TRADE", counterpart, terms: { give, receive } }); }}>
      {canOffer && <label>交渉相手<select value={counterpart} onChange={(e) => setCounterpart(e.target.value)}>{view.players.filter((id) => id !== actor).map((id) => <option key={id} value={id}>{name(id)}</option>)}</select></label>}
      {([[give, setGive, actor, other], [receive, setReceive, other, actor]] as const).map(([bundle, setter, from, to], index) => <div key={index} className="hub-trade-bundle"><strong>{name(from)} → {name(to)} に渡す資源</strong><div className="hub-resource-inputs">{(["materials", "goods", "cash"] as const).map((key) => <label key={key}>{RESOURCE_NAMES[key]}<input type="number" min={0} max={view.companies.find((c) => c.playerId === from)!.resources[key]} step={1} value={bundle[key]} onChange={(e) => setter({ ...bundle, [key]: Number(e.target.value) })} aria-label={`${index === 0 ? "手番側" : "相手側"}の${RESOURCE_NAMES[key]}`}/></label>)}</div></div>)}
      {issue && <p className="hub-hint">{issue}</p>}
      <button className="primary-button" disabled={issue !== null}>{countering ? "対案を提示" : "条件を提示"}</button>
    </form>}
    {canOffer && <button className="secondary-button" onClick={() => act({ type: "SKIP_NEGOTIATION" })}>交渉をスキップ</button>}
    {canAnswer && <div className="hub-buttons"><button className="primary-button" onClick={() => act({ type: "ANSWER_TRADE", accept: true })}>承諾</button><button className="secondary-button" onClick={() => act({ type: "ANSWER_TRADE", accept: false })}>拒否</button>{trade?.status === "OFFERED" && <button className="secondary-button" onClick={() => setCountering(!countering)}>{countering ? "対案の入力を閉じる" : "対案を作る"}</button>}</div>}
    {!canOffer && !canAnswer && <p className="hub-wait">{name(responder ?? actor)}の操作を待っています。</p>}
  </div>;
}
const MARKET_LABELS = { "buy-material": "資金3 → 資材1", "buy-good": "資金3 → 商品1", "sell-material": "資材1 → 資金1", "sell-good": "商品1 → 資金1" };
export function InvestmentPanel({ view, act, name }: ActionProps) {
  const turn = view.investmentTurn!;
  const [type, setType] = useState<InvestmentAction["type"]>(view.investments[0]?.action.type ?? "BUILD");
  const [district, setDistrict] = useState(() => { const first = view.investments.find((q) => q.action.type === "BUILD"); return first?.action.type === "BUILD" ? first.action.district : "MARKET"; });
  const capacity = remainingBuildingCapacity(view.buildings, view.playerId);
  if (turn.step === "NEGOTIATION") return <NegotiationPanel view={view} act={act} name={name}/>;
  if (turn.playerId !== view.playerId) return <p className="hub-wait">{name(turn.playerId)}の{turn.step === "MARKET" ? "公共市場" : "投資"}を待っています。</p>;
  if (turn.step === "MARKET") return <><p>公共市場は1ラウンド1回、資源1個だけ取引できます。{view.publicMarketUsedByPlayer.includes(view.playerId) ? "今ラウンドは利用済みです。" : "今回は利用せず進むこともできます。"}</p><div className="hub-choice-grid">{Object.entries(MARKET_LABELS).map(([key, label]) => <button className="secondary-button" key={key} disabled={!view.marketChoices.includes(key as keyof typeof MARKET_LABELS)} onClick={() => act({ type: "MARKET", action: key as keyof typeof MARKET_LABELS })}>{label}</button>)}</div><button className="primary-button" onClick={() => act({ type: "MARKET", action: null })}>公共市場をスキップ</button></>;
  const quotes = view.investments.filter((q) => q.action.type === type && (q.action.type !== "BUILD" || q.action.district === district));
  return <>
    <div className="hub-capacity">あと{capacity.total}軒建設可能 · {SUITS.map((s) => `${SUIT_NAMES[s]}${capacity.bySuit[s]}`).join(" / ")}</div>
    <div className="hub-tabs" aria-label="投資アクション">{([["BUILD", "建設"], ["UPGRADE", "上位化"], ["ROUTE", "物流路"], ["CONTRIBUTE", "公共事業"]] as const).map(([key, label]) => <button key={key} aria-pressed={type === key} onClick={() => setType(key)}>{label}</button>)}</div>
    {type === "BUILD" && <label>建設する地区<select value={district} onChange={(e) => setDistrict(e.target.value as typeof district)}>{DISTRICTS.filter((d) => d.slots > 0).map((d) => <option key={d.id} value={d.id}>{d.name}（{view.buildings.filter((b) => b.district === d.id).length}/{d.slots}枠{d.outer && view.cityLevel < 2 ? "・Lv2から" : ""}）</option>)}</select></label>}
    {quotes.length === 0 && <p className="hub-hint">現在この選択肢では投資できません。資源・建物枠・City Lv・自社物流網の接続を確認してください。</p>}
    <div className="hub-investments">{quotes.map((quote, i) => {
      const action = quote.action;
      const b = action.type === "UPGRADE" ? view.buildings.find((entry) => entry.id === action.buildingId)! : null;
      const title = action.type === "BUILD" ? `${BUILDING_NAMES[action.suit][0]}を建設`
        : action.type === "UPGRADE" ? `${districtName(b!.district)}：${BUILDING_NAMES[b!.suit][1]}へ上位化`
        : action.type === "ROUTE" ? routeName(action.edgeId)
        : `貢献枠${action.slot + 1}：${RESOURCE_NAMES[view.activePublicProject!.slots[action.slot]!.resource]}`;
      const via = action.type === "BUILD" && DISTRICTS.find((d) => d.id === action.district)?.outer ? action.access === "OWN" ? "自社網" : action.access === "MUNICIPAL" ? "市営輸送" : `${name(action.access)}の網` : null;
      return <button key={i} className="hub-investment-choice" data-investment={action.type} onClick={() => act(action)}><strong>{title}</strong><span>{resourceText(quote.cost)}{via && `（${via}・輸送料${quote.transport?.fee ?? 0}込み）`}</span>
        {action.type === "BUILD" && <small>{ABILITIES[action.suit]![0]}</small>}{b && <small>{buildingName(b)} → {ABILITIES[b.suit]![1]}</small>}
        {(quote.uses.routeCredit > 0 || quote.uses.transportCredit > 0 || quote.uses.route.length > 0 || quote.uses.transport.length > 0 || quote.uses.influence.length > 0 || quote.uses.constructionCash > 0) && <small>軽減適用済み{quote.uses.routeCredit > 0 ? ` · 敷設クレジット${quote.uses.routeCredit}` : ""}{quote.uses.transportCredit > 0 ? ` · 輸送クレジット${quote.uses.transportCredit}` : ""}</small>}
      </button>;
    })}</div>
    {view.investments.length === 0 && <button className="primary-button" onClick={() => act({ type: "PASS_INVESTMENT" })}>実行可能な投資がないため終了</button>}
  </>;
}
