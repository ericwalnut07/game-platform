import { useState } from "react";
import type { Building } from "../../../games/commercial-hub/types";
import { ABILITIES, accessName, buildingName, districtName, resourceText } from "./labels";
import type { ActionProps } from "./ProcurementPanel";
import { SuitMark } from "./SuitMark";
import { CostBreakdown } from "./CostBreakdown";
export function BuildingCard({ b, view, act, name }: ActionProps & { b: Building }) {
  const maximum = b.upgraded && b.suit !== "industry" ? 2 : 1;
  const [amount, setAmount] = useState(maximum), [access, setAccess] = useState("OWN"), [bonus, setBonus] = useState(0);
  const used = view.usage.buildings.includes(b.id), options = view.buildingOptions.filter((q) => q.buildingId === b.id);
  const quantities = [...new Set(options.map((q) => q.amount))], selectedAmount = quantities.includes(amount) ? amount : quantities.length ? Math.max(...quantities) : undefined;
  const selectedBonus = Math.min(bonus, view.benefits.bulk);
  const transports = options.filter((q) => q.amount === selectedAmount && (b.suit !== "procurement" || q.bonus === selectedBonus)), quote = transports.find((q) => q.access === access) ?? transports[0];
  const done = (b.suit === "procurement" ? view.procurementDone : view.productionDone).includes(view.playerId);
  return <article data-building={b.id} className={`hub-building-action ${used && !quote ? "used" : ""}`}><h3><SuitMark suit={b.suit} filled={b.upgraded}/>{buildingName(b)} <small>{districtName(b.district)} / {used ? quote ? "通常使用済み・設備の追加使用可" : "使用済み" : "未使用"}</small></h3><p>{ABILITIES[b.suit][b.upgraded ? 1 : 0]}</p>
    <>{b.suit === "procurement" && view.benefits.bulk > 0 && <label>大量仕入れの配分<select value={selectedBonus} disabled={done || !quote} onChange={(e) => setBonus(Number(e.target.value))}>{Array.from({ length: view.benefits.bulk + 1 }, (_, n) => <option key={n} value={n}>追加資材 {n}（残り{view.benefits.bulk}）</option>)}</select></label>}
      {maximum > 1 && <label>{b.suit === "commerce" ? "販売する商品" : "仕入れる資材"}<select value={selectedAmount ?? maximum} disabled={!quote || done} onChange={(e) => setAmount(Number(e.target.value))}>{[2, 1].map((n) => <option key={n} value={n} disabled={!quantities.includes(n)}>{b.suit === "procurement" ? `資金${n} → 資材${n === 2 ? 3 : 2}` : `${n}個`}{n === maximum ? "（標準）" : "（少量）"}</option>)}</select></label>}
      {quote && <><label>輸送方法<select value={quote.access} onChange={(e) => setAccess(e.target.value)}>{transports.map((q) => <option key={q.access} value={q.access}>{accessName(q.access, name)} / R末に資金{q.transport.amount}</option>)}</select></label><p className="hub-quote">{resourceText(quote.cost)} → <strong>{resourceText(quote.reward)}</strong>{quote.bonus > 0 && <small>{b.suit === "industry" ? "増産" : b.suit === "procurement" ? "大量仕入れ" : "販促"}＋{quote.bonus}を含む</small>}<small>少量でも建物の使用1回を消費します。</small></p><CostBreakdown normalCost={quote.normalCost} auditFee={quote.auditFee} transport={quote.transport.amount}/></>}
      <button className="primary-button" disabled={done || !quote} onClick={() => quote && act({ type: "USE_BUILDING", buildingId: b.id, amount: quote.amount, access: quote.access, ...(b.suit === "procurement" ? { bonus: quote.bonus } : {}) })}>{used && !quote ? "使用済み" : `${used ? "追加で" : ""}${b.suit === "industry" ? "生産する" : b.suit === "procurement" ? "仕入れる" : "販売する"}`}</button>{!used && !quote && !done && <small role="status">監査費を含む必要資源が不足しています。資金・資材・商品と輸送方法を確認してください。</small>}
    </>
  </article>;
}
export function IncomePanel(props: ActionProps) {
  const { view, act } = props, own = view.buildings.filter((b) => b.playerId === view.playerId && b.suit !== "procurement"), done = view.productionDone.includes(view.playerId);
  return <><p>4人同時。建物は好きな順番で各1回。生産した商品を、このフェーズ中に販売できます。</p><div className="hub-production-list">{own.map((b) => <BuildingCard key={b.id} b={b} {...props}/>)}</div>{!own.length && <p>まだ建物がありません。次の投資フェーズで建設できます。</p>}<p className="hub-hint">完了後は生産・販売へ戻れません。全員完了後に投資へ進みます。</p><button className="primary-button" disabled={done} onClick={() => act({ type: "PRODUCTION_DONE" })}>{done ? "完了・他の商会を待っています" : "生産・販売を完了"}</button><small>{view.productionDone.length}/4人完了</small></>;
}

