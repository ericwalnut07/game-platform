import { ResourcePreview } from "./ResourcePreview";
import { DISTRICTS, SUIT_NAMES } from "../../../games/commercial-hub/data";
import { districtOf } from "../../../games/commercial-hub/data";
import { flexibleBuildings, majorV4 } from "../../../games/commercial-hub/trial-features";
import { accessOptions } from "../../../games/commercial-hub/logistics";
import { unifiedOperations } from "../../../games/commercial-hub/trial-features";
import { useEffect, useState } from "react";
import type { Building } from "../../../games/commercial-hub/types";
import { ABILITIES, accessName, buildingName, districtName, resourceText } from "./labels";
import type { ActionProps } from "./ProcurementPanel";
import { SuitMark } from "./SuitMark";
import { CostBreakdown } from "./CostBreakdown";
export function BuildingCard({ b, view, act, name, mapTarget }: ActionProps & { b: Building; mapTarget?: { buildingId?: string; seq: number } | null }) {
  const [expanded, setExpanded] = useState(!unifiedOperations(view));
  useEffect(() => { if (mapTarget?.buildingId === b.id) setExpanded(true); }, [mapTarget, b.id]);
  const resources = view.companies.find(c => c.playerId === view.playerId)!.resources;
  const maximum = b.upgraded && b.suit !== "industry" ? 2 : 1;
  const [confirm, setConfirm] = useState<string | null>(null);
  const [amount, setAmount] = useState(maximum), [access, setAccess] = useState("OWN"), [bonus, setBonus] = useState(0);
  const used = view.usage.buildings.includes(b.id), options = view.buildingOptions.filter((q) => q.buildingId === b.id);
  const quantities = [...new Set(options.map((q) => q.amount))], selectedAmount = quantities.includes(amount) ? amount : quantities.length ? Math.max(...quantities) : undefined;
  const selectedBonus = Math.min(bonus, view.benefits.bulk);
  const transports = options.filter((q) => q.amount === selectedAmount && (b.suit !== "procurement" || q.bonus === selectedBonus)), quote = transports.find((q) => q.access === access) ?? transports[0];
  useEffect(() => { if (used && !quote) setExpanded(false); }, [used, !!quote]);
  const confirmationKey = JSON.stringify([quote, resources, view.round]);
  const monopoly=majorV4(view)&&b.district!=="PRIVATE"?view.next?.cards.find(c=>c.id==="logistics-monopoly"&&c.status==="ACTIVE"&&c.activeRound<=view.round&&c.targetSuit===(districtOf(b.district).suit??"administration")&&view.routes.some(r=>r.playerId===c.owner&&r.district===b.district)):undefined;
  const done = (unifiedOperations(view) ? view.productionDone : b.suit === "procurement" ? view.procurementDone : view.productionDone).includes(view.playerId);
  return <article data-building={b.id} className={`hub-building-action ${used && !quote ? "used" : ""}`}><h3><SuitMark suit={b.suit} filled={b.upgraded}/>{buildingName(b)} <small>{districtName(b.district)} / {b.upgraded ? "上位" : "下位"} / {used ? quote ? "通常使用済み・設備の追加使用可" : "使用済み" : "未使用"}</small></h3><p>{flexibleBuildings(view) && b.suit === "commerce" && b.upgraded ? "商品2 → 資金5（少量：商品1 → 資金3）" : ABILITIES[b.suit][b.upgraded ? 1 : 0]}</p>
    {unifiedOperations(view) && <button className="secondary-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "閉じる" : quote ? "この建物を選択" : "状態を見る"}</button>}
    <div hidden={!expanded}>{b.suit === "procurement" && view.benefits.bulk > 0 && <label>大量仕入れの配分<select aria-label="大量仕入れの配分" value={selectedBonus} disabled={done} onChange={(e) => { setBonus(Number(e.target.value)); setConfirm(null); }}>{Array.from({ length: view.benefits.bulk + 1 }, (_, n) => <option key={n} value={n}>追加資材 {n}（残り{view.benefits.bulk}）</option>)}</select></label>}
      {maximum > 1 && <label>{b.suit === "commerce" ? "販売する商品" : "仕入れる資材"}<select aria-label={b.suit === "commerce" ? "販売する商品" : "仕入れる資材"} value={selectedAmount ?? maximum} disabled={!quote || done} onChange={(e) => { setAmount(Number(e.target.value)); setConfirm(null); }}>{[2, 1].map((n) => <option key={n} value={n} disabled={!quantities.includes(n)}>{b.suit === "procurement" ? `資金${n} → 資材${n === 2 ? 3 : 2}` : `${n}個`}{n === maximum ? "（標準）" : "（少量）"}</option>)}</select></label>}
      {monopoly && <p className="hub-monopoly-note" role="status">{view.next?.blocked.includes(monopoly.owner)?`🔒 ${name(monopoly.owner)}の物流独占路線は封鎖中です。迂回できません。`:`🔒 物流独占契約：${name(monopoly.owner)}の路線を強制利用（${monopoly.owner===view.playerId?"自社：資金0":"他社：資金1"}、ラウンド末精算）。公共輸送・他社路線は選択できません。`}</p>}
      {quote && <>{(!unifiedOperations(view) || transports.length > 1) && <label>輸送方法<select aria-label="輸送方法" value={quote.access} onChange={(e) => { setAccess(e.target.value); setConfirm(null); }}>{transports.map((q) => <option key={q.access} value={q.access}>{accessName(q.access, name)} / R末に資金{q.transport.amount}</option>)}</select></label>}<p className="hub-quote">{resourceText(quote.cost)} → <strong>{resourceText(quote.reward)}</strong>{quote.bonus > 0 && <small>{b.suit === "industry" ? "増産" : b.suit === "procurement" ? "大量仕入れ" : "販促"}＋{quote.bonus}を含む</small>}<small>少量でも建物の使用1回を消費します。</small></p><ResourcePreview before={resources} after={{ cash: resources.cash-quote.cost.cash+quote.reward.cash, materials: resources.materials-quote.cost.materials+quote.reward.materials, goods: resources.goods-quote.cost.goods+quote.reward.goods }} label="使用前 → 使用後"/><CostBreakdown normalCost={quote.normalCost} auditFee={quote.auditFee} transport={quote.transport.amount}/></>}
      <button className="primary-button" disabled={done || !quote} onClick={() => { if (!quote) return; if (unifiedOperations(view) && confirm !== confirmationKey) { setConfirm(confirmationKey); return; } setConfirm(null); act({ type: "USE_BUILDING", buildingId: b.id, amount: quote.amount, access: quote.access, ...(b.suit === "procurement" ? { bonus: quote.bonus } : {}) }); }}>{unifiedOperations(view) && quote && confirm !== confirmationKey ? "稼働内容を確認" : used && !quote ? "使用済み" : `${used ? "追加で" : ""}${b.suit === "industry" ? "生産する" : b.suit === "procurement" ? "仕入れる" : "販売する"}`}</button>{!used && !quote && !done && <small role="status">{!accessOptions(view,view.playerId,b.district).length ? "利用できる輸送路がありません。独占路線の封鎖中は迂回できません。" : "監査費を含む必要資源が不足しています。資金・資材・商品を確認してください。"}</small>}
    </div>
  </article>;
}
export function IncomePanel(props: ActionProps & { mapTarget?: { buildingId?: string; seq: number } | null }) {
  const { view, act } = props, own = view.buildings.filter((b) => b.playerId === view.playerId && (unifiedOperations(view) || b.suit !== "procurement")), done = view.productionDone.includes(view.playerId);
  const groups = (["procurement", "industry", "commerce"] as const).map(suit => ({ suit, buildings: own.filter(b => b.suit === suit).sort((a, b) => Number(view.buildingOptions.some(q => q.buildingId === b.id)) - Number(view.buildingOptions.some(q => q.buildingId === a.id)) || Number(b.upgraded) - Number(a.upgraded) || DISTRICTS.findIndex(d => d.id === a.district) - DISTRICTS.findIndex(d => d.id === b.district)) }));
  const available = own.filter(b => view.buildingOptions.some(q => q.buildingId === b.id)).length;
  return <><p>{unifiedOperations(view) ? "調達 → 工業 → 商業の順に表示。稼働順は自由です。" : "4人同時。建物は好きな順番で各1回。生産した商品を、このフェーズ中に販売できます。"}</p>{groups.filter(g => g.buildings.length).map(g => <section key={g.suit} className="hub-building-group" aria-label={`${SUIT_NAMES[g.suit]}の建物`}><h3>{SUIT_NAMES[g.suit]}</h3><div className="hub-production-list">{g.buildings.map(b => <BuildingCard key={b.id} b={b} {...props}/>)}</div></section>)}{!own.length && <p>まだ建物がありません。次の投資フェーズで建設できます。</p>}{!done && available > 0 && <p className="hub-announcement" role="status">まだ稼働できる建物が{available}棟あります（追加使用を含む）。使用せず終了することもできます。</p>}<p className="hub-hint">完了後は{unifiedOperations(view) ? "建物稼働" : "生産・販売"}へ戻れません。全員完了後に投資へ進みます。</p><button className="primary-button" disabled={done} onClick={() => act({ type: "PRODUCTION_DONE" })}>{done ? "完了・他の商会を待っています" : unifiedOperations(view) ? "建物稼働を完了" : "生産・販売を完了"}</button><small>{view.productionDone.length}/4人完了 · 待機対象：{view.players.filter(p=>!view.productionDone.includes(p)).map(props.name).join(" / ")}</small></>;
}
