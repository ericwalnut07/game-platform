import { useState } from "react";
import type { InvestmentQuote } from "../../../games/commercial-hub/investment";
import type { InvestmentAction } from "../../../games/commercial-hub/state";
import type { Resources } from "../../../games/commercial-hub/types";
import { RESOURCE_NAMES, resourceText } from "./labels";
import { CostBreakdown } from "./CostBreakdown";

export function investmentTarget(action: InvestmentAction): string {
  const { freePayment: _, ...target } = action as InvestmentAction & { freePayment?: Resources };
  return JSON.stringify(target);
}

export function FlexibleInvestment({ options, resources, title, act }: { options: InvestmentQuote[]; resources: Resources; title: string; act: (action: InvestmentAction) => void }) {
  const cashOption = options.find(q => (q.action.type === "BUILD" || q.action.type === "UPGRADE") && q.action.freePayment?.cash === 2);
  const [payment, setPayment] = useState<Resources>(cashOption ? { cash: 2, materials: 0, goods: 0 } : { cash: 0, materials: 0, goods: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const base = options[0]!;
  const total = payment.cash + payment.materials + payment.goods;
  const selected = options.find(q => {
    const p = q.action.type === "BUILD" || q.action.type === "UPGRADE" ? q.action.freePayment : undefined;
    return p && p.cash === payment.cash && p.materials === payment.materials && p.goods === payment.goods;
  });
  const cost = { ...payment, cash: payment.cash + base.mandatoryCash! + base.auditFee };
  const after = { cash: resources.cash - cost.cash, materials: resources.materials - cost.materials, goods: resources.goods - cost.goods };
  const change = (key: keyof Resources, delta: number) => { setConfirmed(false); setPayment(p => ({ ...p, [key]: p[key] + delta })); };
  return <section className="hub-confirm hub-flex-payment" aria-label="自由資源の支払い選択">
    <h3>{title}</h3>
    <p>基礎資金{base.baseCash} · 地区割引 −{base.districtDiscount} · 異系統追加 ＋{base.districtSurcharge} · 開発軽減 −{base.developmentDiscount}</p>
    <strong>必須資金：{base.mandatoryCash} / 自由資源：{base.freeSlots}枠</strong>
    <p>監査費：資金{base.auditFee}（即時） / 輸送費：資金{base.transport?.amount ?? 0}（ラウンド末）</p>
    <button className="secondary-button" disabled={!cashOption} onClick={() => { setPayment({ cash: 2, materials: 0, goods: 0 }); setConfirmed(false); }}>自由枠をすべて資金で払う</button>
    <div className="hub-payment-counters">{(["cash", "materials", "goods"] as const).map(key => <div key={key} className="hub-payment-counter">
      <span>{RESOURCE_NAMES[key]}</span><button aria-label={`自由枠の${RESOURCE_NAMES[key]}を減らす`} disabled={payment[key] === 0} onClick={() => change(key, -1)}>−</button>
      <output aria-label={`自由枠の${RESOURCE_NAMES[key]}数量`}>{payment[key]}</output>
      <button aria-label={`自由枠の${RESOURCE_NAMES[key]}を増やす`} disabled={total >= base.freeSlots! || cost[key] >= resources[key]} onClick={() => change(key, 1)}>＋</button>
    </div>)}</div>
    <p role="status">自由枠：{total}/{base.freeSlots}{!selected && " · 2枠分を選択してください"}</p>
    <table className="hub-payment-preview"><caption>支払い前・今回・支払い後</caption><thead><tr><th>資源</th><th>前</th><th>支払</th><th>後</th></tr></thead><tbody>{(["cash", "materials", "goods"] as const).map(key => <tr key={key}><th>{RESOURCE_NAMES[key]}</th><td>{resources[key]}</td><td>{cost[key]}</td><td>{after[key]}</td></tr>)}</tbody></table>
    <small>支払い後の表示にはラウンド末の輸送費を含みません。</small>
    {!confirmed ? <button className="primary-button" disabled={!selected} onClick={() => setConfirmed(true)}>支払い内容を確認</button> : selected && <div role="group" aria-label="投資内容の確認">
      <CostBreakdown normalCost={selected.normalCost} auditFee={selected.auditFee} transport={selected.transport?.amount ?? 0}/>
      <strong>今回の支払い：{resourceText(selected.cost)}</strong>
      <button className="secondary-button" onClick={() => setConfirmed(false)}>支払い方法を修正</button>
      <button className="primary-button" onClick={() => act(selected.action)}>この内容で投資する</button>
    </div>}
  </section>;
}
