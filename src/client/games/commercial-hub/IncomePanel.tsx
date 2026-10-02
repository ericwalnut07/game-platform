import { useState } from "react";
import type { Building } from "../../../games/commercial-hub/types";
import { ABILITIES, accessName, buildingName, districtName, resourceText } from "./labels";
import type { ActionProps } from "./ProcurementPanel";
import { SuitMark } from "./SuitMark";
function BuildingCard({ b, view, act, name }: ActionProps & { b: Building }) {
  const [amount, setAmount] = useState(1), [access, setAccess] = useState("OWN");
  const used = view.usage.buildings.includes(b.id), options = view.buildingOptions.filter((q) => q.buildingId === b.id);
  const quantities = [...new Set(options.map((q) => q.amount))], selectedAmount = quantities.includes(amount) ? amount : quantities[0];
  const transports = options.filter((q) => q.amount === selectedAmount), quote = transports.find((q) => q.access === access) ?? transports[0];
  const done = view.productionDone.includes(view.playerId);
  return <article data-building={b.id} className={`hub-building-action ${used ? "used" : ""}`}><h3><SuitMark suit={b.suit} filled={b.upgraded}/>{buildingName(b)} <small>{districtName(b.district)} / {used ? "使用済み" : "未使用"}</small></h3><p>{ABILITIES[b.suit][b.upgraded ? 1 : 0]}</p>
    {b.suit === "procurement" ? <small>割引は仕入フェーズで自動適用</small> : <>
      {b.suit === "commerce" && b.upgraded && <label>販売する商品<select value={selectedAmount ?? 1} disabled={!quote || done} onChange={(e) => setAmount(Number(e.target.value))}>{[1, 2].map((n) => <option key={n} value={n} disabled={!quantities.includes(n)}>{n}個</option>)}</select></label>}
      {quote && <><label>輸送方法<select value={quote.access} onChange={(e) => setAccess(e.target.value)}>{transports.map((q) => <option key={q.access} value={q.access}>{accessName(q.access, name)} / R末に資金{q.transport.amount}</option>)}</select></label><p className="hub-quote">{resourceText(quote.cost)} → <strong>{resourceText(quote.reward)}</strong>{quote.bonus > 0 && <small>{b.suit === "industry" ? "増産" : "販促"}＋{quote.bonus}を含む</small>}<small>未精算輸送費 ＋{quote.transport.amount}</small></p></>}
      <button className="primary-button" disabled={done || !quote} onClick={() => quote && act({ type: "USE_BUILDING", buildingId: b.id, amount: quote.amount, access: quote.access })}>{used ? "使用済み" : b.suit === "industry" ? "生産する" : "販売する"}</button>{!used && !quote && !done && <small>必要な資源がありません</small>}
    </>}
  </article>;
}
export function IncomePanel(props: ActionProps) {
  const { view, act } = props, own = view.buildings.filter((b) => b.playerId === view.playerId), done = view.productionDone.includes(view.playerId);
  return <><p>4人同時。建物は好きな順番で各1回。生産した商品を、このフェーズ中に販売できます。</p><div className="hub-production-list">{own.map((b) => <BuildingCard key={b.id} b={b} {...props}/>)}</div>{!own.length && <p>まだ建物がありません。次の投資フェーズで建設できます。</p>}<p className="hub-hint">完了後は生産・販売へ戻れません。全員完了後に投資へ進みます。</p><button className="primary-button" disabled={done} onClick={() => act({ type: "PRODUCTION_DONE" })}>{done ? "完了・他の商会を待っています" : "生産・販売を完了"}</button><small>{view.productionDone.length}/4人完了</small></>;
}
