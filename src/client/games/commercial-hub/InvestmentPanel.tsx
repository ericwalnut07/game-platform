import { useState } from "react";
import { remainingBuildingCapacity } from "../../../games/commercial-hub/buildings";
import { BUILDING_NAMES, DISTRICTS, SUIT_NAMES } from "../../../games/commercial-hub/data";
import type { InvestmentQuote } from "../../../games/commercial-hub/investment";
import type { InvestmentAction } from "../../../games/commercial-hub/state";
import { BUILDING_SUITS, type BuildingSuit, type DistrictId } from "../../../games/commercial-hub/types";
import type { MapHighlight } from "./CityBoard";
import { accessName, buildingName, districtName, RESOURCE_NAMES, resourceText } from "./labels";
import type { ActionProps } from "./ProcurementPanel";
import { PublicProjects, type ProjectExpansion } from "./PublicProjects";
import { SuitMark } from "./SuitMark";
import { CostBreakdown } from "./CostBreakdown";
export function InvestmentPanel({ view, act, name, highlight, expandedProject, expandProject }: ActionProps & ProjectExpansion & { highlight: (h: MapHighlight) => void }) {
  const [type, setType] = useState<InvestmentAction["type"]>("BUILD"), [district, setDistrict] = useState<DistrictId>("MARKET"), [suit, setSuit] = useState<BuildingSuit>("commerce"), [selected, setSelected] = useState<string | null>(null);
  if (view.currentPlayer !== view.playerId) return <p className="hub-wait">{name(view.currentPlayer!)}の投資を待っています。</p>;
  const cap = remainingBuildingCapacity(view.buildings, view.playerId);
  const quote = view.investments.find((q) => JSON.stringify(q.action) === selected && (q.action.type !== "CONTRIBUTE" || q.action.projectId === expandedProject));
  const choices = view.investments.filter((q) => q.action.type === type && (q.action.type !== "BUILD" || q.action.district === district && q.action.suit === suit));
  function title(q: InvestmentQuote): string {
    const a = q.action;
    if (a.type === "BUILD") return `${districtName(a.district)}：${BUILDING_NAMES[a.suit][0]}を建設`;
    if (a.type === "UPGRADE") { const b = view.buildings.find((b) => b.id === a.buildingId)!; return `${districtName(b.district)}：${buildingName(b)}を上位化`; }
    if (a.type === "ROUTE") return `${districtName(a.district)}へ輸送路`;
    const p = view.publicProjects.find((p) => p.id === a.projectId)!;
    return `${p.name} ${RESOURCE_NAMES[p.slots[a.slot]!.resource]}枠${a.slot + 1} / ${a.benefit === "DISCOUNT" ? "必要資源1個削減" : a.benefit === "REBATE" ? "商機：支払後に資金1" : "通常拠出"}`;
  }
  return <>
    <p className="hub-capacity">残り建設枠 {cap.total}/6 · {BUILDING_SUITS.map((s) => `${SUIT_NAMES[s]} ${cap.bySuit[s]}`).join(" / ")}</p>
    <div className="hub-tabs" aria-label="投資アクション">{([["BUILD", "建設"], ["UPGRADE", "上位化"], ["ROUTE", "輸送路"], ["CONTRIBUTE", "公共事業"]] as const).map(([t, label]) => <button key={t} aria-pressed={type === t} onClick={() => { setType(t); setSelected(null); highlight({ district: null, suit: null }); }}>{label}</button>)}</div>
    {type === "BUILD" && <div className="hub-build-select"><label>建物系統<select value={suit} onChange={(e) => { setSuit(e.target.value as BuildingSuit); highlight({ district, suit: e.target.value as BuildingSuit }); }}>{BUILDING_SUITS.map((s) => <option key={s} value={s}>{SUIT_NAMES[s]} / {BUILDING_NAMES[s][0]}</option>)}</select></label><label>建設する地区<select value={district} onChange={(e) => { setDistrict(e.target.value as DistrictId); highlight({ district: e.target.value as DistrictId, suit }); }}>{DISTRICTS.map((d) => <option key={d.id} value={d.id} disabled={!view.investments.some((q) => q.action.type === "BUILD" && q.action.district === d.id && q.action.suit === suit)}>{d.name}{d.outer && view.cityLevel < 2 ? "（未解放）" : ""}</option>)}</select></label><SuitMark suit={suit}/></div>}
    {!choices.length && <p className="hub-hint">現在この選択では投資できません。地区・資金・建物枠を確認してください。</p>}
    {type === "CONTRIBUTE" && <PublicProjects view={view} name={name} expandedProject={expandedProject} expandProject={(id) => { expandProject(id); setSelected(null); }} selected={quote} select={(q) => setSelected(JSON.stringify(q.action))}/>}
    <div className="hub-investments">{choices.filter((q) => q.action.type !== "CONTRIBUTE").map((q, i) => <button key={i} className="hub-investment-choice" aria-pressed={JSON.stringify(q.action) === selected} data-investment={q.action.type} onClick={() => { setSelected(JSON.stringify(q.action)); const b = q.action.type === "UPGRADE" ? view.buildings.find((b) => "buildingId" in q.action && b.id === q.action.buildingId) : null; highlight({ district: "district" in q.action ? q.action.district : b?.district ?? null, suit: q.action.type === "BUILD" ? q.action.suit : b?.suit ?? null }); }}><strong>{title(q)}</strong><span>今払う：{resourceText(q.cost)}</span>{q.transport && <small>{accessName("access" in q.action ? q.action.access ?? "PUBLIC" : "PUBLIC", name)} / R末支払 {q.transport.amount}</small>}</button>)}</div>
    {quote && <div className="hub-confirm" role="group" aria-label="投資内容の確認"><h3>{title(quote)}</h3>{quote.action.type === "BUILD" || quote.action.type === "UPGRADE" ? <p>基本 資金{quote.baseCash} − 地区{quote.districtDiscount} − 開発{quote.developmentDiscount}</p> : null}{quote.action.type === "CONTRIBUTE" && <label>公共事業商機の適用<select value={quote.action.benefit} onChange={(e) => setSelected(JSON.stringify({ ...quote.action, benefit: e.target.value }))}>{view.investments.filter((q) => q.action.type === "CONTRIBUTE" && quote.action.type === "CONTRIBUTE" && q.action.projectId === quote.action.projectId && q.action.slot === quote.action.slot).map((q) => q.action.type === "CONTRIBUTE" && <option key={q.action.benefit} value={q.action.benefit}>{q.action.benefit === "DISCOUNT" ? "必要資源1個削減" : q.action.benefit === "REBATE" ? "商機：支払後に資金1" : "通常拠出"}</option>)}</select></label>}{quote.action.type === "CONTRIBUTE" && quote.action.benefit === "DISCOUNT" && <p>商機：選択した1枠の必要資源を1個削減。監査費は削減しません。</p>}<CostBreakdown normalCost={quote.normalCost} auditFee={quote.auditFee} transport={quote.transport?.amount ?? 0} /><strong>今回の支払い：{resourceText(quote.cost)}</strong><p>支払い後：{(() => { const r = view.companies.find((c) => c.playerId === view.playerId)!.resources; return `資金${r.cash - quote.cost.cash + (quote.action.type === "CONTRIBUTE" && quote.action.benefit === "REBATE" ? 1 : 0)} / 資材${r.materials - quote.cost.materials} / 商品${r.goods - quote.cost.goods}`; })()}<small>（未精算輸送費はラウンド末に反映）</small></p>{quote.transport && <p>輸送：{accessName("access" in quote.action ? quote.action.access ?? "PUBLIC" : "PUBLIC", name)} · 未精算費用＋{quote.transport.amount}<br/><small>費用合計 資金{quote.cost.cash + quote.transport.amount}（輸送費はラウンド末払い）</small></p>}<button className="primary-button" onClick={() => act(quote.action)}>この内容で投資する</button></div>}
    <button className="secondary-button hub-pass" onClick={() => act({ type: "PASS_INVESTMENT" })}>今回の投資をパス</button><small>投資できる場合もパス可能。後で取り戻せません。</small>
  </>;
}
