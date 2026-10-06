import { assertCanBuild } from "./buildings";
import { districtOf, DISTRICTS } from "./data";
import { accessOptions, assertCanRoute, quoteTransport } from "./logistics";
import { projectSlotCost } from "./projects";
import { NO_COST, pay } from "./resources";
import { companyOf, type HubState, type InvestmentAction } from "./state";
import { BUILDING_SUITS, type Resources, type TransportCharge } from "./types";
import { auditFee } from "./auditor";
export interface InvestmentQuote { action: InvestmentAction; normalCost: Resources; auditFee: number; cost: Resources; baseCash: number; districtDiscount: number; developmentDiscount: number; transport: TransportCharge | null }
export function quoteInvestment(state: HubState, playerId: string, action: InvestmentAction): InvestmentQuote {
  const q: InvestmentQuote = { action, normalCost: { ...NO_COST }, auditFee: 0, cost: { ...NO_COST }, baseCash: 0, districtDiscount: 0, developmentDiscount: 0, transport: null };
  if (action.type === "BUILD" || action.type === "UPGRADE") {
    const building = action.type === "UPGRADE" ? state.buildings.find((b) => b.id === action.buildingId && b.playerId === playerId && !b.upgraded) : null;
    if (action.type === "UPGRADE" && !building) throw new Error("上位化できる自社建物を選んでください");
    const d = districtOf(action.type === "BUILD" ? action.district : building!.district);
    if (action.type === "BUILD") assertCanBuild(state.buildings, playerId, action.district, action.suit, state.cityLevel);
    q.baseCash = 5;
    q.districtDiscount = d.suit ? action.type === "BUILD" && !d.outer ? 1 : action.type === "UPGRADE" && d.outer ? 2 : 0 : 0;
    q.developmentDiscount = Math.min(5 - q.districtDiscount, state.benefits[playerId]!.development);
    q.cost.cash = 5 - q.districtDiscount - q.developmentDiscount;
    if (action.type === "UPGRADE") q.transport = quoteTransport(state, playerId, d.id, action.access, action.type);
  } else if (action.type === "ROUTE") {
    assertCanRoute(state, playerId, action.district); q.cost = { ...NO_COST, cash: 2, materials: 1 }; q.baseCash = 2;
  } else {
    const project = state.publicProjects.find((p) => p.id === action.projectId);
    if (!project) throw new Error("公共事業を選んでください");
    q.cost = projectSlotCost(project, action.slot);
    if (action.benefit !== "NONE") {
      if (!state.benefits[playerId]!.project.includes(action.benefit)) throw new Error("その商機報酬は使用できません");
      if (action.benefit === "DISCOUNT") q.cost[project.slots[action.slot]!.resource]--;
    }
    q.baseCash = q.cost.cash;
  }
  q.normalCost = { ...q.cost };
  const target = action.type === "CONTRIBUTE" ? "PUBLIC_PROJECTS" : action.type === "UPGRADE" ? state.buildings.find((b) => b.id === action.buildingId)!.district : action.district;
  q.auditFee = action.type === "BUILD" ? 0 : auditFee(state, target);
  q.cost.cash += q.auditFee;
  pay(companyOf(state, playerId).resources, q.cost); return q;
}
export function legalInvestments(state: HubState, playerId: string): InvestmentQuote[] {
  const candidates: InvestmentAction[] = [];
  for (const d of DISTRICTS) {
    candidates.push({ type: "ROUTE", district: d.id });
    for (const suit of BUILDING_SUITS) candidates.push({ type: "BUILD", district: d.id, suit });
  }
  for (const b of state.buildings.filter((b) => b.playerId === playerId && !b.upgraded)) for (const access of accessOptions(state, playerId, b.district)) candidates.push({ type: "UPGRADE", buildingId: b.id, access });
  for (const p of state.publicProjects) p.slots.forEach((s, slot) => { if (!s.playerId) for (const benefit of new Set(["NONE", ...state.benefits[playerId]!.project] as const)) candidates.push({ type: "CONTRIBUTE", projectId: p.id, slot, benefit }); });
  return candidates.flatMap((a) => { try { return [quoteInvestment(state, playerId, a)]; } catch { return []; } });
}
