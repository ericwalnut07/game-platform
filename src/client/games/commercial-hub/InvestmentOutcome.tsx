import { completionCashPerSlot, projectBenefitRebate, projectComplete } from "../../../games/commercial-hub/projects";
import { companyValue } from "../../../games/commercial-hub/scoring";
import type { InvestmentQuote } from "../../../games/commercial-hub/investment";
import type { HubView } from "../../../games/commercial-hub/view";
import { ResourcePreview } from "./ResourcePreview";
export function InvestmentOutcome({ view, quote }: { view: HubView; quote: InvestmentQuote }) {
  const own = view.companies.find(c => c.playerId === view.playerId)!;
  const resources = { cash: own.resources.cash - quote.cost.cash, materials: own.resources.materials - quote.cost.materials, goods: own.resources.goods - quote.cost.goods };
  const buildings = structuredClone(view.buildings), routes = structuredClone(view.routes), projects = structuredClone(view.publicProjects), a = quote.action;
  let refund = 0;
  if (a.type === "BUILD") buildings.push({ id: "preview", playerId: view.playerId, district: a.district, suit: a.suit, upgraded: false });
  if (a.type === "UPGRADE") buildings.find(b => b.id === a.buildingId)!.upgraded = true;
  if (a.type === "ROUTE") routes.push({ playerId: view.playerId, district: a.district });
  if (a.type === "CONTRIBUTE") {
    const p = projects.find(p => p.id === a.projectId)!;
    p.slots[a.slot]!.playerId = view.playerId;
    if (projectComplete(p)) refund = p.slots.filter(s => s.playerId === view.playerId).length * completionCashPerSlot(view);
    resources.cash += projectBenefitRebate(a.benefit) + refund;
  }
  const before = companyValue(own, view.buildings, view.routes, view.publicProjects, undefined, !!view.next, view);
  const after = companyValue({ ...own, resources }, buildings, routes, projects, undefined, !!view.next, view);
  const delta = after.total - before.total;
  return <div className="hub-investment-outcome"><ResourcePreview before={own.resources} after={resources} label="投資前 → 投資後"/><p>企業価値への即時影響：{delta > 0 ? "+" : ""}{delta}点{view.ownValue && `（${view.ownValue.total} → ${view.ownValue.total + delta}点）`}</p>{refund > 0 && <p>この拠出で完成：自社へ資金{refund}還元。ほかの拠出者にも1枠ごとに還元。</p>}<small>{a.type === "BUILD" || a.type === "UPGRADE" ? "建物の稼働は次Rから。" : a.type === "CONTRIBUTE" ? "未完成事業は0点。費用・監査費は還元前に支払います。" : "輸送路は敷設後から利用可能。"}未精算輸送費はR末に反映。</small></div>;
}
