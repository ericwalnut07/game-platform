import { useEffect, useState } from "react";
import { exchangeResources, NO_COST } from "../../../games/commercial-hub/resources";
import type { HubClientAction } from "../../../games/commercial-hub/state";
import type { Resources } from "../../../games/commercial-hub/types";
import type { HubView } from "../../../games/commercial-hub/view";
import { BuildingCard } from "./IncomePanel";
import { RESOURCE_NAMES, resourceText } from "./labels";
export interface ActionProps { view: HubView; act: (a: HubClientAction) => void; name: (id: string) => string }
export function ProcurementPanel({ view, act, name }: ActionProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, []);
  const [other, setOther] = useState(view.players.find((p) => p !== view.playerId)!);
  const [give, setGive] = useState<Resources>({ ...NO_COST, materials: 1 }), [receive, setReceive] = useState<Resources>({ ...NO_COST, cash: 1 });
  const own = view.companies.find((c) => c.playerId === view.playerId)!.resources;
  let issue = "";
  try { exchangeResources(own, view.companies.find((c) => c.playerId === other)!.resources, give, receive); } catch (e) { issue = (e as Error).message; }
  const done = view.procurementDone.includes(view.playerId), pending = view.negotiations.filter((n) => n.status === "PENDING");
  return <div className="hub-procurement">
    <p>4人同時。市場・在庫処分・交渉は好きな順番で行えます。受け取った資源もすぐに使えます。</p>
    <section><h3>公共市場 <small>通常購入 {view.usage.purchases}/1</small></h3><button className="secondary-button" disabled={done || !view.marketChoices.some((q) => q.action === "buy-material")} onClick={() => act({ type: "MARKET", action: "buy-material" })}>資材を購入<small>資金3 → 資材1</small></button><p className="hub-hint">1ラウンド1回。調達建物の使用回数とは独立しています。</p></section>
    <section><h3>調達建物 <small>各建物1ラウンド1回</small></h3><p>仕入価格に加え、建物1回の使用ごとに通常の輸送費をラウンド末に精算します。</p>{view.benefits.bulk > 0 && <p>大量仕入れ：追加資材 残り{view.benefits.bulk}。建物ごとに配分できます。未使用分は今ラウンド限り。</p>}{view.buildings.filter((b) => b.playerId === view.playerId && b.suit === "procurement").map((b) => <BuildingCard key={b.id} b={b} view={view} act={act} name={name}/>)}</section>
    <section><h3>在庫処分 <small>{view.usage.disposals}/2</small></h3>{!view.specialBoomPlayed ? <p className="hub-locked">都市Lv3到達後に解放（翌ラウンドから）</p> : <button className="secondary-button" disabled={done || !view.marketChoices.some((q) => q.action === "dispose-good")} onClick={() => act({ type: "MARKET", action: "dispose-good" })}>商品1 → 資金1</button>}</section>
    <section><h3>交渉 <small>提案 {view.usage.proposed ? "使用済み" : "残り1回"}</small></h3><p className="hub-hint">条件は当事者だけに表示されます。成立すると交換内容を全員に公開します。提案後の再提案・対案・無償譲渡はできません。</p>
      {!done && !view.usage.proposed && <form className="hub-trade-form" onSubmit={(e) => { e.preventDefault(); if (!issue) act({ type: "OFFER_TRADE", counterpart: other, terms: { give, receive } }); }}>
        <label>交渉相手<select value={other} onChange={(e) => setOther(e.target.value)}>{view.players.filter((p) => p !== view.playerId).map((p) => <option key={p} value={p}>{name(p)}</option>)}</select></label>
        <div className="hub-trade-bundles">{([["渡す", give, setGive], ["求める", receive, setReceive]] as const).map(([label, values, set]) => <fieldset key={label}><legend>{label}資源</legend>{(Object.keys(RESOURCE_NAMES) as (keyof Resources)[]).map((k) => <label key={k}>{RESOURCE_NAMES[k]}<input aria-label={`${label}${RESOURCE_NAMES[k]}`} type="number" min={0} max={k === "cash" ? Math.max(0, (label === "渡す" ? own : view.companies.find((c) => c.playerId === other)!.resources)[k]) : (label === "渡す" ? own : view.companies.find((c) => c.playerId === other)!.resources)[k]} value={values[k]} onChange={(e) => set({ ...values, [k]: Number(e.target.value) })}/></label>)}</fieldset>)}</div>
        {issue && <small className="hub-hint">{issue}</small>}<button className="primary-button" disabled={!!issue}>条件を提示</button>
      </form>}
      {pending.map((n) => <article className="hub-offer" key={n.id}><strong>{name(n.proposer)} → {name(n.counterpart)}</strong><p>{resourceText(n.give)} ↔ {resourceText(n.receive)}</p>{n.deadlineAt !== undefined && <small role="timer">回答期限まで {Math.max(0, Math.ceil((n.deadlineAt - now) / 1000))}秒 · 未回答は自動拒否</small>}{n.counterpart === view.playerId ? <div className="hub-buttons"><button className="primary-button" disabled={n.deadlineAt !== undefined && now >= n.deadlineAt} onClick={() => act({ type: "ANSWER_TRADE", negotiationId: n.id, accept: true })}>承諾</button><button className="secondary-button" onClick={() => act({ type: "ANSWER_TRADE", negotiationId: n.id, accept: false })}>拒否</button></div> : <small>相手の回答待ち</small>}</article>)}
      {view.negotiations.filter((n) => n.status !== "PENDING").map((n) => <p key={n.id}>{name(n.proposer)} → {name(n.counterpart)}：{n.status === "ACCEPTED" ? "成立" : n.status === "REJECTED" ? n.resolution === "TIMEOUT" ? "回答期限切れ・自動拒否" : "拒否" : "失効"}</p>)}
    </section>
    <button className="primary-button" disabled={done} onClick={() => act({ type: "PROCUREMENT_DONE" })}>{done ? "仕入完了・他の商会を待っています" : "仕入を完了"}</button><small>{view.procurementDone.length}/4人完了。全員完了時、未回答の提案は失効します。</small>
  </div>;
}
